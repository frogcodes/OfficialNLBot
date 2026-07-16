const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  updatePlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");
const { roundMoney, formatMoney, checkBet } = require("../../utils/money");

// Helper function for random AI move
function flipCoin() {
  const moves = ["heads", "tails"];
  return moves[Math.floor(Math.random() * 2)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("50/50 chance to win!")
    .addNumberOption((option) =>
      option
        .setName("wager")
        .setDescription("The amount to wager — cents allowed, e.g. 2.50")
        .setMinValue(0)
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
    const wagerAmount = interaction.options.getNumber("wager");
    const playerChoice = interaction.options.getString("choice");

    // Placeholder balance logic
    let balance = getPlayerBalance(interaction.user.id);

    if (balance === null) {
      return interaction.reply({
        content: "❌ You do not have a balance. Use `/balance` to create one.",
        ephemeral: true,
      });
    }

    const betError = checkBet(wagerAmount, balance);
    if (betError) {
      return interaction.reply({ content: betError, ephemeral: true });
    }

    const coin = flipCoin();

    let outcomeText;
    let color;

    if (playerChoice === coin) {
      outcomeText = `You won and earned ${formatMoney(wagerAmount)}! 🎉`;
      color = 0x00ff00;
      balance = roundMoney(balance + wagerAmount);
      changePlayerBalance(interaction.user.id, wagerAmount);
    } else {
      outcomeText = `You lost ${formatMoney(wagerAmount)}! 😢`;
      color = 0xff0000;
      balance = roundMoney(balance - wagerAmount);
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
      .setFooter({ text: `Your new balance: ${formatMoney(balance)}` });

    await interaction.reply({ embeds: [resultEmbed] });
  },
};
