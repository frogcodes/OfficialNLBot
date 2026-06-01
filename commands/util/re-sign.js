const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const teams = require("../../data/teams.json");
const { faRoles, leagueRoles } = require("../../data/roles.json");

// These should be actual channel IDs
const offerChannelID = "1363033838841757817";
const transactionVerifyChannel = "1363033776648622120";
const officialTransactionChannel = "1181050441845457037";
const TRANSACTION_TEAM_ROLE = "1181050438926209083";
const zookeeper = "1181050438926209076";
const handler = "1181050438926209074";
const ADMIN_USER_ID = "351480764602515487"; // Moved hardcoded ID to constant

module.exports = {
  data: new SlashCommandBuilder()
    .setName("re-sign")
    .setDescription("Re-sign a player")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to offer")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Select the tier to offer the player")
        .setRequired(true)
        .addChoices(
          { name: "Apex", value: "Apex" },
          { name: "Alpha", value: "Alpha" },
          { name: "Beta", value: "Beta" },
          { name: "Delta", value: "Delta" },
          { name: "Omega", value: "Omega" },
        ),
    ),
  async execute(interaction) {
    try {
      // Get client from interaction
      const { client } = interaction;

      const player = interaction.options.getUser("player");
      const tierName = interaction.options.getString("tier");

      const member = interaction.guild.members.cache.get(player.id);
      if (!member) {
        return interaction.reply({
          content: "Player not found in this server!",
          ephemeral: true,
        });
      }

      // Check if player has any FA role
      const faRoleEntry = Object.entries(faRoles).find(([_, roleId]) =>
        member.roles.cache.has(roleId),
      );

      const leagueRolesEntry = Object.entries(leagueRoles).find(([_, roleId]) =>
        member.roles.cache.has(roleId),
      );

      if (!faRoleEntry) {
        return interaction.reply({
          content: "Player is not an FA!",
          ephemeral: true,
        });
      }

      // Find the offering team
      const offeringTeamEntry = Object.entries(teams).find(([_, teamData]) =>
        interaction.member.roles.cache.has(teamData.roleId),
      );

      if (!offeringTeamEntry) {
        return interaction.reply({
          content: "You don't have a team role!",
          ephemeral: true,
        });
      }

      const isOrgStaff =
        interaction.member.roles.cache.has(zookeeper) ||
        interaction.member.roles.cache.has(handler);

      if (!isOrgStaff) {
        return interaction.reply({
          content: "You aren't a zookeeper or handler!",
          ephemeral: true,
        });
      }

      const [offeringTeamName, offeringTeamData] = offeringTeamEntry;
      const transactionCreator = interaction.user;

      const offerChannel = client.channels.cache.get(offerChannelID);
      if (!offerChannel) {
        return interaction.reply({
          content: "Offer channel not found!",
          ephemeral: true,
        });
      }

      // Send initial reply
      await interaction.reply({
        content: `Offer sent to <@${player.id}>!`,
        ephemeral: true,
      });

      const message = await offerChannel.send(
        `<@${player.id}>! The **${offeringTeamName}** have offered you a **re-sign**! ✅ to accept or ❌ to decline. This will expire in 12 hours.`,
      );

      await message.react("✅");
      await message.react("❌");

      const filter1 = (reaction, user) => {
        return (
          ["✅", "❌"].includes(reaction.emoji.name) &&
          [player.id, transactionCreator.id].includes(user.id)
        );
      };

      const collector = message.createReactionCollector({
        filter: filter1,
        time: 43_200_000,
      });

      collector.on("collect", async (reaction, user) => {
        try {
          if (reaction.emoji.name === "✅") {
            // Fixed: Check if both users have reacted by looking at the reaction cache
            const checkReaction = await reaction.fetch();
            const users = await checkReaction.users.fetch();
            const hasPlayerReacted = users.has(player.id);
            const hasCreatorReacted = users.has(transactionCreator.id);

            if (hasPlayerReacted && hasCreatorReacted) {
              collector.stop("accepted");
              // Both accepted - proceed to verification
              const transactionVerify = client.channels.cache.get(
                transactionVerifyChannel,
              );
              if (transactionVerify) {
                await message.edit(
                  `Transactions is processing the request! <@${player.id}>! The **${offeringTeamName}** have offered you a **re-sign**!`,
                );

                const message2 = await transactionVerify.send(
                  `The **${offeringTeamName}** are trying to re-sign <@${player.id}>!`,
                );

                await message2.react("✅");
                await message2.react("❌");

                const filter2 = async (reaction, user) => {
                  const member = await reaction.message.guild.members.fetch(
                    user.id,
                  );
                  return (
                    ["✅", "❌"].includes(reaction.emoji.name) &&
                    member.roles.cache.has(TRANSACTION_TEAM_ROLE)
                  );
                };

                const collector2 = message2.createReactionCollector({
                  filter: filter2,
                  time: 43_200_000 * 2,
                });

                collector2.on("collect", async (reaction, user) => {
                  try {
                    if (user.bot) return;
                    if (reaction.emoji.name === "✅") {
                      const officialTransaction = client.channels.cache.get(
                        officialTransactionChannel,
                      );
                      if (officialTransaction) {
                        const embed = new EmbedBuilder()
                          .setColor(offeringTeamData.color)
                          .setTitle(
                            `${offeringTeamName} re-sign ${player.username}`,
                          )
                          .setThumbnail(offeringTeamData.image)
                          .setDescription(
                            `<@${player.id}> re-signed to ${tierName} League!`,
                          )
                          .setTimestamp()
                          .setFooter({
                            text: `Re-signed by ${transactionCreator.username} | Processed by ${user.username}`,
                          });

                        await officialTransaction.send({ embeds: [embed] });

                        collector2.stop("approved");
                        const member = interaction.guild.members.cache.get(
                          player.id,
                        );

                        // Fixed: Added proper role management with error handling
                        try {
                          // Add league role if not already present
                          if (!member.roles.cache.has(leagueRoles[tierName])) {
                            // Fixed: Only remove old league role if it exists
                            if (leagueRolesEntry && leagueRolesEntry[1]) {
                              await member.roles.remove(leagueRolesEntry[1]);
                            }
                            await member.roles.add(leagueRoles[tierName]);
                          }

                          // Remove FA role and add team role
                          await member.roles.remove(faRoles[tierName]);
                          await member.roles.add(offeringTeamData.roleId);
                        } catch (roleError) {
                          console.error("Error updating roles:", roleError);
                          await transactionVerify.send(
                            `<@${ADMIN_USER_ID}> Error updating roles for ${player.username}: ${roleError.message}`,
                          );
                        }

                        // Fixed: Improved nickname handling
                        try {
                          let userDisplayName =
                            member.nickname || member.user.username;
                          const awards = [];
                          const possibleAwards = ["🏆", "🌟"];

                          // Extract awards from the display name
                          for (const emoji of possibleAwards) {
                            while (userDisplayName.endsWith(emoji)) {
                              awards.push(emoji);
                              userDisplayName = userDisplayName
                                .slice(0, -emoji.length)
                                .trim();
                            }
                          }

                          awards.reverse();

                          let newFullName;
                          if (userDisplayName.includes("|")) {
                            const userNameParts = userDisplayName.split(" | ");
                            newFullName = `${userNameParts[0]} | ${offeringTeamName} ${awards.join("")}`;
                          } else {
                            newFullName = `${userDisplayName} | ${offeringTeamName} ${awards.join("")}`;
                          }

                          if (newFullName.length < 33) {
                            await member.setNickname(newFullName);
                          } else {
                            await transactionVerify.send(
                              `<@${ADMIN_USER_ID}> ${player.username}'s nickname is too long. Please manually update it.`,
                            );
                          }
                        } catch (nicknameError) {
                          console.error(
                            "Error updating nickname:",
                            nicknameError,
                          );
                          await transactionVerify.send(
                            `<@${ADMIN_USER_ID}> Error updating nickname for ${player.username}: ${nicknameError.message}`,
                          );
                        }

                        // Delete messages
                        if (message.deletable) {
                          await message.delete().catch(console.error);
                        }
                        if (message2.deletable) {
                          await message2.delete().catch(console.error);
                        }

                        // await interaction.editReply({
                        //   content: `✅ Successfully re-signed <@${player.id}> to ${offeringTeamName}!`,
                        // });
                      }
                    } else if (reaction.emoji.name === "❌") {
                      await offerChannel.send({
                        content: `The transaction for ${offeringTeamName} re-signing <@${player.id}> in ${tierName} has been denied by **THE** ${user.username}! womp womp`,
                      });

                      if (message.deletable) {
                        await message.delete().catch(console.error);
                      }
                      if (message2.deletable) {
                        await message2.delete().catch(console.error);
                      }

                      // await interaction.editReply({
                      //   content: `❌ Transaction denied by ${user.username}`,
                      // });

                      collector2.stop("denied");
                    }
                  } catch (error) {
                    console.error("Error in collector2:", error);
                    await transactionVerify
                      .send(
                        `<@${ADMIN_USER_ID}> An error occurred processing the transaction: ${error.message}`,
                      )
                      .catch(console.error);
                  }
                });
              }
            } else if (user.id === player.id && !hasCreatorReacted) {
              await interaction.editReply({
                content: `Waiting on ${transactionCreator.username} to accept...`,
              });
            } else if (user.id === transactionCreator.id && !hasPlayerReacted) {
              await interaction.editReply({
                content: `Waiting on ${player.username} to accept...`,
              });
            }
          } else if (reaction.emoji.name === "❌") {
            await offerChannel.send(
              `The offer to <@${player.id}> has been **declined**.`,
            );
            collector.stop("declined");

            await interaction.editReply({
              content: `❌ Offer to <@${player.id}> was declined.`,
            });
          }
        } catch (error) {
          console.error("Error in collector:", error);
          await interaction
            .editReply({
              content: `❌ An error occurred: ${error.message}`,
            })
            .catch(console.error);
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          await offerChannel
            .send(`The re-sign offer to <@${player.id}> has **expired**.`)
            .catch(console.error);

          await interaction
            .editReply({
              content: `⏰ Offer to <@${player.id}> has expired.`,
            })
            .catch(console.error);
        }
      });
    } catch (error) {
      console.error("Error in re-sign command:", error);

      // Try to reply or edit reply depending on interaction state
      const errorMessage = `❌ An error occurred: ${error.message}`;
      if (interaction.replied || interaction.deferred) {
        await interaction
          .editReply({ content: errorMessage })
          .catch(console.error);
      } else {
        await interaction
          .reply({ content: errorMessage, ephemeral: true })
          .catch(console.error);
      }
    }
  },
};
