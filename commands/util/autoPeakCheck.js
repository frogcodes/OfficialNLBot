const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
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
    .setName("peak-recheck")
    .setDescription("Process all rows with no sal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const i = await interaction.guild.members.fetch(interaction.user.id);
    // if (
    //   !i.roles.cache.has("1181050438959775747") &&
    //   !i.roles.cache.has("1181050438959775745")
    // ) {
    //   return interaction.editReply({
    //     content: "You are not permitted to perform this command!",
    //     ephemeral: true,
    //   });
    // }
    await interaction.deferReply();

    try {
      // Validate environment variables
      if (!SHEET_ID || !CREDENTIALS) {
        return interaction.editReply({
          content:
            "Error: Missing SHEET_ID or CREDENTIALS environment variables.",
          embeds: [],
        });
      }

      const authClient = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: authClient });

      // Fetch all data from columns A and B
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "A:C",
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        return interaction.editReply({
          content: "No data found in the sheet.",
          embeds: [],
        });
      }

      // Filter rows where column B is empty (skip header row if exists)
      const rowsToProcess = [];
      for (let i = 1; i < rows.length; i++) {
        const columnA = rows[i][0]; // ID from column A
        const columnB = rows[i][1]; // Value from column B

        // Skip if column A is empty (no ID)
        if (!columnA || String(columnA).trim() === "") continue;

        // If column B has content then add to processing list
        if (columnB && columnB.trim() !== "") {
          rowsToProcess.push({
            id: String(columnA),
            rowNumber: i + 1,
            oldTwosMmr: rows[i][1] || "N/A", // Column B (existing 2s MMR)
            oldThreesMmr: rows[i][2] || "N/A", // Column C (existing 3s MMR)
          });
        }
      }

      console.log(`[INIT] Found ${rowsToProcess.length} rows to process`);
      console.log(`[INIT] First 3 rows:`, rowsToProcess.slice(0, 3));

      const totalRows = rowsToProcess.length;

      if (totalRows === 0) {
        return interaction.editReply({
          content: "No rows found with empty B column.",
          embeds: [],
        });
      }

      // Create initial embed
      const embed = new EmbedBuilder()
        .setTitle("Peak Check in progress")
        .setDescription(`Found ${totalRows} rows to process`)
        .addFields(
          { name: "Progress", value: `0/${totalRows}`, inline: true },
          { name: "Status", value: "Starting...", inline: true },
          { name: "Failed Rows", value: "0", inline: true },
          { name: "Successful Updates", value: "None yet", inline: false },
        )
        .setColor(0x0099ff)
        .setTimestamp();

      // Edit the interaction reply once, then send a new message for updates
      await interaction.editReply({
        content: "Starting processing...",
      });

      // Create a new message that we'll edit for updates
      const statusMessage = await interaction.channel.send({ embeds: [embed] });

      // Track processing stats
      let processedCount = 0;
      let failedCount = 0;
      const failedRows = [];
      const successfulRows = [];
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 5 * 60 * 1000;

      // Process each row
      for (let k = 0; k < rowsToProcess.length; k++) {
        const { id, rowNumber, oldTwosMmr, oldThreesMmr } = rowsToProcess[k];

        console.log(
          `[${k + 1}/${rowsToProcess.length}] Processing row ${rowNumber}, ID: ${id}`,
        );

        try {
          const result = await autoSalary(id);
          console.log(`[${k + 1}/${rowsToProcess.length}] Result for ${id}:`, {
            success: result.success,
            twosMmr: result.twosMmr,
            threesMmr: result.threesMmr,
            notes: result.notes,
          });
          processedCount++;
          if (result.success) {
            // Check if MMR actually changed
            const twosMmrChanged =
              String(oldTwosMmr) !== String(result.twosMmr);
            const threesMmrChanged =
              String(oldThreesMmr) !== String(result.threesMmr);

            if (twosMmrChanged || threesMmrChanged) {
              successfulRows.push({
                rowNumber,
                id,
                oldTwosMmr: rowsToProcess[k].oldTwosMmr,
                oldThreesMmr: rowsToProcess[k].oldThreesMmr,
                newTwosMmr: result.twosMmr,
                newThreesMmr: result.threesMmr,
              });
              console.log(
                `[${k + 1}/${rowsToProcess.length}] ✅ Success: ${id} | 2s: ${oldTwosMmr}→${result.twosMmr}, 3s: ${oldThreesMmr}→${result.threesMmr}`,
              );
            } else {
              console.log(
                `[${k + 1}/${rowsToProcess.length}] ℹ️ No change: ${id} | 2s: ${oldTwosMmr}, 3s: ${oldThreesMmr}`,
              );
            }
          }
        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error);
          console.error(
            `[${k + 1}/${rowsToProcess.length}] ❌ Error processing ${id}:`,
            error.message,
          );
          failedCount++;
          failedRows.push({ rowNumber, id, error: error.message });
        }

        // Update embed every 5 minutes OR on the last row
        const now = Date.now();
        const isLastRow = k === rowsToProcess.length - 1;
        const shouldUpdate =
          now - lastUpdateTime >= UPDATE_INTERVAL || isLastRow;

        if (shouldUpdate) {
          // Build successful updates list (show last 10)
          const successListText =
            successfulRows.length > 0
              ? successfulRows
                  .slice(-10)
                  .map(
                    (s) =>
                      `Row ${s.rowNumber} (${s.id}): 2s: ${s.oldTwosMmr}→${s.newTwosMmr}, 3s: ${s.oldThreesMmr}→${s.newThreesMmr}`,
                  )
                  .join("\n")
              : "None yet";

          const moreSuccessful =
            successfulRows.length > 10
              ? `\n...and ${successfulRows.length - 10} more`
              : "";

          const newEmbed = new EmbedBuilder()
            .setTitle("Peak Check in progress")
            .setDescription(`Found ${totalRows} rows to process`)
            .addFields(
              {
                name: "Progress",
                value: `${processedCount + failedCount}/${totalRows}`,
                inline: true,
              },
              {
                name: "Successful",
                value: `${processedCount}`,
                inline: true,
              },
              {
                name: "Failed",
                value: `${failedCount}`,
                inline: true,
              },
              {
                name: "Current Row",
                value: isLastRow ? "Complete" : `Row ${rowNumber} (ID: ${id})`,
                inline: true,
              },
              {
                name: "Status",
                value: isLastRow ? "Complete! ✅" : "Processing...",
                inline: true,
              },
              {
                name: "Recent Successful Updates",
                value: `\`\`\`\n${successListText}${moreSuccessful}\n\`\`\``,
                inline: false,
              },
            )
            .setColor(isLastRow ? 0x00ff00 : 0x0099ff)
            .setTimestamp();

          // Edit the status message instead of the interaction reply
          await statusMessage.edit({ embeds: [newEmbed] });
          lastUpdateTime = now;
        }

        // Random delay between 2-7 minutes (except for last row)
        if (k < rowsToProcess.length - 1) {
          const ms = (Math.random() * 5 + 2) * 60 * 1000;
          await delay(ms);
        }
      }

      // Send final summary
      let summaryMessage = `<@${interaction.user.id}> Run complete! Processed ${processedCount} rows successfully.`;

      if (failedCount > 0) {
        summaryMessage += `\n⚠️ ${failedCount} rows failed to process.`;

        if (failedRows.length > 0) {
          const failedList = failedRows
            .slice(0, 10)
            .map((f) => `Row ${f.rowNumber} (ID: ${f.id}): ${f.error}`)
            .join("\n");

          const moreFailures =
            failedRows.length > 10
              ? `\n...and ${failedRows.length - 10} more.`
              : "";

          await interaction.channel.send(
            `**Failed Rows Details:**\n\`\`\`\n${failedList}${moreFailures}\n\`\`\``,
          );
        }
      }

      // Send successful rows summary
      if (successfulRows.length > 0) {
        const successList = successfulRows
          .slice(0, 20)
          .map(
            (s) =>
              `Row ${s.rowNumber} (${s.id}): 2s: ${s.oldTwosMmr}→${s.newTwosMmr}, 3s: ${s.oldThreesMmr}→${s.newThreesMmr}`,
          )
          .join("\n");

        const moreSuccessful =
          successfulRows.length > 20
            ? `\n...and ${successfulRows.length - 20} more.`
            : "";

        await interaction.channel.send(
          `**Successfully Updated Rows:**\n\`\`\`\n${successList}${moreSuccessful}\n\`\`\``,
        );
      }

      await interaction.channel.send(summaryMessage);
    } catch (error) {
      console.error("Error in requirements-check command:", error);

      // Try to send error to channel if interaction token is expired
      try {
        await interaction.editReply({
          content: `Error: ${error.message || "An unexpected error occurred."}`,
          embeds: [],
        });
      } catch (editError) {
        // If interaction token expired, send to channel instead
        await interaction.channel.send({
          content: `<@${interaction.user.id}> Error: ${
            error.message || "An unexpected error occurred."
          }`,
        });
      }
    }
  },
};
