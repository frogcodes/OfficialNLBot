const { SlashCommandBuilder } = require("discord.js");
const autoSalary = require("../../utils/autoSal.js");
const { google } = require("googleapis");

const SHEET_ID = process.env.enrollmentSheetId;
const CREDENTIALS = process.env.credentials;

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autosal-input")
    .setDescription("Report the score of a match or cancel a match")
    .addIntegerOption((option) =>
      option
        .setName("startrow")
        .setDescription("Starting row number")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("endrow")
        .setDescription("Ending row number")
        .setRequired(true),
    ),

  async execute(interaction) {
    // const i = await interaction.guild.members.fetch(interaction.user.id);
    // if (
    //   !i.roles.cache.has("1181050438959775747") &&
    //   !i.roles.cache.has("1181050438959775745")
    // ) {
    //   return interaction.reply({
    //     content: "You are not permitted to perform this command!",
    //     ephemeral: true,
    //   });
    // }
    interaction.reply({
      content: "ill start working on it goat",
      ephemeral: true,
    });
    const startRow = interaction.options.getInteger("startrow");
    const endRow = interaction.options.getInteger("endrow");

    // Validate row range
    if (startRow > endRow) {
      return interaction.reply(
        "Start row must be less than or equal to end row!",
      );
    }

    try {
      const range = `A${startRow}:A${endRow}`;

      const authClient = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: authClient });

      // Fetch data from Google Sheets
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        return interaction.reply("No data found in the specified range.");
      }

      // Convert to flat array (since column A returns arrays of arrays)
      const dataArray = rows.map((row) => row[0]);

      // Loop through the array and do something with it
      let result = "Data from column A:\n";
      for (let i = 0; i < dataArray.length; i++) {
        await autoSalary(dataArray[i]);
        ms = (Math.random() * 5 + 2) * 60 * 1000;
        await delay(ms);
      }

      await interaction.channel.send(
        `<@${interaction.user.id}>. Run Complete for rows ${startRow}-${endRow}`,
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      await interaction.reply("Error fetching data from Google Sheets.");
    }
  },
};
