const { AVAILABILITY_DAYS, AVAILABILITY_TIMES } = require("./constants.js");
const {
  buildAvailabilityRows,
  buildAvailabilitySubmitRow,
  buildDaySelectRow,
  buildTimeSelectRow,
} = require("./components.js");
const {
  refreshSchedulingControlMessage,
} = require("./controlMessage.js");
const {
  finalizeScheduledMatchFromThread,
} = require("./finalizeSchedule.js");
const {
  canUseAvailabilityForm,
  confirmManualTimeProposal,
  createManualTimeProposal,
  createOverlapTimeProposal,
  ensureAvailabilitySession,
  formatCaptainAvailability,
  formatMissingAvailability,
  getAvailabilitySession,
  getAvailabilityTeamRoleId,
  getCleanAvailabilityTier,
  getOverlapDays,
  getOverlapTimesForDay,
  isHomeCaptain,
  isSchedulingStaff,
  saveCaptainAvailability,
  submitCaptainAvailability,
} = require("./service.js");

const SCHEDULING_BUTTON_PREFIXES = [
  "availability_start",
  "manual_time_agree",
];

const SCHEDULING_BUTTON_IDS = new Set([
  "availability_submit",
  "final_overlap_start",
  "manual_time_start",
]);

const SCHEDULING_SELECT_PREFIXES = new Set([
  "availability_day",
  "final_overlap_day",
  "final_overlap_time",
  "manual_time_day",
  "manual_time_time",
  "staff_set_day",
  "staff_set_time",
]);

// The home captain may pick a final overlap time while none is proposed yet
// (OVERLAP_FOUND) or to replace a pending proposal (OVERLAP_PROPOSED).
const OVERLAP_SELECTION_STATUSES = ["OVERLAP_FOUND", "OVERLAP_PROPOSED"];

function isSchedulingInteraction(interaction) {
  if (interaction.isButton()) {
    return (
      SCHEDULING_BUTTON_IDS.has(interaction.customId) ||
      SCHEDULING_BUTTON_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix))
    );
  }

  if (interaction.isStringSelectMenu()) {
    const [prefix] = interaction.customId.split(":");
    return SCHEDULING_SELECT_PREFIXES.has(prefix);
  }

  return false;
}

async function handle(interaction) {
  if (interaction.isButton()) {
    return await handleSchedulingButton(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    return await handleSchedulingSelect(interaction);
  }
}

async function handleSchedulingButton(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("availability_start")) {
    return await handleAvailabilityStart(interaction);
  }

  if (customId === "availability_submit") {
    return await handleAvailabilitySubmit(interaction);
  }

  if (customId === "final_overlap_start") {
    return await handleFinalOverlapStart(interaction);
  }

  if (customId === "manual_time_start") {
    return await handleManualTimeStart(interaction);
  }

  if (customId.startsWith("manual_time_agree")) {
    return await handleManualTimeAgree(interaction);
  }
}

async function handleSchedulingSelect(interaction) {
  const [prefix, extra] = interaction.customId.split(":");

  switch (prefix) {
    case "availability_day":
      return await handleAvailabilityDaySelect(interaction, extra);
    case "final_overlap_day":
      return await handleFinalOverlapDaySelect(interaction);
    case "final_overlap_time":
      return await handleFinalOverlapTimeSelect(interaction, extra);
    case "manual_time_day":
      return await handleManualTimeDaySelect(interaction);
    case "manual_time_time":
      return await handleManualTimeTimeSelect(interaction, extra);
    case "staff_set_day":
      return await handleStaffSetDaySelect(interaction);
    case "staff_set_time":
      return await handleStaffSetTimeSelect(interaction, extra);
    default:
      console.log(`Unhandled scheduling select menu interaction: ${interaction.customId}`);
      return;
  }
}

async function getInteractionChannel(interaction) {
  return (
    interaction.channel ??
    (await interaction.client.channels.fetch(interaction.channelId).catch(() => null))
  );
}

async function refreshControlMessageForInteraction(interaction) {
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await refreshSchedulingControlMessage(channel, interaction.channelId);
  }

  return channel;
}

