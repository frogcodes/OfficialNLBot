const { Events, EmbedBuilder, PermissionsBitField } = require("discord.js");
const modChannelID = "1197980321988218931";
//const warningChannelID = "1324232929165049876";
const logsChannelID = "1181050440025116748"; // Add your logs channel ID here
const blacklistedWords = [
  "gay",
  "lesbian",
  "queer",
  "furry",
  "furries",
  "bitch",
]; // Consider moving to config file

// Utility function for logging
async function logModAction(
  guild,
  { action, moderator, target, reason, duration = null, messageContent = null }
) {
  const logsChannel = guild.channels.cache.get(logsChannelID);
  if (!logsChannel) {
    console.error("Logs channel not found.");
    return;
  }

  const logEmbed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor("#ff6b6b")
    .setTimestamp()
    .addFields([
      {
        name: "Moderator",
        value: `<@${moderator.id}> (${moderator.id})`,
        inline: true,
      },
      {
        name: "Target User",
        value: `<@${target.id}> (${target.id})`,
        inline: true,
      },
    ]);

  if (reason) {
    logEmbed.addFields({ name: "Reason", value: reason });
  }

  if (duration) {
    logEmbed.addFields({ name: "Duration", value: `${duration} minutes` });
  }

  if (messageContent) {
    logEmbed.addFields({ name: "Message Content", value: messageContent });
  }

  try {
    await logsChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error("Failed to send log message:", error);
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // Check for blacklisted words
    const containsBlacklistedWord = blacklistedWords.some((word) =>
      message.content.toLowerCase().includes(word)
    );

    if (containsBlacklistedWord) {
      const moderationChannel = message.guild.channels.cache.get(modChannelID);
      //const warningChannel = message.guild.channels.cache.get(warningChannelID);

      if (!moderationChannel) {
        console.error("Required channels not found.");
        return;
      }

      // Log the flagged message
      await logModAction(message.guild, {
        action: "Message Flagged",
        moderator: message.client.user,
        target: message.author,
        reason: "Blacklisted word detected",
        messageContent: message.content,
      });

      // Truncate long messages
      let messageContent = message.content;
      if (messageContent.length > 1024) {
        messageContent = messageContent.substring(0, 1021) + "...";
      }

      const moderationEmbed = new EmbedBuilder()
        .setTitle("Message Review Required")
        .setDescription(
          `Message from <@${message.author.id}>:\n\n"${messageContent}"`
        )
        .setColor("#ffcc00")
        .setFooter({
          text: `Flagged User ID: ${message.author.id}, Message ID: ${message.id}, Channel ID: ${message.channel.id}`,
        });

      let moderationMessage;
      try {
        moderationMessage = await moderationChannel.send({
          embeds: [moderationEmbed],
        });
        await moderationMessage.react("✅");
        await moderationMessage.react("❌");
      } catch (error) {
        console.error(
          "Failed to send moderation message or add reactions:",
          error
        );
        return;
      }

      const reactionCollector = moderationMessage.createReactionCollector({
        time: 300000,
      });

      reactionCollector.on("collect", async (reaction, user) => {
        if (user.bot) return;

        try {
          const member = await message.guild.members.fetch(user.id);
          if (
            !member.permissions.has(PermissionsBitField.Flags.ManageMessages)
          ) {
            console.error("User lacks Manage Messages permission.");
            return;
          }

          const embed = reaction.message.embeds[0];
          if (!embed || !embed.footer) {
            console.error("No embed or footer found.");
            return;
          }

          const footerText = embed.footer.text;
          const parts = footerText.split(", ");
          const flaggedUserID = parts[0].split(": ")[1];
          const channelID = parts[2].split(": ")[1];

          const flaggedChannel = await message.client.channels.fetch(channelID);
          const flaggedMessage = await flaggedChannel.messages.fetch(
            parts[1].split(": ")[1]
          );
          const flaggedUser = await message.guild.members.fetch(flaggedUserID);

          if (reaction.emoji.name === "✅") {
            message.client.users.send(
              `${flaggedUserID}`,
              `<@${flaggedUserID}> Your message, "${message}", was flagged but deemed acceptable.`
            );
            await moderationChannel.send(
              `Message from <@${flaggedUserID}> was reviewed and deemed acceptable. The user was warned.`
            );

            // Log warning
            await logModAction(message.guild, {
              action: "Warning Issued",
              moderator: user,
              target: flaggedUser,
              reason: "Potentially inappropriate message",
              messageContent: messageContent,
            });
          } else if (reaction.emoji.name === "❌") {
            try {
              await flaggedMessage.delete();

              // Log message deletion
              await logModAction(message.guild, {
                action: "Message Deleted",
                moderator: user,
                target: flaggedUser,
                reason: "Violation of server rules",
                messageContent: messageContent,
              });
            } catch (error) {
              console.error("Failed to delete message:", error);
              await moderationChannel.send(
                "Failed to delete the flagged message."
              );
              return;
            }

            await moderationChannel.send(
              `<@${user.id}> How long should the flagged user be muted? Respond with a duration in minutes (1-10080).`
            );

            const filter = (response) => response.author.id === user.id;
            try {
              const collected = await moderationChannel.awaitMessages({
                filter,
                max: 1,
                time: 60000,
                errors: ["time"],
              });

              const muteDuration = parseInt(collected.first().content);
              if (
                isNaN(muteDuration) ||
                muteDuration <= 0 ||
                muteDuration > 10080
              ) {
                await moderationChannel.send(
                  "Invalid duration provided. Please provide a number between 1 and 10080 minutes."
                );
                return;
              }

              const muteDurationInMs = muteDuration * 60000;

              try {
                await flaggedUser.timeout(
                  muteDurationInMs,
                  "Violation of server rules."
                );

                // Log timeout
                await logModAction(message.guild, {
                  action: "User Muted",
                  moderator: user,
                  target: flaggedUser,
                  reason: "Violation of server rules",
                  duration: muteDuration,
                  messageContent: messageContent,
                });

                await moderationChannel.send(
                  `${flaggedUser} has been muted for ${muteDuration} minutes.`
                );

                message.client.users.send(
                  `${flaggedUserID}`,
                  `<@${flaggedUserID}> You have been muted for ${muteDuration} minutes. For message "${message}". Please adhere to the rules.`
                );

                setTimeout(async () => {
                  try {
                    message.clientclient.users.send(
                      `${flaggedUserID}`,
                      `<@${flaggedUserID}> You have been unmuted. Please maintain respectful behavior.`
                    );

                    // Log unmute
                    await logModAction(message.guild, {
                      action: "User Unmuted",
                      moderator: message.client.user,
                      target: flaggedUser,
                      reason: "Timeout duration completed",
                    });
                  } catch (error) {
                    console.error("Failed to send unmute message:", error);
                  }
                }, muteDurationInMs);
              } catch (error) {
                console.error("Failed to timeout user:", error);
                await moderationChannel.send("Failed to timeout the user.");
                return;
              }
            } catch (error) {
              await moderationChannel.send("Mute action timed out.");
            }
          }
        } catch (error) {
          console.error("Error in reaction handling:", error);
          await moderationChannel.send(
            "An error occurred while processing the moderation action."
          );
        }
      });

      reactionCollector.on("end", () => {
        moderationMessage.reactions
          .removeAll()
          .catch((error) => console.error("Failed to clear reactions:", error));
      });
    }
  },
};
