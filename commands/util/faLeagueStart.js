const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// gm data
const gmData = {
  Frog: {
    names: ["Frogs", "Toads", "Chipmunks", "Tadpoles"],
    discordID: "676078084377673768",
  },
  JayDea: {
    names: ["Ferrets", "Skunks", "Quokkas"],
    discordID: "676078084377673768",
  },
  Sloth: {
    names: ["Trash Pandas", "Trash Bandits"],
    discordID: "676078084377673768",
  },
  Chef: { names: ["Fledglings"], discordID: "676078084377673768" },
  Erase: { names: ["Koalas", "Donkeys"], discordID: "676078084377673768" },
  Tone: {
    names: ["Hyenas", "Moose", "Hornets"],
    discordID: "676078084377673768",
  },
  Sanzo: { names: ["Lemurs", "Beavers"], discordID: "676078084377673768" },
  Enygmah: { names: ["Mammoths", "Tuskers"], discordID: "676078084377673768" },
  Wifi: {
    names: ["Tortoises", "Makos", "Jellyfish"],
    discordID: "676078084377673768",
  },
  Tifi: {
    names: ["Elk", "Polar Bears", "Reindeer"],
    discordID: "676078084377673768",
  },
  Goalz: { names: ["Spiders"], discordID: "676078084377673768" },
  Thifi: {
    names: ["Pterodactyls", "Velociraptors", "Megalodons"],
    discordID: "676078084377673768",
  },
  Insano: {
    names: ["Ducklings", "Dingoes", "Platypuses"],
    discordID: "676078084377673768",
  },
  Swit: { names: ["Penguins"], discordID: "676078084377673768" },
  Tuxy: { names: ["Hounds"], discordID: "676078084377673768" },
};

const TRACKING_FILE = path.join(__dirname, "tracking.json");
const FA_LEAGUE_ROLE_ID = "1470322091902373909";
const FA_MATCHES_CHANNEL_ID = "1471304113898782872";

const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");

// Configure Google Sheets API
const auth = new GoogleAuth({
  keyFile: process.env.credentials, // Path to your service account key
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

const rfaSheet = process.env.enrollmentSheetId;
const directorySheet = "187AXnmM3a4pHXJgeb0rzb1mbPiMKLz0qeHUVPm7q2ys";

async function getPlayerMMR(discordId) {
  try {
    // Try Sheet 1 first - IDs in C:C, MMR in P:P
    const sheet1Response = await sheets.spreadsheets.values.get({
      spreadsheetId: directorySheet,
      range: "RLtrackerSync!C:P", // Adjust sheet name if needed
    });

    const sheet1Rows = sheet1Response.data.values;

    if (sheet1Rows && sheet1Rows.length > 0) {
      for (let i = 0; i < sheet1Rows.length; i++) {
        const row = sheet1Rows[i];
        const id = row[0]; // Column C (index 0 in the range C:P)
        const mmr = row[13]; // Column N (index 11 in the range C:P)

        if (id === discordId && mmr) {
          console.log(`Found ${discordId} in Sheet1 with MMR: ${mmr}`);
          return parseInt(mmr);
        }
      }
    }

    // Try Sheet 2 - IDs in A:A, MMR in B:B
    const sheet2Response = await sheets.spreadsheets.values.get({
      spreadsheetId: rfaSheet,
      range: "RFAd FA League Players!A:B",
    });

    const sheet2Rows = sheet2Response.data.values;

    if (sheet2Rows && sheet2Rows.length > 0) {
      for (let i = 0; i < sheet2Rows.length; i++) {
        const row = sheet2Rows[i];
        const id = row[0]; // Column A
        const mmr = row[1]; // Column B

        if (id === discordId && mmr) {
          console.log(`Found ${discordId} in Sheet2 with MMR: ${mmr}`);
          return parseInt(mmr);
        }
      }
    }

    // Return a default MMR
    return 0;
  } catch (error) {
    console.error("Error fetching player MMR:", error);
  }

  // Return default MMR
  return 0;
}

function loadTracking() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = fs.readFileSync(TRACKING_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading tracking file:", error.message);
  }

  const defaultTracking = {
    gmGameCounts: {},
  };

  Object.keys(gmData).forEach((gm) => {
    defaultTracking.gmGameCounts[gm] = 0;
  });

  return defaultTracking;
}

function saveTracking(tracking) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving tracking file:", error.message);
  }
}

