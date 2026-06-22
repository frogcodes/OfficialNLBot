const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  updatePlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

// Helper function for random AI move
function flipCoin() {
  const moves = ["heads", "tails"];
  return moves[Math.floor(Math.random() * 2)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("50/50 chance to win!")
    .addIntegerOption((option) =>
      option
        .setName("wager")
        .setDescription("The amount to wager")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("choice")
        .setDescription("Select your choice")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" },
        ),
    ),

  async execute(interaction) {
    const wagerAmount = interaction.options.getInteger("wager");
    const playerChoice = interaction.options.getString("choice");

    // Placeholder balance logic
    let balance = getPlayerBalance(interaction.user.id);

    if (balance === null) {
      return interaction.reply({
        content: "❌ You do not have a balance. Use `/balance` to create one.",
        ephemeral: true,
      });
    }

    if (wagerAmount < 0 || wagerAmount > balance) {
      return interaction.reply({
        content: `❌ You must bet a positive amount within your balance. Your current balance is $${balance}.`,
        ephemeral: true,
      });
    }

    const coin = flipCoin();

    let outcomeText;
    let color;

    if (playerChoice === coin) {
      outcomeText = `You won and earned $${wagerAmount}! 🎉`;
      color = 0x00ff00;
      balance += wagerAmount;
      changePlayerBalance(interaction.user.id, wagerAmount);
    } else {
      outcomeText = `You lost $${wagerAmount}! 😢`;
      color = 0xff0000;
      balance -= wagerAmount;
      changePlayerBalance(interaction.user.id, -wagerAmount);
    }

    const moveEmoji = {
      heads: "🎩",
      tails: "🪙",
    };

    const resultEmbed = new EmbedBuilder()
      .setTitle("Coin Flip!")
      .addFields(
        {
          name: "You Chose",
          value: `${moveEmoji[playerChoice]}`,
          inline: true,
        },
        {
          name: "The coin was",
          value: `${moveEmoji[coin]}`,
          inline: true,
        },
        { name: "Result", value: outcomeText },
      )
      .setColor(color)
      .setFooter({ text: `Your new balance: $${balance}` });

    await interaction.reply({ embeds: [resultEmbed] });
  },
};
