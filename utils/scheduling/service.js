const { PermissionFlagsBits } = require("discord.js");
const { captainRoles } = require("../../data/roles.json");
const {
  AVAILABILITY_DAYS,
  AVAILABILITY_TIMES,
  SCHEDULING_TEAM_ROLE_ID,
} = require("./constants.js");
const {
  getCurrentWeekStartDate,
  getWeekStartDateFromIso,
} = require("./dateUtils.js");
const {
  getAvailabilitySession,
  loadSchedulingState,
  saveSchedulingState,
} = require("./stateStore.js");

function getCleanAvailabilityTier(tier) {
  if (!tier || tier.includes("${")) {
    return "match";
  }

  return tier;
}

function ensureAvailabilitySession({
  threadId,
  tier,
  teamRoleIds = [],
  homeRoleId = null,
  weekStartDate = null,
}) {
  const state = loadSchedulingState();
  const timestamp = new Date().toISOString();
  const resolvedWeekStartDate =
    weekStartDate ?? getWeekStartDateFromIso(timestamp);

  state.sessions ??= {};
  state.sessions[threadId] ??= {
    threadId,
    tier,
    teamRoleIds,
    homeRoleId,
    weekStartDate: resolvedWeekStartDate,
    availability: {},
    controlMessageId: null,
    overlap: [],
    status: "COLLECTING_AVAILABILITY",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const session = state.sessions[threadId];
  session.tier = tier;
  session.teamRoleIds = teamRoleIds.length > 0 ? teamRoleIds : session.teamRoleIds ?? [];
  session.homeRoleId = homeRoleId ?? session.homeRoleId ?? null;
  session.weekStartDate ??= resolvedWeekStartDate ?? getCurrentWeekStartDate();
  session.availability ??= {};
  session.overlap ??= [];
  session.status ??= "COLLECTING_AVAILABILITY";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return session;
}

function markSchedulingFinalized(threadId, finalization) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return null;
  }

  const timestamp = new Date().toISOString();
  session.confirmedTime = {
    ...session.confirmedTime,
    day: finalization.day,
    time: finalization.time,
    date: finalization.date,
    dateTime: finalization.dateTime,
    display: finalization.display,
    timestamp: finalization.timestamp,
    timeZone: finalization.timeZone,
    source: finalization.source,
    selectedByUserId: finalization.selectedByUserId,
  };
  session.scheduleMatch = {
    weekNumber: finalization.weekNumber,
    gamedayNum: finalization.gamedayNum,
    tier: finalization.tier,
    teams: finalization.teams,
  };
  session.scheduleFinalizedAt = timestamp;
  session.status = "CONFIRMED";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return session;
}

function setSchedulingControlMessageId(threadId, messageId) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return null;
  }

  session.controlMessageId = messageId;
  session.updatedAt = new Date().toISOString();

  saveSchedulingState(state);
  return session;
}

function saveCaptainAvailability({
  threadId,
  tier,
  userId,
  displayName,
  teamRoleId,
  day,
  selectedTimes,
}) {
  const state = loadSchedulingState();
  const timestamp = new Date().toISOString();

  state.sessions ??= {};
  state.sessions[threadId] ??= {
    threadId,
    tier,
    availability: {},
    createdAt: timestamp,
  };

  const session = state.sessions[threadId];
  session.tier ??= tier;
  session.availability ??= {};
  session.overlap = [];
  session.status = "COLLECTING_AVAILABILITY";
  session.availability[userId] ??= {
    userId,
    displayName,
    teamRoleId,
    days: {},
    updatedAt: timestamp,
  };

  const captainAvailability = session.availability[userId];
  captainAvailability.displayName = displayName;
  captainAvailability.teamRoleId = teamRoleId ?? captainAvailability.teamRoleId ?? null;
  captainAvailability.days ??= {};
  delete captainAvailability.submittedAt;

  if (selectedTimes.length === 0) {
    delete captainAvailability.days[day];
  } else {
    captainAvailability.days[day] = selectedTimes;
  }

  captainAvailability.updatedAt = timestamp;
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return captainAvailability;
}

function getMemberRoleIds(member) {
  const roles = member?.roles;

  if (!roles) {
    return [];
  }

  if (Array.isArray(roles)) {
    return roles;
  }

  if (roles.cache?.keys) {
    return [...roles.cache.keys()];
  }

  return [];
}

function getAvailabilityTeamRoleId(session, member) {
  const memberRoleIds = getMemberRoleIds(member);
  const teamRoleIds = session?.teamRoleIds ?? [];
  return teamRoleIds.find((roleId) => memberRoleIds.includes(roleId)) ?? null;
}

function canUseAvailabilityForm(session, interaction) {
  const memberRoleIds = getMemberRoleIds(interaction.member);
  const captainRoleId = captainRoles[session.tier];

  if (captainRoleId && !memberRoleIds.includes(captainRoleId)) {
    return false;
  }

  if (session.teamRoleIds?.length > 0 && !getAvailabilityTeamRoleId(session, interaction.member)) {
    return false;
  }

  return true;
}

