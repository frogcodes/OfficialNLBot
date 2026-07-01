const { EmbedBuilder } = require("discord.js");
const { getAvailabilitySession, markSchedulingFinalized } = require("./service.js");
const {
  buildScheduledDateTime,
  formatScheduledDateForDiscord,
  getWeekStartDateFromIso,
} = require("./dateUtils.js");
const {
  findMatchByThreadId,
  mutateSchedule,
} = require("./scheduleStore.js");

const SCHEDULED_CHANNEL_ID = "1291170555856162887";

function getSessionWeekStartDate(session) {
  if (session?.weekStartDate) {
    return session.weekStartDate;
  }

  if (session?.createdAt) {
    return getWeekStartDateFromIso(session.createdAt);
  }

  return getWeekStartDateFromIso(new Date().toISOString());
}

async function getChannel(guild, channelId) {
  if (!guild?.channels) {
    return null;
  }

  return (
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function sendScheduledAnnouncement({ guild, match, scheduledDate }) {
  const scheduledChannel = await getChannel(guild, SCHEDULED_CHANNEL_ID);

  if (!scheduledChannel?.send) {
    return null;
  }

  const embed = new EmbedBuilder()
    .setTitle("📅 Match Scheduled!")
    .setDescription(`**${match.teams[0]}** vs **${match.teams[1]}**`)
    .addFields(
      {
        name: "Gameday",
        value: String(match.gamedayNum),
        inline: true,
      },
      { name: "Tier", value: match.tier, inline: true },
      {
        name: "Date & Time",
        value: formatScheduledDateForDiscord(scheduledDate),
        inline: false,
      },
    )
    .setColor(0x00ff00)
    .setTimestamp();

  return await scheduledChannel.send({ embeds: [embed] });
}

async function deleteScheduledAnnouncement(guild, messageId) {
  if (!messageId) {
    return;
  }

  const scheduledChannel = await getChannel(guild, SCHEDULED_CHANNEL_ID);

  if (!scheduledChannel?.messages?.fetch) {
    return;
  }

  const message = await scheduledChannel.messages
    .fetch(messageId)
    .catch(() => null);

  if (!message) {
    return;
  }

  await message.delete().catch((error) => {
    console.error("Error deleting scheduled match announcement:", error);
  });
}

async function removeUnscheduledMarker(thread) {
  if (!thread?.setName || !thread.name?.includes("🔴")) {
    return;
  }

  const newName = thread.name.replace("🔴", "").trim();
  await thread.setName(newName);
}

async function finalizeScheduledMatchFromThread({
  guild,
  thread,
  threadId,
  day,
  time,
  source,
  selectedByUserId,
}) {
  const session = getAvailabilitySession(threadId);
  const weekStartDate = getSessionWeekStartDate(session);
  let scheduledDate;

  try {
    scheduledDate = buildScheduledDateTime({
      day,
      time,
      weekStartDate,
    });
  } catch (error) {
    console.error("Error building scheduled calendar date:", error);
    return { ok: false, reason: error.message };
  }

  const timestamp = new Date().toISOString();
  let applied;

  // Apply the scheduling fields under the schedule lock, reading fresh so we
  // never overwrite a concurrent change to a different match.
  try {
    applied = await mutateSchedule((schedule) => {
      const matchInfo = findMatchByThreadId(schedule, threadId);

      if (!matchInfo) {
        return { ok: false };
      }

      const { tierData } = matchInfo;
      const previousAnnouncementId = tierData.announcementMessageId;

      tierData.scheduled = true;
      tierData.scheduledDay = day;
      tierData.scheduledTime = time;
      tierData.scheduledDate = scheduledDate.date;
      tierData.scheduledDateTime = scheduledDate.dateTime;
      tierData.scheduledTimestamp = scheduledDate.timestamp;
      tierData.scheduledTimeZone = scheduledDate.timeZone;
      tierData.scheduledSource = source;
      tierData.scheduledByUserId = selectedByUserId;
      tierData.scheduledAt = timestamp;
      tierData.date = scheduledDate.dateTime;

      return {
        ok: true,
        previousAnnouncementId,
        match: {
          teams: matchInfo.match.teams,
          gamedayNum: matchInfo.gameday.gamedayNum,
          tier: matchInfo.tier,
          weekNumber: matchInfo.week.weekNumber,
        },
      };
    });
  } catch (error) {
    console.error("Error writing schedule.json:", error);
    return { ok: false, reason: "Error saving schedule data." };
  }

  if (!applied.ok) {
    return {
      ok: false,
      reason: "Could not find the schedule match for this thread.",
    };
  }

  const { match, previousAnnouncementId } = applied;

  markSchedulingFinalized(threadId, {
    date: scheduledDate.date,
    dateTime: scheduledDate.dateTime,
    day,
    display: scheduledDate.display,
    gamedayNum: match.gamedayNum,
    selectedByUserId,
    source,
    teams: match.teams,
    tier: match.tier,
    time,
    timeZone: scheduledDate.timeZone,
    timestamp: scheduledDate.timestamp,
    weekNumber: match.weekNumber,
  });

  // Retract any announcement from a previous scheduling of this match (e.g. a
  // staff override) before posting the fresh one.
  await deleteScheduledAnnouncement(guild, previousAnnouncementId);

  const announcement = await sendScheduledAnnouncement({
    guild,
    match,
    scheduledDate,
  }).catch((error) => {
    console.error("Error sending scheduled match announcement:", error);
    return null;
  });

  if (announcement?.id) {
    try {
      await mutateSchedule((schedule) => {
        const matchInfo = findMatchByThreadId(schedule, threadId);
        if (matchInfo) {
          matchInfo.tierData.announcementMessageId = announcement.id;
        }
      });
    } catch (error) {
      console.error("Error saving announcement message id:", error);
    }
  }

  await removeUnscheduledMarker(thread).catch((error) => {
    console.error("Error renaming scheduled match thread:", error);
  });

  if (thread?.send) {
    await thread.send(
      [
        `**${match.tier}** match successfully scheduled.`,
        `Final time: **${scheduledDate.display}**`,
      ].join("\n"),
    ).catch((error) => {
      console.error("Error sending scheduled match thread message:", error);
    });
  }

  return {
    ok: true,
    match,
    scheduledDate,
  };
}

async function resetScheduledMatchByThreadId(threadId) {
  let result;

  try {
    result = await mutateSchedule((schedule) => {
      const matchInfo = findMatchByThreadId(schedule, threadId);

      if (!matchInfo) {
        return { ok: false };
      }

      const { tierData } = matchInfo;
      const announcementMessageId = tierData.announcementMessageId;
      tierData.scheduled = false;
      for (const field of [
        "scheduledDay",
        "scheduledTime",
        "scheduledDate",
        "scheduledDateTime",
        "scheduledTimestamp",
        "scheduledTimeZone",
        "scheduledSource",
        "scheduledByUserId",
        "scheduledAt",
        "date",
        "announcementMessageId",
      ]) {
        delete tierData[field];
      }

      return { ok: true, announcementMessageId };
    });
  } catch (error) {
    console.error("Error writing schedule.json:", error);
    return { ok: false, reason: "Error saving schedule data." };
  }

  if (!result.ok) {
    return {
      ok: false,
      reason: "Could not find the schedule match for this thread.",
    };
  }

  return { ok: true, announcementMessageId: result.announcementMessageId };
}

module.exports = {
  deleteScheduledAnnouncement,
  finalizeScheduledMatchFromThread,
  resetScheduledMatchByThreadId,
};
