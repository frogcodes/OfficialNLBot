const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Report the score of a match or cancel a match"),

  async execute(interaction) {
    /**const teamName = interaction.options.getString("team");
    const player = interaction.options.getUser("player");
    const tier = interaction.options.getString("tier");*/
  },
};
