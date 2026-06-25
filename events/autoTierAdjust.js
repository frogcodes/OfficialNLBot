// Every 24 hours: Check playerMMRs.json and update each player's tier roles based on their current salary
const { Events } = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const tierRoles = {
  apex: "1181050438896844812",
  alpha: "1181054433866551347",
  beta: "1181050438896844810",
  delta: "1181054439134593064",
  omega: "1181050438880071698",
};

const tierFAroles = {
  apex: "1181050438787792918",
  alpha: "1181054413071196232",
  beta: "1181050438787792917",
  delta: "1181054419714977933",
  omega: "1181050438771019805",
};

const GUILD_ID = process.env.guildId;

/**
 * Determines the tier based on salary value
 * @param {number} sal - The salary value
 * @returns {Promise<string>} The tier name (omega, delta, beta, alpha, or apex)
 */
async function getTier(sal) {
  try {
    const filePath = path.join(__dirname, "../data/ranges.json");
    const jsonData = await fs.promises.readFile(filePath, "utf8");
    const data = JSON.parse(jsonData);
    const { delta, beta, alpha, apex, omega } = data;

    // Validate that ranges exist
    if (
      delta === undefined ||
      beta === undefined ||
      alpha === undefined ||
      apex === undefined
    ) {
      throw new Error("Missing tier ranges in ranges.json");
    }

    // Return tier based on salary ranges
    if (sal < delta) return "omega";
    else if (sal < beta) return "delta";
    else if (sal < alpha) return "beta";
    else if (sal < apex) return "alpha";
    else return "apex";
  } catch (err) {
    console.error("Error getting tier:", err);
    throw err; // Re-throw to handle in calling function
  }
}

/**
 * Adds a delay between operations to avoid rate limiting
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function to adjust tier roles for all players
 * @param {Client} client - Discord client instance
 */
async function TierAdjustment(client) {
  console.log("Starting tier adjustment process...");

  // Validate guild
  if (!GUILD_ID) {
    console.error("Error: GUILD_ID environment variable not set");
    return;
  }

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error(`Error: Guild with ID ${GUILD_ID} not found`);
    return;
  }

  const filePath = path.join(__dirname, "../data/playerMMRs.json");

  try {
    // Read player data
    const file = await fs.promises.readFile(filePath, "utf8");
    let data = JSON.parse(file);

    if (!data || Object.keys(data).length === 0) {
      console.log("No players found in playerMMRs.json");
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    console.log(`Processing ${Object.keys(data).length} players...`);

    // Process each player
    for (const [playerId, salValue] of Object.entries(data)) {
      try {
        // Validate salary value
        if (typeof salValue !== "number" || isNaN(salValue)) {
          console.warn(
            `Invalid salary value for player ${playerId}: ${salValue}`,
          );
          errorCount++;
          continue;
        }

        // Fetch member
        const member = await guild.members.fetch(playerId).catch(() => null);
        if (!member) {
          skippedCount++;
          continue; // Player not in server
        }

        // Get current tier roles
        const memberTierRoles = Object.values(tierRoles).filter((roleId) =>
          member.roles.cache.has(roleId),
        );

        const memberFaRoles = Object.values(tierFAroles).filter((roleId) =>
          member.roles.cache.has(roleId),
        );

        // Determine correct tier
        const tier = await getTier(salValue);
        const correctTierRoleId = tierRoles[tier];
        const correctFaRoleId = tierFAroles[tier];

        // Check if roles need updating
        const hasCorrectTierRole = member.roles.cache.has(correctTierRoleId);
        const hasCorrectFaRole = member.roles.cache.has(correctFaRoleId);

        if (!hasCorrectTierRole || !hasCorrectFaRole) {
          // Remove incorrect tier roles
          if (memberTierRoles.length > 0) {
            await member.roles.remove(memberTierRoles);
          }
          if (memberFaRoles.length > 0) {
            await member.roles.remove(memberFaRoles);
          }

          // Add correct tier roles
          await member.roles.add([correctTierRoleId, correctFaRoleId]);

          console.log(
            `Updated ${member.user.tag} (${playerId}) to ${tier} tier (sal: ${salValue})`,
          );
          updatedCount++;

          // Small delay to avoid rate limiting
          await delay(500);
        }
      } catch (err) {
        console.error(`Error processing player ${playerId}:`, err.message);
        errorCount++;
      }
    }

    console.log(
      `Tier adjustment complete: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`,
    );
  } catch (err) {
    console.error("Error during tier adjustment:", err);
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log("Tier adjustment system initialized");

    // Run immediately on startup
    try {
      await TierAdjustment(client);
    } catch (err) {
      console.error("Error during initial tier adjustment:", err);
    }

    // Schedule daily at midnight (00:00)
    cron.schedule(
      "0 0 * * *",
      async () => {
        console.log("Running scheduled tier adjustment...");
        try {
          await TierAdjustment(client);
        } catch (err) {
          console.error("Error during scheduled tier adjustment:", err);
        }
      },
      {
        scheduled: true,
        timezone: "America/New_York", // Adjust to your timezone
      },
    );

    console.log("Tier adjustment scheduled to run daily at midnight");
  },
};
