// const {
//   Events,
//   SlashCommandBuilder,
//   ActionRowBuilder,
//   ButtonBuilder,
//   ButtonStyle,
//   EmbedBuilder,
//   PermissionsBitField,
//   MessageFlags,
// } = require("discord.js");
// const dotenv = require("dotenv");
// const schedule = require("node-schedule");
// const moment = require("moment-timezone");
// dotenv.config();
// const { google } = require("googleapis");

// const SHEET_ID = "1SXuikO1grj7SJ-TK7GYgpgO1lbR9P80jQ2dYPn5Y6jk"; // Replace with your Google Sheet ID
// const CREDENTIALS = process.env.credentials; // Path to your credentials JSON file

// const auth = new google.auth.GoogleAuth({
//   keyFile: CREDENTIALS,
//   scopes: ["https://www.googleapis.com/auth/spreadsheets"],
// });

// const MMR_THRESHOLDS = {
//   apex: 2500,
//   high: 1609,
//   uppermiddle: 1447,
//   lowermiddle: 1214,
//   low: 0,
// };

// // Constants for channels, emojis, and roles
// const COMBINE_ANNOUNCEMENT_CHANNEL_ID = "1337889036865507499"; // Replace with actual channel ID
// const QUEUES_POP_CHANNEL_ID = "1337890102126317791"; // Replace with actual channel ID
// const SCORE_REPORT_CHANNEL_ID = "1337890143083696289"; // Replace with actual channel ID
// const REPLAY_SUBMIT_CHANNEL_ID = "1337895679921491979"; // Replace with actual channel ID
// const VOICE_CHANNEL_CATEGORY_ID = "1337888841716990093"; // Replace with actual category ID
// const PC_EMOJI = "🖥️";
// const CONSOLE_EMOJI = "🎮";
// const PCRoleID = "1337941942302146600";
// const ConsoleRoleID = "1337941970068312079";
// const zookeeperID = "1181050438926209076";
// const handlerID = "1181050438926209074";
// const CombinesNeededID = "1342624166024712363";
// const QUEUE_CHANNEL_IDS = {
//   apex: "1337889392424910899", // Replace with actual channel ID
//   high: "1337889519231434853", // Replace with actual channel ID
//   uppermiddle: "1337889665277235250", // Replace with actual channel ID
//   lowermiddle: "1337889804427460628", // Replace with actual channel ID
//   low: "1337889873113125026", // Replace with actual channel ID
// };

// // Queue system variables
// const queues = {
//   apex: [],
//   high: [],
//   uppermiddle: [],
//   lowermiddle: [],
//   low: [],
// };

// const matches = {}; // Store matches by match ID
// let queue_id = 1; // Global match ID counter
// const reportLocks = new Set(); // Prevent simultaneous reports
// const playersInMatches = new Set(); // Track players currently in matches

// // Function to generate lobby info
// function generateLobbyInfo(matchID) {
//   const password = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
//   return {
//     username: "NL" + matchID,
//     password: password.toString(),
//   };
// }

// // Function to reset queue channel permissions
// async function resetQueueChannelPermissions(client) {
//   try {
//     for (const queueChannelId of Object.values(QUEUE_CHANNEL_IDS)) {
//       const queueChannel = client.channels.cache.get(queueChannelId);
//       if (!queueChannel) {
//         console.error(`Queue channel ${queueChannelId} not found!`);
//         continue;
//       }

//       // Reset permissions for the queue channel
//       await queueChannel.permissionOverwrites.set([
//         {
//           id: queueChannel.guild.id, // @everyone
//           allow: [], // Permissions to allow
//           deny: [
//             PermissionsBitField.Flags.ViewChannel,
//             PermissionsBitField.Flags.SendMessages,
//           ], // Permissions to deny
//         },
//         {
//           id: zookeeperID, //zookeeper
//           allow: [PermissionsBitField.Flags.ViewChannel], // Permissions to allow
//           deny: [PermissionsBitField.Flags.SendMessages], // Permissions to deny
//         },
//         {
//           id: handlerID, //handler
//           allow: [PermissionsBitField.Flags.ViewChannel], // Permissions to allow
//           deny: [PermissionsBitField.Flags.SendMessages], // Permissions to deny
//         },
//       ]);
//       console.log(`Reset permissions for queue channel ${queueChannel.name}`);
//     }
//   } catch (error) {
//     console.error("Error resetting queue channel permissions:", error);
//   }
// }

