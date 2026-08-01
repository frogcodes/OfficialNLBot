const { PermissionFlagsBits } = require("discord.js");
const { captainRoles } = require("../../data/roles.json");
const {
  MANAGEMENT_ROLE_IDS,
  SCHEDULING_TEAM_ROLE_ID,
} = require("./constants.js");
const {
  getCurrentWeekStartDate,
  getWeekStartDateFromIso,
} = require("./dateUtils.js");
const {
  computeOverlapByDay,
  countIntervals,
  formatAvailabilityByDay,
  getOverlapDays: getOverlapDaysFromMap,
  isTimeWithinOverlap: isTimeWithinOverlapMap,
  overlapHasAny,
} = require("./timeRange.js");
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
    overlapByDay: {},
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
  session.overlapByDay ??= {};
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

// Store a captain's full availability (typed as time ranges, one submission)
// and immediately mark it submitted, then recompute overlap/status.
function submitAvailabilityRanges({
  threadId,
  tier,
  userId,
  displayName,
  teamRoleId,
  availabilityByDay,
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return {
      ok: false,
      reason: "No scheduling session exists for this thread.",
    };
  }

  if (countIntervals(availabilityByDay) === 0) {
    return {
      ok: false,
      reason: "Enter at least one time range before submitting.",
    };
  }

  const timestamp = new Date().toISOString();
  session.tier ??= tier;
  session.availability ??= {};
  session.availability[userId] = {
    userId,
    displayName,
    teamRoleId:
      teamRoleId ?? session.availability[userId]?.teamRoleId ?? null,
    intervals: availabilityByDay,
    submittedAt: timestamp,
    updatedAt: timestamp,
  };
  session.updatedAt = timestamp;

  const status = getAvailabilitySubmissionStatus(session);

  if (status.complete) {
    session.overlapByDay = calculateAvailabilityOverlap(session);
    session.status = overlapHasAny(session.overlapByDay)
      ? "OVERLAP_FOUND"
      : "NO_OVERLAP";
  } else {
    session.overlapByDay = {};
    session.status = "AWAITING_AVAILABILITY";
  }

  saveSchedulingState(state);

  return {
    ok: true,
    session,
    captainAvailability: session.availability[userId],
    ...status,
  };
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

// The tier captain OR the team's management (zookeeper/handler) may submit
// availability and confirm times — but either way they must be on one of the two
// teams in this match, so a manager can't act for the opposing team.
function canUseAvailabilityForm(session, interaction) {
  const memberRoleIds = getMemberRoleIds(interaction.member);
  const captainRoleId = captainRoles[session.tier];

  const isCaptain = captainRoleId ? memberRoleIds.includes(captainRoleId) : true;
  const isManagement = MANAGEMENT_ROLE_IDS.some((roleId) =>
    memberRoleIds.includes(roleId),
  );

  if (!isCaptain && !isManagement) {
    return false;
  }

  if (session.teamRoleIds?.length > 0 && !getAvailabilityTeamRoleId(session, interaction.member)) {
    return false;
  }

  return true;
}

// The direct "Propose Time" button is open to the same people who can submit
// availability (captains + team management on either team) PLUS the scheduling
// lead, who can propose a time for any match even without a team role.
function canProposeTime(session, interaction) {
  return (
    isSchedulingStaff(interaction) ||
    canUseAvailabilityForm(session, interaction)
  );
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
    return {};
  }

  return computeOverlapByDay(captains[0].intervals, captains[1].intervals);
}

function formatCaptainAvailability(captainAvailability) {
  return formatAvailabilityByDay(captainAvailability?.intervals);
}

function formatOverlap(overlapByDay) {
  return formatAvailabilityByDay(overlapByDay);
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
  return getOverlapDaysFromMap(session?.overlapByDay);
}

function isTimeWithinOverlap(session, day, normalizedMinutes) {
  return isTimeWithinOverlapMap(session?.overlapByDay, day, normalizedMinutes);
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

// Create a proposed match time that the other team must confirm. When the
// proposer is on one of the teams, their team implicitly agrees (pre-confirmed),
// so only the opposing team still needs to confirm. When a scheduling lead who
// isn't on either team proposes, both teams must confirm.
//
// `source` distinguishes an overlap-derived proposal ("overlap", from the home
// captain picking within shared availability) from a direct proposal ("manual").
// The resulting status drives which control panel/agreement buttons show.
function createTimeProposal({
  threadId,
  userId,
  displayName,
  teamRoleId,
  day,
  time,
  timeNormalized,
  source = "manual",
}) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return { ok: false, reason: "No scheduling session exists for this thread." };
  }

  const timestamp = new Date().toISOString();
  const confirmations = teamRoleId
    ? { [teamRoleId]: { userId, displayName, confirmedAt: timestamp } }
    : {};

  session.manualProposal = {
    id: Date.now().toString(36),
    day,
    time,
    timeNormalized,
    source,
    proposedByUserId: userId,
    proposedByDisplayName: displayName,
    proposedByTeamRoleId: teamRoleId,
    confirmations,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  session.status = source === "overlap" ? "OVERLAP_PROPOSED" : "MANUAL_PROPOSED";
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
      timeNormalized: session.manualProposal.timeNormalized,
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
  session.overlapByDay = {};
  delete session.manualProposal;
  delete session.confirmedTime;
  delete session.scheduleMatch;
  delete session.scheduleFinalizedAt;
  session.status = "COLLECTING_AVAILABILITY";
  session.updatedAt = timestamp;

  saveSchedulingState(state);
  return session;
}

// Re-open time selection WITHOUT clearing availability — used by the Reschedule
// button so the teams can just pick a new time from their existing availability.
// Recomputes the status the same way a fresh availability submission would.
function reopenTimeSelection(threadId) {
  const state = loadSchedulingState();
  const session = state.sessions?.[threadId];

  if (!session) {
    return null;
  }

  delete session.manualProposal;
  delete session.confirmedTime;
  delete session.scheduleMatch;
  delete session.scheduleFinalizedAt;

  const status = getAvailabilitySubmissionStatus(session);
  if (status.complete) {
    session.overlapByDay = calculateAvailabilityOverlap(session);
    session.status = overlapHasAny(session.overlapByDay)
      ? "OVERLAP_FOUND"
      : "NO_OVERLAP";
  } else {
    session.overlapByDay = {};
    session.status = "AWAITING_AVAILABILITY";
  }

  session.updatedAt = new Date().toISOString();
  saveSchedulingState(state);
  return session;
}

module.exports = {
  canProposeTime,
  canUseAvailabilityForm,
  confirmFinalTime,
  confirmManualTimeProposal,
  createTimeProposal,
  ensureAvailabilitySession,
  formatCaptainAvailability,
  formatMissingAvailability,
  formatOverlap,
  getAvailabilitySession,
  getAvailabilityTeamRoleId,
  getCleanAvailabilityTier,
  getMemberRoleIds,
  getOverlapDays,
  isHomeCaptain,
  isSchedulingStaff,
  isTimeWithinOverlap,
  markSchedulingFinalized,
  reopenTimeSelection,
  resetSchedulingSession,
  setSchedulingControlMessageId,
  submitAvailabilityRanges,
};
