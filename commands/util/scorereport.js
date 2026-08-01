const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const teams = require("../../data/teams.json");
const { teamImage } = require("../../utils/teamImage.js");
const { leagueRoles } = require("../../data/roles.json");
const subUpTracker = require("../../utils/subUpTracker.js");

const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const { loadSchedule } = require("../../utils/scheduling/scheduleStore.js");

const { google } = require("googleapis");

const SHEET_ID = "1UTmWePLT_FUer83spyuUCucqghM3WZmDPCuRRf88e50";
const CREDENTIALS = process.env.credentials;

// The main league guild where tier/league roles live. Member roles are always
// read from here so sub-up detection works regardless of where the command runs.
const LEAGUE_GUILD_ID = "1181050438750060584";

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

// Tier ranking, lowest -> highest. Used to detect sub-ups (a player whose
// league tier is lower than the reported match tier).
const TIER_ORDER = ["Omega", "Delta", "Beta", "Alpha", "Apex"];

// Return the league tier a guild member belongs to (via their league role),
// or null if they don't have one. Returns the lowest tier if they have several.
function getMemberLeagueTier(member) {
  if (!member) return null;
  for (const tierName of TIER_ORDER) {
    const roleId = leagueRoles[tierName];
    if (roleId && member.roles.cache.has(roleId)) {
      return tierName;
    }
  }
  return null;
}

// The NL team a member is on (the team they'd be subbing up FOR).
function getMemberTeam(member) {
  if (!member) return null;
  for (const roleId of member.roles.cache.keys()) {
    if (roleIdToTeam[roleId]) return roleIdToTeam[roleId];
  }
  return null;
}

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

  // Preseason gamedays are stored as "P1" / "P2".
  if (gamedayNumber === "P1") return "Preseason 1";
  if (gamedayNumber === "P2") return "Preseason 2";

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
          { name: "Preseason 1", value: "P1" },
          { name: "Preseason 2", value: "P2" },
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
      const { thumbnail: image, files } = teamImage(winner, winnerData);

      // Create embed with match info
      const matchEmbed = new EmbedBuilder()
        .setTitle(`${team1} vs ${team2} - ${tier} Tier`)
        .setDescription(formatGameday(gameday))
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
        .setImage(image)
        .setTimestamp()
        .setFooter({ text: `Reported by ${interaction.user.tag}` });
      // Fetch and add the stats
      const { rows: statsValues, subUps } = await getStats(
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
        // Read fresh so threads created after the bot started are found.
        const schedule = loadSchedule();
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
        range: "Import Data (Per Series)!B:W",
        valueInputOption: "RAW",
        resource: {
          values: statsValues,
        },
      });

      // Now that the series is recorded, count each sub-up toward that player's
      // team+tier season total (cap enforced by whoever reviews the sheet).
      for (const { userId, team, tier: subTier } of subUps) {
        const total = subUpTracker.increment(userId, team, subTier);
        if (total > subUpTracker.SUB_UP_CAP) {
          console.warn(
            `⚠️ Player ${userId} is over the sub-up cap for ${team} ${subTier}: ${total}/${subUpTracker.SUB_UP_CAP}`,
          );
        }
      }

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
        await tierChannel.send({ embeds: [matchEmbed], files });
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

// Map a ballchasing platform name to the tracker.gg slug used in the sheet.
function normalizeBcPlatform(platform) {
  const p = (platform || "").toLowerCase();
  const map = {
    ps4: "psn",
    ps5: "psn",
    playstation: "psn",
    psn: "psn",
    xbox: "xbl",
    xboxlive: "xbl",
    xbl: "xbl",
    epic: "epic",
    steam: "steam",
    switch: "switch",
  };
  return map[p] || p;
}

// Build a normalized lookup key "platform:id" (lowercased, dashes stripped so
// epic UUIDs match regardless of formatting).
function makePlatformKey(platform, id) {
  const cleanId = String(id || "")
    .toLowerCase()
    .replace(/-/g, "");
  return `${normalizeBcPlatform(platform)}:${cleanId}`;
}

