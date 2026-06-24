const {
  Events,
  Collection,
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
const autoSalary = require("../utils/autoSal.js");

// Configuration constants
const ADMISSIONS_ID = "1225307467659874396";
const ADMISSIONS_PING = `<@&${ADMISSIONS_ID}>`;
const SHEET_ID = process.env.enrollmentSheetId;
const DB_ID = process.env.databaseId;
const CREDENTIALS = process.env.credentials;
const LOG_CHANNEL_ID = "1393293384558448720";
const DEV_USER_ID = "351480764602515487";
const ENROLLED_ROLE_ID = "1337883747629928611";
const NEW_PERSON_ROLE_ID = "1190802857939709984";
const PREVIOUS_ENROLLEE_ROLE_ID = "1504896008377860177";
const NO_REQS_ROLE_ID = "1225307467659874396";

// Google Sheets setup
const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Helper: button shown when a user's enrollment session has expired or was lost
function getRestartButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("restart_enrollment")
      .setLabel("🔄 Restart Enrollment")
      .setStyle(ButtonStyle.Primary),
  );
}

// Helper function to create review embed and buttons
function getReviewEmbed(index, link, totalCount) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Review Tracker ${index + 1} of ${totalCount}`)
    .setDescription(`${link}\n\nIs this tracker valid and yours?`)
    .setColor("Blue");

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
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, buttons };
}

// Helper function to handle invalid tracker reporting
async function handleInvalidTracker(interaction, currentTracker) {
  const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) {
    console.error("Log channel not found!");
    return;
  }

  try {
    const message = await logChannel.send(
      `<@${interaction.user.id}> reported an invalid tracker:\n${currentTracker}\nCheck if it's a no longer working tracker\n✅ to remove from DB and Admissions Sheet\n❌ to keep in system`,
    );

    await message.react("✅");
    await message.react("❌");

    // Set up reaction collector for admissions team
    const filter = async (reaction, reactor) => {
      const guild = message.guild;
      if (!guild) return false;
      try {
        const member = await guild.members.fetch(reactor.id);
        return (
          ["✅", "❌"].includes(reaction.emoji.name) &&
          member?.roles.cache.has(ADMISSIONS_ID)
        );
      } catch (error) {
        console.error("Error fetching member for reaction filter:", error);
        return false;
      }
    };

    const collector = message.createReactionCollector({
      filter,
      max: 1,
      time: 300000, // 5 minutes
    });

    collector.on("collect", async (reaction) => {
      try {
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
            `✅ Tracker "${currentTracker}" was cleared from all records.`,
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
              (row) => String(row[0]) === String(interaction.user.id),
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
                "❌ Tracker was added back to user's profile.",
              );
            } else {
              await message.edit(
                "⚠️ Could not find user in Database to re-add tracker.",
              );
            }
          } catch (error) {
            console.error("Error re-adding tracker:", error);
            await message.edit("❌ Error occurred while re-adding tracker.");
          }
        }
      } catch (error) {
        console.error("Error in reaction collector:", error);
      }
    });
  } catch (error) {
    console.error("Error in handleInvalidTracker:", error);
  }
}

// Helper function to show tracker summary
function createTrackerSummary(trackers) {
  const embed = new EmbedBuilder()
    .setTitle("📋 All Trackers Reviewed")
    .setDescription("Please verify your trackers once more before submitting:")
    .addFields(
      trackers.map((link, i) => ({
        name: `Tracker ${i + 1}`,
        value: link,
      })),
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
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, buttons };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      console.log("Processing interaction:", interaction.type);

      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        return await handleSlashCommand(interaction);
      }

      // Handle button interactions
      if (interaction.isButton()) {
        return await handleButtonInteraction(interaction);
      }

      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        return await handleModalSubmit(interaction);
      }
    } catch (error) {
      console.error("Error in interaction handler:", error);

      // Attempt to send error message to user
      try {
        const errorMessage =
          "An unexpected error occurred. Please try again or contact an admin.";

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: errorMessage,
            embeds: [],
            components: [],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: errorMessage,
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("Could not send error message to user:", replyError);
      }
    }
  },
};

