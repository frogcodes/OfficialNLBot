// utils/leaderboard.js
// Keeps a pinned "Top Richest Players" embed up to date. Lives in utils/ (not
// commands/) because it exports no slash command — the loader would warn.
// Started from events/ready.js via startLeaderboardUpdater(client).

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const balancesFile = path.join(__dirname, "../data", "playerBalances.json");

// Players below this are hidden from the board.
const MIN_BALANCE = 1;

// Read balances
function readBalances() {
  if (!fs.existsSync(balancesFile)) return [];
  return JSON.parse(fs.readFileSync(balancesFile, "utf8"));
}

// Money with thousands separators AND cents: 1234.5 -> "1,234.50"
function formatBalance(amount) {
  return Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Function to build leaderboard embed
function buildLeaderboardEmbed(sortedBalances) {
  const lines = sortedBalances.map(
    (entry, index) =>
      `**#${index + 1}** <@${entry.user}> — 💰 $${formatBalance(entry.balance)}`,
  );

  // An embed description caps at 4096 chars; 100 ranked lines can exceed that,
  // which would make the whole edit fail. Keep what fits.
  const shown = [];
  let chars = 0;
  for (const line of lines) {
    if (chars + line.length + 1 > 3900) break;
    shown.push(line);
    chars += line.length + 1;
  }
  const hidden = lines.length - shown.length;
  if (hidden > 0) shown.push(`…and ${hidden} more`);

  return new EmbedBuilder()
    .setTitle("💰 Top Richest Players")
    .setDescription(shown.join("\n") || "Nobody has earned money yet!")
    .setColor("Gold")
    .setTimestamp();
}

async function sendLeaderboard(client) {
  const channelId = "1407787654459818145";
  const messageId = "1407790261085536357";

  const channel = await client.channels.fetch(channelId);

  const balances = readBalances();

  // Sort by balance and take top 100
  const sorted = balances
    .filter((player) => player.balance >= MIN_BALANCE) // only keep players above threshold
    .sort((a, b) => b.balance - a.balance) // sort highest → lowest
    .slice(0, 100); // take top 100

  const embed = buildLeaderboardEmbed(sorted);

  try {
    let msg;
    if (messageId) {
      msg = await channel.messages.fetch(messageId);
      await msg.edit({ embeds: [embed] });
    } else {
      msg = await channel.send({ embeds: [embed] });
      console.log("Save this message ID:", msg.id);
    }
  } catch (err) {
    console.error("Leaderboard update error:", err);
  }
}

// Auto-updater
async function startLeaderboardUpdater(client) {
  sendLeaderboard(client);

  setInterval(
    async () => {
      sendLeaderboard(client);
    },
    30 * 60 * 1000,
  ); // every 30 minutes
}

module.exports = { startLeaderboardUpdater };
