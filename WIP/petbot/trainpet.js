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

const COOLDOWN_MS = 1000 * 60 * 5; // 5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trainpet")
    .setDescription("Train one of your pets to boost a stat!")
    .addIntegerOption((option) =>
      option
        .setName("pet")
        .setDescription("Pet number from your inventory")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("stat")
        .setDescription("Which stat to train")
        .setRequired(true)
        .addChoices(
          { name: "Power", value: "power" },
          { name: "Speed", value: "speed" },
          { name: "Defense", value: "defense" }
        )
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const petIndex = interaction.options.getInteger("pet") - 1;
    const stat = interaction.options.getString("stat");

    const petsData = loadPets();
    const userPets = petsData[userId];

    if (!userPets || !userPets[petIndex]) {
      return interaction.reply({
        content: "❌ That pet doesn’t exist. Use `/petinventory` to see them.",
        ephemeral: true,
      });
    }

    const pet = userPets[petIndex];
    const now = Date.now();

    if (!pet.lastTrained) pet.lastTrained = 0;
    const timeSince = now - pet.lastTrained;

    if (timeSince < COOLDOWN_MS) {
      const seconds = Math.ceil((COOLDOWN_MS - timeSince) / 1000);
      return interaction.reply({
        content: `⏳ You must wait **${seconds}s** before training again.`,
        ephemeral: true,
      });
    }

    if (pet.energy < 15) {
      return interaction.reply({
        content: `😴 **${pet.name}** is too tired to train. Feed them with \`/feedpet\`.`,
        ephemeral: true,
      });
    }

    const boost = 1 + Math.floor(Math.random() * 2);
    pet.stats[stat] += boost;
    pet.energy -= 15;
    pet.lastTrained = now;

    savePets(petsData);

    return interaction.reply(
      `📚 **${pet.name}** trained their **${stat}** by +${boost}! (Energy: ${pet.energy})`
    );
  },
};
