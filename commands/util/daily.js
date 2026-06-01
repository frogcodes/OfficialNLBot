const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

const file = path.join(__dirname, "../../data/cooldowns.json");

function readJSON() {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward!"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const cooldown = 24 * 60 * 60 * 1000; // 1 day
    const now = Date.now();

    let cooldowns = readJSON();
    if (!cooldowns[userId]) cooldowns[userId] = { hourly: 0, daily: 0 };

    const lastClaim = cooldowns[userId].daily;

    if (now - lastClaim < cooldown) {
      const timeLeft = cooldown - (now - lastClaim);
      const hours = Math.floor(timeLeft / 3600000);
      const minutes = Math.floor((timeLeft % 3600000) / 60000);
      return interaction.reply(
        `⏳ You already claimed! Try again in **${hours}h ${minutes}m**.`
      );
    }

    const member = await interaction.guild.members.fetch(userId);

    let reward = 1000;

    const hasBonusRole = member.roles.cache.has("1317686453685456967");

    changePlayerBalance(userId, hasBonusRole ? reward * 2 : reward);

    cooldowns[userId].daily = now;
    writeJSON(cooldowns);

    return interaction.reply(
      `🌞 You claimed your daily reward of **$${reward}**!`
    );
  },
};
