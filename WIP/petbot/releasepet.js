const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = "../../data/pets.json";

function loadPets() {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function savePets(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("releasepet")
    .setDescription("Release one of your pets permanently.")
    .addIntegerOption((option) =>
      option
        .setName("pet")
        .setDescription("Pet number from your inventory")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const petIndex = interaction.options.getInteger("pet") - 1;

    const petsData = loadPets();
    const userPets = petsData[userId];

    if (!userPets || !userPets[petIndex]) {
      return interaction.reply({
        content:
          "❌ That pet doesn’t exist. Use `/petinventory` to see your pets.",
        ephemeral: true,
      });
    }

    const released = userPets.splice(petIndex, 1)[0];
    savePets(petsData);

    return interaction.reply(
      `💔 You released **${released.name}** into the wild... Farewell, friend.`
    );
  },
};
