const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const schedule = require("../../data/schedule.json");
const teams = require("../../data/teams.json");
const {
  refreshSchedulingControlMessage,
} = require("../../utils/scheduling/controlMessage.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remind-threads")
    .setDescription("remind the weekly scheduling threads")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option
        .setName("week-number")
        .setDescription("The week number for threads")
        .setRequired(true)
    ),

  async execute(interaction) {
    const weekNum = interaction.options.getInteger("week-number");

    // load week from the json data
    let week = schedule.weeks[weekNum];
    for (const gameday of week.gamedays) {
      for (const match of gameday.matches) {
        for (const tier in match.tiers) {
          const threadId = match.tiers[tier].threadID;
          if (!threadId) continue; // skip if no thread exists

          // fetch the thread object
          const thread = await interaction.guild.channels.fetch(threadId);
          if (!thread || !thread.isThread()) continue; // make sure it's a thread

          if (match.tiers[tier].scheduled == true) continue;

          let team1Role = teams[match.teams[0]].roleId;
          let team2Role = teams[match.teams[1]].roleId;

          await thread.send(
            `<@&${team1Role}> and <@&${team2Role}>! ${tier} GD ${gameday.gamedayNum}

It’s been 2 days since your match thread opened, and we still haven’t seen a confirmed match time.

Please use the scheduling controls in this thread to submit availability or finalize a proposed time.
If you do not provide a time, the Scheduling Team will step in and assist to finalize it.

Thank you for your cooperation!`
          );

          await refreshSchedulingControlMessage(thread, thread.id);
        }
      }
    }
  },
};
