const path = require("path");
const { mutateJsonFile, readJsonFile } = require("./jsonStore.js");

const schedulePath = path.join(__dirname, "../../data/schedule.json");
const scheduleFallback = () => ({ weeks: [] });

// Always reads fresh from disk. Callers that need current scheduling state must
// use this rather than require()-ing schedule.json, whose module cache does not
// reflect writes made through mutateSchedule.
function loadSchedule() {
  return readJsonFile(schedulePath, scheduleFallback);
}

// Serialized, atomic read-modify-write of schedule.json. The mutator receives a
// freshly-read schedule and must apply its change to that object.
function mutateSchedule(mutator) {
  return mutateJsonFile(schedulePath, mutator, scheduleFallback);
}

function findMatchByThreadId(schedule, threadId) {
  for (const week of schedule.weeks ?? []) {
    for (const gameday of week.gamedays ?? []) {
      for (const match of gameday.matches ?? []) {
        for (const [tier, tierData] of Object.entries(match.tiers ?? {})) {
          if (String(tierData.threadID) === String(threadId)) {
            return { gameday, match, tier, tierData, week };
          }
        }
      }
    }
  }

  return null;
}

// Persist a thread ID onto a specific match/tier, locating it by position the
// same way /thread-create iterates (week array index + gameday number + the
// team pairing). Runs under the schedule lock so it can't clobber a concurrent
// finalize/reset.
function setMatchThreadId({ weekIndex, gamedayNum, teams, tier, threadId }) {
  return mutateSchedule((schedule) => {
    const week = (schedule.weeks ?? [])[weekIndex];
    const gameday = week?.gamedays?.find(
      (candidate) => String(candidate.gamedayNum) === String(gamedayNum),
    );
    const match = gameday?.matches?.find(
      (candidate) =>
        Array.isArray(candidate.teams) &&
        candidate.teams.includes(teams[0]) &&
        candidate.teams.includes(teams[1]) &&
        candidate.tiers?.[tier],
    );

    if (!match) {
      return { ok: false };
    }

    match.tiers[tier].threadID = threadId;
    return { ok: true };
  });
}

module.exports = {
  findMatchByThreadId,
  loadSchedule,
  mutateSchedule,
  schedulePath,
  setMatchThreadId,
};
