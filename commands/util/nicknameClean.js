const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fixnicknames")
    .setDescription(
      "Reorganizes server nicknames to move stars and trophies to the end",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;

    try {
      // Fetch all members
      const members = await guild.members.fetch();

      let updatedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      const errors = [];

      for (const [, member] of members) {
        // Skip bots
        if (member.user.bot) continue;

        const currentNick = member.nickname || member.user.username;
        const newNick = reorganizeNickname(currentNick);

        // Only update if the nickname actually changed
        if (newNick !== currentNick) {
          try {
            await member.setNickname(newNick);
            updatedCount++;

            // Add a small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (error) {
            errorCount++;
            errors.push(`${member.user.tag}: ${error.message}`);
          }
        } else {
          skippedCount++;
        }
      }

      // Build response message
      let response = `✅ **Nickname Fix Complete**\n`;
      response += `Updated: ${updatedCount}\n`;
      response += `Skipped (no change needed): ${skippedCount}\n`;
      response += `Errors: ${errorCount}`;

      if (errors.length > 0 && errors.length <= 5) {
        response += "\n\n**Errors:**\n" + errors.join("\n");
      } else if (errors.length > 5) {
        response +=
          "\n\n**Errors:** Too many to display (check bot permissions)";
      }

      await interaction.editReply(response);
    } catch (error) {
      console.error(error);
      await interaction.editReply(
        "❌ An error occurred while processing nicknames.",
      );
    }
  },
};

/**
 * Reorganizes a nickname by moving stars (🌟) and trophies (🏆) to the end
 * Stars always come before trophies
 * @param {string} nickname - The original nickname
 * @returns {string} - The reorganized nickname
 */
function reorganizeNickname(nickname) {
  // Count stars and trophies
  const starCount = (nickname.match(/🌟/g) || []).length;
  const trophyCount = (nickname.match(/🏆/g) || []).length;

  // Remove all stars and trophies from the nickname
  let cleanedNick = nickname.replace(/🌟/g, "").replace(/🏆/g, "");

  // Remove extra spaces that may have been left
  cleanedNick = cleanedNick.replace(/\s+/g, " ").trim();

  // Trim any trailing spaces at the end of the cleaned nickname
  cleanedNick = cleanedNick.trimEnd();

  // Add stars and trophies at the end
  const stars = "🌟".repeat(starCount);
  const trophies = "🏆".repeat(trophyCount);

  // If there are stars or trophies, add a space before them
  const suffix = starCount > 0 || trophyCount > 0 ? " " + stars + trophies : "";

  // Return the reorganized nickname
  return cleanedNick + suffix;
}