async function finalizeMatchFromInteraction({
  day,
  interaction,
  source,
  time,
}) {
  const channel = await getInteractionChannel(interaction);

  if (!channel?.send) {
    return {
      ok: false,
      reason: "Could not find this scheduling thread.",
    };
  }

  const result = await finalizeScheduledMatchFromThread({
    day,
    guild: interaction.guild ?? channel.guild,
    selectedByUserId: interaction.user.id,
    source,
    thread: channel,
    threadId: interaction.channelId,
    time,
  });

  if (!result.ok) {
    await channel.send(
      `Schedule finalization failed: ${result.reason} Please contact an administrator.`,
    );
  }

  await refreshSchedulingControlMessage(channel, interaction.channelId);

  return result;
}

async function handleAvailabilityStart(interaction) {
  const [, tierValue, team1RoleId, team2RoleId, homeRoleId] =
    interaction.customId.split(":");
  const tier = getCleanAvailabilityTier(tierValue);
  const session = ensureAvailabilitySession({
    threadId: interaction.channelId,
    tier,
    teamRoleIds: [team1RoleId, team2RoleId].filter(Boolean),
    homeRoleId: homeRoleId || null,
  });

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.reply({
      content: "Only captains for this match can submit availability.",
      ephemeral: true,
    });
  }

  const firstFiveDays = AVAILABILITY_DAYS.slice(0, 5);
  const remainingDays = AVAILABILITY_DAYS.slice(5);

  await interaction.reply({
    content: `Submit your ${tier} availability. Pick every time you can play.`,
    components: buildAvailabilityRows(firstFiveDays),
    ephemeral: true,
  });

  await interaction.followUp({
    content:
      "Weekend availability. When all of your selections look right, click Submit Availability.",
    components: [...buildAvailabilityRows(remainingDays), buildAvailabilitySubmitRow()],
    ephemeral: true,
  });

  await refreshControlMessageForInteraction(interaction);
}

async function handleAvailabilityDaySelect(interaction, day) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.reply({
      content: "No availability session exists for this thread. Use the thread availability button first.",
      ephemeral: true,
    });
  }

  if (session.status === "CONFIRMED") {
    return await interaction.reply({
      content: "This match already has a confirmed time.",
      ephemeral: true,
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.reply({
      content: "Only captains for this match can submit availability.",
      ephemeral: true,
    });
  }

  const shouldRefreshControl = session.status !== "COLLECTING_AVAILABILITY";
  const selectedTimes = interaction.values;
  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const captainAvailability = saveCaptainAvailability({
    threadId: interaction.channelId,
    tier: session.tier,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    day,
    selectedTimes,
  });
  const totalSelected = Object.values(captainAvailability.days).reduce(
    (total, times) => total + times.length,
    0,
  );

  await interaction.reply({
    content:
      selectedTimes.length === 0
        ? `Cleared availability for ${day}. You now have ${totalSelected} total time(s) saved.`
        : [
            `Saved ${day}: ${selectedTimes.join(", ")}.`,
            `You now have ${totalSelected} total time(s) saved.`,
            "Click Submit Availability when finished.",
          ].join(" "),
    ephemeral: true,
  });

  if (shouldRefreshControl) {
    await refreshControlMessageForInteraction(interaction);
  }
}

async function handleAvailabilitySubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.editReply({
      content: "No availability session exists for this thread. Use the thread availability button first.",
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.editReply({
      content: "Only captains for this match can submit availability.",
    });
  }

  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = submitCaptainAvailability({
    threadId: interaction.channelId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
  });

  if (!result.ok) {
    return await interaction.editReply({ content: result.reason });
  }

  if (result.alreadySubmitted) {
    return await interaction.editReply({
      content: "Your availability was already submitted.",
    });
  }

  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      [
        `<@${interaction.user.id}> submitted availability${
          teamRoleId ? ` for <@&${teamRoleId}>` : ""
        }.`,
        formatCaptainAvailability(result.captainAvailability),
      ].join("\n"),
    );

    if (!result.complete) {
      await channel.send(
        `Waiting on ${formatMissingAvailability(result.session, result.missingTeamRoleIds)} to submit availability.`,
      );
    }

    await refreshSchedulingControlMessage(channel, interaction.channelId);
  }

  return await interaction.editReply({
    content: result.complete
      ? "Availability submitted. Both teams have submitted, so I refreshed the scheduling controls."
      : "Availability submitted. I posted a thread update with who is still needed.",
  });
}

