const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { google } = require("googleapis");
const { enrollmentTracker } = require("../../utils/enrollmentTracker.js");

const SHEET_ID = process.env.enrollmentSheetId;
const DB_ID = process.env.databaseId;
const CREDENTIALS = process.env.credentials;

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("enroll")
    .setDescription("Enroll for Nature League"),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const playerID = interaction.user.id;

      // Check if the user already has the role
      if (interaction.member.roles.cache.has("1337883747629928611")) {
        return interaction.editReply({
          content:
            "You have already enrolled. If you need to make any changes, please open an admissions ticket in https://discord.com/channels/1181050438750060584/1238989734886244352/1389490865440821288.",
          ephemeral: true,
        });
      }

      // Tracker Database Check
      const authClient = await auth.getClient();

      const idColumn = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId: DB_ID,
        range: "Database!A:A",
      });

      const idRows = idColumn.data.values || [];
      const rowIndex = idRows.findIndex((row) => row[0] === playerID);

      if (rowIndex === -1) {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("add_tracker")
            .setLabel("➕ Add Tracker")
            .setStyle(ButtonStyle.Primary),
        );

        await interaction.editReply({
          content:
            "It seems you have not enrolled before.\n\nPlease click the **Add Tracker** button and paste all your Rocket League tracker links **separated by commas**.\n\n**Example:**\n```\nhttps://rocketleague.tracker.network/profile/epic/User1, https://rocketleague.tracker.network/profile/steam/User2\n```",
          components: [buttons],
          ephemeral: true,
        });
        return;
      }

      const sheetRow = rowIndex + 1;
      const rowResponse = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId: DB_ID,
        range: `Database!A${sheetRow}:I${sheetRow}`,
      });

      const row = rowResponse.data.values?.[0] || [];
      const trackers = row.filter(
        (cell) =>
          typeof cell === "string" && cell.includes("rocketleague.tracker"),
      );

      // Initialize enrollment state
      await enrollmentTracker.set(interaction.user.id, {
        trackers,
        current: 0,
        reviewed: [],
      });

      if (trackers.length === 0) {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("add_tracker")
            .setLabel("➕ Add Tracker")
            .setStyle(ButtonStyle.Primary),
        );

        await interaction.editReply({
          content:
            "It seems we have no trackers saved for you.\n\nPlease click the **Add Tracker** button and paste all your Rocket League tracker links **separated by commas**.\n\n**Example:**\n```\nhttps://rocketleague.tracker.network/profile/epic/User1, https://rocketleague.tracker.network/profile/steam/User2\n```",
          components: [buttons],
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Enrollment Tracker Confirmation")
        .setDescription(
          "Please confirm the following tracker links are all yours and valid:",
        )
        .addFields(
          trackers.map((link, i) => ({
            name: `Tracker ${i + 1}`,
            value: `${link}`,
          })),
        )
        .setColor("Green");

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm_trackers")
          .setLabel("✅ Yes")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("review_trackers")
          .setLabel("❌ No")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("add_tracker")
          .setLabel("➕ Add More")
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.editReply({
        embeds: [embed],
        components: [buttons],
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in enroll command:", error);

      const errorMessage =
        "An error occurred during enrollment. Please try again or contact an admin.";

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({
            content: errorMessage,
            embeds: [],
            components: [],
            ephemeral: true,
          })
          .catch(console.error);
      } else {
        await interaction
          .reply({
            content: errorMessage,
            ephemeral: true,
          })
          .catch(console.error);
      }
    }
  },
};
/* Validate tracker1
    if (
      !tracker1.startsWith(
        "https://rocketleague.tracker.network/rocket-league/profile/epic/"
      )
    ) {
      return interaction.reply({
        content:
          "Tracker Link 1 must be **YOUR EPIC TRACKER.** example: https://rocketleague.tracker.network/rocket-league/profile/epic/",
        ephemeral: true,
      });
    }

    if (
      tracker2 &&
      !tracker2.startsWith(
        "https://rocketleague.tracker.network/rocket-league/profile/"
      )
    ) {
      return interaction.reply({
        content:
          "Tracker Link 2 is **INVALID**  example: https://rocketleague.tracker.network/rocket-league/profile/",
        ephemeral: true,
      });
    }

    if (
      tracker3 &&
      !tracker3.startsWith(
        "https://rocketleague.tracker.network/rocket-league/profile/"
      )
    ) {
      return interaction.reply({
        content: "Tracker Link 3 is **INVALID**",
        ephemeral: true,
      });
    }

    // Check if the user already has the role
    if (interaction.member.roles.cache.has("1337883747629928611")) {
      return interaction.reply({
        content:
          "You have already enrolled. If you need to make any changes, please open an admissions ticket in https://discord.com/channels/1181050438750060584/1238989734886244352.",
        ephemeral: true,
      });
    }

    // Give the user the role
    try {
      await interaction.member.roles.add("1337883747629928611");
    } catch (error) {
      console.error("Error giving role:", error);
      return interaction.reply({
        content:
          "There was an error assigning your role. Please try again later.",
        ephemeral: true,
      });
    }

    // Append data to Google Sheets
    try {
      const authClient = await auth.getClient();
      sheets.spreadsheets.values.append({
        auth: authClient,
        spreadsheetId: SHEET_ID,
        range: "Admissions!A:A",
        valueInputOption: "RAW",
        resource: {
          values: [[interaction.user.id, "", "", tracker1, tracker2, tracker3]],
        },
      });

      await interaction.reply({
        content: "Enrollment submitted successfully!",
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error appending data to Google Sheets:", error);
      await interaction.reply({
        content:
          "There was an error submitting your enrollment. Please try again later.",
        ephemeral: true,
      });
    } */