// // Helper function to get MMR from the sheet
// async function getMMR(userId) {
//   try {
//     const authClient = await auth.getClient();
//     const sheets = google.sheets({ version: "v4", auth: authClient });

//     // Read the sheet data
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId: SHEET_ID,
//       range: "Sheet1!A:C", // Adjust the range to match your sheet
//     });

//     const rows = response.data.values;
//     if (!rows || rows.length === 0) {
//       console.error("No data found in the sheet.");
//       return -1; // Default MMR if no data is found
//     }

//     // Find the row with the matching Discord ID
//     const playerRow = rows.find((row) => row[0] === userId);
//     if (!playerRow) {
//       console.error(`Player with ID ${userId} not found in the sheet.`);
//       return -1; // Default MMR if player not found
//     }

//     // Use Combine MMR if available, otherwise use Default MMR
//     const defaultMMR = parseInt(playerRow[1], 10);
//     const combineMMR = playerRow[2] ? parseInt(playerRow[2], 10) : null;

//     return combineMMR || defaultMMR;
//   } catch (error) {
//     console.error("Error fetching MMR from Google Sheets:", error);
//     return -1; // Default MMR if an error occurs
//   }
// }

// // Helper function to update MMR in the sheet
// async function updateMMR(userId, change) {
//   try {
//     const authClient = await auth.getClient();
//     const sheets = google.sheets({ version: "v4", auth: authClient });

//     // Read the sheet data
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId: SHEET_ID,
//       range: "Sheet1!A:C", // Adjust the range to match your sheet
//     });

//     const rows = response.data.values;
//     if (!rows || rows.length === 0) {
//       console.error("No data found in the sheet.");
//       return;
//     }

//     // Find the row with the matching Discord ID
//     const playerRowIndex = rows.findIndex((row) => row[0] === userId);
//     if (playerRowIndex === -1) {
//       console.error(`Player with ID ${userId} not found in the sheet.`);
//       return;
//     }

//     const playerRow = rows[playerRowIndex];

//     // Update the Combine MMR
//     const defaultMMR = parseInt(playerRow[1], 10);
//     const currentCombineMMR = playerRow[2]
//       ? parseInt(playerRow[2], 10)
//       : defaultMMR;
//     const newCombineMMR = currentCombineMMR + change;

//     // Update the sheet
//     await sheets.spreadsheets.values.update({
//       spreadsheetId: SHEET_ID,
//       range: `Sheet1!C${playerRowIndex + 1}`, // Update the Combine MMR column
//       valueInputOption: "RAW",
//       resource: {
//         values: [[newCombineMMR]],
//       },
//     });

//     console.log(`Updated MMR for ${userId} to ${newCombineMMR}`);
//   } catch (error) {
//     console.error("Error updating MMR in Google Sheets:", error);
//   }
// }

// // Helper function to increment the Combine Played Count (D column)
// async function incrementCombinePlayedCount(userId) {
//   try {
//     const authClient = await auth.getClient();
//     const sheets = google.sheets({ version: "v4", auth: authClient });

//     // Read the sheet data
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId: SHEET_ID,
//       range: "Sheet1!A:D", // Adjust the range to include the D column
//     });

//     const rows = response.data.values;
//     if (!rows || rows.length === 0) {
//       console.error("No data found in the sheet.");
//       return;
//     }

//     // Find the row with the matching Discord ID
//     const playerRowIndex = rows.findIndex((row) => row[0] === userId);
//     if (playerRowIndex === -1) {
//       console.error(`Player with ID ${userId} not found in the sheet.`);
//       return;
//     }

//     const playerRow = rows[playerRowIndex];

