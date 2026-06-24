const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { faRoles, leagueRoles } = require("../../data/roles.json");

const ADMISSIONS_TEAM_ROLE_ID = "1181050438926209082";
const SAL_ANNOUNCE_CHANNEL = "1224920912386723840";
const PROCESSED_ROLE = "1337882326566440960";
const rfaRole = "1198452739378786324";
const faLeagueRole = "1470322091902373909";
const noReqsRole = "1470322130812932128";

async function getTier(sal) {
  console.log(sal);
  try {
    const filePath = path.join(__dirname, "../../data/ranges.json");
    const jsonData = await fs.promises.readFile(filePath, "utf8");
    const data = JSON.parse(jsonData);
    const { delta, beta, alpha, apex, omega } = data;
    console.log("Loaded tiers:", { omega, delta, beta, alpha, apex });

    if (sal < delta) return "Omega";
    else if (sal < beta) return "Delta";
    else if (sal < alpha) return "Beta";
    else if (sal < apex) return "Alpha";
    else return "Apex";
  } catch (err) {
    console.error("Error:", err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sal-announce")
    .setDescription("Salary Announce a player!")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("player to sal")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("salary")
        .setDescription("what salary is this player?")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply({
      content: `Calculating...`,
      ephemeral: true,
    });
    const i = await interaction.guild.members.fetch(interaction.user.id);
    if (!i.roles.cache.has(ADMISSIONS_TEAM_ROLE_ID)) {
      return interaction.editReply({
        content: "You are not an admissions team member!",
        ephemeral: true,
      });
    }

    let sal = Number(interaction.options.getString("salary"));
    let p = interaction.options.getUser("player");

    let player = await interaction.guild.members.fetch(p.id);

    const channel =
      await interaction.guild.channels.fetch(SAL_ANNOUNCE_CHANNEL);

    if (!channel) {
      return interaction.editReply({
        content: "Error: sal announcement channel not found.",
        ephemeral: true,
      });
    }

    let tier = await getTier(sal);

    if (!tier || !(tier in leagueRoles)) {
      return interaction.editReply({
        content: `Error determining tier. ${tier}`,
        ephemeral: true,
      });
    }
    let tierRoleToGive = leagueRoles[tier];
    let FArole = faRoles[tier];

    //await player.roles.add(rfaRole);
    await player.roles.add(PROCESSED_ROLE);
    await player.roles.add(tierRoleToGive);
    await player.roles.remove(noReqsRole);
    await player.roles.add(FArole);

    // const today = new Date();
    // const day = today.getDay(); // 0=Sunday, 1=Monday, ...
    // const daysUntilMonday = (8 - day) % 7 || 7; // always pushes to the *next* Monday
    // const nextMonday = new Date(today);
    // nextMonday.setDate(today.getDate() + daysUntilMonday);

    // Format as MM/DD with leading zeros
    // const month = String(nextMonday.getMonth() + 1).padStart(2, "0");
    // const date = String(nextMonday.getDate()).padStart(2, "0");
    // const formatted = `${month}/${date}`;

    // Remove any existing RFA tag, preserve everything else
    const withoutRFA = player.displayName.replace(
      /\s*RFA\s*\d{2}\/\d{2}\s*/,
      "",
    );

    // Extract base name and trailing emojis
    const match = withoutRFA.match(/^(.*?)\s*([⭐🏆]+)?\s*$/);
    const baseName = match ? match[1].trim() : withoutRFA.trim();
    const trailingEmojis = match && match[2] ? match[2] : "";

    // Build new nickname

    const newNickname = `${baseName} | FA ${trailingEmojis ? " " + trailingEmojis : ""}`; // until draft ends
    //const newNickname = `${baseName} | RFA ${formatted}${trailingEmojis ? " " + trailingEmojis : ""}`;
    try {
      await player.setNickname(newNickname);
    } catch (err) {
      console.log(err);
    }
    let data = {};
    const filePath = path.join(__dirname, "../../data/playerMMRs.json");
    try {
      const file = await fs.promises.readFile(filePath, "utf8");
      data = JSON.parse(file);
    } catch (err) {}

    data[player.id] = sal;

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));

    channel.send(`<@${player.id}> ${sal}`);

    return interaction.editReply({
      content: `Salary announced for <@${player.id}> as ${sal} (Tier: ${tier}).`,
      ephemeral: true,
    });
  },
};
