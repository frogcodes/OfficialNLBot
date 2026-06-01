const { SlashCommandBuilder } = require("discord.js");
const { changePlayerBalance } = require("../../utils/balanceManager");

const words = {
  easy: [
    "tree",
    "fish",
    "game",
    "snow",
    "rock",
    "fire",
    "moon",
    "frog",
    "star",
    "wind",
    "leaf",
    "rain",
    "seed",
    "book",
    "coin",
    "bark",
    "wave",
    "nest",
    "dirt",
    "frog",
    "wifi",
    "kylr",
  ],
  medium: [
    "nature",
    "league",
    "rocket",
    "animal",
    "planet",
    "jungle",
    "branch",
    "forest",
    "sunset",
    "tornado",
    "volcano",
    "cheetahs",
    "blue jays",
    "capybaras",
    "owls",
    "panthers",
    "wolves",
    "stingrays",
    "narwhals",
    "raccoons",
    "squirrels",
    "cardinals",
    "lynx",
    "gorillas",
    "whales",
    "okeanoz",
    "cancun",
    "because",
  ],
  hard: [
    "wilderness",
    "photosynthesis",
    "chimpanzee",
    "ecosystem",
    "amphibious",
    "camouflage",
    "conservation",
    "biodiversity",
    "sustainability",
    "meteorology",
    "reforestation",
    "equilibrium",
    "decomposition",
    "environmental",
    "invertebrates",
    "transpiration",
    "supercalifragilisticexpialidocious",
    "bioluminescent",
  ],
};

function scrambleWord(word) {
  let arr = word.split("");
  while (true) {
    let scrambled = arr.sort(() => Math.random() - 0.5).join("");
    if (scrambled !== word) return scrambled;
  }
}

function getPrize(difficulty) {
  switch (difficulty) {
    case "easy":
      return 5;
    case "medium":
      return 10;
    case "hard":
      return 25;
    default:
      return 0;
  }
}

let isScrambleActive = false;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scramble")
    .setDescription("Start a word scramble challenge!")
    .addStringOption((opt) =>
      opt
        .setName("difficulty")
        .setDescription("Choose a difficulty")
        .addChoices(
          { name: "Easy", value: "easy" },
          { name: "Medium", value: "medium" },
          { name: "Hard", value: "hard" }
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    if (isScrambleActive) {
      return interaction.reply({
        content: "# ❌ A Word Scramble game is already active!",
        ephemeral: true,
      });
    }

    const difficulty = interaction.options.getString("difficulty");
    const wordList = words[difficulty];
    const originalWord = wordList[Math.floor(Math.random() * wordList.length)];
    const scrambled = scrambleWord(originalWord);
    const prize = getPrize(difficulty);

    isScrambleActive = true;

    const gameMessage = await interaction.reply({
      content: `**Word Scramble (${difficulty.toUpperCase()})**\nUnscramble this: \`${scrambled}\`\n💰 Prize: **${prize} coins**`,
      fetchReply: true,
    });

    const filter = (msg) =>
      msg.content.toLowerCase() === originalWord.toLowerCase() &&
      !msg.author.bot;
    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", (msg) => {
      collector.stop("solved");
      changePlayerBalance(msg.author.id, prize);
      msg.reply(
        `✅ Correct, ${msg.author}! The word was **${originalWord}**.\nYou won **${prize} coins**!`
      );
      gameMessage.edit(
        `🎉 **Solved!** The word was **${originalWord}**. Winner: ${msg.author}`
      );
      isScrambleActive = false;
    });

    collector.on("end", (collected, reason) => {
      if (reason !== "solved") {
        isScrambleActive = false;
        gameMessage.edit(
          `⏱️ Time’s up! No one got it. The word was **${originalWord}**.`
        );
      }
    });
  },
};
