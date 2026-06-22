const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

// Symbol groups for grouping wins
const symbolGroups = {
  fruits: ["🍒", "🍋", "🍊", "🍇", "🍉", "🥭"],
  special: ["⭐", "🔔", "🎯"],
  premium: ["💎", "👑", "🎪"],
  legendary: ["🌟", "🏆", "🍀"],
};

// Weighted slot symbols adjusted for 94% RTP
const symbols = [
  // Common symbols (fruits) - ~65% total weight
  { emoji: "🍒", multiplier: 8, weight: 16, group: "fruits" },
  { emoji: "🍋", multiplier: 8, weight: 16, group: "fruits" },
  { emoji: "🍊", multiplier: 9, weight: 12, group: "fruits" },
  { emoji: "🍇", multiplier: 9, weight: 12, group: "fruits" },
  { emoji: "🍉", multiplier: 10, weight: 9, group: "fruits" },
  { emoji: "🥭", multiplier: 12, weight: 7, group: "fruits" },

  // Special symbols - ~22% total weight
  { emoji: "⭐", multiplier: 20, weight: 8, group: "special" },
  { emoji: "🔔", multiplier: 30, weight: 6, group: "special" },
  { emoji: "🎯", multiplier: 40, weight: 4, group: "special" },
  { emoji: "🐃", multiplier: 40, weight: 4, group: "misc" },

  // Premium symbols - ~9% total weight
  { emoji: "💎", multiplier: 67, weight: 3, group: "premium" },
  { emoji: "👑", multiplier: 75, weight: 2.5, group: "premium" },
  { emoji: "🎪", multiplier: 100, weight: 2, group: "premium" },

  // Legendary symbols - ~4% total weight
  { emoji: "🌟", multiplier: 333, weight: 1.5, group: "legendary" },
  { emoji: "🏆", multiplier: 1000, weight: 1, group: "legendary" },
  { emoji: "🍀", multiplier: 5000, weight: 0.5, group: "legendary" },
  {
    emoji: "<a:NL_frogspin:1405762518399455254>",
    multiplier: 100000000000000000000,
    weight: 0.001,
    group: "legendary",
  },
];

// Calculate total weight for probability calculations
const totalWeight = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);

// Function to select a weighted random symbol
function getRandomSymbol() {
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  for (const symbol of symbols) {
    currentWeight += symbol.weight;
    if (random <= currentWeight) {
      return symbol;
    }
  }

  // Fallback (should never reach here)
  return symbols[0];
}

// Check if symbols belong to the same group
function checkGroupMatch(symbol1, symbol2, symbol3) {
  if (symbol1.group === symbol2.group && symbol2.group === symbol3.group) {
    return symbol1.group;
  }
  return null;
}

// Get group multiplier based on group type
function getGroupMultiplier(group) {
  const multipliers = {
    fruits: 1.25,
    special: 1.8,
    premium: 3,
    legendary: 5,
    misc: 0, // No group bonus for misc items
  };
  return multipliers[group] || 0;
}