//     // Get the current Combine Played Count (D column)
//     const currentCombinePlayedCount = playerRow[3]
//       ? parseInt(playerRow[3], 10)
//       : 0; // Default to 0 if the column is empty

//     // Increment the Combine Played Count
//     const newCombinePlayedCount = currentCombinePlayedCount + 1;

//     // Update the sheet
//     await sheets.spreadsheets.values.update({
//       spreadsheetId: SHEET_ID,
//       range: `Sheet1!D${playerRowIndex + 1}`, // Update the D column
//       valueInputOption: "RAW",
//       resource: {
//         values: [[newCombinePlayedCount]],
//       },
//     });

//     console.log(
//       `Updated Combine Played Count for ${userId} to ${newCombinePlayedCount}`
//     );
//   } catch (error) {
//     console.error(
//       "Error updating Combine Played Count in Google Sheets:",
//       error
//     );
//   }
// }

// module.exports = {
//   name: Events.ClientReady,
//   once: true,
//   async execute(client) {
//     console.log(`Logged in as ${client.user.tag}`);

//     const now = moment().tz("America/New_York");

//     // Schedule 7 PM EST job
//     let next7PM = moment().tz("America/New_York").hour(19).minute(0).second(0);

//     let next1AM = moment(next7PM).add(6, "hours");
//     let next8pm = moment(next7PM).add(1, "hours");

//     const combineAnnouncementTime = next7PM.toDate();

//     const combineAnnouncementJob = schedule.scheduleJob(
//       combineAnnouncementTime,
//       async () => {
//         console.log("Cron job triggered at:", new Date().toLocaleString());

//         try {
//           // Fetch the channel dynamically
//           const channel = await client.channels.fetch(
//             COMBINE_ANNOUNCEMENT_CHANNEL_ID
//           );
//           if (channel) {
//             console.log("Channel found:", channel.name);

//             // Create a success button for joining the queue
//             const pcButton = new ActionRowBuilder().addComponents(
//               new ButtonBuilder()
//                 .setCustomId("pc")
//                 .setLabel("PC Player")
//                 .setStyle(ButtonStyle.Success)
//             );

//             // Create a success button for joining the queue
//             const consoleButton = new ActionRowBuilder().addComponents(
//               new ButtonBuilder()
//                 .setCustomId("console")
//                 .setLabel("Console Player")
//                 .setStyle(ButtonStyle.Success)
//             );

//             // Send the message
//             const msg = await channel.send({
//               content: `@everyone To signup for combines, click the button below based on your platform.`,
//               components: [pcButton, consoleButton],
//             });

//             if (!msg) {
//               console.error("Failed to send message.");
//               return;
//             }

//             console.log("Message sent successfully:", msg.id);

//             // Listen for button interactions
//           } else {
//             console.error(
//               "Channel not found or client is not properly initialized"
//             );
//           }
//         } catch (error) {
//           console.error("Error sending message or setting up buttons:", error);
//         }
//       }
//     );

//     // Schedule the 8 PM EST job to send queue buttons
//     const queueButtonsTime = next8pm.toDate();

//     const queueButtonsJob = schedule.scheduleJob(queueButtonsTime, async () => {
//       console.log("Sending queue buttons at 8 PM EST...");

//       try {
//         for (const [queueName, queueChannelId] of Object.entries(
//           QUEUE_CHANNEL_IDS
//         )) {
//           const queueChannel = client.channels.cache.get(queueChannelId);
//           if (!queueChannel) {
//             console.error(`Queue channel ${queueChannelId} not found!`);
//             continue;
//           }

//           // Create a success button for joining the queue
//           const joinQueueButton = new ActionRowBuilder().addComponents(
//             new ButtonBuilder()
//               .setCustomId(`join_${queueName}`)
//               .setLabel(
//                 `Join ${
//                   queueName.charAt(0).toUpperCase() + queueName.slice(1)
//                 } Queue`
//               )
//               .setStyle(ButtonStyle.Success)
//           );

