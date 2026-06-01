const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "playerHistory.json"); // Adjust if needed

function readData() {
  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function formatDate() {
  const now = new Date();
  return now
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-");
}

/**
 * Updates a player's history only if the team or tier changed.
 * Adds a reason for tracking why the move happened.
 */
function updatePlayerHistory(discordId, team, tier, reason = "updated") {
  const data = readData();
  const today = formatDate();

  if (!data.players[discordId]) {
    data.players[discordId] = [];
  }

  const history = data.players[discordId];
  const last = history[history.length - 1];

  // If no change in team or tier, do nothing
  if (
    last &&
    last.team === team &&
    last.tier === tier &&
    last.date.endsWith("present")
  ) {
    return false; // No update needed
  }

  // Close previous open period
  if (last && last.date.endsWith("present")) {
    last.date = last.date.replace("present", today);
  }

  // Add new history entry
  history.push({
    tier,
    team,
    reason,
    date: `${today} - present`,
  });

  writeData(data);
  return true;
}

/**
 * Closes the active "present" history slot (if exists).
 */
function closeCurrentHistory(discordId) {
  const data = readData();
  const today = formatDate();

  const history = data.players[discordId];
  if (!history || history.length === 0) return false;

  const last = history[history.length - 1];
  if (last.date.endsWith("present")) {
    last.date = last.date.replace("present", today);
    writeData(data);
    return true;
  }

  return false;
}

/**
 * Returns a full copy of a player's team history
 */
function getPlayerHistory(discordId) {
  const data = readData();
  return data.players[discordId] || [];
}

// Add your emoji mapping here
const emojis = {
  teams: {
    "Blue Jays": "<:BlueJays:1201236883309609041>",
    Capybaras: "<:Capybaras:1201236885918457886>",
    Cardinals: "<:Cardinals:1201232829217001572>",
    Cheetahs: "<:Cheetahs:1201232832803111014>",
    Eagles: "<:eagles:1404150100640403616>",
    Kangaroos: "<:Kangaroos:1201232845130170460>",
    Lynx: "<:Lynx:1277366796470452234>",
    Narwhals: "<:Narwhals:1277366819983720501>",
    Owls: "<:Owls:1201232848208810216>",
    Panthers: "<:Panthers:1343335565000704051>",
    Raccoons: "<:Raccoons:1277366867664830465>",
    Sharks: "<:Sharks:1234209961995665428>",
    Squirrels: "<:Squirrels:1201238219895865495>",
    Stingrays: "<:Stingrays:1234209963585437696>",
    Turtles: "<:Turtles:1234209964688408597>",
    Wolves: "<:Wolves:1343335566464385139>",
  },
  tiers: {
    apex: "🟣",
    alpha: "🔴",
    beta: "🟢",
    delta: "🔵",
    omega: "🟡",
  },
};

/**
 * Returns a display-friendly version of a player's history
 * Format: [team emoji] [tier emoji] [date range] [reason]
 */
function displayHistory(discordId) {
  const history = getPlayerHistory(discordId);

  if (!history.length) return ["No history found."];

  return history.map((entry) => {
    const teamEmoji = emojis.teams[entry.team] || entry.team;
    const tierEmoji = emojis.tiers[entry.tier] || entry.tier;
    const date = `${entry.signed} - ${entry.released}`;
    const reason = entry.reason || "updated";

    return `${teamEmoji} ${tierEmoji} ${date} ${reason}`;
  });
}

module.exports = {
  updatePlayerHistory,
  closeCurrentHistory,
  getPlayerHistory,
  displayHistory,
};