// Handle slash command interactions
async function handleSlashCommand(interaction) {
  const { cooldowns } = interaction.client;
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  // Initialize cooldowns collection for this command
  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, new Collection());
  }

  // Handle cooldowns
  const now = Date.now();
  const timestamps = cooldowns.get(command.data.name);
  const defaultCooldownDuration = 3;
  const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

    if (now < expirationTime) {
      const expiredTimestamp = Math.round(expirationTime / 1000);
      return interaction.reply({
        content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`,
        ephemeral: true,
      });
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

  // Execute command
  try {
    await command.execute(interaction, interaction.client);
  } catch (error) {
    console.error("Command execution error:", error);
    const errorMessage = "There was an error while executing this command!";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

// Handle button interactions
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  try {
    switch (customId) {
      case "confirm_trackers":
        return await handleConfirmTrackers(interaction);

      case "final_confirm_trackers":
        return await handleFinalConfirmTrackers(interaction);

      case "review_trackers":
        return await handleReviewTrackers(interaction);

      case "add_tracker":
        return await handleAddTracker(interaction);

      case "restart_enrollment":
        return await handleRestartEnrollment(interaction);

      case "tracker_invalid":
        return await handleTrackerInvalid(interaction);

      case "tracker_valid":
        return await handleTrackerValid(interaction);

      default:
        console.log(`Unhandled button interaction: ${customId}`);
    }
  } catch (error) {
    console.error(`Error handling button ${customId}:`, error);
    throw error; // Re-throw to be caught by main handler
  }
}

// Handle modal submissions
async function handleModalSubmit(interaction) {
  const { customId } = interaction;

  try {
    switch (customId) {
      case "social_modal":
        return await handleSocialModal(interaction);

      case "add_tracker_modal":
        return await handleAddTrackerModal(interaction);

      default:
        console.log(`Unhandled modal submission: ${customId}`);
    }
  } catch (error) {
    console.error(`Error handling modal ${customId}:`, error);
    throw error; // Re-throw to be caught by main handler
  }
}

// Button handler functions
async function handleConfirmTrackers(interaction) {
  await interaction.deferUpdate();
  const userData = await enrollmentTracker.get(interaction.user.id);
  const trackers = userData?.trackers;

  if (!trackers || trackers.length === 0) {
    return await interaction.editReply({
      content:
        "❌ Your enrollment session expired or timed out. Click below to re-enter your tracker links and continue.",
      components: [getRestartButton()],
      embeds: [],
    });
  }

  // Store the reviewed trackers in state
  await enrollmentTracker.set(interaction.user.id, {
    ...userData,
    reviewed: [...trackers], // Make a copy to preserve the list
  });

  return await interaction.editReply({
    content:
      "⚠️ **Final Check**\nAre you absolutely sure you have no additional tracker accounts?\nIf it's discovered later that you withheld trackers, you may be deemed ineligible or face punishment.\n\nClick below to continue.",
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("final_confirm_trackers")
          .setLabel("✅ Yes, Continue")
          .setStyle(ButtonStyle.Success),
      ),
    ],
    embeds: [],
  });
}

async function handleFinalConfirmTrackers(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("social_modal")
    .setTitle("Enter Social Handles for NL use (optional)")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("twitter")
          .setLabel("Twitter Handle (can leave blank)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("instagram")
          .setLabel("Instagram Handle (can leave blank)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );

  return await interaction.showModal(modal);
}

async function handleReviewTrackers(interaction) {
  await interaction.deferUpdate();
  const userData = await enrollmentTracker.get(interaction.user.id);
  const trackers = userData?.trackers;

  if (!trackers || trackers.length === 0) {
    return await interaction.editReply({
      content:
        "❌ Your enrollment session expired or timed out. Click below to re-enter your tracker links and continue.",
      components: [getRestartButton()],
      embeds: [],
    });
  }

  // Reset review state
  await enrollmentTracker.set(interaction.user.id, {
    trackers: [...trackers], // Make a copy
    current: 0,
    reviewed: [],
  });

  const { embed, buttons } = getReviewEmbed(0, trackers[0], trackers.length);

  return await interaction.editReply({
    content: "",
    embeds: [embed],
    components: [buttons],
  });
}

async function handleAddTracker(interaction) {
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
          .setPlaceholder("https://rocketleague.tracker.network/profile/..."),
      ),
    );

  return await interaction.showModal(modal);
}

// Restart the enrollment flow from scratch: re-check the database for the
// user's saved trackers, exactly like the /enroll command does.
async function handleRestartEnrollment(interaction) {
  await interaction.deferUpdate();

  const playerID = interaction.user.id;

  // Already enrolled? Nothing to restart.
  if (interaction.member.roles.cache.has(ENROLLED_ROLE_ID)) {
    return await interaction.editReply({
      content:
        "You have already enrolled. If you need to make any changes, please open an admissions ticket in https://discord.com/channels/1181050438750060584/1238989734886244352/1389490865440821288.",
      components: [],
      embeds: [],
    });
  }

  const addTrackerButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("add_tracker")
      .setLabel("➕ Add Tracker")
      .setStyle(ButtonStyle.Primary),
  );

  const authClient = await auth.getClient();
  const idColumn = await sheets.spreadsheets.values.get({
    auth: authClient,
    spreadsheetId: DB_ID,
    range: "Database!A:A",
  });

  const idRows = idColumn.data.values || [];
  const rowIndex = idRows.findIndex((row) => row[0] === playerID);

  if (rowIndex === -1) {
    return await interaction.editReply({
      content:
        "It seems you have not enrolled before.\n\nPlease click the **Add Tracker** button and paste all your Rocket League tracker links **separated by commas**.\n\n**Example:**\n```\nhttps://rocketleague.tracker.network/profile/epic/User1, https://rocketleague.tracker.network/profile/steam/User2\n```",
      components: [addTrackerButton],
      embeds: [],
    });
  }

  const sheetRow = rowIndex + 1;
  const rowResponse = await sheets.spreadsheets.values.get({
    auth: authClient,
    spreadsheetId: DB_ID,
    range: `Database!A${sheetRow}:I${sheetRow}`,
  });

  const row = rowResponse.data.values?.[0] || [];
  const trackers = row.filter(
    (cell) => typeof cell === "string" && cell.includes("rocketleague.tracker"),
  );

  // Reset enrollment state for a fresh review
  await enrollmentTracker.set(interaction.user.id, {
    trackers,
    current: 0,
    reviewed: [],
  });

  if (trackers.length === 0) {
    return await interaction.editReply({
      content:
        "It seems we have no trackers saved for you.\n\nPlease click the **Add Tracker** button and paste all your Rocket League tracker links **separated by commas**.\n\n**Example:**\n```\nhttps://rocketleague.tracker.network/profile/epic/User1, https://rocketleague.tracker.network/profile/steam/User2\n```",
      components: [addTrackerButton],
      embeds: [],
    });
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

  return await interaction.editReply({
    content: "",
    embeds: [embed],
    components: [buttons],
  });
}