//           // Create a danger button for leaving the queue
//           const leaveQueueButton = new ActionRowBuilder().addComponents(
//             new ButtonBuilder()
//               .setCustomId(`leave_${queueName}`)
//               .setLabel(
//                 `Leave ${
//                   queueName.charAt(0).toUpperCase() + queueName.slice(1)
//                 } Queue`
//               )
//               .setStyle(ButtonStyle.Danger)
//           );

//           // Send the buttons to the queue channel
//           try {
//             await queueChannel.send({
//               content: `Click the buttons below to join or leave the **${
//                 queueName.charAt(0).toUpperCase() + queueName.slice(1)
//               } Queue**!`,
//               components: [joinQueueButton, leaveQueueButton],
//             });
//             console.log(`Queue buttons sent to channel ${queueChannel.name}`);
//           } catch (error) {
//             console.error(
//               `Failed to send queue buttons to channel ${queueChannel.name}:`,
//               error
//             );
//           }
//         }
//       } catch (error) {
//         console.error("Error sending queue buttons:", error);
//       }
//     });

//     // Schedule a job to reset queue channel permissions at 1 AM EST
//     const resetTime = next1AM.toDate();
//     const resetPermissionsJob = schedule.scheduleJob(resetTime, async () => {
//       console.log("Resetting queue channel permissions at 1 AM EST...");
//       await resetQueueChannelPermissions(client);
//     });

//     client.on("interactionCreate", async (interaction) => {
//       // Ensure the interaction is a button click and has one of the allowed customIds
//       if (
//         !interaction.isButton() ||
//         !["pc", "console"].includes(interaction.customId)
//       ) {
//         return; // Ignore interactions that are not the buttons we care about
//       }

//       try {
//         const { customId, user, member } = interaction;

//         console.log(`Button clicked: ${customId} by ${user.tag}`);
//         await interaction.deferReply({ flags: MessageFlags.Ephemeral });
//         const playerMMR = await getMMR(member.id);
//         console.log(`Fetched MMR for ${user.tag}: ${playerMMR}`);

//         const CONSOLE_ROLE = await interaction.guild.roles.fetch(ConsoleRoleID);
//         const PC_ROLE = await interaction.guild.roles.fetch(PCRoleID);

//         // Assign PC or Console role based on button clicked
//         if (customId === "pc") {
//           await member.roles.add(PC_ROLE);
//           console.log(`Assigned PC role to ${user.tag}`);
//         } else if (customId === "console") {
//           await member.roles.add(CONSOLE_ROLE);
//           console.log(`Assigned Console role to ${user.tag}`);
//         }

//         // Assign queue channel permissions based on MMR
//         let queueChannelId;
//         if (playerMMR >= MMR_THRESHOLDS.apex) {
//           queueChannelId = QUEUE_CHANNEL_IDS.apex;
//         } else if (
//           playerMMR >= MMR_THRESHOLDS.high &&
//           playerMMR < MMR_THRESHOLDS.apex
//         ) {
//           queueChannelId = QUEUE_CHANNEL_IDS.high;
//         } else if (
//           playerMMR >= MMR_THRESHOLDS.uppermiddle &&
//           playerMMR < MMR_THRESHOLDS.high
//         ) {
//           queueChannelId = QUEUE_CHANNEL_IDS.uppermiddle;
//         } else if (
//           playerMMR >= MMR_THRESHOLDS.lowermiddle &&
//           playerMMR < MMR_THRESHOLDS.uppermiddle
//         ) {
//           queueChannelId = QUEUE_CHANNEL_IDS.lowermiddle;
//         } else if (
//           playerMMR >= MMR_THRESHOLDS.low &&
//           playerMMR < MMR_THRESHOLDS.lowermiddle
//         ) {
//           queueChannelId = QUEUE_CHANNEL_IDS.low;
//         }

//         if (queueChannelId) {
//           const queueChannel = client.channels.cache.get(queueChannelId);
//           if (queueChannel) {
//             await queueChannel.permissionOverwrites.create(
//               interaction.user.id,
//               {
//                 ViewChannel: true,
//                 SendMessages: false,
//               }
//             );
//             console.log(
//               `Assigned queue channel permissions to ${interaction.user.tag} in channel ${queueChannel.name}`
//             );
//           } else {
//             console.error(`Queue channel with ID ${queueChannelId} not found.`);
//           }
//         } else {
//           console.error("No queue channel ID found for the player's MMR.");
//         }

