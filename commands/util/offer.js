const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const teams = require("../../data/teams.json");
const { faRoles, leagueRoles } = require("../../data/roles.json");

// These should be actual channel IDs
const offerChannelID = "1363033838841757817";
const transactionVerifyChannel = "1363033776648622120";
const officialTransactionChannel = "1181050441845457037";
const TRANSACTION_TEAM_ROLE = "1181050438926209083";
const rfaRole = "1198452739378786324";
const zookeeper = "1181050438926209076";
const handler = "1181050438926209074";
const FA_LEAGUE_ROLE_ID = "1470322091902373909";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("offer")
    .setDescription("Offer a player a roster spot")
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
      await interaction.deferReply({ ephemeral: true });
      // Get client from interaction
      const { client } = interaction;

      const player = interaction.options.getUser("player");
      const tierName = interaction.options.getString("tier");

      const member = interaction.guild.members.cache.get(player.id);
      if (!member) {
        return interaction.editReply({
          content: "Player not found in this server!",
          ephemeral: true,
        });
      }

      const isRFA = member.roles.cache.has(rfaRole);

      if (isRFA) {
        return interaction.editReply({
          content: "Player is an RFA. Please wait for it to expire",
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
        return interaction.editReply({
          content: "Player is not an FA!",
          ephemeral: true,
        });
      }

      // Find the offering team
      const offeringTeamEntry = Object.entries(teams).find(([_, teamData]) =>
        interaction.member.roles.cache.has(teamData.roleId),
      );

      if (!offeringTeamEntry) {
        return interaction.editReply({
          content: "You don't have a team role!",
          ephemeral: true,
        });
      }

      const isOrgStaff =
        interaction.member.roles.cache.has(zookeeper) ||
        interaction.member.roles.cache.has(handler);

      if (!isOrgStaff) {
        return interaction.editReply({
          content: "You aren't a zookeeper or handler!",
          ephemeral: true,
        });
      }

      const [offeringTeamName, offeringTeamData] = offeringTeamEntry;
      const transactionCreator = interaction.user;

      const offerChannel = client.channels.cache.get(offerChannelID);
      if (!offerChannel) {
        return interaction.editReply({
          content: "Offer channel not found!",
          ephemeral: true,
        });
      }

      const message = await offerChannel.send(
        `Congratulations <@${player.id}>! The **${offeringTeamName}** have offered you a roster spot in **${tierName}**! ✅ to accept or ❌ to decline. This will expire in 12 hours.`,
      );

      await message.react("✅");
      await message.react("❌");

      console.log(player.username);
      console.log(transactionCreator.username);

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

      let playerReacted = false;
      let creatorReacted = false;

      collector.on("collect", async (reaction, user) => {
        try {
          if (user.id === player.id) playerReacted = true;
          if (user.id === transactionCreator.id) creatorReacted = true;

          if (reaction.emoji.name === "✅") {
            if (playerReacted && creatorReacted) {
              collector.stop();
              // Both accepted - proceed to verification
              const transactionVerify = client.channels.cache.get(
                transactionVerifyChannel,
              );
              if (transactionVerify) {
                const message2 = await transactionVerify.send(
                  `The **${offeringTeamName}** have offered <@${player.id}> a roster spot in **${tierName}**!`,
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
                            `${offeringTeamName} sign ${player.username}`,
                          )
                          .setThumbnail(offeringTeamData.image)
                          .setDescription(
                            `<@${player.id}> signed to ${tierName} League!`,
                          )
                          .setTimestamp()
                          .setFooter({
                            text: `Offer by ${transactionCreator.username} | Processed by ${user.username}`,
                          });

                        await officialTransaction.send({ embeds: [embed] });

                        collector2.stop();
                        const member = interaction.guild.members.cache.get(
                          player.id,
                        );

                        // Update roles
                        if (
                          leagueRolesEntry &&
                          !member.roles.cache.has(leagueRoles[tierName])
                        ) {
                          await member.roles.remove(leagueRolesEntry[1]);
                          await member.roles.add(leagueRoles[tierName]);
                        }
                        await member.roles.remove(faRoles[tierName]);
                        await member.roles.remove(FA_LEAGUE_ROLE_ID);
                        await member.roles.add(offeringTeamData.roleId);

                        // Handle nickname update
                        const userDisplayName =
                          member.nickname || member.user.displayName;
                        if (userDisplayName) {
                          const awards = [];
                          const possibleAwards = ["🏆", "🌟"];
                          let cleanDisplayName = userDisplayName;

                          // Extract awards from the display name
                          for (const emoji of possibleAwards) {
                            while (cleanDisplayName.endsWith(emoji)) {
                              awards.push(emoji);
                              cleanDisplayName = cleanDisplayName
                                .slice(0, -emoji.length)
                                .trim();
                            }
                          }

                          awards.reverse();

                          let newFullName;
                          if (!cleanDisplayName.includes("|")) {
                            newFullName = `${cleanDisplayName} | ${offeringTeamName}${
                              awards.length > 0 ? " " + awards.join("") : ""
                            }`;
                          } else {
                            const userNameParts = cleanDisplayName.split(" | ");
                            newFullName = `${
                              userNameParts[0]
                            } | ${offeringTeamName}${
                              awards.length > 0 ? " " + awards.join("") : ""
                            }`;
                          }

                          if (newFullName.length <= 32) {
                            await member.setNickname(newFullName);
                          } else {
                            await transactionVerify.send(
                              `<@351480764602515487> ${player.username}'s nickname is too long. Please manually update it.`,
                            );
                          }
                        }

                        // Clean up messages
                        if (message.deletable) {
                          await message.delete();
                        }
                        if (message2.deletable) {
                          await message2.delete();
                        }
                      }
                    } else if (reaction.emoji.name === "❌") {
                      await offerChannel.send({
                        content: `The transaction for ${offeringTeamName} signing <@${player.id}> in ${tierName} has been denied by **THE** ${user.username}! womp womp`,
                      });
                    }
                  } catch (error) {
                    console.error("Error in verification collector:", error);
                  }
                });
              }
            } else if (user.id === player.id && !creatorReacted) {
              // Don't use editReply here since we haven't replied yet - use followUp instead
              await interaction.followUp({
                content: `Waiting on ${transactionCreator.username} to check`,
                ephemeral: true,
              });
            } else if (user.id === transactionCreator.id && !playerReacted) {
              await interaction.followUp({
                content: `Waiting on ${player.username} to check`,
                ephemeral: true,
              });
            }
          } else if (reaction.emoji.name === "❌") {
            await offerChannel.send(
              `The offer to <@${player.id}> has been **declined**.`,
            );
            collector.stop();
          }
        } catch (error) {
          console.error("Error in offer collector:", error);
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          await offerChannel.send(
            `The offer to <@${player.id}> has **expired**.`,
          );
        }
      });

      await interaction.editReply({
        content: `Offer sent to <@${player.id}>!`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in offer command:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while processing the offer.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "An error occurred while processing the offer.",
          ephemeral: true,
        });
      }
    }
  },
};
