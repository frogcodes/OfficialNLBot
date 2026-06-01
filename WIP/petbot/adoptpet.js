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

function generateRandomPetName() {
  const names = [
    "Bubbles",
    "Nimbus",
    "Clawsy",
    "Zuzu",
    "Sprig",
    "Ember",
    "Shadow",
    "Pebbles",
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function generatePetRarity() {
  const roll = Math.random();
  if (roll < 0.05) return "Legendary";
  if (roll < 0.15) return "Epic";
  if (roll < 0.35) return "Rare";
  return "Common";
}

function generateStats(rarity) {
  const base = {
    Common: 1,
    Rare: 2,
    Epic: 3,
    Legendary: 5,
  }[rarity];

  return {
    power: base + Math.floor(Math.random() * 3),
    speed: base + Math.floor(Math.random() * 3),
    defense: base + Math.floor(Math.random() * 3),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adoptpet")
    .setDescription("Adopt a random pet!"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const petsData = loadPets();

    if (!petsData[userId]) petsData[userId] = [];

    if (petsData[userId].length >= 5) {
      return interaction.reply({
        content: "❌ You already have 5 pets! Use `/releasepet` to free one.",
        ephemeral: true,
      });
    }

    const rarity = generatePetRarity();
    const newPet = {
      name: generateRandomPetName(),
      level: 1,
      xp: 0,
      energy: 100,
      happiness: 100,
      rarity,
      stats: generateStats(rarity),
      wins: 0,
      losses: 0,
      created: Date.now(),
    };

    petsData[userId].push(newPet);
    savePets(petsData);

    return interaction.reply({
      content: `🎉 You adopted a **${rarity}** pet named **${newPet.name}**!\nStats → 💪 Power: ${newPet.stats.power}, ⚡ Speed: ${newPet.stats.speed}, 🛡️ Defense: ${newPet.stats.defense}`,
    });
  },
};