//         // Acknowledge the interaction
//         await interaction.editReply({
//           content: `You have successfully signed up as a ${customId} player!`,
//           ephemeral: true,
//         });
//       } catch (error) {
//         console.error(`Error processing button click from`, error);
//         await interaction.editReply({
//           content: "An error occurred while processing your request.",
//           ephemeral: true,
//         });
//       }
//     });

//     // Handle queue button interactions
//     client.on("interactionCreate", async (interaction) => {
//       try {
//         if (!interaction.isButton()) return;

//         // Handle joining the queue
//         if (interaction.customId.startsWith("join_")) {
//           const queueName = interaction.customId.replace("join_", ""); // e.g., apex, high, etc.
//           if (!queues[queueName]) return; // Ignore unknown buttons
//           await interaction.deferReply({ flags: MessageFlags.Ephemeral });
//           const member = interaction.member;

//           // Check if the user is already in a match
//           if (playersInMatches.has(member.id)) {
//             await interaction.editReply({
//               content:
//                 "You are currently in a match and cannot join another queue until it is reported.",
//               ephemeral: true,
//             });
//             return;
//           }

//           // Check if the user is already in the queue
//           const isInQueue = queues[queueName].some(
//             (player) => player.id === member.id
//           );
//           if (isInQueue) {
//             await interaction.editReply({
//               content: `You are already in the ${queueName} queue! There are currently ${queues[queueName].length} players in the queue.`,
//               ephemeral: true,
//             });
//             return;
//           }

//           // Fetch the player's MMR
//           const playerMMR = await getMMR(member.id);

//           // Add player to the specific queue with their MMR
//           queues[queueName].push({ id: member.id, mmr: playerMMR });

//           // Acknowledge the interaction immediately
//           await interaction.editReply({
//             content: `You have joined the ${queueName} queue! There are currently ${queues[queueName].length} players in the queue.`,
//             ephemeral: true,
//           });

//           // Check if the queue has reached 6 players
//           if (queues[queueName].length === 6) {
//             // Sort players by MMR
//             queues[queueName].sort((a, b) => b.mmr - a.mmr);

//             // Create teams
//             const teamBlue = [
//               queues[queueName][0],
//               queues[queueName][2],
//               queues[queueName][5],
//             ];
//             const teamOrange = [
//               queues[queueName][1],
//               queues[queueName][3],
//               queues[queueName][4],
//             ];

//             const matchID = String(queue_id++).padStart(3, "0"); // Generate match ID

//             // Store the match details
//             matches[matchID] = {
//               teamBlue,
//               teamOrange,
//               reported: false,
//               verified: false,
//               queueName, // Track which queue this match belongs to
//             };

//             // Add players to the playersInMatches set
//             for (const player of [...teamBlue, ...teamOrange]) {
//               playersInMatches.add(player.id);
//             }

//             queues[queueName] = []; // Reset the specific queue

//             // Select lobby creator and replay getter (both must be PC players)
//             const pcPlayers = await Promise.all(
//               [...teamBlue, ...teamOrange].map(async (player) => {
//                 const member = await interaction.guild.members.fetch(player.id);
//                 return { ...player, member }; // Add the full member object to the player
//               })
//             ).then(
//               (players) =>
//                 players.filter((player) =>
//                   player.member.roles.cache.has(PCRoleID)
//                 ) // Check if the player has the PC role
//             );

//             // Ensure there are at least 2 PC players for lobby creator and replay getter
//             let lobbyCreator, replayGetter;
//             if (pcPlayers.length >= 2) {
//               lobbyCreator =
//                 pcPlayers[Math.floor(Math.random() * pcPlayers.length)];
//               replayGetter = pcPlayers.find(
//                 (player) => player.id !== lobbyCreator.id
//               );
//             } else {
//               // If not enough PC players, assign roles to any players
//               const allPlayers = [...teamBlue, ...teamOrange];
//               lobbyCreator =
//                 allPlayers[Math.floor(Math.random() * allPlayers.length)];
//               replayGetter = allPlayers.find(
//                 (player) => player.id !== lobbyCreator.id
//               );
//             }

