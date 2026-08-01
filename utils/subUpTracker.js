// utils/subUpTracker.js
// Tracks how many times each player has subbed up (played a match in a tier above
// their own) this season, PER (team, tier) combination.
//
// Rule: a player may sub up FOR THE SAME TEAM WITHIN THE SAME TIER at most
// SUB_UP_CAP (4) times per season — the 5th for that team+tier is over the
// limit. Two different teams, or two different tiers, are counted separately.
//
// Stored in data/subUps.json as:
//   { "<userId>": { "<Team>|<Tier>": count, ... }, ... }

const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/subUps.json");
const SUB_UP_CAP = 4;

function load() {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function comboKey(team, tier) {
  return `${team}|${tier}`;
}

// Count of sub-ups for one player + team + tier this season.
function getCount(userId, team, tier) {
  const entry = load()[userId];
  // Ignore the old flat "{ userId: number }" format — new rule counts per combo.
  if (!entry || typeof entry !== "object") return 0;
  return entry[comboKey(team, tier)] || 0;
}

// Increment that player + team + tier and return the new count.
function increment(userId, team, tier) {
  const data = load();
  if (!data[userId] || typeof data[userId] !== "object") data[userId] = {};
  const key = comboKey(team, tier);
  data[userId][key] = (data[userId][key] || 0) + 1;
  save(data);
  return data[userId][key];
}

// Wipe all sub-up counts (called on season clear).
function resetAll() {
  save({});
}

module.exports = { getCount, increment, resetAll, SUB_UP_CAP, comboKey };
