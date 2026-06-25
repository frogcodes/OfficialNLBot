const { SlashCommandBuilder } = require("discord.js");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const NEEDS_REQS_CHANNEL_ID = "1399943322629308476"; // needs-requirements channel ID
const ADMISSIONS_ROLE_ID = "1181050438926209082"; // admissions role ID
const CAREER_WINS_TARGET = 1000;
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("requirements-ping")
    .setDescription(
      "Ping a player in the needs-requirements channel with what they still need",
    )
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player to ping")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("current-season")
        .setDescription(
          "Current season games still needed, e.g. 71/100 (optional)",
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("past-5")
        .setDescription(
          "Combined 2s+3s games over past 5 seasons, e.g. 543/800 or 543/1000 (optional)",
        )
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("wins-needed")
        .setDescription(
          `Career wins still needed to reach ${CAREER_WINS_TARGET} (optional)`,
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("invalid-trackers")
        .setDescription(
          "Invalid tracker(s) that need to be resubmitted (optional)",
        )
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Permission check — admissions role only
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    if (!member || !member.roles.cache.has(ADMISSIONS_ROLE_ID)) {
      return interaction.editReply({
        content: "You are not permitted to use this command.",
      });
    }

    if (!NEEDS_REQS_CHANNEL_ID || NEEDS_REQS_CHANNEL_ID.startsWith("REPLACE")) {
      return interaction.editReply({
        content:
          "The needs-requirements channel is not configured yet. Set `NEEDS_REQS_CHANNEL_ID` in `commands/util/requirementsPing.js`.",
      });
    }

    const player = interaction.options.getUser("player");
    const currentSeason = interaction.options.getString("current-season");
    const past5 = interaction.options.getString("past-5");
    const winsNeeded = interaction.options.getInteger("wins-needed");
    const invalidTrackers = interaction.options.getString("invalid-trackers");

    // Build the list of requirements based on what was provided
    const lines = [];

    if (currentSeason) {
      lines.push(`• ${currentSeason} games this current season`);
    }
    if (past5) {
      lines.push(`• ${past5} combined 2s and 3s games in the past 5 seasons`);
    }
    if (winsNeeded !== null && winsNeeded !== undefined) {
      lines.push(
        `• ${winsNeeded} more career wins to reach ${CAREER_WINS_TARGET}`,
      );
    }
    if (invalidTrackers) {
      lines.push(
        `• Resubmit the following invalid tracker(s): ${invalidTrackers}`,
      );
    }

    if (lines.length === 0) {
      return interaction.editReply({
        content:
          "Please provide at least one requirement (current season, past 5, wins needed, or invalid trackers).",
      });
    }

    const message =
      `<@${player.id}>, you still need the following to complete enrollment:\n` +
      `${lines.join("\n")}\n\n` +
      `Make an admissions ticket once these requirements are complete. https://discord.com/channels/1181050438750060584/1238989734886244352`;

    // Post the ping in the needs-requirements channel
    const channel = await interaction.client.channels
      .fetch(NEEDS_REQS_CHANNEL_ID)
      .catch(() => null);

    if (!channel) {
      return interaction.editReply({
        content:
          "Could not find the needs-requirements channel. Check `NEEDS_REQS_CHANNEL_ID`.",
      });
    }

    try {
      await channel.send({
        content: message,
        allowedMentions: { users: [player.id] },
      });

      return interaction.editReply({
        content: `Requirements ping posted for ${player.tag} in <#${NEEDS_REQS_CHANNEL_ID}>.`,
      });
    } catch (error) {
      console.error("Error posting requirements ping:", error);
      return interaction.editReply({
        content: `Failed to post the ping: ${error.message}`,
      });
    }
  },
};