async function handleTrackerInvalid(interaction) {
  await interaction.deferUpdate();
  const state = await enrollmentTracker.get(interaction.user.id);

  if (!state || !state.trackers || state.trackers.length === 0) {
    return await interaction.editReply({
      content:
        "❌ Your enrollment session expired or timed out. Click below to re-enter your tracker links and continue.",
      components: [getRestartButton()],
      embeds: [],
    });
  }

  // Ensure current index is valid
  if (state.current >= state.trackers.length) {
    state.current = state.trackers.length - 1;
  }

  const currentTracker = state.trackers[state.current];

  // Handle the invalid tracker reporting (async, but don't wait for it)
  handleInvalidTracker(interaction, currentTracker).catch((error) => {
    console.error("Error reporting invalid tracker:", error);
  });

  // Remove invalid tracker from the array
  const updatedTrackers = [
    ...state.trackers.slice(0, state.current),
    ...state.trackers.slice(state.current + 1),
  ];

  // Update state - DON'T increment current since we removed the item
  const updatedState = {
    trackers: updatedTrackers,
    current: state.current, // Keep current index the same
    reviewed: state.reviewed || [],
  };

  await enrollmentTracker.set(interaction.user.id, updatedState);

  // Check if there are no more trackers
  if (updatedTrackers.length === 0) {
    await enrollmentTracker.delete(interaction.user.id);
    return await interaction.editReply({
      content:
        "❌ All trackers were marked invalid. Please restart the process by using `/enroll` again.",
      components: [],
      embeds: [],
    });
  }

  // Removing a tracker shifts the next one into the current index, so we do
  // NOT advance `current`. If `current` is now past the end, it means we just
  // removed the last tracker and everything remaining has already been
  // reviewed -> go straight to the summary (don't re-show a reviewed tracker).
  if (updatedState.current >= updatedTrackers.length) {
    const { embed, buttons } = createTrackerSummary(updatedTrackers);
    return await interaction.editReply({
      content:
        "✅ Tracker removed and review complete! Please confirm your remaining trackers below.",
      embeds: [embed],
      components: [buttons],
    });
  }

  // Otherwise show the tracker that shifted into the current position
  const { embed, buttons } = getReviewEmbed(
    updatedState.current,
    updatedTrackers[updatedState.current],
    updatedTrackers.length,
  );
  return await interaction.editReply({
    content: `❌ Tracker removed. Showing tracker ${
      updatedState.current + 1
    } of ${updatedTrackers.length}...`,
    embeds: [embed],
    components: [buttons],
  });
}

