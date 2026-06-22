/*
Someone challenges someone (15s)
both need to have the wager when accepted
When they accept its
Payout
smoke for 5 seconds then it shows
🔫 Standard Outcomes (Core)
    •    Player A wins (clean kill)
    •    Player B wins (clean kill)

⚔️ Special Twist Outcomes
    •    Double KO: Both players land headshots simultaneously and die. No one wins, pot is lost.
    •    Profit Pact: Players handshake, sell their gear, and each earns 110% of the wager.
    •    Collateral Damage: Both players accidentally grenade themselves. Money goes to the bot.
    •    Crowd Interference: A random third party snipes one player. The other wins but only gets 50% of the wager.
    •    Weapon Jam: Both players’ guns jam. ends with refund.
    •    Surrender: One player panics and forfeits, but loses only 50% of their wager.
    •    Draw: Neither pulls the trigger. Refund only — no gains or losses.
    •    Cheater Detected: One player gets caught “aimbotting” and is disqualified. The other wins double.
    •    Ultimate Dodge: Both players dodge every shot. The duel ends in mutual respect. Each gets +5%, no loss.
    •    Nature League Admin Steps In: Duel interrupted. Okeanoz or Frog decides the winner randomly.

🪓 Melee Madness
    •    Both ran out of ammo and switched to fists. It was too evenly matched, so they both collapse from exhaustion. No winner, full refund.
    •    Player A throws their gun, bonks Player B on the head, and somehow wins. Gets double payout for creative thinking.

    🧃 Consumable Confusion
    •    Player B drinks an energy drink mid-fight. It was expired. Instantly loses 75% of wager, Player A wins 125%.
    •    Both eat suspicious mushrooms found near the duel zone. They hallucinate a truce. They split the pot and gain 3 coins for “inner peace.”

    🎩 Showmanship Events
    •    Player A wins by trickshot, gets a bonus style multiplier (1.5x reward).
    •    Player B slow walks into the duel, dodges every shot like Neo, and wins. Spectators cheer. Player B wins plus 10 NatureCoins from crowd donations.

      •    Both try to cheat, get caught, and the bot takes the pot as punishment. Message reads: “🛡️ Duel integrity protected.”

        Player B’s controller disconnected, and they stood still. Player A didn’t shoot out of pity. Duel ends in mercy — refund only.

        Nature League Easter Eggs
    •    Frogdrivescar intervenes mid-duel, resets the duel, but gives each player a sticker.
    •    Okeanoz appears, flips a coin live, declares the winner “by decree.” Winner gets pot + a “Blessing of Nature”.

    🔁 Unexpected Continuations
    •    Duel ends in a draw, but instead of refunding, both are auto-enrolled into a revenge rematch in 5 minutes.
    •    Spectator throws a flashbang, everyone’s blind. Random winner chosen. Message: “Was it fair? Doesn’t matter. It was funny.”
    
Payout
*/

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

function getOutcome() {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("duel")
    .setDescription("Challenge someone to a dual")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to offer")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("wager")
        .setDescription("Amount to wager")
        .setRequired(true),
    ),

  async execute(interaction) {
    const player = interaction.options.getUser("player");
    const wager = interaction.options.getInteger("wager");

    const challenger = interaction.user;

    if (wager < 0) {
      return interaction.reply({
        content: `Wager amount must be non-negative!`,
        ephemeral: true,
      });
    }

    if (challenger.id === player.id) {
      return interaction.reply({
        content: `You cannot duel yourself!`,
        ephemeral: true,
      });
    }

    if (getPlayerBalance(challenger.id) < wager) {
      return interaction.reply({
        content: `You do not have enough to wager ${wager}!`,
        ephemeral: true,
      });
    }

    if (getPlayerBalance(player.id) < wager) {
      return interaction.reply({
        content: `<@${player.id}> does not have enough to wager ${wager}!`,
        ephemeral: true,
      });
    }

    // acceptance command
    const message = await interaction.reply({
      content: `Attention <@${player.id}>! <@${challenger.id}> has challenged you to a duel (${wager})`,
      fetchReply: true,
    });

    await message.react("✅");
    await message.react("❌");

    const filter = (reaction, user) => {
      return (
        ["✅", "❌"].includes(reaction.emoji.name) && user.id === player.id
      );
    };

    const collector = message.createReactionCollector({
      filter: filter,
      time: 15000,
    });

    collector.on("collect", async (reaction, user) => {
      try {
        if (reaction.emoji.name === "✅") {
          if (getPlayerBalance(challenger.id) < wager) {
            return message.edit({
              content: `<@${challenger.id}> does not have enough to wager ${wager}!`,
            });
          }

          if (getPlayerBalance(player.id) < wager) {
            return message.edit({
              content: `<@${player.id}> does not have enough to wager ${wager}!`,
            });
          }

          //let outcome = getOutcome();
          let winner;
          let num = Math.random() * 100;

          if (num < 49.5) {
            winner = `<@${player.id}> wins the duel! ${wager} has been awarded`;
            changePlayerBalance(player.id, wager);
            changePlayerBalance(challenger.id, -wager);
          } else if (num < 99) {
            winner = `<@${challenger.id}> wins the duel! ${wager} has been awarded`;
            changePlayerBalance(player.id, -wager);
            changePlayerBalance(challenger.id, wager);
          } else {
            winner = `Both players have fallen in battle. Both have lost ${wager}`;
            changePlayerBalance(player.id, -wager);
            changePlayerBalance(challenger.id, -wager);
          }

          await message.edit(`💨`);
          await new Promise((r) => setTimeout(r, 1000));
          await message.edit(`💨💨`);
          await new Promise((r) => setTimeout(r, 1000));
          await message.edit(`💨💨💨💨`);
          await new Promise((r) => setTimeout(r, 1000));
          await message.edit(`💨💨💨💨💨💨💨`);
          await new Promise((r) => setTimeout(r, 1000));
          await message.edit(`The dust settles`);
          await new Promise((r) => setTimeout(r, 1000));
          await message.edit(`${winner}`);
        }
        if (reaction.emoji.name === "❌") {
          collector.stop();
          await message.edit(`<@${player.id}> declined the duel!`);
        }
      } catch (error) {
        console.error("Error in duel collector:", error);
      }
    });
  },
};
