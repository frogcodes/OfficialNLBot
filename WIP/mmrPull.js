const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

function getGraphPeak(graph, playlist) {
  var peak = 0;
  for (const day of graph.data[playlist]) {
    if (day.rating > peak) {
      peak = day.rating;
    }
  }
  return peak;
}

function getPagePeak(playerData, playlist) {
  let peakRating = 0;
  let currentRating = 0;
  for (const segment of playerData.segments) {
    if (segment.attributes.playlistId == playlist) {
      if (segment.type == "peak-rating") {
        peakRating = segment.stats.peakRating?.value ?? 0; // checking peak Rating. if there isnt a value it gives 0
        console.log(peakRating);
        continue;
      }
      if (segment.type == "playlist") {
        currentRating = segment.stats.rating?.value ?? 0; // checking current Rating. if there isnt a value it gives 0
        console.log(currentRating);
      }
    }
  }
  return Math.max(currentRating, peakRating);
}

function countGamesPlayed(currentSeasonData, lastSeasonData, thirdSeasonData) {
  var twosGames = 0;
  var threesGames = 0;

  for (var playlist of currentSeasonData) {
    if (playlist.attributes.playlistId == 11) {
      twosGames += playlist.stats.matchesPlayed.value;
    }
    if (playlist.attributes.playlistId == 13) {
      threesGames += playlist.stats.matchesPlayed.value;
    }
  }
  if (
    twosGames + threesGames >= 350 &&
    (twosGames >= 100 || threesGames >= 100)
  ) {
    return { twosGames, threesGames };
  }
  for (var playlist of lastSeasonData) {
    if (playlist.attributes.playlistId == 11) {
      twosGames += playlist.stats.matchesPlayed.value;
    }
    if (playlist.attributes.playlistId == 13) {
      threesGames += playlist.stats.matchesPlayed.value;
    }
  }
  if (
    twosGames + threesGames >= 350 &&
    (twosGames >= 100 || threesGames >= 100)
  ) {
    return { twosGames, threesGames };
  }
  for (var playlist of thirdSeasonData) {
    if (playlist.attributes.playlistId == 11) {
      twosGames += playlist.stats.matchesPlayed.value;
    }
    if (playlist.attributes.playlistId == 13) {
      threesGames += playlist.stats.matchesPlayed.value;
    }
  }
  return { twosGames, threesGames };
}