function getSelectedAvailabilityCount(captainAvailability) {
  return Object.values(captainAvailability.days ?? {}).reduce(
    (total, times) => total + times.length,
    0,
  );
}

function submitCaptainAvailability({
  threadId,
  userId,
  displayName,
  teamRoleId,
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return { ok: false, reason: "No availability session exists for this thread." };
  }

  session.availability ??= {};
  const captainAvailability = session.availability[userId];

  if (!captainAvailability || getSelectedAvailabilityCount(captainAvailability) === 0) {
    return { ok: false, reason: "Pick at least one available time before submitting." };
  }

  if (captainAvailability.submittedAt) {
    return { ok: true, alreadySubmitted: true, session, captainAvailability };
  }

  const timestamp = new Date().toISOString();
  captainAvailability.displayName = displayName;
  captainAvailability.teamRoleId = teamRoleId ?? captainAvailability.teamRoleId ?? null;
  captainAvailability.submittedAt = timestamp;
  captainAvailability.updatedAt = timestamp;
  session.updatedAt = timestamp;

  const status = getAvailabilitySubmissionStatus(session);

  if (status.complete) {
    session.overlap = calculateAvailabilityOverlap(session);
    session.status = session.overlap.length > 0 ? "OVERLAP_FOUND" : "NO_OVERLAP";
  } else {
    session.overlap = [];
    session.status = "AWAITING_AVAILABILITY";
  }

  saveSchedulingState(state);

  return {
    ok: true,
    alreadySubmitted: false,
    session,
    captainAvailability,
    ...status,
    overlap: session.overlap,
  };
}

function getAvailabilitySubmissionStatus(session) {
  const submittedCaptains = Object.values(session.availability ?? {}).filter(
    (captainAvailability) => captainAvailability.submittedAt,
  );
  const teamRoleIds = session.teamRoleIds ?? [];

  if (teamRoleIds.length > 0) {
    const submittedTeamRoleIds = new Set(
      submittedCaptains
        .map((captainAvailability) => captainAvailability.teamRoleId)
        .filter(Boolean),
    );
    const missingTeamRoleIds = teamRoleIds.filter(
      (teamRoleId) => !submittedTeamRoleIds.has(teamRoleId),
    );

    return {
      complete: missingTeamRoleIds.length === 0,
      missingTeamRoleIds,
      submittedCaptains,
    };
  }

  return {
    complete: submittedCaptains.length >= 2,
    missingTeamRoleIds: [],
    submittedCaptains,
  };
}

function getCaptainsForOverlap(session) {
  const submittedCaptains = Object.values(session.availability ?? {}).filter(
    (captainAvailability) => captainAvailability.submittedAt,
  );
  const teamRoleIds = session.teamRoleIds ?? [];

  if (teamRoleIds.length === 0) {
    return submittedCaptains
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(0, 2);
  }

  return teamRoleIds
    .map((teamRoleId) =>
      submittedCaptains
        .filter((captainAvailability) => captainAvailability.teamRoleId === teamRoleId)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0],
    )
    .filter(Boolean);
}

function calculateAvailabilityOverlap(session) {
  const captains = getCaptainsForOverlap(session);

  if (captains.length < 2) {
    return [];
  }

  return AVAILABILITY_DAYS.flatMap((day) =>
    AVAILABILITY_TIMES.filter((time) =>
      captains.every((captainAvailability) =>
        (captainAvailability.days?.[day] ?? []).includes(time),
      ),
    ).map((time) => ({ day, time })),
  );
}

function formatCaptainAvailability(captainAvailability) {
  const lines = AVAILABILITY_DAYS.map((day) => {
    const times = captainAvailability.days?.[day] ?? [];
    return times.length > 0 ? `- ${day}: ${times.join(", ")}` : null;
  }).filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- No times selected.";
}

function formatOverlap(overlap) {
  const lines = AVAILABILITY_DAYS.map((day) => {
    const times = overlap
      .filter((slot) => slot.day === day)
      .map((slot) => slot.time);

    return times.length > 0 ? `- ${day}: ${times.join(", ")}` : null;
  }).filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- No overlapping times.";
}

function formatMissingAvailability(session, missingTeamRoleIds) {
  if (missingTeamRoleIds?.length > 0) {
    return missingTeamRoleIds.map((roleId) => `<@&${roleId}>`).join(", ");
  }

  return "the other captain";
}

function isHomeCaptain(session, interaction) {
  return (
    canUseAvailabilityForm(session, interaction) &&
    Boolean(session.homeRoleId) &&
    getMemberRoleIds(interaction.member).includes(session.homeRoleId)
  );
}

function getOverlapDays(session) {
  return AVAILABILITY_DAYS.filter((day) =>
    (session.overlap ?? []).some((slot) => slot.day === day),
  );
}

function getOverlapTimesForDay(session, day) {
  return (session.overlap ?? [])
    .filter((slot) => slot.day === day)
    .map((slot) => slot.time);
}

