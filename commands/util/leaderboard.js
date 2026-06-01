const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const balancesFile = path.join(__dirname, "../../data", "playerBalances.json");

// Read balances
function readBalances() {
  if (!fs.existsSync(balancesFile)) return [];
  return JSON.parse(fs.readFileSync(balancesFile, "utf8"));
}

// Function to build leaderboard embed
function buildLeaderboardEmbed(sortedBalances, client) {
  let desc = "";

  sortedBalances.forEach((entry, index) => {
    const rank = index + 1;
    const username =
      client.users.cache.get(entry.user)?.username || `User ${entry.user}`;
    desc += `**#${rank}** <@${
      entry.user
    }> — 💰 $${entry.balance.toLocaleString()}\n`;
  });

  return new EmbedBuilder()
    .setTitle("💰 Top Richest Players")
    .setDescription(desc || "Nobody has earned money yet!")
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
    .filter((player) => player.balance >= 1000) // only keep players above threshold
    .sort((a, b) => b.balance - a.balance) // sort highest → lowest
    .slice(0, 100); // take top 100

  const embed = buildLeaderboardEmbed(sorted, client);

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

  setInterval(async () => {
    sendLeaderboard(client);
  }, 30 * 60 * 1000); // every 30 minutes
}

module.exports = { startLeaderboardUpdater };