//             // Store the replay getter in the match object
//             matches[matchID].replayGetter = replayGetter;

//             // Generate lobby info
//             const lobbyInfo = generateLobbyInfo(matchID);

//             // Create voice channels for each team in the specified category
//             const guild = interaction.guild;
//             const blueChannel = await guild.channels.create({
//               name: `Match ${matchID} Blue`,
//               type: 2, // Voice channel type
//               userLimit: 3,
//               parent: VOICE_CHANNEL_CATEGORY_ID, // Place in the specified category
//             });
//             const orangeChannel = await guild.channels.create({
//               name: `Match ${matchID} Orange`,
//               type: 2, // Voice channel type
//               userLimit: 3,
//               parent: VOICE_CHANNEL_CATEGORY_ID, // Place in the specified category
//             });

//             // Store the voice channel IDs in the match object
//             matches[matchID].voiceChannels = {
//               blue: blueChannel.id,
//               orange: orangeChannel.id,
//             };

//             // Assign team members to their respective voice channels
//             for (const player of teamBlue) {
//               const member = await guild.members.fetch(player.id);
//               await blueChannel.permissionOverwrites.create(member.id, {
//                 Connect: true,
//                 ViewChannel: true,
//               });
//             }
//             for (const player of teamOrange) {
//               const member = await guild.members.fetch(player.id);
//               await orangeChannel.permissionOverwrites.create(member.id, {
//                 Connect: true,
//                 ViewChannel: true,
//               });
//             }

//             // Create embed for queue popped message
//             const embed = new EmbedBuilder()
//               .setTitle(`__**Queue #${matchID}**__ has popped in ${queueName}!`)
//               .addFields(
//                 {
//                   name: "__**Team Blue**__",
//                   value: `${teamBlue
//                     .map(
//                       (p) =>
//                         `<@${p.id}>${
//                           p.id === lobbyCreator.id
//                             ? " *(Makes Lobby)*"
//                             : p.id === replayGetter.id
//                             ? " *(Saves Replays)*"
//                             : ""
//                         }`
//                     )
//                     .join("\n")}`,
//                 },
//                 {
//                   name: "__**Team Orange**__",
//                   value: `${teamOrange
//                     .map(
//                       (p) =>
//                         `<@${p.id}>${
//                           p.id === lobbyCreator.id
//                             ? " *(Makes Lobby)*"
//                             : p.id === replayGetter.id
//                             ? " *(Saves Replays)*"
//                             : ""
//                         }`
//                     )
//                     .join("\n")}`,
//                 },
//                 {
//                   name: "__**Lobby Info**__",
//                   value: `Username: **${lobbyInfo.username}**\nPassword: **${lobbyInfo.password}**`,
//                 }
//               )
//               .setColor("#004C54");

//             // Send queue pop message in the queues pop channel
//             const queuesPopChannel = client.channels.cache.get(
//               QUEUES_POP_CHANNEL_ID
//             );
//             if (queuesPopChannel) {
//               await queuesPopChannel.send({
//                 content: `${teamBlue
//                   .map((p) => `<@${p.id}>`)
//                   .join(" ")} ${teamOrange.map((p) => `<@${p.id}>`).join(" ")}`,
//                 embeds: [embed],
//               });
//             }
//           }
//         }

//         // Handle leaving the queue
//         if (interaction.customId.startsWith("leave_")) {
//           const queueName = interaction.customId.replace("leave_", ""); // e.g., apex, high, etc.
//           if (!queues[queueName]) return; // Ignore unknown buttons

//           const member = interaction.member;

//           // Remove the player from the queue
//           queues[queueName] = queues[queueName].filter(
//             (player) => player.id !== member.id
//           );