async function pullMMR() {
  /*
  // Rate limiting to avoid API blocks
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;
  const requestDelay =
    this.minDelay + Math.random() * (this.maxDelay - this.minDelay);

  if (timeSinceLastRequest < requestDelay && this.lastRequestTime > 0) {
    const waitTime = requestDelay - timeSinceLastRequest;
    console.log(
      `[API] Rate limiting: waiting ${Math.round(waitTime / 1000)}s...`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  this.lastRequestTime = Date.now();
  **/

  const profileUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/EKA%20Luminous`;
  // Step 1: Get player profile to extract player ID

  //const player = JSON.parse(fs.readFileSync("./tracker.json", "utf8"));
  const { stdout: playerData } = await execAsync(
    `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${profileUrl}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  console.log(`[API] Fetching profile: ${profileUrl}`);

  let player;
  //console.log(playerData);
  try {
    player = JSON.parse(playerData);
  } catch (parseError) {
    throw new Error(
      "API returned invalid JSON - possible rate limit. Try again in a few minutes."
    );
  }
  //console.log(graph, tracker);

  // Extract numeric player ID from metadata
  const playerId = player.data.metadata.playerId;

  if (!playerId) {
    throw new Error("Could not find player ID in profile");
  }

  console.log(`[API] Found player ID: ${playerId}`);
  //api.tracker.gg/api/v2/rocket-league/player-history/mmr/${playerId}
  //console.log(playerId);

  var wins = player.data.segments[0].stats.wins.value;
  if (wins < 1500) {
    console.log(`You need **${1500 - wins}** more account wins`);
    return;
  }

  if (player.errors && player.errors.length > 0) {
    throw new Error(`API Error: ${profile.errors[0].message}`);
  }

  if (!player.data || !player.data.metadata) {
    throw new Error("Invalid API response - player may not exist");
  }

  // Step 2: Get MMR history using player ID
  console.log(`[API] Fetching MMR history...`);

  const mmrHistoryUrl = `https://api.tracker.gg/api/v2/rocket-league/player-history/mmr/${playerId}`;

  const { stdout: graphData } = await execAsync(
    `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${mmrHistoryUrl}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  const graph = JSON.parse(graphData);
  // console.log(graph);
  var currentSeason = player.data.metadata.currentSeason;
  console.log(currentSeason);

  const csUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/EKA%20Luminous/segments/playlist?season=${currentSeason}`;
  const { stdout: data1 } = await execAsync(
    `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${csUrl}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  const currentSeasonData = JSON.parse(data1);

  var lastSeason = currentSeason - 1;
  const lsUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/EKA%20Luminous/segments/playlist?season=${lastSeason}`;
  const { stdout: data2 } = await execAsync(
    `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${lsUrl}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  const lastSeasonData = JSON.parse(data2);

  var thirdSeason = currentSeason - 2;
  const tsUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/EKA%20Luminous/segments/playlist?season=${thirdSeason}`;
  const { stdout: data3 } = await execAsync(
    `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${tsUrl}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  const thirdSeasonData = JSON.parse(data3);

  const { twosGames, threesGames } = countGamesPlayed(
    currentSeasonData.data,
    lastSeasonData.data,
    thirdSeasonData.data
  );

  // TODO: turn below into return able statements
  if (twosGames >= 100 || threesGames >= 100) {
    console.log("100 games in one mode surpassed!");
  }
  if (twosGames + threesGames >= 350) {
    console.log("350 games in 3 seasons surpassed!");
  }

  // console.log(Object.keys(graph));
  // console.log(Object.keys(graph.data || {}));

  var twosGraph = getGraphPeak(graph, 11);
  console.log("Twos Graph Peak " + twosGraph);
  var threesGraph = getGraphPeak(graph, 13);
  console.log("Threes Graph Peak " + threesGraph);
  var twosPeak = getPagePeak(player.data, 11);
  console.log("Twos Page Peak " + twosPeak);
  var threesPeak = getPagePeak(player.data, 13);
  console.log("Threes Page Peak " + threesPeak);

  //Final Calculations

  var twos = twosGraph >= twosPeak ? twosGraph : twosPeak;
  var threes = threesGraph >= threesPeak ? threesGraph : threesPeak;
  var sal = twos >= threes ? twos : threes;

  console.log(
    `\nEKA%20Luminous Peaks\n2s: ${twos}\n3s: ${threes}\n\nRaw Salary: ${sal}`
  );
}

pullMMR();

const { firefox } = require("playwright");

async function scrapeWithPlaywright() {
  const browser = await firefox.launch({
    headless: false, // Watch it work
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0",
  });

  const page = await context.newPage();

  const usernames = ["FrogDrivesCar"];
  const results = [];

  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    console.log(`\n[${i + 1}/${usernames.length}] Fetching ${username}...`);

    try {
      // Visit tracker page first
      await page.goto(
        `https://rocketleague.tracker.network/rocket-league/profile/epic/${encodeURIComponent(
          username
        )}/overview`,
        { waitUntil: "domcontentloaded", timeout: 30000 }
      );

      // Handle Cloudflare
      await handleCloudflare(page);

      // Now get the API data
      const apiUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/${encodeURIComponent(
        username
      )}/segments/playlist?season=30`;

      await page.goto(apiUrl, { waitUntil: "domcontentloaded" });

      const jsonText = await page.textContent("body");
      const data = JSON.parse(jsonText);

      results.push({ username, success: true, data });
      console.log(`✓ Success`);
    } catch (error) {
      results.push({ username, success: false, error: error.message });
      console.log(`✗ Failed: ${error.message}`);
    }

    // Rate limiting: wait between requests
    if (i < usernames.length - 1) {
      console.log("Waiting 60s before next request...");
      await page.waitForTimeout(60000);
    }
  }

  await browser.close();
  return results;
}

// Helper function
async function handleCloudflare(page) {
  try {
    const checkbox = await page.waitForSelector('input[type="checkbox"]', {
      timeout: 5000,
    });
    if (checkbox) {
      await checkbox.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    // No Cloudflare
  }
}

// Run
scrapeWithPlaywright().then((results) => {
  console.log("\n=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
});