// Calculate expected return to player (RTP)
function calculateRTP() {
  let expectedPayout = 0;

  // Triple matches
  for (const symbol of symbols) {
    const probability = symbol.weight / totalWeight;
    const tripleChance = Math.pow(probability, 3);
    expectedPayout += tripleChance * symbol.multiplier;
  }

  // Double matches
  for (const symbol of symbols) {
    const probability = symbol.weight / totalWeight;
    const otherProbability = 1 - probability;
    // Three ways to get exactly 2 matches: AAB, ABA, BAA
    const doubleChance = 3 * Math.pow(probability, 2) * otherProbability;
    expectedPayout += doubleChance * (symbol.multiplier * 0.25);
  }

  // Group matches (all different symbols but same group)
  for (const [groupName, groupSymbols] of Object.entries(symbolGroups)) {
    if (groupName === "misc") continue; // Skip misc group

    const groupMultiplier = getGroupMultiplier(groupName);
    const relevantSymbols = symbols.filter((s) => s.group === groupName);

    // Calculate probability of getting 3 different symbols from same group
    for (let i = 0; i < relevantSymbols.length; i++) {
      for (let j = 0; j < relevantSymbols.length; j++) {
        for (let k = 0; k < relevantSymbols.length; k++) {
          if (i !== j && j !== k && i !== k) {
            const prob1 = relevantSymbols[i].weight / totalWeight;
            const prob2 = relevantSymbols[j].weight / totalWeight;
            const prob3 = relevantSymbols[k].weight / totalWeight;
            const groupChance = prob1 * prob2 * prob3;
            expectedPayout += groupChance * groupMultiplier;
          }
        }
      }
    }
  }

  return expectedPayout;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine!")
    .addIntegerOption((option) =>
      option
        .setName("bet")
        .setDescription("Amount of coins to bet (0 for free play)")
        .setRequired(true),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const betAmount = interaction.options.getInteger("bet");

    // Allow negative bets check
    if (betAmount < 0) {
      return interaction.reply({
        content: "❌ Bet amount cannot be negative.",
        ephemeral: true,
      });
    }

    // Get current balance
    const balance = getPlayerBalance(userId);

    if (balance === null) {
      return interaction.reply({
        content:
          "❌ You do not have a wallet yet. Use `/balance` to create one.",
        ephemeral: true,
      });
    }

    // Check balance only if betting real money
    if (betAmount > 0 && betAmount > balance) {
      return interaction.reply({
        content: `❌ You don't have enough coins! Your balance is $${balance}.`,
        ephemeral: true,
      });
    }

    // Deduct bet first (only if betting real money)
    if (betAmount > 0) {
      changePlayerBalance(userId, -betAmount);
    }

    // Spin 3 reels independently
    const reel1 = getRandomSymbol();
    const reel2 = getRandomSymbol();
    const reel3 = getRandomSymbol();

    const spinResults = [reel1, reel2, reel3];

    // Check winning conditions
    let payout = 0;
    let winType = "";
    let isWin = false;

    // Three of a kind (highest priority)
    if (reel1.emoji === reel2.emoji && reel2.emoji === reel3.emoji) {
      payout = betAmount * reel1.multiplier;
      winType = `Triple ${reel1.emoji}`;
      isWin = true;
    }
    // Check for group match (all different symbols but same group)
    else {
      const groupMatch = checkGroupMatch(reel1, reel2, reel3);
      if (groupMatch && groupMatch !== "misc") {
        // Make sure all symbols are different
        const allDifferent =
          reel1.emoji !== reel2.emoji &&
          reel2.emoji !== reel3.emoji &&
          reel1.emoji !== reel3.emoji;

        if (allDifferent) {
          payout = betAmount * getGroupMultiplier(groupMatch);
          winType = `${
            groupMatch.charAt(0).toUpperCase() + groupMatch.slice(1)
          } Group`;
          isWin = true;
        }
      }

      // If no group match, check for two of a kind
      if (!isWin) {
        if (
          reel1.emoji === reel2.emoji ||
          reel2.emoji === reel3.emoji ||
          reel1.emoji === reel3.emoji
        ) {
          // Find the matching symbol
          let matchingSymbol;
          if (reel1.emoji === reel2.emoji) matchingSymbol = reel1;
          else if (reel2.emoji === reel3.emoji) matchingSymbol = reel2;
          else matchingSymbol = reel1;

          payout = Math.floor(betAmount * (matchingSymbol.multiplier * 0.2)); // 20% of full multiplier
          winType = `Double ${matchingSymbol.emoji}`;
          isWin = true;
        }
      }
    }

    // Add winnings to balance (only if betting real money)
    if (isWin && betAmount > 0) {
      changePlayerBalance(userId, payout);
    }

    // Create visual slot display
    const slotDisplay = `
╔═════════╗
║  ${spinResults[0].emoji}  │  ${spinResults[1].emoji}  │  ${spinResults[2].emoji}  ║
╚═════════╝`;

    // Build embed reply
    const embed = new EmbedBuilder()
      .setTitle("🎰 Slot Machine 🎰")
      .setDescription(slotDisplay)
      .addFields({
        name: "💰 Bet",
        value: betAmount === 0 ? "Free Play" : `$${betAmount}`,
        inline: true,
      })
      .setColor(isWin ? 0x00ff00 : 0xff0000);

    if (isWin) {
      embed.addFields({
        name: "🎉 Result",
        value: `**${winType}!**\n${
          betAmount === 0 ? "Practice win!" : `Won $${payout}`
        }`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: "💔 Result",
        value:
          betAmount === 0 ? "No match - try again!" : "Better luck next time!",
        inline: true,
      });
    }

    if (betAmount > 0) {
      embed.addFields({
        name: "💳 New Balance",
        value: `$${getPlayerBalance(userId)}`,
        inline: true,
      });
    }

    // Add footer with odds info occasionally
    /* if (Math.random() < 0.1) {
      // 10% chance to show RTP
      const rtp = (calculateRTP() * 100).toFixed(1);
      embed.setFooter({
        text: `RTP: ${rtp}% | Tip: Look for group matches too!`,
      });
    } */

    await interaction.reply({ embeds: [embed] });
  },
};
