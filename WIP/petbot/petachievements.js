const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const petsPath = "../../data/pets.json";
const achvPath = "../../data/achievements.json";

function loadPets() {
  if (!fs.existsSync(petsPath)) return {};
  return JSON.parse(fs.readFileSync(petsPath));
}

function loadAchievements() {
  if (!fs.existsSync(achvPath)) return {};
  return JSON.parse(fs.readFileSync(achvPath));
}

function saveAchievements(data) {
  fs.writeFileSync(achvPath, JSON.stringify(data, null, 2));
}

function checkAndUnlock(userId, pets, userAchievements) {
  const newAchvs = [];

  const totalWins = pets.reduce((sum, p) => sum + p.wins, 0);
  const totalPets = pets.length;
  const hasRare = pets.some(
    (p) => p.rarity === "Epic" || p.rarity === "Legendary"
  );
  const hasLvl10 = pets.some((p) => p.level >= 10);

  const conditions = [
    {
      key: "petmaster",
      name: "🐾 Pet Master",
      desc: "Own 5 or more pets.",
      unlocked: totalPets >= 5,
    },
    {
      key: "champion",
      name: "🏆 Champion",
      desc: "Win 10 pet battles.",
      unlocked: totalWins >= 10,
    },
    {
      key: "collector",
      name: "🌟 Collector",
      desc: "Own an Epic or Legendary pet.",
      unlocked: hasRare,
    },
    {
      key: "veteran",
      name: "📈 Veteran Pet",
      desc: "Have a pet reach level 10.",
      unlocked: hasLvl10,
    },
  ];

  conditions.forEach((a) => {
    if (a.unlocked && !userAchievements.includes(a.key)) {
      userAchievements.push(a.key);
      newAchvs.push(a);
    }
  });

  return newAchvs;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("petachievements")
    .setDescription("View your unlocked pet achievements!"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const petsData = loadPets();
    const achvData = loadAchievements();

    const pets = petsData[userId] || [];
    const userAchvs = achvData[userId] || [];

    const newlyUnlocked = checkAndUnlock(userId, pets, userAchvs);
    achvData[userId] = userAchvs;
    saveAchievements(achvData);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${interaction.user.username}'s Pet Achievements`)
      .setColor(0xffd700)
      .setDescription(
        userAchvs.length
          ? userAchvs
              .map((k) => {
                switch (k) {
                  case "petmaster":
                    return "🐾 Pet Master – Own 5+ pets";
                  case "champion":
                    return "🏆 Champion – 10 pet wins";
                  case "collector":
                    return "🌟 Collector – Epic or Legendary pet";
                  case "veteran":
                    return "📈 Veteran Pet – Level 10+ pet";
                  default:
                    return "";
                }
              })
              .join("\n")
          : "No achievements unlocked yet. Keep training your pets!"
      );

    if (newlyUnlocked.length > 0) {
      embed.addFields({
        name: "🎉 New Achievements Unlocked!",
        value: newlyUnlocked.map((a) => `${a.name} – ${a.desc}`).join("\n"),
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
