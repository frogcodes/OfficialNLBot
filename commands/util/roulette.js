const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

const rouletteWheel = [
  { number: "00", color: "green" },
  { number: 0, color: "green" },
  { number: 1, color: "red" },
  { number: 2, color: "black" },
  { number: 3, color: "red" },
  { number: 4, color: "black" },
  { number: 5, color: "red" },
  { number: 6, color: "black" },
  { number: 7, color: "red" },
  { number: 8, color: "black" },
  { number: 9, color: "red" },
  { number: 10, color: "black" },
  { number: 11, color: "black" },
  { number: 12, color: "red" },
  { number: 13, color: "black" },
  { number: 14, color: "red" },
  { number: 15, color: "black" },
  { number: 16, color: "red" },
  { number: 17, color: "black" },
  { number: 18, color: "red" },
  { number: 19, color: "red" },
  { number: 20, color: "black" },
  { number: 21, color: "red" },
  { number: 22, color: "black" },
  { number: 23, color: "red" },
  { number: 24, color: "black" },
  { number: 25, color: "red" },
  { number: 26, color: "black" },
  { number: 27, color: "red" },
  { number: 28, color: "black" },
  { number: 29, color: "black" },
  { number: 30, color: "red" },
  { number: 31, color: "black" },
  { number: 32, color: "red" },
  { number: 33, color: "black" },
  { number: 34, color: "red" },
  { number: 35, color: "black" },
  { number: 36, color: "red" },
];

