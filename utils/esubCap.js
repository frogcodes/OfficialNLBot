// utils/esubCap.js
// Tracks how many emergency subs each org (team) has used per tier this season.
// Stored in data/esubs.json as { [teamName]: { [tier]: count } }.
// Cap is per team + tier; reset on season clear.

const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/esubs.json");
const ESUB_CAP = 3;

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

function getCount(team, tier) {
  const data = load();
  return data[team]?.[tier] || 0;
}

function increment(team, tier) {
  const data = load();
  if (!data[team]) data[team] = {};
  data[team][tier] = (data[team][tier] || 0) + 1;
  save(data);
  return data[team][tier];
}

// Wipe all esub counts (called on season clear)
function resetAll() {
  save({});
}

module.exports = { getCount, increment, resetAll, ESUB_CAP };
