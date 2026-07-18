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

// The panel used to re-post on EVERY message, and because its text contains team
// role mentions, each re-post pinged the teams again — spammy. Instead we bump it
// on activity at most once per this interval, so an unscheduled thread gets a
// periodic nudge (and at most one ping per window) rather than a ping per message.
// Note: the panel still refreshes IMMEDIATELY on real scheduling actions
// (submit/propose/confirm) via the interaction handlers — this throttle only
// governs the "keep it at the bottom" chat bumps. Tune this one value to taste.
const STICKY_REPOST_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

const lastBumpAt = new Map(); // threadId -> timestamp of last chat-driven bump

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

    // Throttle: only bump if it's been at least a full window since the last one.
    const now = Date.now();
    const last = lastBumpAt.get(threadId) ?? 0;
    if (now - last < STICKY_REPOST_INTERVAL_MS) {
      return;
    }
    lastBumpAt.set(threadId, now);

    try {
      // silent: the 12h bump re-posts the panel but never pings the teams.
      await refreshSchedulingControlMessage(message.channel, threadId, {
        silent: true,
      });
    } catch (error) {
      console.error(
        `Failed to bump scheduling control panel in thread ${threadId}:`,
        error,
      );
    }
  },
};
