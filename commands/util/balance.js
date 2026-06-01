const { SlashCommandBuilder } = require("discord.js");
const {
  getPlayerBalance,
  updatePlayerBalance,
} = require("../../utils/balanceManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription(
      "Check your wallet or create one if you don't have one yet"
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const currentBalance = getPlayerBalance(userId, interaction);

    // If they already have a balance, show it
    if (currentBalance !== null) {
      return interaction.reply({
        content: `Your current balance is **$${currentBalance}**.`,
      });
    }

    updatePlayerBalance(userId, 1000);

    return interaction.reply({
      content: `Wallet created! You have been given a starting balance of **$1000**.`,
      ephemeral: true,
    });
  },
};
