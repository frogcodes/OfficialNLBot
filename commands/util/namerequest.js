const { SlashCommandBuilder } = require("discord.js");

const TRANSACTION_TEAM_ROLE_ID = "1181050438926209083"; // Ensure this is correct
const TransactionsChannel = "1340803096288297031";
const requestChannelID = "1340809697619611719";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("namerequest")
    .setDescription("Request a name change")
    .addStringOption((option) =>
      option
        .setName("new_name")
        .setDescription('The new part of your name (before "|")')
        .setRequired(true)
    ),

  async execute(interaction) {
    let newFullName = "";
    let awards = [];
    const newName = interaction.options.getString("new_name");

    // Ensure the user has requested only the new part of their name
    if (newName.includes("🏆") || newName.includes("🌟")) {
      await interaction.reply({
        content: "Please provide only the name and not the awards.",
        ephemeral: true,
      });
      return;
    }

    if (newName.includes("|")) {
      await interaction.reply({
        content: "Please provide only the name before the '|' symbol.",
        ephemeral: true,
      });
      return;
    }

    var userDisplayName = interaction.member.displayName;
    const possibleAwards = ["🏆", "🌟"];

    // Extract awards from the display name
    for (const emoji of possibleAwards) {
      while (userDisplayName.endsWith(emoji)) {
        awards.push(emoji); // Add the emoji to the awards array
        userDisplayName = userDisplayName.slice(0, -emoji.length).trim(); // Remove the emoji from the end
      }
    }

    awards.reverse();

    if (!userDisplayName.includes("|")) {
      newFullName = `${newName} ${awards.join("")}`;
    }

    if (userDisplayName.includes("|")) {
      const userNameParts = userDisplayName.split(" | ");

      if (userNameParts.length < 2) {
        await interaction.reply({
          content:
            "Your name doesn't follow the format 'name | franchise'. Please correct it.",
          ephemeral: true,
        });
        return;
      }

      const currentName = userNameParts[0];
      const franchise = userNameParts[1];
      newFullName = `${newName} | ${franchise} ${awards.join("")}`;
    }

    // Check if the new name exceeds 32 characters
    if (newFullName.length > 32) {
      const excessLength = newFullName.length - 32;
      await interaction.reply({
        content: `Your new name is too long by ${excessLength} character(s). Please shorten it and try again.`,
        ephemeral: true,
      });
      return;
    }

    channel = interaction.client.channels.cache.get(TransactionsChannel);
    await interaction.reply({
      content: `Your name has been requested.`,
      ephemeral: true,
    });

    // Post a message for the transaction team to approve or decline
    const message = await channel.send({
      content: `${interaction.user} is requesting a name change to: **${newFullName}**`,
    });

    // Add reaction buttons for approval and decline
    await message.react("✅"); // Checkmark for approve
    await message.react("❌"); // Cross for decline

    // Filter for reactions
    const filter = (reaction, user) => {
      console.log(`Reaction: ${reaction.emoji.name}, User: ${user.tag}`);

      // Check if the reaction is in a guild
      if (!reaction.message.guild) {
        console.error("Reaction is not in a guild.");
        return false;
      }

      // Get the guild member who reacted
      const member = reaction.message.guild.members.cache.get(user.id);
      if (!member) {
        console.error("Member not found in the guild.");
        return false;
      }

      console.log(
        `Member: ${member.user.tag}, Roles: ${member.roles.cache
          .map((role) => role.name)
          .join(", ")}`
      );

      // Check if the reaction emoji is ✅ or ❌ and if the member has the required role
      return (
        ["✅", "❌"].includes(reaction.emoji.name) && // Check the emoji
        member.roles.cache.has(TRANSACTION_TEAM_ROLE_ID) // Check if the member has the role
      );
    };

    // Wait for a reaction from the Transaction Team
    try {
      const collected = await message.awaitReactions({
        filter,
        max: 1,
        time: 1000 * 60 * 60 * 24, // 1 day
        errors: ["time"],
      });

      const reaction = collected.first();

      requestChannel = interaction.client.channels.cache.get(requestChannelID);

      if (reaction.emoji.name === "✅") {
        // Approve the name change
        await interaction.member.setNickname(newFullName);
        await requestChannel.send(
          `${interaction.user}'s name has been changed to ${newFullName} from ${userDisplayName}.`
        );
      } else if (reaction.emoji.name === "❌") {
        // Decline the name change
        await requestChannel.send(
          `${interaction.user}'s name change request to ${newFullName} has been declined.`
        );
      }
    } catch (err) {
      console.error("Error in awaitReactions:", err);
      await interaction.followUp({
        content: "No response from the Transaction Team. Request timed out.",
        ephemeral: true,
      });
    }
  },
};
