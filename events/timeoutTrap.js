const RESTRICTED_CHANNEL_ID = "1522364761193320588";
const LOG_CHANNEL_ID = "1202051037687726112";
const TIMEOUT_DURATION = 28 * 24 * 60 * 60 * 1000;

module.exports = {
  name: "messageCreate",
  async execute(message) {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    // Only act in the specified channel
    if (message.channel.id !== RESTRICTED_CHANNEL_ID) return;

    try {
      const member =
        message.member ??
        (await message.guild.members.fetch(message.author.id));

      // Can't timeout someone with a higher/equal role than the bot, or an admin, etc.
      if (!member.moderatable) {
        console.log(
          `Cannot timeout ${member.user.tag} — insufficient permissions/hierarchy.`,
        );
        return;
      }

      await member.timeout(
        TIMEOUT_DURATION,
        `Posted in restricted channel: ${message.channel.name}`,
      );

      // Delete the offending message
      await message.delete().catch(() => {});

      // Log to the designated log channel
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          embeds: [
            {
              title: "User Timed Out",
              color: 0xed4245,
              fields: [
                {
                  name: "User",
                  value: `${member} (${member.user.tag})`,
                  inline: true,
                },
                {
                  name: "Channel",
                  value: `<#${message.channel.id}>`,
                  inline: true,
                },
                { name: "Duration", value: "28 days", inline: true },
                {
                  name: "Reason",
                  value: `Posted in restricted channel`,
                  inline: false,
                },
                {
                  name: "Message Content",
                  value:
                    message.content?.slice(0, 1000) || "*(no text conteWnt)*",
                  inline: false,
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } else {
        console.warn(`Log channel ${LOG_CHANNEL_ID} not found.`);
      }

      console.log(
        `Timed out ${member.user.tag} for posting in ${message.channel.name}`,
      );
    } catch (err) {
      console.error("Failed to timeout user:", err);
    }
  },
};
