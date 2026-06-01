const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = "../../data/pets.json";

function loadPets() {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function savePets(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function calculatePower(pet) {
  const moodBoost = (pet.happiness + pet.energy) / 20; // max +10 total
  const base = pet.stats.power + pet.stats.speed + pet.stats.defense;
  return base + moodBoost + pet.level * 2;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("petbattle")
    .setDescription("Battle one of your pets against someone else's pet.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("The user to battle")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("your_pet")
        .setDescription("Your pet number from your inventory")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("their_pet")
        .setDescription("Their pet number from their inventory")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const opponent = interaction.options.getUser("opponent");
    const yourIndex = interaction.options.getInteger("your_pet") - 1;
    const theirIndex = interaction.options.getInteger("their_pet") - 1;

    if (opponent.bot || opponent.id === userId) {
      return interaction.reply({
        content: "⚠️ You must select a valid human opponent.",
        ephemeral: true,
      });
    }

    const petsData = loadPets();
    const yourPets = petsData[userId];
    const theirPets = petsData[opponent.id];

    if (!yourPets || !yourPets[yourIndex]) {
      return interaction.reply({
        content: "❌ You do not have a valid pet at that index.",
        ephemeral: true,
      });
    }

    if (!theirPets || !theirPets[theirIndex]) {
      return interaction.reply({
        content: `❌ ${opponent.username} does not have a valid pet at that index.`,
        ephemeral: true,
      });
    }

    const yourPet = yourPets[yourIndex];
    const theirPet = theirPets[theirIndex];

    const yourPower = calculatePower(yourPet) + getRandomInt(-5, 5);
    const theirPower = calculatePower(theirPet) + getRandomInt(-5, 5);

    const winner = yourPower > theirPower ? interaction.user : opponent;
    const loser = yourPower > theirPower ? opponent : interaction.user;
    const winPet = yourPower > theirPower ? yourPet : theirPet;
    const losePet = yourPower > theirPower ? theirPet : yourPet;

    // Update stats
    winPet.wins += 1;
    winPet.level += 1;
    losePet.losses += 1;

    winPet.happiness = Math.min(100, winPet.happiness + 10);
    losePet.happiness = Math.max(0, losePet.happiness - 10);
    winPet.energy = Math.max(0, winPet.energy - 10);
    losePet.energy = Math.max(0, losePet.energy - 10);

    savePets(petsData);

    const embed = new EmbedBuilder()
      .setTitle("⚔️ Pet Battle!")
      .setColor(0xffae00)
      .setDescription(
        `**${yourPet.name}** (You) vs **${theirPet.name}** (${opponent.username})\n\n` +
          `🏆 **Winner:** ${winner.username}'s **${winPet.name}**\n` +
          `📊 Power — You: ${yourPower.toFixed(1)}, Them: ${theirPower.toFixed(
            1
          )}`
      )
      .setFooter({ text: "GG! Your pets are now more experienced." });

    await interaction.reply({ embeds: [embed] });
  },
};
