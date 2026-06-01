const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const { google } = require("googleapis");
const { enrollmentTracker } = require("../utils/enrollmentTracker.js");

const ADMISSIONS_ID = "1225307467659874396";
const ADMISSIONS_PING = `<@&${ADMISSIONS_ID}>`; // Replace with actual role ID
const SHEET_ID = process.env.enrollmentSheetId;
const DB_ID = process.env.databaseId;
const CREDENTIALS = process.env.credentials;

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Helper: Show review buttons + embed
function getReviewEmbed(index, link) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Review Tracker ${index + 1}`)
    .setDescription(`${link}\nIs this tracker valid and yours?`);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tracker_valid")
      .setLabel("✅ Yes")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("tracker_invalid")
      .setLabel("❌ No")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("add_tracker")
      .setLabel("➕ Add More")
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, buttons };
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    const { customId, user } = interaction;

    if (interaction.isButton()) {
      if (customId === "confirm_trackers") {
        await interaction.deferUpdate();
        const userData = await enrollmentTracker.get(user.id);
        const trackers = userData?.trackers;

        if (!trackers || trackers.length === 0) {
          return await interaction.editReply({
            content:
              "❌ No trackers found to review. Please restart enrollment.",
            components: [],
            embeds: [],
          });
        }

        const currentData = userData || {};
        await enrollmentTracker.set(user.id, {
          ...currentData,
          reviewed: trackers, // Set reviewed trackers
        });

        return await interaction.editReply({
          content:
            "⚠️ **Final Check**\nAre you absolutely sure you have no additional tracker accounts?\nIf it's discovered later that you withheld trackers, you may be deemed ineligible or face punishment.\n\nClick below to continue.",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("final_confirm_trackers")
                .setLabel("✅ Yes, Continue")
                .setStyle(ButtonStyle.Success)
            ),
          ],
          embeds: [],
        });
      }

      if (customId === "final_confirm_trackers") {
        const modal = new ModalBuilder()
          .setCustomId("social_modal")
          .setTitle("Enter Social Handles for NL use (optional)")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("twitter")
                .setLabel("Twitter Handle (can leave blank)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("instagram")
                .setLabel("Instagram Handle (can leave blank)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            )
          );

        return await interaction.showModal(modal);
      }

      if (customId === "review_trackers") {
        await interaction.deferUpdate();
        const userData = await enrollmentTracker.get(user.id);
        const trackers = userData?.trackers;

        if (!trackers || trackers.length === 0) {
          return await interaction.editReply({
            content:
              "❌ No trackers found to review. Please restart enrollment.",
            components: [],
            embeds: [],
          });
        }

        await enrollmentTracker.set(user.id, {
          trackers,
          current: 0,
          reviewed: [],
        });

        const { embed, buttons } = getReviewEmbed(0, trackers[0]);

        return await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [buttons],
        });
      }

      if (customId === "add_tracker") {
        const modal = new ModalBuilder()
          .setCustomId("add_tracker_modal")
          .setTitle("Add More Tracker Links")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("tracker_links")
                .setLabel("Paste tracker links (comma separated)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        return await interaction.showModal(modal);
      }

      if (customId === "tracker_invalid") {
        await interaction.deferUpdate();
        const state = await enrollmentTracker.get(user.id);

        if (!state || !state.trackers) {
          return await interaction.editReply({
            content: "❌ No tracker data found. Please restart enrollment.",
            components: [],
            embeds: [],
          });
        }

        const currentTracker = state.trackers[state.current];

        // Send message to admissions log channel
        const logChannel = interaction.client.channels.cache.get(
          "1393293384558448720"
        );
        if (logChannel) {
          const message = await logChannel.send(
            `<@${user.id}> reported an invalid tracker:\n${currentTracker}\nCheck if it's a no longer working tracker\n✅ to remove from DB and Admissions Sheet\n❌ to keep in system`
          );

          await message.react("✅");
          await message.react("❌");

          // Set up reaction collector for admissions team
          const filter = async (reaction, reactor) => {
            const guild = message.guild;
            if (!guild) return false;
            const member = await guild.members
              .fetch(reactor.id)
              .catch(() => null);
            return (
              ["✅", "❌"].includes(reaction.emoji.name) &&
              member?.roles.cache.has(ADMISSIONS_ID)
            );
          };

          const collector = message.createReactionCollector({
            filter,
            max: 1,
            time: 300000, // 5 minutes
          });

          collector.on("collect", async (reaction) => {
            const authClient = await auth.getClient();

            if (reaction.emoji.name === "✅") {
              // Remove tracker from sheets
              const sheetsToCheck = [
                { id: SHEET_ID, name: "Admissions" },
                { id: DB_ID, name: "Database" },
              ];

              for (const sheet of sheetsToCheck) {
                try {
                  const res = await sheets.spreadsheets.values.get({
                    auth: authClient,
                    spreadsheetId: sheet.id,
                    range: `${sheet.name}!A:Z`,
                  });

                  const updates = [];
                  (res.data.values || []).forEach((row, rowIndex) => {
                    row.forEach((cell, colIndex) => {
                      if (cell === currentTracker) {
                        const colLetter = String.fromCharCode(65 + colIndex);
                        updates.push({
                          range: `${sheet.name}!${colLetter}${rowIndex + 1}`,
                          values: [[""]],
                        });
                      }
                    });
                  });

                  if (updates.length > 0) {
                    await sheets.spreadsheets.values.batchUpdate({
                      auth: authClient,
                      spreadsheetId: sheet.id,
                      resource: {
                        valueInputOption: "RAW",
                        data: updates,
                      },
                    });
                  }
                } catch (error) {
                  console.error(`Error updating ${sheet.name}:`, error);
                }
              }

              await message.edit(
                `✅ Tracker "${currentTracker}" was cleared from all records.`
              );
            } else if (reaction.emoji.name === "❌") {
              // Add tracker back to user's profile
              try {
                const dbRes = await sheets.spreadsheets.values.get({
                  auth: authClient,
                  spreadsheetId: DB_ID,
                  range: "Database!A:Z",
                });

                const dbRows = dbRes.data.values || [];
                const dbIndex = dbRows.findIndex(
                  (row) => String(row[0]) === String(user.id)
                );

                if (dbIndex !== -1) {
                  const existingRow = dbRows[dbIndex];
                  const updatedRow = [...existingRow, currentTracker];

                  await sheets.spreadsheets.values.update({
                    auth: authClient,
                    spreadsheetId: DB_ID,
                    range: `Database!A${dbIndex + 1}:Z${dbIndex + 1}`,
                    valueInputOption: "RAW",
                    resource: { values: [updatedRow] },
                  });

                  await message.edit(
                    "❌ Tracker was added back to user's profile."
                  );
                } else {
                  await message.edit(
                    "⚠️ Could not find user in Database to re-add tracker."
                  );
                }
              } catch (error) {
                console.error("Error re-adding tracker:", error);
                await message.edit(
                  "❌ Error occurred while re-adding tracker."
                );
              }
            }
          });
        }

        // Continue the review process - remove invalid tracker
        state.trackers.splice(state.current, 1);
        await enrollmentTracker.set(user.id, state);

        // Check if there are no more trackers
        if (state.trackers.length === 0) {
          await enrollmentTracker.delete(user.id);
          return await interaction.editReply({
            content:
              "❌ All trackers were marked invalid. Please restart the process.",
            components: [],
            embeds: [],
          });
        }

        // If we're at the end of the list, show summary
        if (state.current >= state.trackers.length) {
          const embed = new EmbedBuilder()
            .setTitle("📋 All Trackers Reviewed")
            .setDescription(
              "Please verify your updated tracker list before submitting:"
            )
            .addFields(
              state.trackers.map((link, i) => ({
                name: `Tracker ${i + 1}`,
                value: link,
              }))
            )
            .setColor("Green");

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("confirm_trackers")
              .setLabel("✅ Confirm & Submit")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("review_trackers")
              .setLabel("🔍 Review Again")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("add_tracker")
              .setLabel("➕ Add More")
              .setStyle(ButtonStyle.Primary)
          );

          return await interaction.editReply({
            content:
              "✅ Tracker review complete! Please confirm your trackers or make changes below.",
            embeds: [embed],
            components: [buttons],
          });
        }

        // Otherwise, show the next tracker
        const { embed, buttons } = getReviewEmbed(
          state.current,
          state.trackers[state.current]
        );

        return await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [buttons],
        });
      }

      if (customId === "tracker_valid") {
        await interaction.deferUpdate();
        const state = await enrollmentTracker.get(user.id);

        if (!state || !state.trackers) {
          return await interaction.editReply({
            content: "❌ No tracker data found. Please restart enrollment.",
            components: [],
            embeds: [],
          });
        }

        const currentTracker = state.trackers[state.current];
        state.reviewed.push(currentTracker);
        state.current++;

        await enrollmentTracker.set(user.id, state);

        if (state.current >= state.trackers.length) {
          // All trackers reviewed - show summary
          const embed = new EmbedBuilder()
            .setTitle("📋 All Trackers Reviewed")
            .setDescription(
              "Please verify your trackers once more before submitting:"
            )
            .addFields(
              state.trackers.map((link, i) => ({
                name: `Tracker ${i + 1}`,
                value: link,
              }))
            )
            .setColor("Green");

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("confirm_trackers")
              .setLabel("✅ Confirm & Submit")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("review_trackers")
              .setLabel("🔍 Review Again")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("add_tracker")
              .setLabel("➕ Add More")
              .setStyle(ButtonStyle.Primary)
          );

          return await interaction.editReply({
            content:
              "✅ Tracker review complete! Please verify your trackers or add more if needed.",
            embeds: [embed],
            components: [buttons],
          });
        } else {
          // Show next tracker
          const { embed, buttons } = getReviewEmbed(
            state.current,
            state.trackers[state.current]
          );

          return await interaction.editReply({
            content: "",
            embeds: [embed],
            components: [buttons],
          });
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (customId === "social_modal") {
        await interaction.deferUpdate();
        const twitter =
          interaction.fields.getTextInputValue("twitter") || "N/A";
        const instagram =
          interaction.fields.getTextInputValue("instagram") || "N/A";

        const state = await enrollmentTracker.get(interaction.user.id);
        const finalTrackers = state?.reviewed || state?.trackers || [];

        try {
          const authClient = await auth.getClient();
          const admitValues = [[interaction.user.id, "", "", ...finalTrackers]];
          const dbValues = [
            [interaction.user.id, twitter, instagram, ...finalTrackers],
          ];
          const playerID = String(interaction.user.id);

          // Step 1: Append to Admissions sheet
          const appendAdmissions = sheets.spreadsheets.values.append({
            auth: authClient,
            spreadsheetId: SHEET_ID,
            range: "Admissions!A1",
            valueInputOption: "RAW",
            resource: { values: admitValues },
          });

          // Step 2: Read Database sheet to find player row
          const readRes = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: DB_ID,
            range: "Database!A:A",
          });

          const rows = readRes.data.values || [];
          const rowIndex = rows.findIndex((row) => String(row[0]) === playerID);

          let updateOrAppendDb;
          if (rowIndex === -1) {
            // ID not found → append new row
            updateOrAppendDb = sheets.spreadsheets.values.append({
              auth: authClient,
              spreadsheetId: DB_ID,
              range: "Database!A1",
              valueInputOption: "RAW",
              resource: { values: dbValues },
            });
          } else {
            // ID found → update that row
            const sheetRow = rowIndex + 1;
            const range = `Database!A${sheetRow}:Z${sheetRow}`;
            updateOrAppendDb = sheets.spreadsheets.values.update({
              auth: authClient,
              spreadsheetId: DB_ID,
              range,
              valueInputOption: "RAW",
              resource: { values: dbValues },
            });
          }

          // Run both operations in parallel
          await Promise.all([appendAdmissions, updateOrAppendDb]);

          // Clean up enrollment data
          await enrollmentTracker.delete(interaction.user.id);

          // Update user roles
          try {
            await interaction.member.roles.add("1337883747629928611"); // enrolled role
            await interaction.member.roles.remove("1190802857939709984"); // new person role
          } catch (roleError) {
            console.error("Error updating roles:", roleError);
            // Don't return here - still show success message
          }

          return await interaction.editReply({
            content: `✅ Enrollment submitted successfully!\n**Twitter:** ${twitter}\n**Instagram:** ${instagram}`,
            components: [],
            embeds: [],
          });
        } catch (error) {
          console.error("Error during enrollment submission:", error);

          // Try to notify admin
          try {
            const adminUser = await interaction.client.users.fetch(
              "351480764602515487"
            );
            await adminUser.send(
              `Error during enrollment for ${interaction.user.tag}: ${error.message}`
            );
          } catch (dmError) {
            console.error("Could not DM admin:", dmError);
          }

          return await interaction.editReply({
            content:
              "❌ There was an error processing your enrollment. Please try again or contact an admin.",
            components: [],
            embeds: [],
          });
        }
      }

      if (customId === "add_tracker_modal") {
        await interaction.deferUpdate();
        const input = interaction.fields.getTextInputValue("tracker_links");

        const newLinks = input
          .split(/[\n,]+/)
          .map((link) => link.trim())
          .filter(
            (link) =>
              link.startsWith("http") && link.includes("rocketleague.tracker")
          );

        if (newLinks.length === 0) {
          return await interaction.editReply({
            content:
              "❌ No valid tracker links detected. Please make sure they start with 'http' and contain 'rocketleague.tracker'.",
            components: [],
            embeds: [],
          });
        }

        let state = await enrollmentTracker.get(interaction.user.id);

        // If no state exists (new user), create one
        if (!state) {
          state = {
            trackers: [...newLinks],
            current: 0,
            reviewed: [],
          };
        } else {
          // Add new trackers to the list
          state.trackers.push(...newLinks);
        }

        await enrollmentTracker.set(interaction.user.id, state);

        // Show current tracker (or first one if starting fresh)
        const currentIndex = Math.min(state.current, state.trackers.length - 1);
        const { embed, buttons } = getReviewEmbed(
          currentIndex,
          state.trackers[currentIndex]
        );

        return await interaction.editReply({
          content: `✅ Added ${newLinks.length} new tracker(s). Continuing review...`,
          embeds: [embed],
          components: [buttons],
        });
      }
    }
  },
};