async function handleTrackerValid(interaction) {
  await interaction.deferUpdate();
  const state = await enrollmentTracker.get(interaction.user.id);

  if (!state || !state.trackers || state.trackers.length === 0) {
    return await interaction.editReply({
      content:
        "❌ Your enrollment session expired or timed out. Click below to re-enter your tracker links and continue.",
      components: [getRestartButton()],
      embeds: [],
    });
  }

  // Ensure current index is valid
  if (state.current >= state.trackers.length) {
    state.current = state.trackers.length - 1;
  }

  const currentTracker = state.trackers[state.current];

  // Add to reviewed list if not already there
  if (!state.reviewed.includes(currentTracker)) {
    state.reviewed.push(currentTracker);
  }

  // Move to next tracker
  state.current++;

  await enrollmentTracker.set(interaction.user.id, state);

  if (state.current >= state.trackers.length) {
    // All trackers reviewed - show summary
    const { embed, buttons } = createTrackerSummary(state.trackers);
    return await interaction.editReply({
      content:
        "✅ All trackers reviewed! Please verify your trackers below or add more if needed.",
      embeds: [embed],
      components: [buttons],
    });
  } else {
    // Show next tracker
    const { embed, buttons } = getReviewEmbed(
      state.current,
      state.trackers[state.current],
      state.trackers.length,
    );
    return await interaction.editReply({
      content: "",
      embeds: [embed],
      components: [buttons],
    });
  }
}

