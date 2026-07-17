const { SlashCommandBuilder } = require("discord.js");
const { isSchedulingStaff } = require("../../utils/scheduling/service.js");
const { loadSchedule } = require("../../utils/scheduling/scheduleStore.js");
const { loadSchedulingState } = require("../../utils/scheduling/stateStore.js");
const {
  formatScheduledDateForDiscord,
} = require("../../utils/scheduling/dateUtils.js");

const MESSAGE_CHUNK_LIMIT = 1900;

function submittedCount(session) {
  return Object.values(session?.availability ?? {}).filter(
    (captain) => captain.submittedAt,
  ).length;
}

function expectedCount(session) {
  return session?.teamRoleIds?.length || 2;
}

// Maps a tier's schedule + live session state to a one-line status. `bucket` is
// used for the summary tally; `text` is the per-match line.
function describeStatus(tierData, session) {
  if (tierData.scheduled) {
    const when = tierData.scheduledTimestamp
      ? formatScheduledDateForDiscord({ timestamp: tierData.scheduledTimestamp })
      : tierData.scheduledDateTime || "scheduled";
    return { bucket: "scheduled", text: `✅ ${when}` };
  }

  if (!tierData.threadID) {
    return { bucket: "nothread", text: "⚪ No thread created" };
  }

  if (!session) {
    return { bucket: "collecting", text: "🟡 Awaiting availability" };
  }

  switch (session.status) {
    case "OVERLAP_FOUND":
      return { bucket: "inprogress", text: "🟠 Overlap found — home picks a time" };
    case "OVERLAP_PROPOSED":
      return {
        bucket: "inprogress",
        text: "🟠 Time proposed — awaiting other captain",
      };
    case "MANUAL_PROPOSED":
      return {
        bucket: "inprogress",
        text: "🟠 Manual time proposed — awaiting agreement",
      };
    case "NO_OVERLAP":
      return { bucket: "nooverlap", text: "🔴 No overlap — needs a manual time" };
    case "CONFIRMED":
      return { bucket: "scheduled", text: "✅ Confirmed" };
    case "COLLECTING_AVAILABILITY":
    case "AWAITING_AVAILABILITY":
    default:
      return {
        bucket: "collecting",
        text: `🟡 Availability ${submittedCount(session)}/${expectedCount(session)} submitted`,
      };
  }
}

function chunkLines(lines, limit) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-status")
    .setDescription("Show scheduling status for every match in a week")
    .addIntegerOption((option) =>
      option
        .setName("week-number")
        .setDescription("The week number to report on")
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!isSchedulingStaff(interaction)) {
      return await interaction.reply({
        content: "Only scheduling staff or admins can view scheduling status.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const weekNum = interaction.options.getInteger("week-number");
    const schedule = loadSchedule();
    const week = schedule.weeks?.[weekNum];

    if (!week) {
      return await interaction.editReply(`No data found for week ${weekNum}.`);
    }

    const sessions = loadSchedulingState().sessions ?? {};
    const tally = {
      scheduled: 0,
      inprogress: 0,
      collecting: 0,
      nooverlap: 0,
      nothread: 0,
    };
    let total = 0;

    const lines = [`**📅 Week ${weekNum} Scheduling Status**`];

    for (const gameday of week.gamedays ?? []) {
      for (const match of gameday.matches ?? []) {
        const [team1, team2] = match.teams;
        lines.push("", `**GD ${gameday.gamedayNum} — ${team1} vs ${team2}**`);

        for (const [tier, tierData] of Object.entries(match.tiers ?? {})) {
          total += 1;
          const session = tierData.threadID
            ? sessions[tierData.threadID]
            : null;
          const status = describeStatus(tierData, session);
          tally[status.bucket] += 1;
          lines.push(`• ${tier}: ${status.text}`);
        }
      }
    }

    lines.push(
      "",
      "**Summary**",
      `✅ ${tally.scheduled} scheduled · 🟠 ${tally.inprogress} in progress · ` +
        `🟡 ${tally.collecting} collecting · 🔴 ${tally.nooverlap} no overlap · ` +
        `⚪ ${tally.nothread} no thread — ${total} total`,
    );

    const chunks = chunkLines(lines, MESSAGE_CHUNK_LIMIT);
    await interaction.editReply(chunks[0]);

    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, ephemeral: true });
    }
  },
};
