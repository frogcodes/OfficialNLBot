const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = "../../data/pets.json";

function loadPets() {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function formatPet(pet, index) {
  return (
    `**${index + 1}. ${pet.name}** *(Lv. ${pet.level}, ${pet.rarity})*\n` +
    `💪 ${pet.stats.power} | ⚡ ${pet.stats.speed} | 🛡️ ${pet.stats.defense}\n` +
    `💤 Energy: ${pet.energy} | 😊 Happiness: ${pet.happiness} | 🏆 ${pet.wins}W-${pet.losses}L`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("petinventory")
    .setDescription("View all of your adopted pets."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const petsData = loadPets();
    const pets = petsData[userId];

    if (!pets || pets.length === 0) {
      return interaction.reply({
        content: "📭 You don’t have any pets! Use `/adoptpet` to get started.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Pets`)
      .setColor(0x00ae86)
      .setDescription(pets.map((pet, i) => formatPet(pet, i)).join("\n\n"))
      .setFooter({
        text: "Use /feedpet, /trainpet, /playpet, or /releasepet to interact!",
      });

    await interaction.reply({ embeds: [embed] });
  },
};
