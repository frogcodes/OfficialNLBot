const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getPlayerBalance } = require("../../utils/balanceManager");
const { displayHistory } = require("../../utils/playerhistory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Get server information about a player")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player profile to check")
        .setRequired(false)
    ),

  async execute(interaction) {
    const player = interaction.options.getUser("player") || interaction.user;
    const member = await interaction.guild.members.fetch(player.id);

    const balance = getPlayerBalance(parseInt(player.id)) ?? 0;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`📄 Profile for ${player.username}`)
      .setThumbnail(player.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: "Balance",
          value: `${balance} NatureCoins`,
        },
        {
          name: "Server Join Date",
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
        },
        {
          name: "Team History",
          value: displayHistory(player.id).join("\n") || "No history found.",
        }
      )
      .setColor(0x2ecc71)
      .setFooter({ text: `Nature League loves ${player.username}!` });

    await interaction.reply({ embeds: [resultEmbed] });
  },
};