//           // Acknowledge the interaction
//           await interaction.reply({
//             content: `You have left the ${queueName} queue!`,
//             ephemeral: true,
//           });
//         }
//       } catch (error) {
//         console.error("Error handling queue button interaction:", error);
//         await interaction.reply({
//           content:
//             "An error occurred while processing your request. Please try again.",
//           ephemeral: true,
//         });
//       }
//     });

//     // Handle /report command
//     client.on("interactionCreate", async (interaction) => {
//       try {
//         if (!interaction.isCommand() || interaction.commandName !== "report")
//           return;

//         const matchID = interaction.options.getString("match_id");
//         const score = interaction.options.getString("score");
//         const reporter = interaction.member;

//         // Check if the match exists
//         if (!matches[matchID]) {
//           await interaction.reply({
//             content: "Invalid match ID.",
//             ephemeral: true,
//           });
//           return;
//         }

//         // Check if the reporter was in the match
//         const match = matches[matchID];
//         const isInMatch = [...match.teamBlue, ...match.teamOrange].some(
//           (player) => player.id === reporter.id
//         );
//         if (!isInMatch) {
//           await interaction.reply({
//             content: "You were not in this match.",
//             ephemeral: true,
//           });
//           return;
//         }

//         // Prevent double reports or simultaneous reports
//         if (reportLocks.has(matchID)) {
//           await interaction.reply({
//             content: "This match is already being reported. Please wait.",
//             ephemeral: true,
//           });
//           return;
//         }

//         // Lock the match to prevent simultaneous reports
//         reportLocks.add(matchID);

//         // Handle cancel option
//         if (score === "cancel") {
//           delete matches[matchID]; // Remove the match
//           reportLocks.delete(matchID); // Unlock the match

//           // Remove players from the playersInMatches set
//           for (const player of [...match.teamBlue, ...match.teamOrange]) {
//             playersInMatches.delete(player.id);
//           }

//           const guild = interaction.guild;
//           if (match.voiceChannels) {
//             const blueChannel = guild.channels.cache.get(
//               match.voiceChannels.blue
//             );
//             const orangeChannel = guild.channels.cache.get(
//               match.voiceChannels.orange
//             );

//             if (blueChannel) await blueChannel.delete().catch(console.error);
//             if (orangeChannel)
//               await orangeChannel.delete().catch(console.error);
//           }

//           await interaction.reply({
//             content: `Match #${matchID} has been canceled.`,
//             ephemeral: false,
//           });
//           return;
//         }

//         // Check if the match has already been reported
//         if (match.reported) {
//           reportLocks.delete(matchID); // Unlock the match
//           await interaction.reply({
//             content: "This match has already been reported.",
//             ephemeral: true,
//           });
//           return;
//         }

//         // Mark the match as reported
//         match.reported = true;
//         match.score = score;
//         match.reporter = reporter.id;

//         // Ping 2 players from the opposing team for verification
//         const opposingTeam = match.teamBlue.some(
//           (player) => player.id === reporter.id
//         )
//           ? match.teamOrange
//           : match.teamBlue;
//         const verificationPings = opposingTeam
//           .slice(0, 2)
//           .map((player) => `<@${player.id}>`)
//           .join(" ");

//         // Create a verification button
//         const verifyButton = new ActionRowBuilder().addComponents(
//           new ButtonBuilder()
//             .setCustomId(`verify_${matchID}`)
//             .setLabel("Verify Score")
//             .setStyle(ButtonStyle.Success)
//         );

//         const verifyMessage = await interaction.reply({
//           content: `${verificationPings}, please verify the reported score of ${score} for match #${matchID}.`,
//           components: [verifyButton],
//           ephemeral: false,
//         });

//         // Handle verification button
//         const filter = (i) => {
//           // Ensure the customId matches
//           if (i.customId !== `verify_${matchID}`) return false;

