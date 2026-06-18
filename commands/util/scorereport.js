const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const teams = require("../../data/teams.json");

const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const schedule = require("../../data/schedule.json");

const { google } = require("googleapis");

const SHEET_ID = "1jtF0CZRliwxl2r8MdNz-CfJ6-Wbm3AESGAeN7kpdzXA";
const CREDENTIALS = process.env.credentials;

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const tierColors = {
  Apex: 0x6500af,
  Alpha: 0xdc143c,
  Beta: 0x00bd00,
  Delta: 0x4682b4,
  Omega: 0xffd700,
};

// Create an array of team names for choices
const teamChoices = Object.keys(teams).map((name) => ({
  name: name,
  value: name,
}));

// Create a roleId to team name mapping for quick lookup
const roleIdToTeam = {};
for (const [teamName, teamData] of Object.entries(teams)) {
  roleIdToTeam[teamData.roleId] = teamName;
}

// League tiers
const tiers = ["Apex", "Alpha", "Beta", "Delta", "Omega"];
const tierChoices = tiers.map((tier) => ({
  name: tier,
  value: tier,
}));

// Helper function to sleep for a specified time
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to get headers for ballchasing API
function getHeaders() {
  return {
    Authorization: `${process.env.BALLCHASING_TOKEN}`,
  };
}

