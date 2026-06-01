const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");

const LOG_CHANNEL_ID = "1331833494506045491"; // 🔁 Replace with your mod channel ID

function calculateDate(strikeLen, startDate = new Date()) {
  const newDate = new Date(startDate);
  newDate.setMonth(newDate.getMonth() + strikeLen);
  return newDate;
}

function formatTime(isoDate) {
  const unix = Math.floor(new Date(isoDate).getTime() / 1000);
  return `<t:${unix}:F>`;
}

function isExpired(dateStr) {
  return new Date(dateStr) < new Date();
}

function ensureDataDefaults(data) {
  if (!data.strikes) data.strikes = [];
  if (!data.suspensions) data.suspensions = [];
  if (!data.bans) data.bans = [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("punish")
    .setDescription("Punish a Nature League member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player to punish")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("striketype")
        .setDescription("The type of strike")
        .setRequired(true)
        .addChoices(
          { name: "Major", value: "Major" },
          { name: "Minor", value: "Minor" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the strike")
        .setRequired(true)
    ),

  async execute(interaction) {
    const striketype = interaction.options.getString("striketype");
    const player = interaction.options.getUser("player");
    const reason = interaction.options.getString("reason");
    const strikeLen = striketype === "Major" ? 6 : 3;

    const dataPath = "data/infractions.json";
    const boardPath = "data/punishment_board.json";

    const data = fs.existsSync(dataPath)
      ? JSON.parse(fs.readFileSync(dataPath, "utf-8"))
      : { strikes: [], suspensions: [], bans: [] };

    ensureDataDefaults(data);

    // Auto-remove expired
    data.strikes = data.strikes.filter((s) => !isExpired(s.removalDate));
    data.suspensions = data.suspensions.filter(
      (s) => !isExpired(s.removalDate)
    );
    data.bans = data.bans.filter((b) => !isExpired(b.appealDate));

    // Stack strike after latest active strike
    const userStrikes = data.strikes.filter((s) => s.user === player.id);
    let latestEnd = new Date();
    if (userStrikes.length > 0) {
      latestEnd = new Date(
        Math.max(...userStrikes.map((s) => new Date(s.removalDate)))
      );
    }

    const removalDate = calculateDate(strikeLen, latestEnd).toISOString();

    data.strikes.push({
      user: player.id,
      removalDate,
      reason,
    });

    const newStrikeCount = data.strikes.filter(
      (s) => s.user === player.id
    ).length;

    if (newStrikeCount === 2) {
      data.suspensions.push({
        user: player.id,
        removalDate,
        reason: "2 strikes (automatic suspension)",
      });
    } else if (newStrikeCount === 3) {
      data.bans.push({
        user: player.id,
        appealDate: calculateDate(6, new Date(removalDate)).toISOString(),
        reason: "3 strikes (automatic ban)",
      });
    }

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    // Generate new embed content
    const allPunishments = {};

    for (const s of data.strikes) {
      if (!allPunishments[s.user])
        allPunishments[s.user] = { strikes: [], suspensions: [], bans: [] };
      allPunishments[s.user].strikes.push(s);
    }

    for (const s of data.suspensions) {
      if (!allPunishments[s.user])
        allPunishments[s.user] = { strikes: [], suspensions: [], bans: [] };
      allPunishments[s.user].suspensions.push(s);
    }

    for (const b of data.bans) {
      if (!allPunishments[b.user])
        allPunishments[b.user] = { strikes: [], suspensions: [], bans: [] };
      allPunishments[b.user].bans.push(b);
    }

    const embed = new EmbedBuilder()
      .setTitle("🧾 Nature League Punishment Board")
      .setColor(0xff5555)
      .setTimestamp();

    const userIds = Object.keys(allPunishments);

    if (userIds.length === 0) {
      embed.setDescription("✅ No active punishments.");
    } else {
      for (const uid of userIds) {
        const u = allPunishments[uid];
        const strikeLines = u.strikes
          .map(
            (s, i) =>
              `**Strike ${i + 1}**: ${s.reason} (expires ${formatTime(
                s.removalDate
              )})`
          )
          .join("\n");

        const suspensionLines = u.suspensions
          .map((s) => `⛔ ${s.reason} (until ${formatTime(s.removalDate)})`)
          .join("\n");

        const banLines = u.bans
          .map((b) => `🚫 ${b.reason} (appeal on ${formatTime(b.appealDate)})`)
          .join("\n");

        const value =
          (strikeLines || "") +
          (suspensionLines ? `\n${suspensionLines}` : "") +
          (banLines ? `\n${banLines}` : "");

        embed.addFields({
          name: `<@${uid}>`,
          value: value || "No active punishments",
        });
      }
    }

    // Fetch log channel
    const channel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);

    // Try to update existing message
    let boardInfo = {};
    if (fs.existsSync(boardPath)) {
      boardInfo = JSON.parse(fs.readFileSync(boardPath, "utf-8"));
    }

    try {
      if (boardInfo.messageId) {
        const oldMsg = await channel.messages.fetch(boardInfo.messageId);
        await oldMsg.edit({ embeds: [embed] });
      } else {
        const msg = await channel.send({ embeds: [embed] });
        boardInfo.messageId = msg.id;
        fs.writeFileSync(boardPath, JSON.stringify(boardInfo, null, 2));
      }
    } catch (e) {
      console.warn("Failed to update board. Sending new one.");
      const msg = await channel.send({ embeds: [embed] });
      boardInfo.messageId = msg.id;
      fs.writeFileSync(boardPath, JSON.stringify(boardInfo, null, 2));
    }

    await interaction.reply({
      content: `✅ Strike added to ${player.tag}.\n🕒 Expires: ${new Date(
        removalDate
      ).toLocaleDateString()}`,
      ephemeral: true,
    });
  },
};
