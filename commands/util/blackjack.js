// commands/util/blackjack.js
// Single-player blackjack vs the dealer, with Hit / Stand / Double Down buttons.
//
// Rules: 6-deck shoe, dealer stands on all 17, blackjack pays 3:2, push returns
// the bet, double down allowed on the opening hand only (one card, then stand).
// The bet is taken up front and the full return is paid back at the end.

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");
const { roundMoney, formatMoney, checkBet } = require("../../utils/money");

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
];

const DECKS = 6;
const TIMEOUT_MS = 60_000;

// Fresh shoe, Fisher-Yates shuffled.
function newShoe() {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) {
    for (const suit of SUITS) {
      for (const { rank, value } of RANKS) {
        shoe.push({ rank, suit, value });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

// Best total: aces count 11 until that would bust, then 1.
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.value;
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

// A hand is "soft" when an ace is still counting as 11.
function isSoft(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.value;
    if (card.rank === "A") aces++;
  }
  return aces > 0 && total <= 21;
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

// Draw the cards as boxes in a monospace block so the table reads at a glance.
// Widths are derived per-card so "10♦" doesn't break the alignment.
function cardRow(cards, { hideSecond = false } = {}) {
  const faces = cards.map((c, i) =>
    hideSecond && i === 1 ? "??" : `${c.rank}${c.suit}`,
  );
  const top = faces.map((f) => "┌" + "─".repeat(f.length + 2) + "┐").join(" ");
  const mid = faces.map((f) => "│ " + f + " │").join(" ");
  const bot = faces.map((f) => "└" + "─".repeat(f.length + 2) + "┘").join(" ");
  return `${top}\n${mid}\n${bot}`;
}

function renderTable(player, dealer, { hideDealer = false } = {}) {
  const dealerTotal = hideDealer ? "?" : handValue(dealer);
  const playerTotal = handValue(player);
  const soft = isSoft(player) && playerTotal !== 21 ? " soft" : "";
  return [
    "```",
    `DEALER — ${dealerTotal}`,
    cardRow(dealer, { hideSecond: hideDealer }),
    "",
    `YOU — ${playerTotal}${soft}`,
    cardRow(player),
    "```",
  ].join("\n");
}

function buttons({ canDouble, disabled = false }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("bj_hit")
      .setLabel("Hit")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("bj_stand")
      .setLabel("Stand")
      .setEmoji("✋")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
  if (canDouble) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("bj_double")
        .setLabel("Double Down")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
    );
  }
  return [row];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a hand of blackjack against the dealer")
    .addNumberOption((option) =>
      option
        .setName("bet")
        .setDescription("Amount to bet — cents allowed, e.g. 2.50")
        .setMinValue(0.01)
        .setRequired(true),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    let bet = interaction.options.getNumber("bet");

    const balance = getPlayerBalance(userId);
    if (balance === null) {
      return interaction.reply({
        content:
          "❌ You do not have a wallet yet. Use `/balance` to create one.",
        ephemeral: true,
      });
    }

    // Blackjack has no free-play mode — a real wager is required.
    const betError = checkBet(bet, balance, { allowZero: false });
    if (betError) {
      return interaction.reply({ content: betError, ephemeral: true });
    }
    bet = roundMoney(bet);

    // Take the bet up front; the total return is paid back when the hand ends.
    changePlayerBalance(userId, -bet);

    const shoe = newShoe();
    const player = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];

    // Settle up: `returned` is the total handed back (bet included).
    const finish = async (btnInteraction, outcome) => {
      const playerTotal = handValue(player);
      const dealerTotal = handValue(dealer);

      let returned = 0;
      let title;
      let color;

      if (outcome === "player_blackjack") {
        returned = roundMoney(bet * 2.5); // 3:2 — bet back + 1.5x
        title = "🂡 Blackjack! You win 3:2";
        color = 0xf1c40f;
      } else if (outcome === "push") {
        returned = bet;
        title = "🤝 Push — your bet is returned";
        color = 0x95a5a6;
      } else if (outcome === "player_bust") {
        returned = 0;
        title = "💥 Bust — you lose";
        color = 0xff0000;
      } else if (outcome === "dealer_bust") {
        returned = roundMoney(bet * 2);
        title = "🎉 Dealer busts — you win!";
        color = 0x00ff00;
      } else if (outcome === "player_win") {
        returned = roundMoney(bet * 2);
        title = "🎉 You win!";
        color = 0x00ff00;
      } else {
        returned = 0;
        title = "💔 Dealer wins";
        color = 0xff0000;
      }

      if (returned > 0) changePlayerBalance(userId, returned);

      const net = roundMoney(returned - bet);
      const netText =
        net > 0
          ? `🟢 +${formatMoney(net)}`
          : net < 0
            ? `🔴 -${formatMoney(Math.abs(net))}`
            : "⚪ ±$0.00";

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(`${renderTable(player, dealer)}\n### ${netText}`)
        .addFields(
          { name: "💰 Bet", value: formatMoney(bet), inline: true },
          {
            name: "🪙 NL Coins",
            value: formatMoney(getPlayerBalance(userId)),
            inline: true,
          },
        );

      const payload = {
        embeds: [embed],
        components: buttons({ canDouble: false, disabled: true }),
      };
      if (btnInteraction) await btnInteraction.update(payload);
      else await interaction.editReply(payload);
    };

    // ─── Naturals settle immediately ───────────────────────────────────────────
    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);
    if (playerBJ || dealerBJ) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Dealing…")],
      });
      if (playerBJ && dealerBJ) return finish(null, "push");
      if (playerBJ) return finish(null, "player_blackjack");
      return finish(null, "dealer_win");
    }

    // Double down needs enough left in the wallet to cover a second bet.
    const canDouble = getPlayerBalance(userId) >= bet;

    const table = () =>
      new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setColor(0x2ecc71)
        .setDescription(renderTable(player, dealer, { hideDealer: true }))
        .addFields({ name: "💰 Bet", value: formatMoney(bet), inline: true });

    await interaction.reply({
      embeds: [table()],
      components: buttons({ canDouble }),
    });
    const message = await interaction.fetchReply();

    // Dealer plays out: draw to 17, stand on all 17s.
    const playDealer = () => {
      while (handValue(dealer) < 17) dealer.push(shoe.pop());
    };

    const collector = message.createMessageComponentCollector({
      // Only the player who started the hand can act on it.
      filter: (i) => i.user.id === userId,
      time: TIMEOUT_MS,
    });

    let settled = false;

    collector.on("collect", async (btn) => {
      if (btn.customId === "bj_hit") {
        player.push(shoe.pop());
        if (handValue(player) > 21) {
          settled = true;
          collector.stop("done");
          return finish(btn, "player_bust");
        }
        if (handValue(player) === 21) {
          // Auto-stand on 21 — there's no reason to hit.
          playDealer();
          settled = true;
          collector.stop("done");
          const p = handValue(player);
          const d = handValue(dealer);
          return finish(
            btn,
            d > 21
              ? "dealer_bust"
              : p > d
                ? "player_win"
                : p === d
                  ? "push"
                  : "dealer_win",
          );
        }
        return btn.update({
          embeds: [table()],
          components: buttons({ canDouble: false }),
        });
      }

      if (btn.customId === "bj_double") {
        // Charge the second bet, take exactly one card, then stand.
        const bal = getPlayerBalance(userId);
        if (bal < bet) {
          return btn.reply({
            content: `❌ You need another ${formatMoney(bet)} to double down.`,
            ephemeral: true,
          });
        }
        changePlayerBalance(userId, -bet);
        bet = roundMoney(bet * 2);
        player.push(shoe.pop());
        settled = true;
        collector.stop("done");
        if (handValue(player) > 21) return finish(btn, "player_bust");
        playDealer();
        const p = handValue(player);
        const d = handValue(dealer);
        return finish(
          btn,
          d > 21
            ? "dealer_bust"
            : p > d
              ? "player_win"
              : p === d
                ? "push"
                : "dealer_win",
        );
      }

      if (btn.customId === "bj_stand") {
        playDealer();
        settled = true;
        collector.stop("done");
        const p = handValue(player);
        const d = handValue(dealer);
        return finish(
          btn,
          d > 21
            ? "dealer_bust"
            : p > d
              ? "player_win"
              : p === d
                ? "push"
                : "dealer_win",
        );
      }
    });

    collector.on("end", async (_collected, reason) => {
      // Timed out with no action — auto-stand so the bet is never left in limbo.
      if (settled || reason === "done") return;
      playDealer();
      const p = handValue(player);
      const d = handValue(dealer);
      try {
        await finish(
          null,
          d > 21
            ? "dealer_bust"
            : p > d
              ? "player_win"
              : p === d
                ? "push"
                : "dealer_win",
        );
      } catch (err) {
        console.error("[blackjack] Failed to settle timed-out hand:", err);
      }
    });
  },

  // Exported for tests; the command loader only uses `data` and `execute`.
  newShoe,
  handValue,
  isSoft,
  isBlackjack,
};