//           // Ensure the user clicking the button is on the opposing team
//           const isOpposingTeamMember = opposingTeam.some(
//             (player) => player.id === i.user.id
//           );
//           if (!isOpposingTeamMember) {
//             // If the user is not on the opposing team, reply with an error
//             i.reply({
//               content:
//                 "Only members of the opposing team can verify the score.",
//               ephemeral: true,
//             });
//             return false;
//           }

//           // If all checks pass, allow the interaction
//           return true;
//         };

//         const collector = verifyMessage.createMessageComponentCollector({
//           filter,
//           time: 60000, // 60 seconds
//         });

//         collector.on("collect", async (i) => {
//           try {
//             match.verified = true;
//             await i.update({
//               content: "Score verified! Updating MMRs...",
//               components: [],
//             });
//           } catch (error) {
//             console.error("Error updating verification message:", error);
//           }
//         });

//         collector.on("end", (collected) => {
//           if (collected.size === 0) {
//             verifyMessage.edit({
//               content: "Verification timed out.",
//               components: [],
//             });
//           }
//         });

//         collector.on("error", (error) => {
//           console.error("Error in verification collector:", error);
//         });

//         // Calculate MMR changes
//         const mmrChange = score === "3-0" ? 12 : 7;
//         const winningTeam = match.teamBlue.some(
//           (player) => player.id === reporter.id
//         )
//           ? match.teamBlue
//           : match.teamOrange;
//         const losingTeam =
//           winningTeam === match.teamBlue ? match.teamOrange : match.teamBlue;

//         // Update MMRs
//         for (const player of winningTeam) {
//           await updateMMR(player.id, mmrChange);
//         }
//         for (const player of losingTeam) {
//           await updateMMR(player.id, -mmrChange);
//         }

//         // Increment Combine Played Count for all players
//         for (const player of [...match.teamBlue, ...match.teamOrange]) {
//           await incrementCombinePlayedCount(player.id);
//         } // Increment Combine Played Count for all players

//         // Post match results in the score report channel
//         const scoreReportChannel = client.channels.cache.get(
//           SCORE_REPORT_CHANNEL_ID
//         );
//         if (scoreReportChannel) {
//           const embed = new EmbedBuilder()
//             .setTitle(`__**Match #${matchID} Results**__`)
//             .addFields(
//               {
//                 name: "__**Winning Team**__",
//                 value: `${winningTeam.map((p) => `<@${p.id}>`).join(", ")}`,
//               },
//               {
//                 name: "__**Losing Team**__",
//                 value: `${losingTeam.map((p) => `<@${p.id}>`).join(", ")}`,
//               },
//               {
//                 name: "__**Series Score**__",
//                 value: `*${score}*`,
//               }
//             )
//             .setColor("#004C54");

//           await scoreReportChannel.send({ embeds: [embed] });

//           // Ping the replay reporter to submit replays
//           const replaySubmitChannel = client.channels.cache.get(
//             REPLAY_SUBMIT_CHANNEL_ID
//           );
//           if (replaySubmitChannel && match.replayGetter) {
//             await replaySubmitChannel.send(
//               `<@${match.replayGetter.id}>, please submit the replays for match #${matchID} in this channel.`
//             );
//           }
//         }

//         // Delete the voice channels
//         const guild = interaction.guild;
//         if (match.voiceChannels) {
//           const blueChannel = guild.channels.cache.get(
//             match.voiceChannels.blue
//           );
//           const orangeChannel = guild.channels.cache.get(
//             match.voiceChannels.orange
//           );

//           if (blueChannel) await blueChannel.delete().catch(console.error);
//           if (orangeChannel) await orangeChannel.delete().catch(console.error);
//         }

//         // Remove players from the playersInMatches set
//         for (const player of [...match.teamBlue, ...match.teamOrange]) {
//           playersInMatches.delete(player.id);
//         }

//         // Send confirmation
//         console.log(`MMRs updated for match #${matchID}.`);

//         // Unlock the match
//         reportLocks.delete(matchID);
//       } catch (error) {
//         console.error("Error handling /report command:", error);
//         await interaction.editReply({
//           content:
//             "An error occurred while processing your request. Please try again.",
//           ephemeral: true,
//         });
//       }
//     });
//   },
// };
