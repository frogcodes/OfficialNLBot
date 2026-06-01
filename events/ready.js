const { Events } = require("discord.js");
const { enrollmentTracker } = require("../utils/enrollmentTracker.js");
const { startLeaderboardUpdater } = require("../commands/util/leaderboard.js");

async function cacheGuildMembers(guild) {
  let lastMemberId = undefined;
  let totalFetched = 0;

  while (true) {
    const options = { limit: 1000 };
    if (lastMemberId) options.after = lastMemberId;

    const fetchedMembers = await guild.members.fetch(options);
    totalFetched += fetchedMembers.size;

    if (fetchedMembers.size < 1000) break;
    lastMemberId = fetchedMembers.last().id;

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return totalFetched;
}

const GUILD_ID = process.env.guildId;
const ONE_YEAR_ROLE_ID = "1317686453685456967";
module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ ${client.user.username} is online.`);
    client.user.setActivity("Serving Nature League since 1999!");
    client.users.send("351480764602515487", "I am now online!");

    // Cache members on startup (do this in background)
    for (const guild of client.guilds.cache.values()) {
      console.log(
        `Starting member cache for: ${guild.name} (${guild.memberCount} members)`,
      );

      // Don't await - let it run in background
      cacheGuildMembers(guild)
        .then(() => {
          console.log(
            `✅ Finished caching ${guild.name}: ${guild.members.cache.size} members`,
          );
        })
        .catch((err) => {
          console.error(`❌ Failed to cache ${guild.name}:`, err.message);
        });
    }

    console.log("✅ Year Check Scheduler started.");

    //startLeaderboardUpdater(client);

    const checkAnniversaries = async () => {
      const guild = client.guilds.cache.get(GUILD_ID);
      if (!guild) {
        console.error("Guild not found");
        return;
      }

      await enrollmentTracker.initialize();

      try {
        await guild.members.fetch(); // Ensure member cache is populated

        const now = Date.now();
        let givenCount = 0;

        for (const [id, member] of guild.members.cache) {
          if (member.user.bot) continue;

          const joinTimestamp = member.joinedTimestamp;
          if (!joinTimestamp) continue;

          const oneYearInMs = 1000 * 60 * 60 * 24 * 365;
          const hasBeenYear = now - joinTimestamp >= oneYearInMs;

          const hasRole = member.roles.cache.has(ONE_YEAR_ROLE_ID);

          if (hasBeenYear && !hasRole) {
            await member.roles.add(ONE_YEAR_ROLE_ID);
            console.log(`🎉 Gave 1-Year role to ${member.user.tag}`);
            givenCount++;
          }
        }

        if (givenCount > 0) {
          console.log(
            `✅ Assigned 1-Year role to ${givenCount} member(s) in ${guild.name}.`,
          );
        }
      } catch (err) {
        console.error(
          `❌ Failed checking 1-year roles in guild ${guild.name}:`,
          err,
        );
      }
    };

    // Run immediately on bot start
    checkAnniversaries();
    scheduleMidnightCheck(client);

    // Then every 24 hours
    setInterval(checkAnniversaries, 1000 * 60 * 60 * 24); // 24 hrs
  },
};

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  guildId: "1181050438750060584",

  // The RFA role ID that marks players as Restricted Free Agents
  rfaRoleId: "1198452739378786324",

  // Map each tier role ID → the corresponding FA role ID
  // Add as many tiers as you need
  tierToFaRole: {
    1181050438896844812: "1181050438787792918", //apex
    1181054433866551347: "1181054413071196232", //alpha
    1181050438896844810: "1181050438787792917", //beta
    1181054439134593064: "1181054419714977933", //delta
    1181050438880071698: "1181050438771019805", //omega
  },

  // Optional: channel ID to log releases (set to null to disable)
  logChannelId: "1202051037687726112",
};
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Returns today's date as "MM/DD" (e.g. "02/23")
 */
function getTodayTag() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/**
 * Milliseconds until the next midnight (00:00:00 local time)
 */
function msUntilMidnight() {
  const now = new Date();
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const nyMidnight = new Date(nyNow);
  nyMidnight.setHours(24, 0, 0, 0);
  return nyMidnight - nyNow;
}

/**
 * Core logic: scan all members with the RFA role and release those whose
 * nickname contains "RFA MM/DD" matching today's date.
 */
async function checkAndReleaseRFA(client) {
  const todayTag = getTodayTag();
  console.log(`[RFA Check] Running check for date tag: RFA ${todayTag}`);

  const guild = await client.guilds.fetch(CONFIG.guildId);
  await guild.members.fetch(); // cache all members

  const rfaRole = guild.roles.cache.get(CONFIG.rfaRoleId);
  if (!rfaRole) {
    console.error(
      "[RFA Check] RFA role not found! Check your rfaRoleId config.",
    );
    return;
  }

  const logChannel = CONFIG.logChannelId
    ? guild.channels.cache.get(CONFIG.logChannelId)
    : null;

  const releasedPlayers = [];

  for (const [, member] of rfaRole.members) {
    const nickname = member.nickname || member.user.username;

    // Match "RFA MM/DD" anywhere in the nickname (case-insensitive)
    const rfaPattern = new RegExp(
      `RFA\\s*${todayTag.replace("/", "\\/")}`,
      "i",
    );
    if (!rfaPattern.test(nickname)) continue;

    console.log(`[RFA Check] Releasing: ${nickname} (${member.user.tag})`);

    try {
      // 1. Update nickname: replace "RFA MM/DD" with "FA"
      const newNickname = nickname.replace(rfaPattern, "FA");
      await member.setNickname(newNickname);

      // 2. Remove the RFA role
      await member.roles.remove(CONFIG.rfaRoleId);

      // 3. Find the member's tier role and add the matching FA role
      let faRoleAdded = false;
      for (const [tierRoleId, faRoleId] of Object.entries(
        CONFIG.tierToFaRole,
      )) {
        if (member.roles.cache.has(tierRoleId)) {
          await member.roles.add(faRoleId);
          faRoleAdded = true;
          console.log(`  → Added FA role for tier ${tierRoleId}`);
          break;
        }
      }

      if (!faRoleAdded) {
        console.warn(`  ⚠ No matching tier role found for ${member.user.tag}`);
      }

      releasedPlayers.push(`**${newNickname}** (${member.user.tag})`);
    } catch (err) {
      console.error(`[RFA Check] Error processing ${member.user.tag}:`, err);
    }
  }

  // 4. Log results to the log channel
  if (logChannel && releasedPlayers.length > 0) {
    await logChannel.send(
      `📋 **RFA → FA Release — ${todayTag}**\n` +
        `The following players have been released to Free Agency:\n` +
        releasedPlayers.map((p) => `• ${p}`).join("\n"),
    );
  } else if (logChannel) {
    await logChannel.send(
      `📋 **RFA → FA Check — ${todayTag}**: No players released today.`,
    );
  }

  console.log(
    `[RFA Check] Done. Released ${releasedPlayers.length} player(s).`,
  );
}

/**
 * Schedule the check to run every day at midnight.
 */
function scheduleMidnightCheck(client) {
  const delay = msUntilMidnight();
  console.log(
    `[Scheduler] Next RFA check in ${Math.round(delay / 60000)} minutes (at midnight).`,
  );

  setTimeout(() => {
    checkAndReleaseRFA(client);
    // After the first midnight hit, repeat every 24 hours
    setInterval(() => checkAndReleaseRFA(client), 24 * 60 * 60 * 1000);
  }, delay);
}
