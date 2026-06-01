const { firefox } = require("playwright");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const lastYearSeasonMin = 31;

class RocketLeagueTracker {
  constructor(options = {}) {
    this.headless = options.headless ?? true;
    this.timeout = options.timeout ?? 30000;
    this.rateLimitDelay = options.rateLimitDelay ?? 60000;
  }

  /**
   * Get the peak rating from graph data
   */
  getGraphPeak(graph, playlist) {
    let peak = 0;
    const playlistData = graph.data[playlist];

    if (!playlistData) return peak;

    for (const day of playlistData) {
      if (day.rating > peak) {
        peak = day.rating;
      }
    }
    return peak;
  }

  /**
   * Get peak rating from player page data
   */
  getPagePeak(playerData, playlist) {
    let peakRating = 0;
    let currentRating = 0;

    for (const segment of playerData.segments) {
      if (segment.attributes.playlistId == playlist) {
        if (
          segment.type == "peak-rating" &&
          segment.attributes.season >= lastYearSeasonMin
        ) {
          peakRating = segment.stats.peakRating?.value ?? 0;
        }
        if (
          segment.type == "playlist" &&
          segment.attributes.season >= lastYearSeasonMin
        ) {
          currentRating = segment.stats.rating?.value ?? 0;
        }
      }
    }
    return Math.max(currentRating, peakRating);
  }

  /**
   * Count games played from a single season's data
   */
  countGamesFromSeason(seasonData) {
    let twosGames = 0;
    let threesGames = 0;

    for (const playlist of seasonData) {
      if (playlist.attributes.playlistId == 11) {
        twosGames += playlist.stats.matchesPlayed.value;
      }
      if (playlist.attributes.playlistId == 13) {
        threesGames += playlist.stats.matchesPlayed.value;
      }
    }

    return {
      twos: twosGames,
      threes: threesGames,
      total: twosGames + threesGames,
    };
  }

  /**
   * Count games played across multiple seasons
   */
  countGamesPlayed(currentSeasonData, lastSeasonData, thirdSeasonData) {
    let twosGames = 0;
    let threesGames = 0;
    let currentTwos = 0;
    let currentThrees = 0;

    // Count current season
    for (const playlist of currentSeasonData) {
      if (playlist.attributes.playlistId == 11) {
        const games = playlist.stats.matchesPlayed.value;
        twosGames += games;
        currentTwos = games;
      }
      if (playlist.attributes.playlistId == 13) {
        const games = playlist.stats.matchesPlayed.value;
        threesGames += games;
        currentThrees = games;
      }
    }

    // Check if requirements met after current season
    if (
      twosGames + threesGames >= 350 &&
      (currentTwos >= 100 || currentThrees >= 100)
    ) {
      return { twosGames, threesGames, requirementsMet: true };
    }

    // Count last season
    for (const playlist of lastSeasonData) {
      if (playlist.attributes.playlistId == 11) {
        twosGames += playlist.stats.matchesPlayed.value;
      }
      if (playlist.attributes.playlistId == 13) {
        threesGames += playlist.stats.matchesPlayed.value;
      }
    }

    // Check if requirements met after last season
    if (
      twosGames + threesGames >= 350 &&
      (currentTwos >= 100 || currentThrees >= 100)
    ) {
      return { twosGames, threesGames, requirementsMet: true };
    }

    // Count third season
    for (const playlist of thirdSeasonData) {
      if (playlist.attributes.playlistId == 11) {
        twosGames += playlist.stats.matchesPlayed.value;
      }
      if (playlist.attributes.playlistId == 13) {
        threesGames += playlist.stats.matchesPlayed.value;
      }
    }

    // Final check
    const requirementsMet =
      twosGames + threesGames >= 350 &&
      (currentTwos >= 100 || currentThrees >= 100);

    return {
      currentTwos,
      currentThrees,
      twosGames,
      threesGames,
      requirementsMet,
    };
  }

