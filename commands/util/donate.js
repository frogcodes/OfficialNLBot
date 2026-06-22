const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getPlayerBalance,
  changePlayerBalance,
} = require("../../utils/balanceManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("donate")
    .setDescription("Donate to someone")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to donate to")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to donate")
        .setRequired(true),
    ),

  async execute(interaction) {
    const player = interaction.options.getUser("player");
    const amount = interaction.options.getInteger("amount");

    const donater = interaction.user;

    if (amount < 1) {
      return interaction.reply({
        content: `Donation amount must be positive!`,
        ephemeral: true,
      });
    }

    if (getPlayerBalance(donater.id) < amount) {
      return interaction.reply({
        content: `You do not have enough to donate ${amount}!`,
        ephemeral: true,
      });
    }

    const message = await interaction.reply({
      content: `Attention <@${donater.id}>! Are you sure you want to donate $${amount} to <@${player.id}>`,
      fetchReply: true,
    });

    await message.react("✅");
    await message.react("❌");

    const filter = (reaction, user) => {
      return (
        ["✅", "❌"].includes(reaction.emoji.name) && user.id === donater.id
      );
    };

    const collector = message.createReactionCollector({
      filter: filter,
      time: 15000,
    });

    collector.on("collect", async (reaction, user) => {
      try {
        if (reaction.emoji.name === "✅") {
          if (getPlayerBalance(donater.id) < amount) {
            return interaction.reply({
              content: `You do not have enough to donate ${amount}!`,
              ephemeral: true,
            });
          }

          changePlayerBalance(donater.id, -amount);
          changePlayerBalance(player.id, amount);
        }
        if (reaction.emoji.name === "❌") {
          collector.stop();
          await message.edit(`<@${donater.id}> cancelled the donation!`);
        }
      } catch (error) {
        console.error("Error in donation collector:", error);
      }
    });
  },
};
