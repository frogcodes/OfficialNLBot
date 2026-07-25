const {
  buildAvailabilityStartRow,
  buildConfirmedControlRow,
  buildHomeFinalTimeRow,
  buildManualAgreementRow,
  buildManualProposalRow,
  buildOverlapAgreementRow,
} = require("./components.js");
const {
  formatMissingAvailability,
  formatOverlap,
  getAvailabilitySession,
  setSchedulingControlMessageId,
} = require("./service.js");
const { formatDayTimeFromProposal } = require("./timeRange.js");

function getMissingAvailabilityTeamRoleIds(session) {
  const teamRoleIds = session.teamRoleIds ?? [];
  const submittedTeamRoleIds = new Set(
    Object.values(session.availability ?? {})
      .filter((captainAvailability) => captainAvailability.submittedAt)
      .map((captainAvailability) => captainAvailability.teamRoleId)
      .filter(Boolean),
  );

  return teamRoleIds.filter(
    (teamRoleId) => !submittedTeamRoleIds.has(teamRoleId),
  );
}

function formatOverlapForControl(overlapByDay) {
  const formattedOverlap = formatOverlap(overlapByDay);

  if (formattedOverlap.length <= 1000) {
    return formattedOverlap;
  }

  return "Common availability found. Click Select Final Time to choose.";
}

function formatManualConfirmations(session) {
  const proposal = session.manualProposal;
  const confirmations = proposal?.confirmations ?? {};
  const teamRoleIds = session.teamRoleIds ?? [];

  if (teamRoleIds.length === 0) {
    return "Waiting for both teams to agree.";
  }

  return teamRoleIds
    .map((teamRoleId) => {
      const status = confirmations[teamRoleId] ? "Agreed" : "Waiting";
      return `- <@&${teamRoleId}>: ${status}`;
    })
    .join("\n");
}

function buildAvailabilityControlPayload(session) {
  const missingTeamRoleIds = getMissingAvailabilityTeamRoleIds(session);
  const missingText =
    missingTeamRoleIds.length > 0
      ? `Waiting on ${formatMissingAvailability(session, missingTeamRoleIds)}.`
      : "Captains can submit or update availability here.";

  return {
    content: [
      "**Scheduling Controls**",
      missingText,
      "Click **Submit Availability** and type the times you can play (ET), e.g. `Monday: 6:15-7:45, 9-11:15`.",
      "Or use **Propose Time** to put a specific time up for the other team to confirm.",
    ].join("\n"),
    components: [buildAvailabilityStartRow(session)],
  };
}

function buildSchedulingControlPayload(session) {
  if (!session) {
    return null;
  }

  if (session.status === "OVERLAP_FOUND") {
    return {
      content: [
        "**Scheduling Controls**",
        "Common availability found.",
        formatOverlapForControl(session.overlapByDay ?? {}),
        "",
        session.homeRoleId
          ? `<@&${session.homeRoleId}> selects the final match time.`
          : "The home team selects the final match time.",
      ].join("\n"),
      components: [buildHomeFinalTimeRow()],
    };
  }

  if (session.status === "OVERLAP_PROPOSED" && session.manualProposal) {
    return {
      content: [
        "**Scheduling Controls**",
        `Proposed time: **${formatDayTimeFromProposal(session.manualProposal)}**`,
        "The other captain must confirm before this time is final.",
        formatManualConfirmations(session),
      ].join("\n"),
      components: [buildOverlapAgreementRow(session.manualProposal.id)],
    };
  }

  if (session.status === "NO_OVERLAP") {
    return {
      content: [
        "**Scheduling Controls**",
        "No common availability was found.",
        "Captains should discuss a workable time in this thread.",
        "Once you have one, use Propose Time for both teams to approve.",
      ].join("\n"),
      components: [buildManualProposalRow()],
    };
  }

  if (session.status === "MANUAL_PROPOSED" && session.manualProposal) {
    return {
      content: [
        "**Scheduling Controls**",
        `Proposed time: **${formatDayTimeFromProposal(session.manualProposal)}**`,
        "Both teams must agree before this time is confirmed.",
        formatManualConfirmations(session),
      ].join("\n"),
      components: [buildManualAgreementRow(session.manualProposal.id)],
    };
  }

  if (session.status === "CONFIRMED") {
    const confirmedTime = session.confirmedTime
      ? (session.confirmedTime.display ??
        formatDayTimeFromProposal(session.confirmedTime))
      : "the selected time";

    return {
      content: [
        "**Scheduling Controls**",
        `Match confirmed for **${confirmedTime}**.`,
      ].join("\n"),
      components: [buildConfirmedControlRow()],
    };
  }

  return buildAvailabilityControlPayload(session);
}

async function deletePreviousControlMessage(channel, messageId) {
  if (!messageId || !channel?.messages?.fetch) {
    return;
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);

  if (!message || message.deletable === false) {
    return;
  }

  await message.delete().catch((error) => {
    console.error(
      "Failed to delete previous scheduling control message:",
      error,
    );
  });
}

// `silent: true` renders the team role mentions as plain text but suppresses the
// notification — used by the periodic sticky re-post so bumping the panel never
// pings the teams. Action-driven refreshes (submit/propose) leave it false so a
// real state change can still nudge the relevant team.
async function refreshSchedulingControlMessage(
  channel,
  threadId,
  { silent = false } = {},
) {
  const session = getAvailabilitySession(threadId);

  if (!session || !channel?.send) {
    return null;
  }

  await deletePreviousControlMessage(channel, session.controlMessageId);

  const payload = buildSchedulingControlPayload(session);

  if (!payload) {
    return null;
  }

  const message = await channel.send(
    silent ? { ...payload, allowedMentions: { parse: [] } } : payload,
  );
  setSchedulingControlMessageId(threadId, message.id);

  return message;
}

module.exports = {
  buildSchedulingControlPayload,
  refreshSchedulingControlMessage,
};
