const { Events } = require("discord.js");
const {
  refreshSchedulingControlMessage,
} = require("../utils/scheduling/controlMessage.js");
const { getAvailabilitySession } = require("../utils/scheduling/stateStore.js");

// Statuses where the control panel still offers actions worth keeping in view.
// Once a match is CONFIRMED the panel is just a disabled button, so we stop
// bumping it to avoid needless churn.
const ACTIVE_STATUSES = new Set([
  "COLLECTING_AVAILABILITY",
  "AWAITING_AVAILABILITY",
  "OVERLAP_FOUND",
  "OVERLAP_PROPOSED",
  "NO_OVERLAP",
  "MANUAL_PROPOSED",
]);

// Coalesce bursts of chat per thread so the panel is re-posted at most once per
// quiet window instead of on every message, which keeps us clear of Discord's
// per-channel rate limits while still landing the panel at the bottom.
const REPOST_DEBOUNCE_MS = 1500;
const pendingReposts = new Map();

function scheduleRepost(threadChannel, threadId) {
  const existing = pendingReposts.get(threadId);
  if (existing) {
    clearTimeout(existing);
  }

  pendingReposts.set(
    threadId,
    setTimeout(async () => {
      pendingReposts.delete(threadId);

      // Re-check on the trailing edge in case the match was confirmed (or the
      // session cleared) while people were still chatting.
      const session = getAvailabilitySession(threadId);
      if (!session || !ACTIVE_STATUSES.has(session.status)) {
        return;
      }

      try {
        await refreshSchedulingControlMessage(threadChannel, threadId);
      } catch (error) {
        console.error(
          `Failed to bump scheduling control panel in thread ${threadId}:`,
          error,
        );
      }
    }, REPOST_DEBOUNCE_MS),
  );
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Only real user chat should bump the panel. Skipping bot/system messages
    // also prevents an infinite loop with the panel the bot re-posts.
    if (message.author?.bot || message.system) {
      return;
    }

    if (!message.channel?.isThread?.()) {
      return;
    }

    const threadId = message.channelId;
    const session = getAvailabilitySession(threadId);

    if (!session || !ACTIVE_STATUSES.has(session.status)) {
      return;
    }

    scheduleRepost(message.channel, threadId);
  },
};
