const path = require("path");
const { readJsonFile, writeJsonFileAtomic } = require("./jsonStore.js");

const schedulingStatePath = path.join(__dirname, "../../data/scheduling_state.json");
const stateFallback = () => ({ sessions: {} });

function loadSchedulingState() {
  const state = readJsonFile(schedulingStatePath, stateFallback);
  state.sessions ??= {};
  return state;
}

function saveSchedulingState(state) {
  writeJsonFileAtomic(schedulingStatePath, state);
}

function getAvailabilitySession(threadId) {
  const state = loadSchedulingState();
  return state.sessions?.[threadId] ?? null;
}

function listSessionThreadIds() {
  return Object.keys(loadSchedulingState().sessions ?? {});
}

function removeSchedulingSession(threadId) {
  const state = loadSchedulingState();

  if (!state.sessions?.[threadId]) {
    return false;
  }

  delete state.sessions[threadId];
  saveSchedulingState(state);
  return true;
}

module.exports = {
  getAvailabilitySession,
  listSessionThreadIds,
  loadSchedulingState,
  removeSchedulingSession,
  saveSchedulingState,
};
