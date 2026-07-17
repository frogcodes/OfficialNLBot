const { SlashCommandBuilder } = require("discord.js");
const { AVAILABILITY_DAYS } = require("../../utils/scheduling/constants.js");
const { buildDaySelectRow } = require("../../utils/scheduling/components.js");
const { isSchedulingStaff } = require("../../utils/scheduling/service.js");
const {
  findMatchByThreadId,
  loadSchedule,
} = require("../../utils/scheduling/scheduleStore.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-set")
    .setDescription(
      "Manually set a match time (run inside the match thread)",
    ),

  async execute(interaction) {
    if (!isSchedulingStaff(interaction)) {
      return await interaction.reply({
        content: "Only scheduling staff or admins can set a match time.",
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

    if (!findMatchByThreadId(loadSchedule(), thread.id)) {
      return await interaction.reply({
        content: "This thread is not linked to a match in the schedule.",
        ephemeral: true,
      });
    }

    return await interaction.reply({
      content:
        "Choose the match day, then the time. This overrides the current time for this match.",
      components: [
        buildDaySelectRow("staff_set_day", AVAILABILITY_DAYS, "Choose match day"),
      ],
      ephemeral: true,
    });
  },
};
