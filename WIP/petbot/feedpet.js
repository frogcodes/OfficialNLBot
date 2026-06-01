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
    .setName("feedpet")
    .setDescription("Feed a pet to restore energy and happiness.")
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
        content: "❌ That pet doesn’t exist. Check `/petinventory`.",
        ephemeral: true,
      });
    }

    const pet = userPets[petIndex];
    pet.energy = Math.min(100, pet.energy + 25);
    pet.happiness = Math.min(100, pet.happiness + 15);

    savePets(petsData);

    return interaction.reply(
      `🍽️ You fed **${pet.name}**! Energy: ${pet.energy}, Happiness: ${pet.happiness}`
    );
  },
};