  /**
   * Handle Cloudflare challenges
   */
  async handleCloudflare(page) {
    try {
      // Wait longer for checkbox to appear
      const checkbox = await page.waitForSelector('input[type="checkbox"]', {
        timeout: 10000,
      });

      if (checkbox) {
        console.log("[Cloudflare] Challenge detected, clicking checkbox...");
        await checkbox.click();

        // Wait longer for verification
        await page.waitForTimeout(8000);

        // Verify the challenge was completed by checking for success indicators
        const stillChallenged = await page.$('input[type="checkbox"]');
        if (stillChallenged) {
          console.log("[Cloudflare] Challenge may not have completed");
          await page.waitForTimeout(5000); // Wait a bit more
        } else {
          console.log("[Cloudflare] Challenge completed");
        }
      }
    } catch (e) {
      console.log("[Cloudflare] No challenge detected or timeout");
    }
  }

  /**
   * Fetch player data using Playwright (handles Cloudflare)
   */
  async fetchWithPlaywright(username, platform) {
    const browser = await firefox.launch({
      headless: this.headless,
    });

    const context = await browser.newContext();

    const page = await context.newPage();

    try {
      // Visit tracker page first to establish session
      await page.goto(
        `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodeURIComponent(
          username,
        )}/overview`,
        { waitUntil: "domcontentloaded", timeout: this.timeout },
      );

      await this.handleCloudflare(page);

      // Fetch main profile
      const profileUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
        username,
      )}`;
      await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
      const profileJson = await page.textContent("body");
      const playerData = JSON.parse(profileJson);

      if (!playerData.data || !playerData.data.metadata) {
        throw new Error("Invalid API response - player may not exist");
      }

      const playerId = playerData.data.metadata.playerId;
      const currentSeason = playerData.data.metadata.currentSeason;

      // Fetch MMR history
      const mmrHistoryUrl = `https://api.tracker.gg/api/v2/rocket-league/player-history/mmr/${playerId}`;
      await page.goto(mmrHistoryUrl, { waitUntil: "domcontentloaded" });
      const mmrJson = await page.textContent("body");
      const graphData = JSON.parse(mmrJson);

      // Fetch season data progressively (only fetch what's needed)
      const seasonData = {};