async function handleFinalOverlapStart(interaction) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !OVERLAP_SELECTION_STATUSES.includes(session.status)) {
    return await interaction.reply({
      content: "This match is not ready for final-time selection.",
      ephemeral: true,
    });
  }

  if (!isHomeCaptain(session, interaction)) {
    return await interaction.reply({
      content: "Only the home team captain can select the final match time.",
      ephemeral: true,
    });
  }

  const overlapDays = getOverlapDays(session);

  if (overlapDays.length === 0) {
    return await interaction.reply({
      content: "No overlapping days are available to select.",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: "Choose the day for the final match time.",
    components: [buildDaySelectRow("final_overlap_day", overlapDays, "Choose final day")],
    ephemeral: true,
  });

  await refreshControlMessageForInteraction(interaction);
}

async function handleFinalOverlapDaySelect(interaction) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !OVERLAP_SELECTION_STATUSES.includes(session.status)) {
    return await interaction.reply({
      content: "This match is not ready for final-time selection.",
      ephemeral: true,
    });
  }

  if (!isHomeCaptain(session, interaction)) {
    return await interaction.reply({
      content: "Only the home team captain can select the final match time.",
      ephemeral: true,
    });
  }

  const day = interaction.values[0];
  const times = getOverlapTimesForDay(session, day);

  if (times.length === 0) {
    return await interaction.reply({
      content: "That day no longer has overlapping times.",
      ephemeral: true,
    });
  }

  return await interaction.reply({
    content: `Choose the final time for ${day}.`,
    components: [buildTimeSelectRow(`final_overlap_time:${day}`, times, "Choose final time")],
    ephemeral: true,
  });
}

async function handleFinalOverlapTimeSelect(interaction, day) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !OVERLAP_SELECTION_STATUSES.includes(session.status)) {
    return await interaction.reply({
      content: "This match is not ready for final-time selection.",
      ephemeral: true,
    });
  }

  if (!isHomeCaptain(session, interaction)) {
    return await interaction.reply({
      content: "Only the home team captain can select the final match time.",
      ephemeral: true,
    });
  }

  const time = interaction.values[0];
  const allowedTimes = getOverlapTimesForDay(session, day);

  if (!allowedTimes.includes(time)) {
    return await interaction.reply({
      content: "That time is no longer part of the shared availability.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = createOverlapTimeProposal({
    threadId: interaction.channelId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    day,
    time,
  });

  if (!result.ok) {
    return await interaction.editReply({ content: result.reason });
  }

  const otherTeamRoleId = (session.teamRoleIds ?? []).find(
    (roleId) => roleId !== teamRoleId,
  );
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      [
        `<@${interaction.user.id}> proposed **${day} at ${time}**.`,
        `${
          otherTeamRoleId ? `<@&${otherTeamRoleId}>` : "The other captain"
        }, confirm in the scheduling controls below.`,
      ].join(" "),
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId);
  }

  return await interaction.editReply({
    content: `Proposed ${day} at ${time}. Waiting on the other captain to confirm.`,
  });
}

async function handleManualTimeStart(interaction) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.reply({
      content: "No scheduling session exists for this thread.",
      ephemeral: true,
    });
  }

  if (session.status === "CONFIRMED") {
    const confirmedTime = session.confirmedTime
      ? `${session.confirmedTime.day} at ${session.confirmedTime.time}`
      : "a final time";

    return await interaction.reply({
      content: `This match is already confirmed for ${confirmedTime}.`,
      ephemeral: true,
    });
  }

  if (!["NO_OVERLAP", "MANUAL_PROPOSED"].includes(session.status)) {
    return await interaction.reply({
      content: "Manual time proposals are only available when there is no shared availability.",
      ephemeral: true,
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.reply({
      content: "Only captains for this match can propose a manual time.",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: "Choose the day for the proposed match time.",
    components: [buildDaySelectRow("manual_time_day", AVAILABILITY_DAYS, "Choose proposed day")],
    ephemeral: true,
  });

  await refreshControlMessageForInteraction(interaction);
}

async function handleManualTimeDaySelect(interaction) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !["NO_OVERLAP", "MANUAL_PROPOSED"].includes(session.status)) {
    return await interaction.reply({
      content: "Manual time proposals are only available when there is no shared availability.",
      ephemeral: true,
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.reply({
      content: "Only captains for this match can propose a manual time.",
      ephemeral: true,
    });
  }

  const day = interaction.values[0];

  return await interaction.reply({
    content: `Choose the proposed time for ${day}.`,
    components: [buildTimeSelectRow(`manual_time_time:${day}`, AVAILABILITY_TIMES, "Choose proposed time")],
    ephemeral: true,
  });
}

async function handleManualTimeTimeSelect(interaction, day) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !["NO_OVERLAP", "MANUAL_PROPOSED"].includes(session.status)) {
    return await interaction.reply({
      content: "Manual time proposals are only available when there is no shared availability.",
      ephemeral: true,
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.reply({
      content: "Only captains for this match can propose a manual time.",
      ephemeral: true,
    });
  }

  const time = interaction.values[0];
  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = createManualTimeProposal({
    threadId: interaction.channelId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    day,
    time,
  });

  if (!result.ok) {
    return await interaction.reply({ content: result.reason, ephemeral: true });
  }

  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      `<@${interaction.user.id}> proposed **${day} at ${time}**.`,
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId);
  }

  return await interaction.reply({
    content: `Manual time proposed: ${day} at ${time}. Both teams must agree in the thread.`,
    ephemeral: true,
  });
}