async function selectGMsAndTeams() {
  const tracking = loadTracking();
  const minGames = Math.min(...Object.values(tracking.gmGameCounts));

  const eligibleGMs = Object.keys(tracking.gmGameCounts).filter(
    (gm) => tracking.gmGameCounts[gm] === minGames,
  );

  let gm1, gm2;

  if (eligibleGMs.length >= 2) {
    const shuffled = [...eligibleGMs].sort(() => Math.random() - 0.5);
    gm1 = shuffled[0];
    gm2 = shuffled[1];
  } else if (eligibleGMs.length === 1) {
    gm1 = eligibleGMs[0];
    const nextTierGMs = Object.keys(tracking.gmGameCounts).filter(
      (gm) => tracking.gmGameCounts[gm] === minGames + 1,
    );
    const shuffled = [...nextTierGMs].sort(() => Math.random() - 0.5);
    gm2 = shuffled[0];
  } else {
    const allGMs = Object.keys(tracking.gmGameCounts);
    const shuffled = [...allGMs].sort(() => Math.random() - 0.5);
    gm1 = shuffled[0];
    gm2 = shuffled[1];
  }

  if (!gmData[gm1] || !gmData[gm2]) {
    throw new Error(`Invalid GM selection: ${gm1}, ${gm2}`);
  }

  const team1 =
    gmData[gm1].names[Math.floor(Math.random() * gmData[gm1].names.length)];
  const team2 =
    gmData[gm2].names[Math.floor(Math.random() * gmData[gm2].names.length)];

  tracking.gmGameCounts[gm1]++;
  tracking.gmGameCounts[gm2]++;

  saveTracking(tracking);

  return {
    team1gm: gmData[gm1].discordID,
    team2gm: gmData[gm2].discordID,
    team1,
    team2,
  };
}

function balanceTeams(players) {
  if (players.length !== 8) {
    throw new Error("Exactly 8 players required");
  }

  const combinations = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      for (let k = j + 1; k < players.length; k++) {
        for (let l = k + 1; l < players.length; l++) {
          combinations.push([i, j, k, l]);
        }
      }
    }
  }

  let bestBalance = null;
  let smallestTop3Difference = Infinity;
  let smallestTotalDifference = Infinity;

  for (const team1Indices of combinations) {
    const team2Indices = [];
    for (let i = 0; i < players.length; i++) {
      if (!team1Indices.includes(i)) {
        team2Indices.push(i);
      }
    }

    const team1Players = team1Indices.map((idx) => players[idx]);
    const team2Players = team2Indices.map((idx) => players[idx]);

    const team1Sorted = [...team1Players].sort((a, b) => b.mmr - a.mmr);
    const team2Sorted = [...team2Players].sort((a, b) => b.mmr - a.mmr);

    const team1Top3MMR = team1Sorted
      .slice(0, 3)
      .reduce((sum, p) => sum + p.mmr, 0);
    const team2Top3MMR = team2Sorted
      .slice(0, 3)
      .reduce((sum, p) => sum + p.mmr, 0);

    const team1TotalMMR = team1Players.reduce((sum, p) => sum + p.mmr, 0);
    const team2TotalMMR = team2Players.reduce((sum, p) => sum + p.mmr, 0);

    const top3Difference = Math.abs(team1Top3MMR - team2Top3MMR);
    const totalDifference = Math.abs(team1TotalMMR - team2TotalMMR);

    const isTop3Better = top3Difference < smallestTop3Difference;
    const isTop3Equal = top3Difference === smallestTop3Difference;
    const isTotalBetter = totalDifference < smallestTotalDifference;

    if (isTop3Better || (isTop3Equal && isTotalBetter)) {
      smallestTop3Difference = top3Difference;
      smallestTotalDifference = totalDifference;
      bestBalance = {
        team1: {
          players: team1Players,
          totalMMR: team1TotalMMR,
          averageMMR: team1TotalMMR / 4,
        },
        team2: {
          players: team2Players,
          totalMMR: team2TotalMMR,
          averageMMR: team2TotalMMR / 4,
        },
        top3MMRDifference: top3Difference,
        totalMMRDifference: totalDifference,
      };
    }
  }

  return bestBalance;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("run-faleague-matches")
    .setDescription("admin only command runs new fa matches")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const faLeagueRole = interaction.guild.roles.cache.get(FA_LEAGUE_ROLE_ID);

    if (!faLeagueRole) {
      return await interaction.editReply("FA League role not found!");
    }

    // Members should already be cached from startup
    const faLeaguePlayers = await Promise.all(
      faLeagueRole.members.map(async (member) => ({
        discordID: member.id,
        mmr: await getPlayerMMR(member.id),
      })),
    );

    if (faLeaguePlayers.length === 0) {
      return await interaction.editReply(
        "No FA League members found. Bot may still be caching members, please wait a moment and try again.",
      );
    }

    faLeaguePlayers.sort((a, b) => b.mmr - a.mmr);

    const extraPlayers = [];

    const remainder = faLeaguePlayers.length % 8;
    if (remainder !== 0) {
      for (let i = 0; i < remainder; i++) {
        const randomIndex = Math.floor(Math.random() * faLeaguePlayers.length);
        const [removedPlayer] = faLeaguePlayers.splice(randomIndex, 1);
        extraPlayers.push(removedPlayer);
      }
    }

    const channel = await interaction.guild.channels.fetch(
      FA_MATCHES_CHANNEL_ID,
    );
    channel.send(
      "subs: " + extraPlayers.map((p) => `<@${p.discordID}>`).join(", "),
    );

    let threadsCreated = 0;

    for (let i = 0; i < faLeaguePlayers.length; i += 8) {
      const group = faLeaguePlayers.slice(i, i + 8);

      const balancedTeams = balanceTeams(group);
      const { team1gm, team2gm, team1, team2 } = await selectGMsAndTeams();

      console.log(
        `Team 1: ${team1} > GM: ${team1gm} > players > ${balancedTeams.team1.players}\n\nTeam 2: ${team2} > GM: ${team2gm} > players > ${balancedTeams.team2.players}`,
      );
      await makeFALeagueThread(
        interaction,
        team1gm,
        team2gm,
        team1,
        team2,
        balancedTeams.team1.players,
        balancedTeams.team2.players,
      );

      threadsCreated++;
    }

    await interaction.editReply(
      `✅ Created ${threadsCreated} FA League match threads!`,
    );
  },
};

