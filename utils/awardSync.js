// utils/awardSync.js
// Handles award role assignment and nickname emoji enforcement.
//
// Exports:
//   syncMemberAwards(member)      — sync one member (called on join from welcome.js)
//   syncAllMemberAwards(guild)    — sync every member in the guild
//   startAwardScheduler(client)   — call once from ready.js; runs on startup + every 7 days

const path = require("path");
const fs = require("fs");

const awardsPath = path.join(__dirname, "../data/awards.json");

function loadAwards() {
  return JSON.parse(fs.readFileSync(awardsPath, "utf8")).awards;
}

// Determines the emoji suffix a member should have based on their award roles.
// awardRoleIdsToAdd: role IDs being added this run (not yet reflected in member.roles.cache)
function buildEmojiSuffix(awards, memberRoles, awardRoleIdsToAdd = []) {
  let stars = 0;
  let trophies = 0;

  for (const award of awards) {
    const hasRole =
      memberRoles.cache.has(award.roleId) ||
      awardRoleIdsToAdd.includes(award.roleId);
    if (!hasRole) continue;

    if (award.emoji === "🌟") stars++;
    else if (award.emoji === "🏆") trophies++;
  }

  if (stars === 0 && trophies === 0) return "";
  return " " + "🌟".repeat(stars) + "🏆".repeat(trophies);
}

/**
 * Sync award roles and nickname emoji for a single GuildMember.
 * Safe to call on every join — bots are skipped automatically.
 *
 * @param {GuildMember} member
 * @returns {{ rolesAdded: string[], nicknameFixed: boolean }}
 */
async function syncMemberAwards(member) {
  if (member.user.bot) return { rolesAdded: [], nicknameFixed: false };

  const awards = loadAwards();
  const rolesAdded = [];

  // 1. Assign any missing award roles this member should have
  for (const award of awards) {
    if (!award.members.includes(member.id)) continue;
    if (member.roles.cache.has(award.roleId)) continue;

    try {
      await member.roles.add(award.roleId);
      rolesAdded.push(award.roleId);
      console.log(
        `[Awards] Gave role ${award.roleId} (${award.description}) to ${member.user.tag}`
      );
    } catch (err) {
      console.error(
        `[Awards] Failed to add role ${award.roleId} to ${member.user.tag}: ${err.message}`
      );
    }
  }

  // 2. Build the correct emoji suffix (includes newly assigned roles)
  const correctSuffix = buildEmojiSuffix(awards, member.roles, rolesAdded);

  // 3. Strip existing award emojis from nickname and re-append correct suffix
  const currentNick = member.nickname || member.user.username;
  let cleaned = currentNick.replace(/🌟/g, "").replace(/🏆/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const correctNick = cleaned + correctSuffix;

  let nicknameFixed = false;
  if (correctNick !== currentNick) {
    try {
      await member.setNickname(correctNick);
      nicknameFixed = true;
      console.log(
        `[Awards] Fixed nickname for ${member.user.tag}: "${currentNick}" → "${correctNick}"`
      );
    } catch (err) {
      // Expected for server owner and members with higher roles than the bot
      console.warn(
        `[Awards] Could not set nickname for ${member.user.tag}: ${err.message}`
      );
    }
  }

  return { rolesAdded, nicknameFixed };
}

/**
 * Scan every non-bot member of the guild and sync their awards.
 * Includes a 1-second delay between members that had changes to avoid rate limits.
 *
 * @param {Guild} guild
 * @returns {{ rolesAssigned: number, nicknamesFixed: number, errors: number }}
 */
async function syncAllMemberAwards(guild) {
  await guild.members.fetch();

  let rolesAssigned = 0;
  let nicknamesFixed = 0;
  let errors = 0;

  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;

    try {
      const result = await syncMemberAwards(member);
      rolesAssigned += result.rolesAdded.length;
      if (result.nicknameFixed) nicknamesFixed++;

      // Rate-limit guard when changes were made
      if (result.rolesAdded.length > 0 || result.nicknameFixed) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      errors++;
      console.error(`[Awards] Error syncing ${member.user.tag}: ${err.message}`);
    }
  }

  return { rolesAssigned, nicknamesFixed, errors };
}

/**
 * Call this once from events/ready.js execute().
 * Runs an immediate full sync, then repeats every 7 days.
 *
 * @param {Client} client
 */
function startAwardScheduler(client) {
  const GUILD_ID = process.env.guildId;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const runWeeklySync = async () => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error("[Awards Scheduler] Guild not found.");
      return;
    }

    console.log("[Awards Scheduler] Running weekly award sync...");
    const result = await syncAllMemberAwards(guild);
    console.log(
      `[Awards Scheduler] Done — Roles assigned: ${result.rolesAssigned}, Nicknames fixed: ${result.nicknamesFixed}, Errors: ${result.errors}`
    );
  };

  runWeeklySync();
  setInterval(runWeeklySync, SEVEN_DAYS_MS);

  console.log("[Awards Scheduler] Weekly award sync scheduled (every 7 days).");
}

module.exports = { syncMemberAwards, syncAllMemberAwards, startAwardScheduler };
