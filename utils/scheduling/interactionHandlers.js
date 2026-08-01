const {
  buildAvailabilityModal,
  buildTimeEntryModal,
} = require("./components.js");
const {
  refreshSchedulingControlMessage,
} = require("./controlMessage.js");
const {
  finalizeScheduledMatchFromThread,
} = require("./finalizeSchedule.js");
const {
  buildAvailabilityTemplate,
  formatDayTime,
  formatDayTimeFromProposal,
  parseAvailabilityText,
  parseDayName,
  parseTimeToken,
  toCanonicalTime,
} = require("./timeRange.js");
const {
  canProposeTime,
  canUseAvailabilityForm,
  confirmManualTimeProposal,
  createTimeProposal,
  ensureAvailabilitySession,
  formatCaptainAvailability,
  formatMissingAvailability,
  formatOverlap,
  getAvailabilitySession,
  getAvailabilityTeamRoleId,
  getCleanAvailabilityTier,
  isHomeCaptain,
  isSchedulingStaff,
  isTimeWithinOverlap,
  reopenTimeSelection,
  submitAvailabilityRanges,
} = require("./service.js");

const SCHEDULING_BUTTON_PREFIXES = ["availability_start", "manual_time_agree"];

const SCHEDULING_BUTTON_IDS = new Set([
  "propose_time_start",
  "final_overlap_start",
  "scheduling_reschedule",
]);

const SCHEDULING_MODAL_IDS = new Set([
  "availability_modal",
  "propose_time_modal",
  "final_time_modal",
  "staff_time_modal",
]);

// The home captain may pick a final overlap time while none is proposed yet
// (OVERLAP_FOUND) or to replace a pending proposal (OVERLAP_PROPOSED).
const OVERLAP_SELECTION_STATUSES = ["OVERLAP_FOUND", "OVERLAP_PROPOSED"];

function isSchedulingInteraction(interaction) {
  if (interaction.isButton()) {
    return (
      SCHEDULING_BUTTON_IDS.has(interaction.customId) ||
      SCHEDULING_BUTTON_PREFIXES.some((prefix) =>
        interaction.customId.startsWith(prefix),
      )
    );
  }

  if (interaction.isModalSubmit()) {
    return SCHEDULING_MODAL_IDS.has(interaction.customId);
  }

  return false;
}

async function handle(interaction) {
  if (interaction.isButton()) {
    return await handleSchedulingButton(interaction);
  }

  if (interaction.isModalSubmit()) {
    return await handleSchedulingModal(interaction);
  }
}

async function handleSchedulingButton(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("availability_start")) {
    return await handleAvailabilityStart(interaction);
  }

  if (customId === "propose_time_start") {
    return await handleProposeTimeStart(interaction);
  }

  if (customId === "final_overlap_start") {
    return await handleFinalOverlapStart(interaction);
  }

  if (customId.startsWith("manual_time_agree")) {
    return await handleManualTimeAgree(interaction);
  }

  if (customId === "scheduling_reschedule") {
    return await handleReschedule(interaction);
  }
}

// The always-present "Reschedule" button: re-opens time selection so the teams
// can agree on a NEW time — but leaves the currently scheduled time (and its
// announcement / thread state) untouched until a new time is actually confirmed.
// When that new time is confirmed, the normal finalize flow replaces the old
// announcement. Allowed for the two teams' captains/management or staff.
async function handleReschedule(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const session = getAvailabilitySession(interaction.channelId);
  if (!session) {
    return await interaction.editReply({
      content: "No scheduling session exists for this thread.",
    });
  }

  if (!canUseAvailabilityForm(session, interaction) && !isSchedulingStaff(interaction)) {
    return await interaction.editReply({
      content:
        "Only captains/management for this match or scheduling staff can reschedule.",
    });
  }

  // Re-open time selection from the existing availability. Does NOT unschedule
  // the match — the current time stands until both teams confirm a new one.
  reopenTimeSelection(interaction.channelId);

  const channel = await getInteractionChannel(interaction);
  if (channel?.send) {
    await refreshSchedulingControlMessage(channel, interaction.channelId);
    await channel
      .send(
        `<@${interaction.user.id}> reopened this match to change the time. The current time stays scheduled until both teams agree on a new one — pick a new time using the controls below.`,
      )
      .catch(() => {});
  }

  return await interaction.editReply({
    content:
      "Reschedule opened — the old time stays until a new one is confirmed.",
  });
}