// Modal handler functions
async function handleSocialModal(interaction) {
  await interaction.deferUpdate();

  try {
    const twitter = interaction.fields.getTextInputValue("twitter") || "N/A";
    const instagram =
      interaction.fields.getTextInputValue("instagram") || "N/A";

    const state = await enrollmentTracker.get(interaction.user.id);
    const finalTrackers = state?.reviewed || state?.trackers || [];

    if (finalTrackers.length === 0) {
      return await interaction.editReply({
        content:
          "❌ Your enrollment session expired or timed out. Click below to re-enter your tracker links and continue.",
        components: [getRestartButton()],
        embeds: [],
      });
    }

    const authClient = await auth.getClient();
    const admitValues = [
      ["", interaction.user.id, "", "", "", ...finalTrackers],
    ];
    const dbValues = [
      [interaction.user.id, twitter, instagram, ...finalTrackers],
    ];
    const playerID = String(interaction.user.id);

    // Append to Admissions sheet
    const appendAdmissions = sheets.spreadsheets.values.append({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Admissions!A1",
      valueInputOption: "RAW",
      resource: { values: admitValues },
    });

    // Read Database sheet to find player row
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
      await interaction.member.roles.add(ENROLLED_ROLE_ID);
      await interaction.member.roles.remove(NEW_PERSON_ROLE_ID);
      await interaction.member.roles.remove(PREVIOUS_ENROLLEE_ROLE_ID);
    } catch (roleError) {
      console.error("Error updating roles:", roleError);
    }

    //autoSalary(interaction.member.id).catch((err) => {
    //  console.error("autoSalary error:", err);
    //});

    return await interaction.editReply({
      content: `✅ Enrollment submitted successfully!\n**Twitter:** ${twitter}\n**Instagram:** ${instagram}\n\nYou have been assigned the enrolled role. Welcome to Nature League!`,
      components: [],
      embeds: [],
    });
  } catch (error) {
    console.error("Error during enrollment submission:", error);

    // Notify admin
    try {
      const adminUser = await interaction.client.users.fetch(DEV_USER_ID);
      await adminUser.send(
        `Error during enrollment for ${interaction.user.tag} (${interaction.user.id}):\n\`\`\`${error.message}\`\`\`\n${error.stack}`,
      );
    } catch (dmError) {
      console.error("Could not DM admin:", dmError);
    }

    return await interaction.editReply({
      content:
        "❌ There was an error processing your enrollment. An admin has been notified. Please try again or contact an admin directly.",
      components: [],
      embeds: [],
    });
  }
}

async function handleAddTrackerModal(interaction) {
  await interaction.deferUpdate();

  try {
    const input = interaction.fields.getTextInputValue("tracker_links");

    const newLinks = input
      .split(/[\n,]+/)
      .map((link) => link.trim())
      .filter(
        (link) =>
          link.startsWith("http") && link.includes("rocketleague.tracker"),
      );

    if (newLinks.length === 0) {
      return await interaction.editReply({
        content:
          "❌ No valid tracker links detected. Please make sure they:\n• Start with 'http' or 'https'\n• Contain 'rocketleague.tracker'\n• Are separated by commas or new lines",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("add_tracker")
              .setLabel("Try Again")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
        embeds: [],
      });
    }

    let state = await enrollmentTracker.get(interaction.user.id);

    // If no state exists, create one
    if (!state) {
      state = {
        trackers: [...newLinks],
        current: 0,
        reviewed: [],
      };
    } else {
      // Filter out duplicates
      const existingTrackers = state.trackers || [];
      const uniqueNewLinks = newLinks.filter(
        (link) => !existingTrackers.includes(link),
      );

      if (uniqueNewLinks.length === 0) {
        return await interaction.editReply({
          content:
            "⚠️ All the trackers you entered are already in your list. Please add different trackers.",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("add_tracker")
                .setLabel("Try Again")
                .setStyle(ButtonStyle.Primary),
            ),
          ],
          embeds: [],
        });
      }

      // Add unique new trackers to the list
      state.trackers = [...existingTrackers, ...uniqueNewLinks];

      // If we were in review mode and at the end, reset to show new trackers
      if (state.current >= existingTrackers.length) {
        state.current = existingTrackers.length; // Start reviewing new trackers
      }
    }

    await enrollmentTracker.set(interaction.user.id, state);

    // Show current tracker
    const currentIndex = Math.min(state.current, state.trackers.length - 1);
    const { embed, buttons } = getReviewEmbed(
      currentIndex,
      state.trackers[currentIndex],
      state.trackers.length,
    );

    return await interaction.editReply({
      content: `✅ Added ${newLinks.length} new tracker(s). ${
        state.current < state.trackers.length - newLinks.length
          ? "Continuing"
          : "Starting"
      } review...`,
      embeds: [embed],
      components: [buttons],
    });
  } catch (error) {
    console.error("Error in handleAddTrackerModal:", error);

    return await interaction.editReply({
      content: "❌ An error occurred while adding trackers. Please try again.",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("add_tracker")
            .setLabel("Try Again")
            .setStyle(ButtonStyle.Primary),
        ),
      ],
      embeds: [],
    });
  }
}
