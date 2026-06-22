const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  updatePlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

// Helper function for random AI move
function selectAutoMove() {
  const moves = ["rock", "paper", "scissors"];
  return moves[Math.floor(Math.random() * 3)];
}

// Helper function to determine the winner
function getResult(playerMove, aiMove) {
  if (playerMove === aiMove) return "tie";
  if (
    (playerMove === "rock" && aiMove === "scissors") ||
    (playerMove === "paper" && aiMove === "rock") ||
    (playerMove === "scissors" && aiMove === "paper")
  ) {
    return "win";
  }
  return "lose";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock, Paper, Scissors vs an AI")
    .addIntegerOption((option) =>
      option
        .setName("wager")
        .setDescription("The amount to wager")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("move")
        .setDescription("Select your move")
        .setRequired(true)
        .addChoices(
          { name: "✊", value: "rock" },
          { name: "✋", value: "paper" },
          { name: "✌️", value: "scissors" },
        ),
    ),

  async execute(interaction) {
    const wagerAmount = interaction.options.getInteger("wager");
    const playerMove = interaction.options.getString("move");

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

    const aiMove = selectAutoMove();
    const result = getResult(playerMove, aiMove);

    let outcomeText;
    let color;

    if (result === "win") {
      outcomeText = `You won and earned $${wagerAmount}! 🎉`;
      color = 0x00ff00;
      balance += wagerAmount;
      changePlayerBalance(interaction.user.id, wagerAmount);
    } else if (result === "lose") {
      outcomeText = `You lost $${wagerAmount}! 😢`;
      color = 0xff0000;
      balance -= wagerAmount;
      changePlayerBalance(interaction.user.id, -wagerAmount);
    } else {
      outcomeText = `It's a tie! Your balance stays the same.`;
      color = 0xffff00;
    }

    const moveEmoji = {
      rock: "✊",
      paper: "✋",
      scissors: "✌️",
    };

    const resultEmbed = new EmbedBuilder()
      .setTitle("Rock, Paper, Scissors")
      .addFields(
        {
          name: "Your Move",
          value: `${moveEmoji[playerMove]} ${playerMove}`,
          inline: true,
        },
        {
          name: "AI's Move",
          value: `${moveEmoji[aiMove]} ${aiMove}`,
          inline: true,
        },
        { name: "Result", value: outcomeText },
      )
      .setColor(color)
      .setFooter({ text: `Your new balance: $${balance}` });

    await interaction.reply({ embeds: [resultEmbed] });
  },
};
