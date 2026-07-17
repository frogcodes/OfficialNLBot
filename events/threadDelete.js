const { Events } = require("discord.js");
const {
  removeSchedulingSession,
} = require("../utils/scheduling/stateStore.js");

// When a scheduling thread is deleted (e.g. /scorereport closes it after a
// match, or a mod removes it) drop its availability session so
// scheduling_state.json doesn't accumulate orphaned entries.
module.exports = {
  name: Events.ThreadDelete,
  execute(thread) {
    try {
      if (removeSchedulingSession(thread.id)) {
        console.log(
          `Removed scheduling session for deleted thread ${thread.id}.`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to remove scheduling session for thread ${thread.id}:`,
        error,
      );
    }
  },
};