async function handleManualTimeAgree(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const [, proposalId] = interaction.customId.split(":");
  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.editReply({
      content: "No scheduling session exists for this thread.",
    });
  }

  if (session.status === "CONFIRMED") {
    const confirmedTime = session.confirmedTime
      ? `${session.confirmedTime.day} at ${session.confirmedTime.time}`
      : "a final time";

    return await interaction.editReply({
      content: `This match is already confirmed for ${confirmedTime}.`,
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.editReply({
      content: "Only captains for this match can agree to the proposed time.",
    });
  }

  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = confirmManualTimeProposal({
    threadId: interaction.channelId,
    proposalId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
  });

  if (!result.ok) {
    return await interaction.editReply({ content: result.reason });
  }

  if (result.alreadyConfirmed) {
    return await interaction.editReply({
      content: "Your team has already agreed to this proposed time.",
    });
  }

  if (result.complete) {
    const finalizationResult = await finalizeMatchFromInteraction({
      day: result.proposal.day,
      interaction,
      source: result.proposal.source ?? "manual",
      time: result.proposal.time,
    });

    if (!finalizationResult.ok) {
      return await interaction.editReply({
        content: [
          "Agreement saved, but schedule finalization failed.",
          finalizationResult.reason,
          "Please contact an administrator.",
        ].join(" "),
      });
    }

    return await interaction.editReply({
      content: `Agreement saved. Match scheduled for ${finalizationResult.scheduledDate.display}.`,
    });
  }

  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      [
        `<@${interaction.user.id}> agreed to **${result.proposal.day} at ${result.proposal.time}**.`,
        `Waiting on ${formatMissingAvailability(result.session, result.missingTeamRoleIds)}.`,
      ].join(" "),
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId);
  }

  return await interaction.editReply({
    content: "Agreement saved. Waiting on the other team.",
  });
}

async function handleStaffSetDaySelect(interaction) {
  if (!isSchedulingStaff(interaction)) {
    return await interaction.reply({
      content: "Only scheduling staff or admins can set a match time.",
      ephemeral: true,
    });
  }

  const day = interaction.values[0];

  return await interaction.reply({
    content: `Choose the match time for ${day}.`,
    components: [
      buildTimeSelectRow(`staff_set_time:${day}`, AVAILABILITY_TIMES, "Choose match time"),
    ],
    ephemeral: true,
  });
}

async function handleStaffSetTimeSelect(interaction, day) {
  if (!isSchedulingStaff(interaction)) {
    return await interaction.reply({
      content: "Only scheduling staff or admins can set a match time.",
      ephemeral: true,
    });
  }

  const time = interaction.values[0];

  await interaction.deferReply({ ephemeral: true });

  const result = await finalizeMatchFromInteraction({
    day,
    interaction,
    source: "staff",
    time,
  });

  if (!result.ok) {
    return await interaction.editReply({
      content: `Could not set the match time: ${result.reason}`,
    });
  }

  return await interaction.editReply({
    content: `Match time set: ${result.scheduledDate.display}.`,
  });
}

module.exports = {
  handle,
  isSchedulingInteraction,
};
