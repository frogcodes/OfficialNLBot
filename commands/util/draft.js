const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require("discord.js");
const teams = require("../../data/teams.json");
const { faRoles, leagueRoles } = require("../../data/roles.json");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

var pickNumber = 0;

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("draft")
    .setDescription("Announce a player draft to a team")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player who got drafted")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("team")
        .setDescription("The team the player is drafted to")
        .setRequired(true)
        .addChoices(...teamChoices),
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      // Get the draft announcement channel
      const DRAFT_CHANNEL_ID = "1197993529469849720";
      const channel = await interaction.guild.channels.fetch(DRAFT_CHANNEL_ID);

      if (!channel) {
        return interaction.editReply({
          content: "Error: Draft announcement channel not found.",
        });
      }

      // Get command options
      const teamName = interaction.options.getString("team");
      const player = interaction.options.getUser("player");
      const member = await interaction.guild.members.fetch(player.id);
      const tier =
        Object.entries(leagueRoles).find(([_, roleId]) =>
          member.roles.cache.has(roleId),
        )?.[0] || undefined;

      pickNumber = pickNumber + 1;

      // Get team data - first try direct team name lookup
      let teamData = teams[teamName];

      // If that fails, check if they passed a role ID instead of a team name
      if (!teamData && roleIdToTeam[teamName]) {
        const correctTeamName = roleIdToTeam[teamName];
        teamData = teams[correctTeamName];
        console.log(
          `Converted role ID ${teamName} to team name ${correctTeamName}`,
        );
      }

      // Debug logging
      console.log("Team name provided:", teamName);
      console.log("Team data found:", teamData);

      if (!teamData) {
        return interaction.editReply({
          content: `Error: Team data not found for "${teamName}". Please use one of the team names from the dropdown.`,
        });
      }

      // Handle local images vs URLs
      let files = [];
      let imageUrl = teamData.bannerImage;

      // Check if bannerImage is a local file path (doesn't start with http)
      if (teamData.bannerImage && !teamData.bannerImage.startsWith("http")) {
        // Construct absolute path - adjust based on where your images actually are
        const imagePath = path.resolve(
          __dirname,
          "../../images/drafted",
          path.basename(teamData.bannerImage),
        );

        console.log("Attempting to load image from:", imagePath); // Debug log

        const file = new AttachmentBuilder(imagePath);
        files.push(file);
        const fileName = path.basename(teamData.bannerImage);
        imageUrl = `attachment://${fileName}`;
      }

      // Create the draft announcement embed
      const draftEmbed = new EmbedBuilder()
        .setColor(teamData.color)
        .setDescription(
          `${player} has been drafted to the <@&${teamData.roleId}> (${tier} League)`,
        )
        .setImage(imageUrl)
        //.setTimestamp()
        .setFooter({
          text: `Pick #${pickNumber}`,
        });

      // Send the draft announcement with files array
      await channel.send({
        content: `Congratulations ${player}!`,
        embeds: [draftEmbed],
        files: files, // Include the files array
      });

      // roles the player
      await member.roles.remove(faRoles[tier]);
      await member.roles.add(teamData.roleId);

      let userDisplayName = member.nickname || player.username;

      console.log(userDisplayName);
      const awards = [];
      const possibleAwards = ["🏆", "🌟"];

      // Extract awards from the display name
      for (const emoji of possibleAwards) {
        while (userDisplayName.endsWith(emoji)) {
          awards.push(emoji);
          userDisplayName = userDisplayName.slice(0, -emoji.length).trim();
        }
      }

      awards.reverse();

      let newFullName;
      if (!userDisplayName.includes("|")) {
        newFullName = `${userDisplayName} | ${teamName} ${awards.join("")}`;
      }

      if (userDisplayName.includes("|")) {
        const userNameParts = userDisplayName.split(" | ");
        newFullName = `${userNameParts[0]} | ${teamName} ${awards.join("")}`;
      }

      if (newFullName.length < 33) {
        await member.setNickname(newFullName);
      } else {
        console.log(
          `<@351480764602515487> ${player.username}'s nickname is too long. Please manually do it`,
        );
      }

      // Confirm to the command user
      await interaction.editReply({
        content: `Draft announcement sent for ${player} to ${teamName}!`,
      });
    } catch (error) {
      console.error("Error in draft command:", error);

      // Provide a user-friendly error message
      await interaction.editReply({
        content:
          "There was an error processing the draft command. Please check the logs and make sure you're selecting a team from the dropdown menu.",
      });
    }
  },
};
