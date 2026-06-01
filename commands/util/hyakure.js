const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const users = [
  "464536334581628928",
  "1213995403767320587",
  "351480764602515487",
  "1266523667651891276",
  "710411367500218411",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hyakure")
    .setDescription("ping hyakure"),

  async execute(interaction) {
    if (users.includes(interaction.user.id)) {
      await interaction.reply({
        content: "<@1213995403767320587>",
        ephemeral: false,
      });
      return;
    } else {
      await interaction.reply({
        content: "You are not permitted to use this command.",
        ephemeral: true,
      });
      return;
    }
  },
};
