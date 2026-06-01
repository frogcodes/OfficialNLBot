const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("franchise")
    .setDescription("Get the Discord invite link for a specific franchise")
    .addStringOption((option) =>
      option
        .setName("franchise_name")
        .setDescription("Select a franchise")
        .setRequired(true)
        .addChoices(
          { name: "Blue Jays", value: "blue jays" },
          { name: "Cardinals", value: "cardinals" },
          { name: "Capybaras", value: "capybaras" },
          { name: "Cheetahs", value: "cheetahs" },
          { name: "Eagles", value: "eagles" },
          { name: "Kangaroos", value: "kangaroos" },
          { name: "Lynx", value: "lynx" },
          { name: "Narwhals", value: "narwhals" },
          { name: "Owls", value: "owls" },
          { name: "Panthers", value: "panthers" },
          { name: "Raccoons", value: "raccoons" },
          { name: "Sharks", value: "sharks" },
          { name: "Squirrels", value: "squirrels" },
          { name: "Stingrays", value: "stingrays" },
          { name: "Turtles", value: "turtles" },
          { name: "Wolves", value: "wolves" }
        )
    ),
  async execute(interaction) {
    const franchiseLinks = {
      "blue jays": "https://discord.gg/GwwEnagEyK",
      cardinals: "https://discord.gg/cqX9Pvc8q2",
      capybaras: "https://discord.gg/bURfAZgVXe",
      cheetahs: "https://discord.gg/SE6jjQxc2y",
      eagles: "https://discord.gg/KKpvxVwEJz",
      kangaroos: "https://discord.gg/hFaY35aKFE",
      lynx: "https://discord.gg/weaKUVqxr6",
      narwhals: "https://discord.gg/SbJZ9nhGeu",
      owls: "https://discord.gg/Y9UNszM6nw",
      panthers: "https://discord.gg/NJFgpCmAkD",
      raccoons: "https://discord.gg/YXqKpBJmHC",
      sharks: "https://discord.gg/EXjkkPuwD4",
      squirrels: "https://discord.gg/w49vgCSXh7",
      stingrays: "https://discord.gg/55bfZKWtCk",
      turtles: "https://discord.gg/zrTSEdz2G2",
      wolves: "https://discord.gg/xAP76N6MyS",
    };

    const franchiseName = interaction.options
      .getString("franchise_name")
      .toLowerCase();

    if (franchiseLinks[franchiseName]) {
      const link = franchiseLinks[franchiseName];
      await interaction.reply(
        `Here's the link for **${
          franchiseName.charAt(0).toUpperCase() + franchiseName.slice(1)
        }**: ${link}`
      );
    } else {
      await interaction.reply({
        content: `Sorry, I couldn't find a link for '${franchiseName}'. Please try again.`,
        ephemeral: true,
      });
    }
  },
};