async function handleSchedulingModal(interaction) {
  switch (interaction.customId) {
    case "availability_modal":
      return await handleAvailabilityModalSubmit(interaction);
    case "propose_time_modal":
      return await handleProposeTimeModalSubmit(interaction);
    case "final_time_modal":
      return await handleFinalTimeModalSubmit(interaction);
    case "staff_time_modal":
      return await handleStaffTimeModalSubmit(interaction);
    default:
      console.log(`Unhandled scheduling modal: ${interaction.customId}`);
      return;
  }
}

async function getInteractionChannel(interaction) {
  return (
    interaction.channel ??
    (await interaction.client.channels
      .fetch(interaction.channelId)
      .catch(() => null))
  );
}

async function refreshControlMessageForInteraction(interaction) {
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await refreshSchedulingControlMessage(channel, interaction.channelId, {
      silent: true,
    });
  }

  return channel;
}

async function finalizeMatchFromInteraction({ day, interaction, source, time }) {
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

  await refreshSchedulingControlMessage(channel, interaction.channelId, {
    silent: true,
  });

  return result;
}

// Mention the teams that still need to confirm a proposal (a proposer's own team
// is pre-confirmed inside createTimeProposal, so it's excluded here).
function formatPendingConfirmations(session) {
  const confirmations = session.manualProposal?.confirmations ?? {};
  const pending = (session.teamRoleIds ?? []).filter(
    (teamRoleId) => !confirmations[teamRoleId],
  );

  if (pending.length === 0) {
    return "the other captain";
  }

  return pending.map((teamRoleId) => `<@&${teamRoleId}>`).join(", ");
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

  const existing = session.availability?.[interaction.user.id]?.intervals;
  return await interaction.showModal(
    buildAvailabilityModal(buildAvailabilityTemplate(existing)),
  );
}

async function handleAvailabilityModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.editReply({
      content:
        "No availability session exists for this thread. Use the thread availability button first.",
    });
  }

  if (session.status === "CONFIRMED") {
    return await interaction.editReply({
      content: "This match already has a confirmed time.",
    });
  }

  if (!canUseAvailabilityForm(session, interaction)) {
    return await interaction.editReply({
      content: "Only captains for this match can submit availability.",
    });
  }

  const text = interaction.fields.getTextInputValue("availability_text");
  const { availabilityByDay, errors } = parseAvailabilityText(text);

  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = submitAvailabilityRanges({
    threadId: interaction.channelId,
    tier: session.tier,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    availabilityByDay,
  });

  if (!result.ok) {
    return await interaction.editReply({
      content: [
        result.reason,
        errors.length > 0 ? `\nCouldn't read:\n- ${errors.join("\n- ")}` : "",
      ]
        .join("")
        .trim(),
    });
  }

  const echo = formatCaptainAvailability(result.captainAvailability);
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      [
        `<@${interaction.user.id}> submitted availability${
          teamRoleId ? ` for <@&${teamRoleId}>` : ""
        }.`,
        echo,
      ].join("\n"),
    );

    if (!result.complete) {
      await channel.send(
        `Waiting on ${formatMissingAvailability(
          result.session,
          result.missingTeamRoleIds,
        )} to submit availability.`,
      );
    }

    await refreshSchedulingControlMessage(channel, interaction.channelId, {
      silent: true,
    });
  }

  return await interaction.editReply({
    content: [
      "Availability submitted:",
      echo,
      errors.length > 0
        ? `\n⚠️ Ignored lines I couldn't read:\n- ${errors.join("\n- ")}`
        : "",
      result.complete
        ? "\nBoth teams are in — I refreshed the scheduling controls."
        : "\nI posted a thread update with who is still needed.",
    ]
      .join("\n")
      .trim(),
  });
}

async function handleProposeTimeStart(interaction) {
  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.reply({
      content: "No scheduling session exists for this thread.",
      ephemeral: true,
    });
  }

  if (session.status === "CONFIRMED") {
    const confirmedTime = session.confirmedTime
      ? (session.confirmedTime.display ??
        formatDayTimeFromProposal(session.confirmedTime))
      : "a final time";

    return await interaction.reply({
      content: `This match is already confirmed for ${confirmedTime}.`,
      ephemeral: true,
    });
  }

  if (!canProposeTime(session, interaction)) {
    return await interaction.reply({
      content:
        "Only captains, team management, or the scheduling lead can propose a time.",
      ephemeral: true,
    });
  }

  return await interaction.showModal(
    buildTimeEntryModal({
      customId: "propose_time_modal",
      title: "Propose Match Time",
    }),
  );
}

