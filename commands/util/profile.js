const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getPlayerBalance } = require("../../utils/balanceManager");
const {
  displayHistory,
  getCurrentTeam,
  getCurrentRoles,
  teamLabel,
  tierLabel,
} = require("../../utils/playerhistory");
const { formatMoney } = require("../../utils/money");

// Fit the most recent history lines into Discord's 1024-char field limit,
// noting how many older moves were trimmed.
function fitHistory(lines) {
  if (lines.length === 1 && lines[0] === "No history found.") return lines[0];
  const recent = [...lines].reverse(); // newest first
  const shown = [];
  let len = 0;
  for (const line of recent) {
    if (len + line.length + 1 > 950) break;
    shown.push(line);
    len += line.length + 1;
  }
  const hidden = lines.length - shown.length;
  if (hidden > 0) shown.push(`…and ${hidden} earlier move${hidden === 1 ? "" : "s"}`);
  return shown.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Get server information about a player")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player profile to check")
        .setRequired(false),
    ),

  async execute(interaction) {
    const player = interaction.options.getUser("player") || interaction.user;
    const member = await interaction.guild.members.fetch(player.id);

    // Keep the ID a string: balances are keyed by the string user ID, and Discord
    // snowflakes exceed MAX_SAFE_INTEGER, so parsing to a Number both breaks the
    // lookup and corrupts the ID.
    const balance = getPlayerBalance(player.id) ?? 0;
    const current = getCurrentTeam(player.id);
    const currentValue = current
      ? [teamLabel(current.team), tierLabel(current.tier)].filter(Boolean).join(" · ")
      : "Free Agent";

    const roles = getCurrentRoles(player.id);
    const rolesValue = roles.length
      ? roles.map((r) => `${r.reason}${r.team ? ` — ${teamLabel(r.team)}` : ""}`).join("\n")
      : null;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`📄 Profile for ${player.username}`)
      .setThumbnail(player.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "Current Team", value: currentValue || "Free Agent", inline: true },
        { name: "NL Coins", value: `🪙 ${formatMoney(balance)}`, inline: true },
        ...(rolesValue ? [{ name: "Management", value: rolesValue, inline: true }] : []),
        {
          name: "Server Join Date",
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
        },
        {
          name: "Team History",
          value: fitHistory(displayHistory(player.id)),
        },
      )
      .setColor(current ? 0x2ecc71 : 0x95a5a6);

    await interaction.reply({ embeds: [resultEmbed] });
  },
};