function confirmFinalTime({ threadId, day, time, selectedByUserId, source }) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return { ok: false, reason: "No scheduling session exists for this thread." };
  }

  const timestamp = new Date().toISOString();
  session.confirmedTime = {
    day,
    time,
    source,
    selectedByUserId,
    confirmedAt: timestamp,
  };
  session.status = "CONFIRMED";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return { ok: true, session };
}

function createManualTimeProposal({
  threadId,
  userId,
  displayName,
  teamRoleId,
  day,
  time,
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return { ok: false, reason: "No scheduling session exists for this thread." };
  }

  const timestamp = new Date().toISOString();
  session.manualProposal = {
    id: Date.now().toString(36),
    day,
    time,
    proposedByUserId: userId,
    proposedByDisplayName: displayName,
    proposedByTeamRoleId: teamRoleId,
    confirmations: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  session.status = "MANUAL_PROPOSED";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return { ok: true, session, proposal: session.manualProposal };
}

function createOverlapTimeProposal({
  threadId,
  userId,
  displayName,
  teamRoleId,
  day,
  time,
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return { ok: false, reason: "No scheduling session exists for this thread." };
  }

  const timestamp = new Date().toISOString();

  // The proposing (home) captain implicitly agrees, so pre-confirm their team.
  const confirmations = teamRoleId
    ? { [teamRoleId]: { userId, displayName, confirmedAt: timestamp } }
    : {};

  session.manualProposal = {
    id: Date.now().toString(36),
    day,
    time,
    source: "overlap",
    proposedByUserId: userId,
    proposedByDisplayName: displayName,
    proposedByTeamRoleId: teamRoleId,
    confirmations,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  session.status = "OVERLAP_PROPOSED";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return { ok: true, session, proposal: session.manualProposal };
}

function confirmManualTimeProposal({
  threadId,
  proposalId,
  userId,
  displayName,
  teamRoleId,
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session?.manualProposal) {
    return { ok: false, reason: "There is no manual time proposal to agree to." };
  }

  if (proposalId && session.manualProposal.id !== proposalId) {
    return { ok: false, reason: "That proposal is no longer active." };
  }

  if (!teamRoleId) {
    return { ok: false, reason: "Only captains for this match can agree to the proposed time." };
  }

  const timestamp = new Date().toISOString();
  session.manualProposal.confirmations ??= {};

  if (session.manualProposal.confirmations[teamRoleId]) {
    return {
      ok: true,
      alreadyConfirmed: true,
      complete: false,
      session,
      proposal: session.manualProposal,
      missingTeamRoleIds: getMissingManualConfirmationTeamRoleIds(session),
    };
  }

  session.manualProposal.confirmations[teamRoleId] = {
    userId,
    displayName,
    confirmedAt: timestamp,
  };
  session.manualProposal.updatedAt = timestamp;
  session.updatedAt = timestamp;

  const missingTeamRoleIds = getMissingManualConfirmationTeamRoleIds(session);

  if (missingTeamRoleIds.length === 0) {
    session.confirmedTime = {
      day: session.manualProposal.day,
      time: session.manualProposal.time,
      source: session.manualProposal.source ?? "manual",
      selectedByUserId: session.manualProposal.proposedByUserId,
      confirmedAt: timestamp,
    };
    session.manualProposal.confirmedAt = timestamp;
    session.status = "CONFIRMED";
  }

  saveSchedulingState(state);

  return {
    ok: true,
    alreadyConfirmed: false,
    complete: missingTeamRoleIds.length === 0,
    session,
    proposal: session.manualProposal,
    missingTeamRoleIds,
  };
}

function getMissingManualConfirmationTeamRoleIds(session) {
  const confirmations = session.manualProposal?.confirmations ?? {};
  return (session.teamRoleIds ?? []).filter((teamRoleId) => !confirmations[teamRoleId]);
}

function isSchedulingStaff(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      getMemberRoleIds(interaction.member).includes(SCHEDULING_TEAM_ROLE_ID),
  );
}

function resetSchedulingSession(threadId) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return null;
  }

  const timestamp = new Date().toISOString();
  session.availability = {};
  session.overlap = [];
  delete session.manualProposal;
  delete session.confirmedTime;
  delete session.scheduleMatch;
  delete session.scheduleFinalizedAt;
  session.status = "COLLECTING_AVAILABILITY";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return session;
}

module.exports = {
  canUseAvailabilityForm,
  confirmFinalTime,
  confirmManualTimeProposal,
  createManualTimeProposal,
  createOverlapTimeProposal,
  ensureAvailabilitySession,
  formatCaptainAvailability,
  formatMissingAvailability,
  formatOverlap,
  getAvailabilitySession,
  getAvailabilityTeamRoleId,
  getCleanAvailabilityTier,
  getMemberRoleIds,
  getOverlapDays,
  getOverlapTimesForDay,
  isHomeCaptain,
  isSchedulingStaff,
  markSchedulingFinalized,
  resetSchedulingSession,
  saveCaptainAvailability,
  setSchedulingControlMessageId,
  submitCaptainAvailability,
};
