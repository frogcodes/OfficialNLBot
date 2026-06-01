const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const teams = require("../../data/teams.json");

const dotenv = require("dotenv");
dotenv.config();

const tierColors = {
  Apex: 0x6500af,
  Alpha: 0xdc143c,
  Beta: 0x00bd00,
  Delta: 0x4682b4,
  Omega: 0xffd700,
};

// Create an array of team names for choices
const teamChoices = Object.keys(teams).map((name) => ({
  name: name,
  value: name,
}));

// Create a roleId to team name mapping for quick lookup
const roleIdToTeam = {};
for (const [teamName, teamData] of Object.entries(teams)) {
  roleIdToTeam[teamData.roleId] = teamName;
}

// League tiers
const tiers = ["Apex", "Alpha", "Beta", "Delta", "Omega"];
const tierChoices = tiers.map((tier) => ({
  name: tier,
  value: tier,
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forfeit")
    .setDescription("Admin Forfeit Reporter")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("The tier of the match")
        .setRequired(true)
        .addChoices(...tierChoices)
    )
    .addStringOption((option) =>
      option
        .setName("winner")
        .setDescription("winner via ff")
        .setRequired(true)
        .addChoices(...teamChoices)
    )
    .addStringOption((option) =>
      option
        .setName("loser")
        .setDescription("ff loser")
        .setRequired(true)
        .addChoices(...teamChoices)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("loser via ff").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("gameday")
        .setDescription("Gameday Number of the match")
        .setRequired(true)
        .addChoices(
          { name: "Gameday 1", value: "1" },
          { name: "Gameday 2", value: "2" },
          { name: "Gameday 3", value: "3" },
          { name: "Gameday 4", value: "4" },
          { name: "Gameday 5", value: "5" },
          { name: "Gameday 6", value: "6" },
          { name: "Gameday 7", value: "7" },
          { name: "Gameday 8", value: "8" },
          { name: "Gameday 9", value: "9" },
          { name: "Gameday 10", value: "10" },
          { name: "Gameday 11", value: "11" },
          { name: "Gameday 12", value: "12" },
          { name: "Gameday 13", value: "13" },
          { name: "Gameday 14", value: "14" },
          { name: "Gameday 15", value: "15" },
          { name: "Gameday 16", value: "16" },
          { name: "Gameday 17", value: "17" },
          { name: "Gameday 18", value: "18" },
          { name: "Gameday 19", value: "19" },
          { name: "Gameday 20", value: "20" },
          { name: "Gameday 21", value: "21" },
          { name: "Gameday 22", value: "22" },
          { name: "Gameday 23", value: "23" },
          { name: "Playoffs", value: "Playoffs" }
        )
    ),
  async execute(interaction) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const apexReportID = "1181050441669279753";
    const alphaReportID = "1181050441845457028";
    const betaReportID = "1181050441845457029";
    const deltaReportID = "1183463506507468811";
    const omegaReportID = "1183463475687723008";

    try {
      const apexReport = await interaction.guild.channels.fetch(apexReportID);
      const alphaReport = await interaction.guild.channels.fetch(alphaReportID);
      const betaReport = await interaction.guild.channels.fetch(betaReportID);
      const deltaReport = await interaction.guild.channels.fetch(deltaReportID);
      const omegaReport = await interaction.guild.channels.fetch(omegaReportID);

      if (
        !apexReport ||
        !alphaReport ||
        !betaReport ||
        !deltaReport ||
        !omegaReport
      ) {
        return interaction.editReply({
          content: "Error: A channel was not found. :(",
          flags: MessageFlags.Ephemeral,
        });
      }
      const winner = interaction.options.getString("winner");
      const loser = interaction.options.getString("loser");
      const tier = interaction.options.getString("tier");
      const gameday = interaction.options.getString("gameday");
      const reason = interaction.options.getString("reason");

      let winnerData = teams[winner];

      // Create embed with match info
      const matchEmbed = new EmbedBuilder()
        .setTitle(`Forfeit in ${tier} Tier`)
        .setDescription(`Gameday ${gameday}`)
        .setThumbnail(`https://i.imgur.com/0IGk0bh.png`)
        .addFields(
          {
            name: `${winner} FFW vs ${loser}`,
            value: " ",
          },
          {
            name: "⚠️ FF Reason ⚠️",
            value: reason,
          }
        )
        .setColor(tierColors[tier] || 0x000000) // Also fix the color to use the team's color
        .setImage(winnerData.image) // Fix: add .image to access the image URL
        .setTimestamp()
        .setFooter({ text: `${interaction.user.tag} is a fraud` });

      // Determine which tier channel to send the report to
      let tierChannel;
      switch (tier) {
        case "Apex":
          tierChannel = apexReport;
          break;
        case "Alpha":
          tierChannel = alphaReport;
          break;
        case "Beta":
          tierChannel = betaReport;
          break;
        case "Delta":
          tierChannel = deltaReport;
          break;
        case "Omega":
          tierChannel = omegaReport;
          break;
      }

      if (tierChannel) {
        await tierChannel.send({ embeds: [matchEmbed] });
      }

      return interaction.editReply({
        content: "Forfeit has been posted successfully!",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error in forfeit command:", error);
      return interaction.editReply({
        content: `Error processing the forfeit report: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

function tierColor(tier) {
  if (tier == "Omega") {
    return 0xffd700;
  }
  if (tier == "Delta") {
    return 0x4682b4;
  }
  if (tier == "Beta") {
    return 0x00bd00;
  }
  if (tier == "Alpha") {
    return 0xdc143c;
  }
  if (tier == "Apex") {
    return 0x6500af;
  }
}