// Read the "Platform IDs" tab (A = Discord ID, B..Z = "platform:id" entries)
// and build a map of normalized platform key -> Discord ID.
async function getPlatformIdMap(spreadsheetId) {
  const sheets = await initSheetsAPI();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Platform IDs'!A:Z",
    });

    const rows = response.data.values || [];
    const map = new Map(); // "platform:id" -> discordId

    for (const row of rows) {
      const discordId = row[0];
      // Skip header / blank rows (Discord IDs are all digits)
      if (!discordId || !/^\d+$/.test(String(discordId).trim())) continue;

      for (let i = 1; i < row.length; i++) {
        const cell = (row[i] || "").trim();
        if (!cell.includes(":")) continue;
        const idx = cell.indexOf(":");
        const platform = cell.slice(0, idx);
        const id = cell.slice(idx + 1);
        map.set(makePlatformKey(platform, id), String(discordId).trim());
      }
    }

    console.log(`Loaded ${map.size} platform IDs from Platform IDs tab`);
    return map;
  } catch (error) {
    console.error("Error reading Platform IDs tab:", error);
    return new Map();
  }
}

// Read tracker links from the Admissions tab (B = Discord ID, F..Z = links)
// and build a "platform:username" -> Discord ID map. This is the fallback that
// covers platforms ballchasing only exposes by username (notably PSN, where
// ballchasing gives the PSN online ID, not the numeric account id).
async function getTrackerLinkMap(spreadsheetId) {
  const sheets = await initSheetsAPI();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Admissions!A:Z",
    });

    const rows = response.data.values || [];
    const map = new Map();

    for (const row of rows) {
      const discordId = row[1]; // column B
      if (!discordId || !/^\d+$/.test(String(discordId).trim())) continue;

      // Tracker links live in columns F onward (index 5+)
      for (let i = 5; i < row.length; i++) {
        const link = row[i];
        if (typeof link !== "string" || !link.includes("tracker")) continue;

        const m = link.match(/profile\/([^/]+)\/([^/?#]+)/);
        if (!m) continue;

        const platform = m[1];
        const username = decodeURIComponent(m[2]);
        map.set(makePlatformKey(platform, username), String(discordId).trim());
      }
    }

    console.log(`Loaded ${map.size} tracker-link keys from Admissions tab`);
    return map;
  } catch (error) {
    console.error("Error reading Admissions tracker links:", error);
    return new Map();
  }
}

// The group endpoint reports each player's *display name* in the `id` field
// instead of their real platform account id. That means Steam players never
// match the Platform IDs tab (which stores the numeric SteamID64), and Epic/Xbox
// players only match by coincidence via the tracker-link username fallback.
//
// Replay-level data DOES carry the real id (`player.id.platform` / `player.id.id`).
// Since the display name is identical between the replay and group payloads, we
// fetch each replay in the group, resolve every player by their real id, and key
// the result by display name so the group loop can join on `player.name`.
async function buildNameToDiscordMap(matchGroupID, lookup) {
  const nameToDiscord = new Map(); // display name -> Discord ID
  if (!lookup || lookup.size === 0) return nameToDiscord;

  try {
    const listURL = `https://ballchasing.com/api/replays?group=${matchGroupID}`;
    const listResp = await axios.get(listURL, { headers: getHeaders() });
    const replays = listResp.data.list || [];
    console.log(`Resolving real platform IDs from ${replays.length} replays`);

    for (const summary of replays) {
      try {
        const replayResp = await axios.get(
          `https://ballchasing.com/api/replays/${summary.id}`,
          { headers: getHeaders() },
        );
        const replay = replayResp.data;

        for (const color of ["blue", "orange"]) {
          const teamPlayers = (replay[color] && replay[color].players) || [];
          for (const p of teamPlayers) {
            if (!p.name || nameToDiscord.has(p.name)) continue; // already resolved
            if (!p.id || !p.id.platform || !p.id.id) continue;

            const key = makePlatformKey(p.id.platform, p.id.id);
            const discordId = lookup.get(key);
            if (discordId) {
              nameToDiscord.set(p.name, discordId);
              console.log(`  ${p.name} (${key}) -> ${discordId}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching replay ${summary.id}:`, err.message);
      }

      await sleep(500); // stay under the ballchasing rate limit
    }
  } catch (error) {
    console.error("Error building name->Discord map from replays:", error);
  }

  return nameToDiscord;
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
  const subUps = []; // Discord IDs flagged as sub-ups this series (to count on success)
  const matchGroupURL = `https://ballchasing.com/api/groups/${matchGroupID}`;

  try {
    // Build the combined lookup: Platform IDs (epic/steam/xbox by real id) plus
    // tracker-link usernames (covers PSN, which ballchasing only gives by name).
    let lookup = new Map();
    if (spreadsheetId) {
      console.log("Fetching player lookup tables from Google Sheet...");
      const [idMap, linkMap] = await Promise.all([
        getPlatformIdMap(spreadsheetId),
        getTrackerLinkMap(spreadsheetId),
      ]);
      lookup = idMap;
      // Add tracker-link keys that the Platform IDs table doesn't already cover
      for (const [k, v] of linkMap) {
        if (!lookup.has(k)) lookup.set(k, v);
      }
      console.log(`Combined lookup has ${lookup.size} keys`);
    }

    // Resolve real platform IDs (esp. Steam) from replay-level data, keyed by
    // display name so the group loop below can match on player.name.
    const nameToDiscord = await buildNameToDiscordMap(matchGroupID, lookup);

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

    // Resolve the league guild (where tier roles live) for role lookups.
    // Falls back to the command's guild if that guild isn't reachable.
    const leagueGuild = await interaction.client.guilds
      .fetch(LEAGUE_GUILD_ID)
      .catch(() => interaction.guild);

    // Calculate total team goals
    const totalGoals = matchData.players.reduce((sum, player) => {
      return sum + player.cumulative.core.goals;
    }, 0);

    // Process each player's stats
    for (let i = 0; i < matchData.players.length; i++) {
      const player = matchData.players[i];

      // Match player to a Discord ID: first via the replay-resolved real IDs
      // (needed for Steam, whose real id the group endpoint hides), then via the
      // group platform/id key as a fallback for Epic/Xbox tracker-link matches.
      let discordId = null;
      let discordUsername = null;
      let subUpMarker = "";
      let isSubUp = false;

      // Prefer the replay-resolved match (real platform IDs, keyed by display
      // name). Fall back to the group platform/id key, which still covers
      // Epic/Xbox players via the tracker-link username map.
      if (nameToDiscord.has(player.name)) {
        discordId = nameToDiscord.get(player.name);
      }
      if (!discordId && lookup.size > 0 && player.platform && player.id) {
        const key = makePlatformKey(player.platform, player.id);
        discordId = lookup.get(key) || null;
      }

      if (lookup.size > 0 && player.platform && player.id) {
        console.log(
          `Player ${player.name} (${makePlatformKey(player.platform, player.id)}): Discord ID ${discordId || "NOT FOUND"}`,
        );

        if (discordId) {
          // Fetch the member from the league guild so we can read roles
          // (username + sub-up check)
          const member = await leagueGuild.members
            .fetch(discordId)
            .catch(() => null);

          if (member) {
            discordUsername = `@${member.user.username}`;

            // Sub-up: the player's own league tier is lower than the reported tier
            const memberTier = getMemberLeagueTier(member);
            const memberIdx = memberTier ? TIER_ORDER.indexOf(memberTier) : -1;
            const reportedIdx = TIER_ORDER.indexOf(tier);
            if (
              memberIdx !== -1 &&
              reportedIdx !== -1 &&
              memberIdx < reportedIdx
            ) {
              // Cap is per team + tier: a player may sub up for the same team in
              // the same tier at most SUB_UP_CAP times per season.
              const memberTeam = getMemberTeam(member);
              // Projected count = current + 1 (the actual increment happens in
              // execute() only once the report is confirmed and written).
              const projected =
                subUpTracker.getCount(discordId, memberTeam, tier) + 1;
              subUpMarker = `Sub Up (${memberTier}) ${projected}/${subUpTracker.SUB_UP_CAP}`;
              if (projected > subUpTracker.SUB_UP_CAP) {
                subUpMarker += " ⚠️ OVER CAP";
              }
              subUps.push({ userId: discordId, team: memberTeam, tier });
              isSubUp = true;
              console.log(
                `↑ ${member.user.username} is a SUB UP: ${memberTier} playing in ${tier} (${projected}/${subUpTracker.SUB_UP_CAP})`,
              );
            }
          } else {
            console.log(`Could not fetch member for ID ${discordId}`);
            discordUsername = `<@${discordId}>`;
          }
        }
      } else {
        console.log(`⚠️ Player ${player.name} - missing platform or id`);
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
        subUpMarker,
      ];

      // Sub-ups don't count toward stats: clear the stat columns (D–R) and leave
      // the V column (the @) blank so nothing is attributed to them. The sub-up
      // note stays in the W column (index 21).
      if (isSubUp) {
        for (let c = 2; c <= 16; c++) playerArray[c] = "";
        playerArray[20] = ""; // V column: don't type the @ for sub-ups
      }

      statsArray.push(playerArray);
    }

    return { rows: statsArray, subUps };
  } catch (error) {
    console.error("Error fetching match data:", error);
    throw error;
  }
}
// Helper functions

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
