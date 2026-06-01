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
    .setName("playpet")
    .setDescription("Play with a pet to increase happiness!")
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
          "❌ That pet doesn’t exist. Use `/petinventory` to view your pets.",
        ephemeral: true,
      });
    }

    const pet = userPets[petIndex];

    if (pet.happiness >= 100) {
      return interaction.reply({
        content: `😊 **${pet.name}** is already maxed out on happiness!`,
        ephemeral: true,
      });
    }

    const boost = 10 + Math.floor(Math.random() * 11); // +10 to +20
    pet.happiness = Math.min(100, pet.happiness + boost);

    savePets(petsData);

    return interaction.reply(
      `🎾 You played with **${pet.name}**! Happiness is now ${pet.happiness}/100 (+${boost})`
    );
  },
};