function formatGameday(gamedayNumber) {
  // Handle "Playoffs" case
  if (gamedayNumber === "Playoffs") {
    return "Playoffs";
  }

  // Convert to number and pad with leading zero
  const num = parseInt(gamedayNumber);
  const paddedNum = num.toString().padStart(2, "0");
  return `Game Day ${paddedNum}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scorereport")
    .setDescription("Score Report a Match")
    .addStringOption((option) =>
      option
        .setName("ballchasing-link")
        .setDescription("The match ballchasing group")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("The tier of the match")
        .setRequired(true)
        .addChoices(...tierChoices),
    )
    .addStringOption((option) =>
      option
        .setName("team1")
        .setDescription("Team 1 of the match")
        .setRequired(true)
        .addChoices(...teamChoices),
    )
    .addStringOption((option) =>
      option
        .setName("team2")
        .setDescription("Team 2 of the match")
        .setRequired(true)
        .addChoices(...teamChoices),
    )
    .addStringOption((option) =>
      option
        .setName("gameday")
        .setDescription("Gameday Number of the match")
        .setRequired(true)
        .addChoices(
          { name: "Gameday 1", value: "1" },
          { name: "Gameday 2", value: "2" },
          { name: "Gameday 3", value: "3" },
          { name: "Gameday 4", value: "4" },
          { name: "Gameday 5", value: "5" },
          { name: "Gameday 6", value: "6" },
          { name: "Gameday 7", value: "7" },
          { name: "Gameday 8", value: "8" },
          { name: "Gameday 9", value: "9" },
          { name: "Gameday 10", value: "10" },
          { name: "Gameday 11", value: "11" },
          { name: "Gameday 12", value: "12" },
          { name: "Gameday 13", value: "13" },
          { name: "Gameday 14", value: "14" },
          { name: "Gameday 15", value: "15" },
          { name: "Gameday 16", value: "16" },
          { name: "Gameday 17", value: "17" },
          { name: "Gameday 18", value: "18" },
          { name: "Playoffs", value: "Playoffs" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("g1")
        .setDescription("Game 1 score. Please do score as team1-team2 ex: 1-5")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("g2")
        .setDescription("Game 2 score. Please do score as team1-team2 ex: 1-5")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("g3")
        .setDescription("Game 3 score. Please do score as team1-team2 ex: 1-5")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("g4")
        .setDescription("Game 4 score. Please do score as team1-team2 ex: 1-5"),
    )
    .addStringOption((option) =>
      option
        .setName("g5")
        .setDescription("Game 5 score. Please do score as team1-team2 ex: 1-5"),
    )
    .addStringOption((option) =>
      option
        .setName("g6")
        .setDescription("Game 6 score. Please do score as team1-team2 ex: 1-5"),
    )
    .addStringOption((option) =>
      option
        .setName("g7")
        .setDescription("Game 7 score. Please do score as team1-team2 ex: 1-5"),
    ),
  async execute(interaction) {
    try {
      await interaction.reply({
        content: "Processing score report...",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error sending initial reply:", error);
      return;
    }

    // Channel IDs - replace these with your actual channel IDs
    const statsChannelID = "1277371046961352920";
    const apexReportID = "1181050441669279753";
    const alphaReportID = "1181050441845457028";
    const betaReportID = "1181050441845457029";
    const deltaReportID = "1183463506507468811";
    const omegaReportID = "1183463475687723008";

    try {
      const statsChannel =
        await interaction.guild.channels.fetch(statsChannelID);
      const apexReport = await interaction.guild.channels.fetch(apexReportID);
      const alphaReport = await interaction.guild.channels.fetch(alphaReportID);
      const betaReport = await interaction.guild.channels.fetch(betaReportID);
      const deltaReport = await interaction.guild.channels.fetch(deltaReportID);
      const omegaReport = await interaction.guild.channels.fetch(omegaReportID);

      if (
        !statsChannel ||
        !apexReport ||
        !alphaReport ||
        !betaReport ||
        !deltaReport ||
        !omegaReport
      ) {
        try {
          return await interaction.editReply({
            content: "Error: A channel was not found. :(",
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          console.error("Error sending channel not found reply:", error);
          return;
        }
      }

      // Get command options
      const ballchasing = interaction.options.getString("ballchasing-link");
      const team1 = interaction.options.getString("team1");
      const team2 = interaction.options.getString("team2");
      const tier = interaction.options.getString("tier");
      const gameday = interaction.options.getString("gameday");
      const game1 = interaction.options.getString("g1");
      const game2 = interaction.options.getString("g2");
      const game3 = interaction.options.getString("g3");
      const game4 = interaction.options.getString("g4");
      const game5 = interaction.options.getString("g5");
      const game6 = interaction.options.getString("g6");
      const game7 = interaction.options.getString("g7");

      // Validate the series result before doing any heavy work.
      // Every game must have a winner (no ties/handshakes), and the series
      // winner must reach the required number of game wins:
      //   - Regular season (best-of-5): at least 3 wins
      //   - Playoffs (best-of-7): at least 4 wins
      const validation = validateSeries(
        team1,
        team2,
        [game1, game2, game3, game4, game5, game6, game7],
        gameday,
      );

      if (!validation.valid) {
        try {
          return await interaction.editReply({
            content: `${validation.reason}`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          console.error("Error sending validation reply:", error);
          return;
        }
      }

      const winner = validation.winner;
      console.log(winner);
      // Check if the ballchasing link is valid
      const groupID = getIdFromBCLink(ballchasing);
      if (!groupID) {
        try {
          return await interaction.editReply({
            content:
              "Error: Invalid Ballchasing link. Please provide a valid Ballchasing group link.",
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          console.error("Error sending invalid link reply:", error);
          return;
        }
      }

      let winnerData = teams[winner];

      // Create embed with match info
      const matchEmbed = new EmbedBuilder()
        .setTitle(`${team1} vs ${team2} - ${tier} Tier`)
        .setDescription(`Gameday ${gameday}`)
        .setThumbnail(`https://i.imgur.com/wrdZCPe.png`)
        .addFields(
          { name: `${ballchasing}`, value: ` ` },
          {
            name: "Games",
            value: getGameResults(team1, team2, [
              game1,
              game2,
              game3,
              game4,
              game5,
              game6,
              game7,
            ]),
          },
        )
        .setColor(tierColors[tier] || 0x000000) // Also fix the color to use the team's color
        .setImage(winnerData.image) // Fix: add .image to access the image URL
        .setTimestamp()
        .setFooter({ text: `Reported by ${interaction.user.tag}` });
      // Fetch and add the stats
      const statsValues = await getStats(
        groupID,
        team1,
        team2,
        tier,
        gameday,
        interaction,
      );
      //-------------------------------------------------------------------------------------------------------------------------
      let foundMatch = null;

      // If playoffs, bypass gameday lookup
      if (gameday === "Playoffs") {
        foundMatch = true; //skip logic basically
      } else {
        outer: for (const week of schedule.weeks) {
          for (const gamedayData of week.gamedays) {
            if (gamedayData.gamedayNum.toString() !== gameday) continue;
            for (const match of gamedayData.matches) {
              if (
                match.teams.includes(team1) &&
                match.teams.includes(team2) &&
                match.tiers[tier]
              ) {
                foundMatch = match;
                break outer;
              }
            }
          }
        }
      }

      if (!foundMatch) {
        try {
          return await interaction.editReply({
            content:
              "Could not find a scheduled match for that gameday, teams, and tier.",
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          console.error("Error sending match not found reply:", error);
          return;
        }
      }

      let thread = null;

      if (gameday !== "Playoffs" && foundMatch !== true) {
        const tierData = foundMatch.tiers[tier];
        thread = await interaction.client.channels
          .fetch(tierData.threadID)
          .catch(() => null);
      }

      //-------------------------------------------------------------------------------------------------------------------------
      // Send the embeds to the appropriate channels
      // old embed await statsChannel.send({ embeds: [statsEmbed] });

      await sheets.spreadsheets.values.append({
        auth: auth,
        spreadsheetId: SHEET_ID,
        range: "Import Data (Per Series)!B:U",
        valueInputOption: "RAW",
        resource: {
          values: statsValues,
        },
      });

      // Determine which tier channel to send the report to
      let tierChannel;
      switch (tier) {
        case "Apex":
          tierChannel = apexReport;
          break;
        case "Alpha":
          tierChannel = alphaReport;
          break;
        case "Beta":
          tierChannel = betaReport;
          break;
        case "Delta":
          tierChannel = deltaReport;
          break;
        case "Omega":
          tierChannel = omegaReport;
          break;
      }

      if (tierChannel) {
        await tierChannel.send({ embeds: [matchEmbed] });
      }

      if (thread) {
        try {
          await thread.delete("Match reported and thread closed.");
          console.log(`Deleted thread: ${thread.name} (${thread.id})`);
        } catch (error) {
          console.error(`Failed to delete thread: ${thread?.id}`, error);
        }
      } else {
        console.warn("Tried to delete a thread, but none was found.");
      }

      try {
        return await interaction.editReply({
          content: "Score report has been posted successfully!",
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        console.error("Error sending success reply:", error);
        return;
      }
    } catch (error) {
      console.error("Error in scorereport command:", error);
      try {
        return await interaction.editReply({
          content: `Error processing the score report: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error("Error sending error reply:", replyError);
        return;
      }
    }
  },
};

// Initialize the sheets API
async function initSheetsAPI() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

// 2. Function to read tracker links from your sheet
async function getTrackerLinksFromSheet(spreadsheetId) {
  const sheets = await initSheetsAPI();

  // Read columns D-G, rows 1-500
  const range = "D:G"; // Adjust sheet name if needed: 'Sheet1!D1:G500'

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found.");
      return [];
    }

    // Extract all tracker links from columns D-G
    const trackerLinks = [];

    rows.forEach((row) => {
      // Check each cell in columns D, E, F, G
      for (let i = 0; i < row.length; i++) {
        const cell = row[i];
        // Check if cell contains a tracker link
        if (cell && cell.includes("tracker.network")) {
          trackerLinks.push(cell);
        }
      }
    });

    console.log(`Found ${trackerLinks.length} tracker links in sheet`);
    return trackerLinks;
  } catch (error) {
    console.error("Error reading from Google Sheets:", error);
    return [];
  }
}
// Modified function to read both tracker links AND IDs from column A
async function getTrackerDataFromSheet(spreadsheetId) {
  const sheets = await initSheetsAPI();

  // Read columns A through G to get both IDs and tracker links
  const range = "A1:G500";

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found.");
      return [];
    }

    // Build a map of tracker links to Discord IDs
    const trackerDatabase = [];

    rows.forEach((row, index) => {
      const discordId = row[0]; // Column A
      const trackerLink1 = row[3]; // Column D
      const trackerLink2 = row[4]; // Column E
      const trackerLink3 = row[5]; // Column F
      const trackerLink4 = row[6]; // Column G

      // Add each tracker link with its associated Discord ID
      [trackerLink1, trackerLink2, trackerLink3, trackerLink4].forEach(
        (link) => {
          if (link && link.includes("tracker.network")) {
            trackerDatabase.push({
              discordId: discordId,
              trackerLink: link,
              rowNumber: index + 1, // For debugging
            });
          }
        },
      );
    });

    console.log(
      `Found ${trackerDatabase.length} tracker links with Discord IDs`,
    );
    return trackerDatabase;
  } catch (error) {
    console.error("Error reading from Google Sheets:", error);
    return [];
  }
}

// Helper to find Discord ID from tracker database
function findDiscordId(trackerDatabase, platform, playerId) {
  // Check if platform and playerId are valid
  if (!platform || !playerId) {
    return null;
  }

  // Normalize platform to lowercase for comparison
  const normalizedPlatform = platform.toLowerCase();

  const normalizedPlayerId = normalizePlayerId(normalizedPlatform, playerId);

  // If normalization failed, return null
  if (!normalizedPlayerId) {
    return null;
  }

  for (const entry of trackerDatabase) {
    const parsed = parseTrackerLink(entry.trackerLink);
    if (!parsed) continue;

    // Compare normalized platforms
    if (parsed.platform === normalizedPlatform) {
      const dbId = normalizePlayerId(parsed.platform, parsed.id);
      if (dbId && dbId === normalizedPlayerId) {
        return entry.discordId;
      }
    }
  }

  return null;
}
// Update the function signature to accept interaction
async function getStats(
  matchGroupID,
  team1,
  team2,
  tier,
  gameday,
  interaction,
) {
  const spreadsheetId = process.env.enrollmentSheetId;
  const statsArray = [];
  const matchGroupURL = `https://ballchasing.com/api/groups/${matchGroupID}`;

  try {
    // Fetch tracker database from sheet if spreadsheetId provided
    let trackerDatabase = [];
    if (spreadsheetId) {
      console.log("Fetching tracker database from Google Sheet...");
      trackerDatabase = await getTrackerDataFromSheet(spreadsheetId);
    }

    // Initial request
    let response = await axios.get(matchGroupURL, { headers: getHeaders() });
    let matchData = response.data;

    // Poll until we get player data
    while (!matchData.players || !matchData.players.length) {
      console.log(`Polling for match data... Status: ${response.status}`);
      await sleep(3000);
      response = await axios.get(matchGroupURL, { headers: getHeaders() });
      matchData = response.data;
    }

    console.log(`Found ${matchData.players.length} players to process`);

    // Check if any Steam players exist
    const hasSteamPlayers = matchData.players.some(
      (p) => p.platform && p.platform.toLowerCase() === "steam",
    );

    // Build a map of player names to their actual Steam64 IDs (only if needed)
    const steamIdMap = new Map();

    if (hasSteamPlayers) {
      console.log(
        "Steam players detected - fetching replay data for Steam64 IDs...",
      );
      const replaysURL = `https://ballchasing.com/api/replays?group=${matchGroupID}`;
      const replaysResponse = await axios.get(replaysURL, {
        headers: getHeaders(),
      });
      const replays = replaysResponse.data.list;

      replays.forEach((replay) => {
        ["blue", "orange"].forEach((team) => {
          if (replay[team] && replay[team].players) {
            replay[team].players.forEach((player) => {
              // Safety check: ensure player exists
              if (!player) {
                return;
              }

              let platform = null;
              let playerId = null;

              // Try to extract platform and ID from various structures
              if (
                player.id &&
                typeof player.id === "object" &&
                player.id.platform
              ) {
                // Nested structure: player.id.platform and player.id.id
                platform = player.id.platform;
                playerId = player.id.id;
              } else if (player.platform) {
                // Flat structure: player.platform and player.id as string
                platform = player.platform;
                playerId = typeof player.id === "string" ? player.id : null;
              }

              // Only proceed if we have valid platform and ID
              if (!platform || !playerId) {
                return;
              }

              // Safely check if it's Steam
              const platformLower = platform.toLowerCase();
              if (platformLower === "steam") {
                steamIdMap.set(player.name.toLowerCase(), playerId);
                console.log(
                  `Added Steam player: ${player.name} -> ${playerId}`,
                );
              }
            });
          }
        });
      });

      console.log(`Built Steam ID map with ${steamIdMap.size} entries`);
    }

    // Calculate total team goals
    const totalGoals = matchData.players.reduce((sum, player) => {
      return sum + player.cumulative.core.goals;
    }, 0);

    // Process each player's stats
    for (let i = 0; i < matchData.players.length; i++) {
      const player = matchData.players[i];

      // Cross-check player against database
      let inDatabase = false;
      let trackerLink = null;
      let discordId = null;
      let discordUsername = null;

      if (trackerDatabase.length > 0 && player.platform && player.id) {
        const platform = player.platform.toLowerCase();
        let playerId;

        // For Steam, use the Steam64 ID from replays
        if (platform === "steam") {
          playerId = steamIdMap.get(player.name.toLowerCase());
          if (!playerId) {
            console.log(
              `⚠️ Steam player ${player.name} - No Steam64 ID found in replays`,
            );
            // Skip this player for database matching
            playerId = null;
          } else {
            console.log(
              `Player ${player.name} (Steam): Steam64 ID = ${playerId}`,
            );
          }
        } else {
          playerId = player.name; // This is their Epic/PSN/Xbox username
          console.log(
            `Player ${player.name} (${platform}): Username ID = ${playerId}`,
          );

          // Add this debug for Epic specifically:
          if (platform === "epic") {
            console.log(
              `  Normalized: "${normalizePlayerId(platform, playerId)}"`,
            );

            // Check what we have in database
            const epicEntries = trackerDatabase.filter((entry) => {
              const parsed = parseTrackerLink(entry.trackerLink);
              return parsed && parsed.platform === "epic";
            });

            console.log(
              `  Found ${epicEntries.length} Epic entries in database`,
            );
            epicEntries.slice(0, 3).forEach((entry) => {
              const parsed = parseTrackerLink(entry.trackerLink);
            });
          }
        }

        if (playerId) {
          // Find Discord ID from database
          discordId = findDiscordId(trackerDatabase, platform, playerId);

          console.log(`Discord ID found: ${discordId || "NOT FOUND"}`);

          if (discordId) {
            inDatabase = true;

            // Try to get username from Discord

            try {
              const user = await interaction.client.users.fetch(discordId);
              discordUsername = `@${user.username}`;
              console.log(`Found user: ${discordUsername}`);
            } catch (userErr) {
              console.log(`Could not fetch user for ID ${discordId}`);
              discordUsername = `<@${discordId}>`;
            }

            // Find their tracker link
            const entry = trackerDatabase.find(
              (e) => e.discordId === discordId,
            );
            if (entry) {
              trackerLink = entry.trackerLink;
              console.log(`Found tracker link: ${trackerLink}`);
            }
          }
        }
      } else {
        console.log(`⚠️ Player ${player.name} - Missing platform or ID`);
      }

      const playerteamName = player.team || "";
      let gamesPlayed = player.cumulative.games;
      let wins = player.cumulative.wins;
      let goals = player.cumulative.core.goals;
      let assists = player.cumulative.core.assists;
      let shots = player.cumulative.core.shots;

      let GP = 0;
      if (assists + goals !== 0 && totalGoals !== 0) {
        GP = ((assists + goals) / totalGoals) * 100;
      }

      let saves = player.cumulative.core.saves;
      let SPS = 0;
      if (shots !== 0) {
        SPS = saves / shots;
      }

      let demos = player.cumulative.demo.inflicted;
      let demosTaken = player.cumulative.demo.taken;
      let BS =
        player.cumulative.boost.count_stolen_big +
        player.cumulative.boost.count_stolen_small / 2.5;
      let goalsAgainst =
        player.cumulative.positioning.goals_against_while_last_defender;
      let score = player.cumulative.core.score;
      let offensePercent = player.cumulative.positioning.percent_offensive_half;
      let defensePercent = player.cumulative.positioning.percent_defensive_half;

      let OPV =
        1.5 * goals +
        1.25 * assists +
        0.45 * shots +
        0.25 * demos +
        0.05 * BS +
        0.05 * GP;
      let DPV = (1 * saves + 0.2 * SPS - 0.85 * goalsAgainst) * 2.5;
      let TPV = 0;

      if (DPV < 0) {
        TPV = (1 * DPV + 1.25 * OPV) / 2;
      } else {
        TPV = (1.5 * DPV + 1.25 * OPV) / 2;
      }

      let playerArray = [
        formatGameday(gameday),
        ,
        gamesPlayed,
        wins,
        gamesPlayed - wins,
        score,
        goals,
        saves,
        assists,
        shots,
        demos,
        demosTaken,
        offensePercent,
        defensePercent,
        DPV,
        OPV,
        TPV,
        player.name,
        tier,
        playerteamName,
        discordUsername || "Not Submitted?",
      ];

      statsArray.push(playerArray);
    }

    return statsArray;
  } catch (error) {
    console.error("Error fetching match data:", error);
    throw error;
  }
}
// Helper functions

function normalizePlayerId(platform, id) {
  // Add safety check for undefined/null
  if (!id) {
    return null;
  }

  // Normalize platform to lowercase
  const normalizedPlatform = platform.toLowerCase();

  // For Epic, PSN, Xbox, Switch - normalize to lowercase for case-insensitive matching
  // This handles names like "Epic Player" vs "epic player" vs "Epic%20Player"
  return id.toLowerCase().trim();
}

// Update parseTrackerLink to ensure lowercase platforms
function parseTrackerLink(link) {
  const match = link.match(/profile\/([^\/]+)\/([^\/]+)/);
  if (match) {
    let platform = match[1].toLowerCase();
    let id = decodeURIComponent(match[2]); // This converts %20 to spaces

    const platformMap = {
      psn: "ps4",
      xbl: "xbox",
      epic: "epic",
      steam: "steam",
      switch: "switch",
    };

    return {
      platform: platformMap[platform] || platform,
      id: id,
      originalPlatform: match[1],
    };
  }
  return null;
}

// Determine the winner of a single game.
// Returns 1 (team1 wins), 2 (team2 wins), "tie", "invalid", or null (empty slot).
function parseGameWinner(game) {
  if (game === null || game === undefined || `${game}`.trim() === "") {
    return null; // empty/unused game slot
  }

  const parts = `${game}`.split("-").map((s) => s.trim());
  if (parts.length < 2 || parts[0] === "" || parts[1] === "") {
    return "invalid";
  }

  const aFF = parts[0].toUpperCase() === "FF";
  const bFF = parts[1].toUpperCase() === "FF";

  // Forfeit handling: the side marked "FF" loses
  if (aFF && bFF) return "invalid";
  if (aFF) return 2; // team1 forfeited -> team2 wins
  if (bFF) return 1; // team2 forfeited -> team1 wins

  const aScore = parseInt(parts[0], 10);
  const bScore = parseInt(parts[1], 10);
  if (Number.isNaN(aScore) || Number.isNaN(bScore)) return "invalid";

  if (aScore === bScore) return "tie"; // handshake / draw - not allowed
  return aScore > bScore ? 1 : 2;
}

/**
 * Validate a submitted series.
 * - Every provided game must have a clear winner (no ties/handshakes).
 * - The winner must reach the required number of game wins:
 *     Playoffs (best-of-7): 4 wins. Regular season (best-of-5): 3 wins.
 *
 * @returns {{ valid: boolean, reason?: string, winner?: string, t1?: number, t2?: number }}
 */
function validateSeries(team1, team2, games, gameday) {
  const isPlayoffs = gameday === "Playoffs";
  const requiredWins = isPlayoffs ? 4 : 3;
  const seriesLabel = isPlayoffs
    ? "best-of-7 (first to 4)"
    : "best-of-5 (first to 3)";

  let t1 = 0;
  let t2 = 0;
  let gameCount = 0;

  for (let i = 0; i < games.length; i++) {
    const result = parseGameWinner(games[i]);
    if (result === null) continue; // unused slot

    gameCount++;

    if (result === "tie") {
      return {
        valid: false,
        reason: `Game ${i + 1} (\`${games[i]}\`) is a tie. Every game must have a winner. Please redo the report.`,
      };
    }

    if (result === "invalid") {
      return {
        valid: false,
        reason: `Game ${i + 1} (\`${games[i]}\`) is not a valid score. Use \`team1-team2\` (e.g. \`3-2\`) or a forfeit (\`FF-W\` / \`W-FF\`). Please redo the report.`,
      };
    }

    if (result === 1) t1++;
    else t2++;
  }

  if (gameCount === 0) {
    return { valid: false, reason: "No game scores were provided." };
  }

  const winnerWins = Math.max(t1, t2);
  if (winnerWins < requiredWins) {
    return {
      valid: false,
      reason: `No team reached ${requiredWins} game wins (currently ${team1} ${t1} - ${t2} ${team2}). A ${seriesLabel} series needs a winner with at least ${requiredWins} games won. Please redo the report.`,
    };
  }

  if (t1 === t2) {
    return {
      valid: false,
      reason: `The series is tied ${team1} ${t1} - ${t2} ${team2}. There must be a clear winner. Please redo the report.`,
    };
  }

  return { valid: true, winner: t1 > t2 ? team1 : team2, t1, t2 };
}

function getGameResults(team1, team2, games) {
  let resultsText = "";

  games.forEach((game, index) => {
    if (!game) return; // Skip if game doesn't exist

    const score = game.split("-");
    let winnerEmoji = "";

    // check for single game forfeit
    if (score[0].toString() === "FF") {
      winnerEmoji = teams[team2].emoji; // Forfeit win for team2
      resultsText += `Game ${index + 1}: ${game} ${winnerEmoji}\n`;
      return resultsText;
    } else if (score[1].toString() === "FF") {
      winnerEmoji = teams[team1].emoji; // Forfeit win for team1
      resultsText += `Game ${index + 1}: ${game} ${winnerEmoji}\n`;
      return resultsText;
    }

    const team1Score = parseInt(score[0]);
    const team2Score = parseInt(score[1]);

    if (team1Score > team2Score) {
      winnerEmoji = teams[team1].emoji || "🏆"; // Use team1's emoji or default
    } else if (team2Score > team1Score) {
      winnerEmoji = teams[team2].emoji || "🏆"; // Use team2's emoji or default
    } else {
      winnerEmoji = "🤝"; // Draw emoji if scores are equal
    }

    resultsText += `Game ${index + 1}: ${game} ${winnerEmoji}\n`;
  });

  return resultsText || "No games played";
}

function tierColor(tier) {
  if (tier == "Omega") {
    return 0xffd700;
  }
  if (tier == "Delta") {
    return 0x4682b4;
  }
  if (tier == "Beta") {
    return 0x00bd00;
  }
  if (tier == "Alpha") {
    return 0xdc143c;
  }
  if (tier == "Apex") {
    return 0x6500af;
  }
}

function getIdFromBCLink(ballchasingLink) {
  let ioBCG = ballchasingLink.indexOf("ballchasing.com/group");

  if (ioBCG == -1) {
    return "";
  }

  let linkLength = ballchasingLink.length;
  let groupId = ballchasingLink.substring(ioBCG + 22, linkLength);

  let extra = groupId.indexOf("/");
  if (extra != -1) {
    groupId = groupId.substring(0, extra);
  }

  return groupId;
}
