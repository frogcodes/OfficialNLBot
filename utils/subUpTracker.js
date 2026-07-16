// utils/subUpTracker.js
// Tracks how many times each player has subbed up (played a match in a tier
// above their own) this season. Stored in data/subUps.json as { userId: count }.
// A player may sub up at most SUB_UP_CAP times per season.

const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/subUps.json");
const SUB_UP_CAP = 6;

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

function getCount(userId) {
  const data = load();
  return data[userId] || 0;
}

function increment(userId) {
  const data = load();
  data[userId] = (data[userId] || 0) + 1;
  save(data);
  return data[userId];
}

// Wipe all sub-up counts (called on season clear)
function resetAll() {
  save({});
}

module.exports = { getCount, increment, resetAll, SUB_UP_CAP };