      // Always fetch current season
      const currentSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
        username,
      )}/segments/playlist?season=${currentSeason}`;
      await page.goto(currentSeasonUrl, { waitUntil: "domcontentloaded" });
      const currentSeasonJson = await page.textContent("body");
      seasonData.seasonCurrent = JSON.parse(currentSeasonJson);

      // Check if we need more seasons
      const currentGames = this.countGamesFromSeason(
        seasonData.seasonCurrent.data,
      );
      const needsMoreSeasons =
        currentGames.total < 350 ||
        (currentGames.twos < 100 && currentGames.threes < 100);

      if (needsMoreSeasons) {
        // Fetch last season
        const lastSeason = currentSeason - 1;
        const lastSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
          username,
        )}/segments/playlist?season=${lastSeason}`;
        await page.goto(lastSeasonUrl, { waitUntil: "domcontentloaded" });
        const lastSeasonJson = await page.textContent("body");
        seasonData.seasonLast = JSON.parse(lastSeasonJson);

        // Check if we need third season
        const totalGames = {
          twos:
            currentGames.twos +
            this.countGamesFromSeason(seasonData.seasonLast.data).twos,
          threes:
            currentGames.threes +
            this.countGamesFromSeason(seasonData.seasonLast.data).threes,
        };
        totalGames.total = totalGames.twos + totalGames.threes;

        const needsThirdSeason =
          totalGames.total < 350 ||
          (totalGames.twos < 100 && totalGames.threes < 100);

        if (needsThirdSeason) {
          // Fetch third season
          const thirdSeason = currentSeason - 2;
          const thirdSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
            username,
          )}/segments/playlist?season=${thirdSeason}`;
          await page.goto(thirdSeasonUrl, { waitUntil: "domcontentloaded" });
          const thirdSeasonJson = await page.textContent("body");
          seasonData.seasonThird = JSON.parse(thirdSeasonJson);
        }
      }

      await browser.close();

      return {
        playerData,
        graphData,
        seasonData,
        currentSeason,
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Fetch player data using curl (faster but may be blocked)
   */
  async fetchWithCurl(username, platform) {
    const profileUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
      username,
    )}`;

    console.log(`[API] Fetching profile: ${profileUrl}`);

    const { stdout: playerDataRaw } = await execAsync(
      `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${profileUrl}"`,
      { maxBuffer: 1024 * 1024 * 10 },
    );

    let playerData;
    try {
      playerData = JSON.parse(playerDataRaw);
    } catch (parseError) {
      throw new Error(
        "API returned invalid JSON - possible rate limit. Try again in a few minutes.",
      );
    }

    if (playerData.errors && playerData.errors.length > 0) {
      throw new Error(`API Error: ${playerData.errors[0].message}`);
    }

    if (!playerData.data || !playerData.data.metadata) {
      throw new Error("Invalid API response - player may not exist");
    }

    const playerId = playerData.data.metadata.playerId;
    const currentSeason = playerData.data.metadata.currentSeason;

    console.log(`[API] Found player ID: ${playerId}`);
    console.log(`[API] Current season: ${currentSeason}`);

    // Fetch MMR history
    const mmrHistoryUrl = `https://api.tracker.gg/api/v2/rocket-league/player-history/mmr/${playerId}`;
    const { stdout: graphDataRaw } = await execAsync(
      `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${mmrHistoryUrl}"`,
      { maxBuffer: 1024 * 1024 * 10 },
    );
    const graphData = JSON.parse(graphDataRaw);

    // Fetch season data progressively (only fetch what's needed)
    const seasonData = {};

    // Always fetch current season
    const currentSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
      username,
    )}/segments/playlist?season=${currentSeason}`;

    const { stdout: currentSeasonRaw } = await execAsync(
      `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${currentSeasonUrl}"`,
      { maxBuffer: 1024 * 1024 * 10 },
    );
    seasonData.seasonCurrent = JSON.parse(currentSeasonRaw);

    // Check if we need more seasons
    const currentGames = this.countGamesFromSeason(
      seasonData.seasonCurrent.data,
    );
    const needsMoreSeasons =
      currentGames.total < 350 ||
      (currentGames.twos < 100 && currentGames.threes < 100);

    if (needsMoreSeasons) {
      console.log(`[API] Current season insufficient, fetching last season...`);

      // Fetch last season
      const lastSeason = currentSeason - 1;
      const lastSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
        username,
      )}/segments/playlist?season=${lastSeason}`;

      const { stdout: lastSeasonRaw } = await execAsync(
        `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${lastSeasonUrl}"`,
        { maxBuffer: 1024 * 1024 * 10 },
      );
      seasonData.seasonLast = JSON.parse(lastSeasonRaw);

      // Check if we need third season
      const totalGames = {
        twos:
          currentGames.twos +
          this.countGamesFromSeason(seasonData.seasonLast.data).twos,
        threes:
          currentGames.threes +
          this.countGamesFromSeason(seasonData.seasonLast.data).threes,
      };
      totalGames.total = totalGames.twos + totalGames.threes;

      const needsThirdSeason =
        totalGames.total < 350 ||
        (totalGames.twos < 100 && totalGames.threes < 100);

      if (needsThirdSeason) {
        console.log(`[API] Still insufficient, fetching third season...`);

        // Fetch third season
        const thirdSeason = currentSeason - 2;
        const thirdSeasonUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
          username,
        )}/segments/playlist?season=${thirdSeason}`;

        const { stdout: thirdSeasonRaw } = await execAsync(
          `curl --max-time 15 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121" "${thirdSeasonUrl}"`,
          { maxBuffer: 1024 * 1024 * 10 },
        );
        seasonData.seasonThird = JSON.parse(thirdSeasonRaw);
      }
    }

    return {
      playerData,
      graphData,
      seasonData,
      currentSeason,
    };
  }

  /**
   * Calculate player stats and salary
   */
  calculateStats(username, fetchedData) {
    const { playerData, graphData, seasonData } = fetchedData;

    // Check account wins requirement
    const wins = playerData.data.segments[0].stats.wins.value;
    const winsNeeded = 1500 - wins;

    // Count games played - handle missing season data gracefully
    const emptySeasonData = [];
    const {
      currentTwos,
      currentThrees,
      twosGames, //total 2s
      threesGames, //total 3s
      requirementsMet,
    } = this.countGamesPlayed(
      seasonData.seasonCurrent?.data || emptySeasonData,
      seasonData.seasonLast?.data || emptySeasonData,
      seasonData.seasonThird?.data || emptySeasonData,
    );

    // if (!requirementsMet) {
    //   return {
    //     username,
    //     success: false,
    //     error: `game req`,
    //     games: {
    //       twos: currentTwos,
    //       threes: currentThrees,
    //       total: twosGames + threesGames,
    //       requirementsMet,
    //     },
    //   };
    // }

    // Calculate peaks
    const twosGraphPeak = this.getGraphPeak(graphData, 11);
    const threesGraphPeak = this.getGraphPeak(graphData, 13);
    const twosPagePeak = this.getPagePeak(playerData.data, 11);
    const threesPagePeak = this.getPagePeak(playerData.data, 13);

    const twosPeak = Math.max(twosGraphPeak, twosPagePeak);
    const threesPeak = Math.max(threesGraphPeak, threesPagePeak);
    const rawSalary = Math.max(twosPeak, threesPeak);

    if (winsNeeded > 0) {
      return {
        username,
        success: false,
        error: `Not enough account wins`,
        winsNeeded,
        peaks: {
          twos: twosPeak,
          threes: threesPeak,
        },
      };
    }
    return {
      username,
      success: requirementsMet,
      wins,
      games: {
        twos: currentTwos,
        threes: currentThrees,
        total: twosGames + threesGames,
        requirementsMet,
        seasonsFetched: {
          current: !!seasonData.seasonCurrent,
          last: !!seasonData.seasonLast,
          third: !!seasonData.seasonThird,
        },
      },
      peaks: {
        twos: twosPeak,
        threes: threesPeak,
        twosGraph: twosGraphPeak,
        threesGraph: threesGraphPeak,
        twosPage: twosPagePeak,
        threesPage: threesPagePeak,
      },
      rawSalary,
    };
  }

  /**
   * Main method to get player data - tries curl first, falls back to Playwright
   */
  async getPlayerStats(username, platform, useCurl) {
    console.log(`\n[Tracker] Fetching data for ${username}...`);

    let fetchedData;

    if (useCurl) {
      try {
        fetchedData = await this.fetchWithCurl(username, platform);
      } catch (error) {
        console.log(`[Tracker] Curl failed, falling back to Playwright...`);
        fetchedData = await this.fetchWithPlaywright(username, platform);
      }
    } else {
      try {
        fetchedData = await this.fetchWithPlaywright(username, platform);
      } catch (error) {
        // Return a skippable error object instead of throwing
        return {
          username: username,
          success: false,
          error: error.message || "Failed to fetch player data",
          skippable: true, // Mark as skippable
        };
      }
    }

    return this.calculateStats(username, fetchedData);
  }

  /**
   * Process multiple players
   */
  async getMultiplePlayerStats(usernames, useCurl = true) {
    const results = [];

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      console.log(`\n[${i + 1}/${usernames.length}] Processing ${username}...`);

      try {
        const stats = await this.getPlayerStats(username, useCurl);
        results.push(stats);

        if (stats.success) {
          console.log(`✓ Success - Raw Salary: ${stats.rawSalary}`);
        } else {
          console.log(`✗ ${stats.error}`);
        }
      } catch (error) {
        results.push({
          username,
          success: false,
          error: error.message,
        });
        console.log(`✗ Failed: ${error.message}`);
      }

      // Rate limiting between requests
      if (i < usernames.length - 1) {
        console.log(
          `Waiting ${this.rateLimitDelay / 1000}s before next request...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.rateLimitDelay),
        );
      }
    }

    return results;
  }
}

module.exports = RocketLeagueTracker;