async function handleProposeTimeModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const session = getAvailabilitySession(interaction.channelId);

  if (!session) {
    return await interaction.editReply({
      content: "No scheduling session exists for this thread.",
    });
  }

  if (session.status === "CONFIRMED") {
    return await interaction.editReply({
      content: "This match already has a confirmed time.",
    });
  }

  if (!canProposeTime(session, interaction)) {
    return await interaction.editReply({
      content:
        "Only captains, team management, or the scheduling lead can propose a time.",
    });
  }

  const parsed = parseTimeEntry(interaction);

  if (!parsed.ok) {
    return await interaction.editReply({ content: parsed.reason });
  }

  const { day, normalized } = parsed;
  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = createTimeProposal({
    threadId: interaction.channelId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    day,
    time: toCanonicalTime(normalized),
    timeNormalized: normalized,
    source: "manual",
  });

  if (!result.ok) {
    return await interaction.editReply({ content: result.reason });
  }

  const label = formatDayTime(day, normalized);
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      `<@${interaction.user.id}> proposed **${label}**. ${formatPendingConfirmations(
        result.session,
      )}, confirm in the scheduling controls below.`,
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId, {
      silent: true,
    });
  }

  return await interaction.editReply({
    content: `Proposed ${label}. Waiting on the other team to confirm.`,
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

  return await interaction.showModal(
    buildTimeEntryModal({
      customId: "final_time_modal",
      title: "Select Final Match Time",
    }),
  );
}

async function handleFinalTimeModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const session = getAvailabilitySession(interaction.channelId);

  if (!session || !OVERLAP_SELECTION_STATUSES.includes(session.status)) {
    return await interaction.editReply({
      content: "This match is not ready for final-time selection.",
    });
  }

  if (!isHomeCaptain(session, interaction)) {
    return await interaction.editReply({
      content: "Only the home team captain can select the final match time.",
    });
  }

  const parsed = parseTimeEntry(interaction);

  if (!parsed.ok) {
    return await interaction.editReply({ content: parsed.reason });
  }

  const { day, normalized } = parsed;

  if (!isTimeWithinOverlap(session, day, normalized)) {
    return await interaction.editReply({
      content: [
        "That time isn't part of the shared availability. Pick a time inside the overlap:",
        formatOverlap(session.overlapByDay),
      ].join("\n"),
    });
  }

  const teamRoleId = getAvailabilityTeamRoleId(session, interaction.member);
  const result = createTimeProposal({
    threadId: interaction.channelId,
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    teamRoleId,
    day,
    time: toCanonicalTime(normalized),
    timeNormalized: normalized,
    source: "overlap",
  });

  if (!result.ok) {
    return await interaction.editReply({ content: result.reason });
  }

  const label = formatDayTime(day, normalized);
  const channel = await getInteractionChannel(interaction);

  if (channel?.send) {
    await channel.send(
      `<@${interaction.user.id}> proposed **${label}**. ${formatPendingConfirmations(
        result.session,
      )}, confirm in the scheduling controls below.`,
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId, {
      silent: true,
    });
  }

  return await interaction.editReply({
    content: `Proposed ${label}. Waiting on the other captain to confirm.`,
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
      ? (session.confirmedTime.display ??
        formatDayTimeFromProposal(session.confirmedTime))
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
        `<@${interaction.user.id}> agreed to **${formatDayTimeFromProposal(result.proposal)}**.`,
        `Waiting on ${formatMissingAvailability(
          result.session,
          result.missingTeamRoleIds,
        )}.`,
      ].join(" "),
    );

    await refreshSchedulingControlMessage(channel, interaction.channelId, {
      silent: true,
    });
  }

  return await interaction.editReply({
    content: "Agreement saved. Waiting on the other team.",
  });
}

async function handleStaffTimeModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isSchedulingStaff(interaction)) {
    return await interaction.editReply({
      content: "Only scheduling staff or admins can set a match time.",
    });
  }

  const parsed = parseTimeEntry(interaction);

  if (!parsed.ok) {
    return await interaction.editReply({ content: parsed.reason });
  }

  const { day, normalized } = parsed;
  const result = await finalizeMatchFromInteraction({
    day,
    interaction,
    source: "staff",
    time: toCanonicalTime(normalized),
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

// Shared parsing for the day + time entry modals. Returns { ok, day, normalized }
// or { ok: false, reason }.
function parseTimeEntry(interaction) {
  const dayInput = interaction.fields.getTextInputValue("day");
  const timeInput = interaction.fields.getTextInputValue("time");
  const day = parseDayName(dayInput);

  if (!day) {
    return {
      ok: false,
      reason: `Couldn't read the day "${dayInput}". Use a weekday name like Saturday.`,
    };
  }

  try {
    return { ok: true, day, normalized: parseTimeToken(timeInput) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

module.exports = {
  handle,
  isSchedulingInteraction,
};
