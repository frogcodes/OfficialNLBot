const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Donate to someone")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to donate to")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to donate")
        .setRequired(true)
    ),

  async execute(interaction) {
    const player = interaction.options.getUser("player");
    const amount = interaction.options.getInteger("amount");

    if (amount < 1) {
      return interaction.reply({
        content: `Donation amount must be positive!`,
        ephemeral: true,
      });
    }

    try {
      // Adjust balances
      changePlayerBalance(player.id, amount);

      // Reply to donor
      await interaction.reply({
        content: `You have given $${amount} to <@${player.id}>`,
        ephemeral: true,
      });

      // Try to DM the recipient
      try {
        await interaction.client.users.send(
          player.id,
          `You have been given $${amount} NL Coin`
        );
      } catch (dmError) {
        console.warn(`Failed to DM ${player.tag}:`, dmError);
      }
    } catch (error) {
      console.error("Error in donation command:", error);
      return interaction.reply({
        content: "Something went wrong with your donation. Please try again.",
        ephemeral: true,
      });
    }
  },
};