async function makeFALeagueThread(
  interaction,
  gm1,
  gm2,
  team1,
  team2,
  t1Players,
  t2Players,
) {
  try {
    const channel = await interaction.guild.channels.fetch(
      FA_MATCHES_CHANNEL_ID,
    );

    if (!channel || !channel.isTextBased()) {
      throw new Error("Invalid channel for thread creation");
    }

    const threadName = `FA League - ${team1} vs ${team2}`;

    const thread = await channel.threads.create({
      name: threadName,
      type: 12,
      reason: "FA League match thread",
    });

    const wardenRole = interaction.guild.roles.cache.find(
      (role) => role.name === "Trial Warden",
    );

    if (!wardenRole) {
      console.error("Warden role not found!");
    }

    const allParticipants = [
      gm1,
      gm2,
      ...t1Players.map((p) => p.discordID),
      ...t2Players.map((p) => p.discordID),
    ];

    for (const userId of allParticipants) {
      try {
        await thread.members.add(userId);
      } catch (error) {
        console.error(`Failed to add user ${userId}:`, error.message);
      }
    }

    if (wardenRole) {
      const membersWithWarden = wardenRole.members.map((member) => member.id);
      for (const userId of membersWithWarden) {
        try {
          await thread.members.add(userId);
        } catch (error) {
          console.error(`Failed to add Warden ${userId}:`, error.message);
        }
      }
    }

    const team1List = t1Players.map((p) => `<@${p.discordID}>`).join("\n");
    const team2List = t2Players.map((p) => `<@${p.discordID}>`).join("\n");

    const message = await thread.send({
      content:
        `# ${team1} vs ${team2}\n\n` +
        `**${team1}**\n` +
        `GM: <@${gm1}>\n` +
        `${team1List}\n\n` +
        `**${team2}**\n` +
        `GM: <@${gm2}>\n` +
        `${team2List}\n\n` +
        `Welcome to FA League! These matches are required as an FA in nature league as they are to keep activity within the FA pool and hopefully help y'all find a team. This game is to be scheduled for 6-8 players to show and the GMs will be here to assist. All players who show must play 2 games. Get this match score reported within a week!`,
    });

    await message.pin();

    return thread;
  } catch (error) {
    console.error("Error creating FA League thread:", error);
    throw error;
  }
}
