const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { google } = require("googleapis");

const PLAYER_ROLE_ID = "1337882326566440960";
const NO_REQS_ROLE_ID = "1470322130812932128";
const ENROLLED_ROLE_ID = "1337883747629928611";
const FA_LEAGUE_ROLE_ID = "1470322091902373909";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join-fa-league")
    .setDescription("Sign up for the Free Agent League"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get the member object
      const member = interaction.member;

      // Define role IDs (YOU NEED TO REPLACE THESE WITH YOUR ACTUAL ROLE IDS)

      // Check if user has the player role (should NOT have it)
      if (member.roles.cache.has(PLAYER_ROLE_ID)) {
        return await interaction.editReply({
          content:
            "You already have the Player role and will automatically join FA League as a Free Agent.",
        });
      }

      // Check if user has the no reqs role (MUST have it)
      if (!member.roles.cache.has(NO_REQS_ROLE_ID)) {
        return await interaction.editReply({
          content: "You must have the No Reqs role to join the FA League.",
        });
      }

      // Check if user has the enrolled role (MUST have it)
      if (!member.roles.cache.has(ENROLLED_ROLE_ID)) {
        return await interaction.editReply({
          content: "You must have the Enrolled role to join the FA League.",
        });
      }

      // Check if user already has FA role
      if (member.roles.cache.has(FA_LEAGUE_ROLE_ID)) {
        return await interaction.editReply({
          content: "You are already signed up for the FA League!",
        });
      }

      // Add to Google Sheet
      await addToSheet(interaction.user.id);

      // Add FA role
      await member.roles.add(FA_LEAGUE_ROLE_ID);

      // Success message
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Successfully Joined FA League!")
        .setDescription(
          `Welcome to the Free Agent League, ${interaction.user}!`,
        )
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [embed],
      });
    } catch (error) {
      console.error("Error in join-fa-league command:", error);
      await interaction.editReply({
        content:
          "An error occurred while processing your request. Please contact an administrator.",
      });
    }
  },
};

async function addToSheet(discordId) {
  // YOU NEED TO REPLACE THESE WITH YOUR ACTUAL VALUES
  const SPREADSHEET_ID = process.env.enrollmentSheetId;
  const CREDENTIALS = process.env.credentials;
  // Google Sheets setup
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const SHEET_NAME = "RFAd FA League Players"; // e.g., "FA Signups"

  const sheets = google.sheets({ version: "v4", auth });

  // Get all values from the sheet to find the first empty row in column A
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = response.data.values || [];

  // Find the first empty row (where column A is empty)
  let targetRow = 1; // Start from row 1
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i] || !rows[i][0]) {
      targetRow = i + 1; // +1 because sheets are 1-indexed
      break;
    }
  }

  // If all rows have values in column A, append to the next row
  if (targetRow === 1 && rows.length > 0) {
    targetRow = rows.length + 1;
  }

  // Write the Discord ID to column B of the target row (leaving A empty)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${targetRow}`,
    valueInputOption: "RAW",
    resource: {
      values: [[discordId]],
    },
  });
}