// Helper function to validate bet inputs
function validateBet(betType, rawValue) {
  switch (betType) {
    case "color":
      if (!rawValue || !["red", "black", "green"].includes(rawValue)) {
        return {
          valid: false,
          error: "Color must be 'red', 'black', or 'green'.",
        };
      }
      break;
    case "number":
      if (!rawValue) {
        return { valid: false, error: "You must specify a number to bet on." };
      }
      if (rawValue === "00") {
        return { valid: true };
      }
      const num = parseInt(rawValue);
      if (isNaN(num) || num < 0 || num > 36) {
        return { valid: false, error: "Number must be between 0-36 or '00'." };
      }
      break;
    case "odd":
    case "even":
    case "range-1-12":
    case "range-13-24":
    case "range-25-36":
    case "range-1-18":
    case "range-19-36":
      // These don't need additional validation
      break;
    default:
      return { valid: false, error: "Invalid bet type." };
  }
  return { valid: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Bet on a roulette spin!")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to bet")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Type of bet")
        .setRequired(true)
        .addChoices(
          { name: "Color (red/black/green)", value: "color" },
          { name: "Number (0-36, 00)", value: "number" },
          { name: "Odd", value: "odd" },
          { name: "Even", value: "even" },
          { name: "1st Third (1-12)", value: "range-1-12" },
          { name: "2nd Third (13-24)", value: "range-13-24" },
          { name: "3rd Third (25-36)", value: "range-25-36" },
          { name: "Low (1-18)", value: "range-1-18" },
          { name: "High (19-36)", value: "range-19-36" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("value")
        .setDescription("Value to bet on (required for color/number bets)")
        .setRequired(false),
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const betType = interaction.options.getString("type");
    const rawValue = interaction.options.getString("value")
      ? interaction.options.getString("value").toLowerCase().trim()
      : null;
    const betAmount = interaction.options.getInteger("amount");

    // Validate minimum bet amount
    if (betAmount < 0) {
      return interaction.reply({
        content: "❌ You cannot bet a negative amount.",
        ephemeral: true,
      });
    }

    // Check if player has a wallet
    const balance = getPlayerBalance(userId);
    if (balance === null) {
      return interaction.reply({
        content: "❌ You do not have a wallet. Use `/balance` to create one.",
        ephemeral: true,
      });
    }

    // Check if player has enough balance (skip check for $0 bets)
    if (betAmount > 0 && betAmount > balance) {
      return interaction.reply({
        content: `❌ Insufficient funds! Your current balance is ${balance}.`,
        ephemeral: true,
      });
    }

    // Validate bet input
    const validation = validateBet(betType, rawValue);
    if (!validation.valid) {
      return interaction.reply({
        content: `❌ ${validation.error}`,
        ephemeral: true,
      });
    }

    // Require value for number and color bets
    if ((betType === "number" || betType === "color") && !rawValue) {
      return interaction.reply({
        content:
          "❌ You must specify a value when betting on a 'number' or 'color'.",
        ephemeral: true,
      });
    }

    // Spin the wheel
    const spinResult =
      rouletteWheel[Math.floor(Math.random() * rouletteWheel.length)];
    let won = false;
    let payout = 0;
    let multiplier = 0;

    // Determine win/loss and payout
    switch (betType) {
      case "color":
        if (spinResult.color === rawValue) {
          won = true;
          if (rawValue === "green") {
            multiplier = 17; // 17:1 for green (covers both 0 and 00)
            payout = betAmount * (multiplier + 1); // +1 to include original bet
          } else {
            multiplier = 1; // 1:1 for red/black
            payout = betAmount * 2;
          }
        }
        break;

      case "number":
        let numberMatches = false;
        if (rawValue === "00" && spinResult.number === "00") {
          numberMatches = true;
        } else if (rawValue !== "00") {
          const betNumber = parseInt(rawValue);
          if (spinResult.number === betNumber) {
            numberMatches = true;
          }
        }

        if (numberMatches) {
          won = true;
          multiplier = 35; // 35:1 for single number
          payout = betAmount * (multiplier + 1);
        }
        break;

      case "odd":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number !== 0 &&
          spinResult.number % 2 === 1
        ) {
          won = true;
          multiplier = 1; // 1:1
          payout = betAmount * 2;
        }
        break;

      case "even":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number !== 0 &&
          spinResult.number % 2 === 0
        ) {
          won = true;
          multiplier = 1; // 1:1
          payout = betAmount * 2;
        }
        break;

      case "range-1-12":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number >= 1 &&
          spinResult.number <= 12
        ) {
          won = true;
          multiplier = 2; // 2:1
          payout = betAmount * 3;
        }
        break;

      case "range-13-24":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number >= 13 &&
          spinResult.number <= 24
        ) {
          won = true;
          multiplier = 2; // 2:1
          payout = betAmount * 3;
        }
        break;

      case "range-25-36":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number >= 25 &&
          spinResult.number <= 36
        ) {
          won = true;
          multiplier = 2; // 2:1
          payout = betAmount * 3;
        }
        break;

      case "range-1-18":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number >= 1 &&
          spinResult.number <= 18
        ) {
          won = true;
          multiplier = 1; // 1:1
          payout = betAmount * 2;
        }
        break;

      case "range-19-36":
        if (
          typeof spinResult.number === "number" &&
          spinResult.number >= 19 &&
          spinResult.number <= 36
        ) {
          won = true;
          multiplier = 1; // 1:1
          payout = betAmount * 2;
        }
        break;
    }

    // Update player balance (skip balance changes for $0 bets)
    if (betAmount > 0) {
      if (won) {
        changePlayerBalance(userId, payout - betAmount); // Add winnings minus original bet
      } else {
        changePlayerBalance(userId, -betAmount); // Subtract bet amount
      }
    }

    // Format bet description for display
    let betDescription = betType;
    if (rawValue) {
      betDescription += ` (${rawValue})`;
    }

    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setTitle("🎰 Roulette Spin Results")
      .setColor(won ? 0x00ff00 : 0xff0000)
      .addFields(
        {
          name: "🎡 Wheel Result",
          value: `**${spinResult.number}** ${getColorEmoji(spinResult.color)}`,
          inline: true,
        },
        {
          name: "🎯 Your Bet",
          value: betDescription,
          inline: true,
        },
        {
          name: "💰 Wager",
          value: `$${betAmount}`,
          inline: true,
        },
      );

    if (won) {
      const winnings = payout - betAmount;
      resultEmbed.addFields({
        name: "🎉 Result",
        value: `**YOU WON!** 🎊\nWinnings: **$${winnings}** (${multiplier}:1)`,
      });
    } else {
      resultEmbed.addFields({
        name: "💸 Result",
        value: `You lost $${betAmount}. Better luck next spin!`,
      });
    }

    const newBalance = getPlayerBalance(userId);
    resultEmbed.setFooter({ text: `Balance: $${newBalance}` });

    await interaction.reply({ embeds: [resultEmbed] });
  },
};

// Helper function to get color emoji
function getColorEmoji(color) {
  switch (color) {
    case "red":
      return "🔴";
    case "black":
      return "⚫";
    case "green":
      return "🟢";
    default:
      return "";
  }
}
