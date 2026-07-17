const { SlashCommandBuilder } = require("discord.js");
const {
  refreshSchedulingControlMessage,
} = require("../../utils/scheduling/controlMessage.js");
const {
  isSchedulingStaff,
  resetSchedulingSession,
} = require("../../utils/scheduling/service.js");
const {
  deleteScheduledAnnouncement,
  resetScheduledMatchByThreadId,
} = require("../../utils/scheduling/finalizeSchedule.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-reset")
    .setDescription(
      "Reset a scheduled match and re-open availability (run inside the match thread)",
    ),

  async execute(interaction) {
    if (!isSchedulingStaff(interaction)) {
      return await interaction.reply({
        content: "Only scheduling staff or admins can reset a match.",
        ephemeral: true,
      });
    }

    const thread = interaction.channel;

    if (!thread?.isThread?.()) {
      return await interaction.reply({
        content: "Run this command inside a match scheduling thread.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await resetScheduledMatchByThreadId(thread.id);

    if (!result.ok) {
      return await interaction.editReply(result.reason);
    }

    resetSchedulingSession(thread.id);

    // Retract the "Match Scheduled!" announcement so a fresh one is posted when
    // the match is scheduled again.
    if (result.announcementMessageId) {
      await deleteScheduledAnnouncement(
        interaction.guild,
        result.announcementMessageId,
      );
    }

    // Restore the unscheduled marker that finalization strips from the name.
    if (thread.setName && !thread.name.includes("🔴")) {
      try {
        await thread.setName(`🔴${thread.name}`);
      } catch (error) {
        console.error("Error restoring unscheduled marker:", error);
      }
    }

    await refreshSchedulingControlMessage(thread, thread.id);

    await thread
      .send(
        `Scheduling for this match was reset by <@${interaction.user.id}>. Captains, please resubmit your availability using the controls below.`,
      )
      .catch((error) => {
        console.error("Error sending reset notice:", error);
      });

    return await interaction.editReply(
      "Match scheduling reset. Availability collection has been re-opened.",
    );
  },
};
