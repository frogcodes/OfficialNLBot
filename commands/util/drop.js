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

function threeWeekFromToday() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  return `${nextWeek.getMonth() + 1}/${nextWeek.getDate()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Drop a player from your roster")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to drop")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Select the tier to drop the player from")
        .setRequired(true)
        .addChoices(
          { name: "Apex", value: "Apex" },
          { name: "Alpha", value: "Alpha" },
          { name: "Beta", value: "Beta" },
          { name: "Delta", value: "Delta" },
          { name: "Omega", value: "Omega" },
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName("playerdrop")
        .setDescription("Is it a player drop?")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { client } = interaction;
      const player = interaction.options.getUser("player");
      const tierName = interaction.options.getString("tier");
      const playerDropBool = interaction.options.getBoolean("playerdrop");

      const member = interaction.guild.members.cache.get(player.id);
      if (!member) {
        return interaction.editReply({
          content: "Player not found in this server!",
          ephemeral: true,
        });
      }

      const leagueRolesEntry = Object.entries(leagueRoles).find(([_, roleId]) =>
        member.roles.cache.has(roleId),
      );

      const droppingTeamEntry = Object.entries(teams).find(([_, teamData]) =>
        interaction.member.roles.cache.has(teamData.roleId),
      );

      if (!droppingTeamEntry) {
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

      const [offeringTeamName, offeringTeamData] = droppingTeamEntry;
      const transactionCreator = interaction.user;
      const offerChannel = client.channels.cache.get(offerChannelID);

      if (!member.roles.cache.has(droppingTeamEntry[1].roleId)) {
        return interaction.editReply({
          content: "Player is not on the team!",
          ephemeral: true,
        });
      }

      if (!offerChannel) {
        return interaction.editReply({
          content: "Offer channel not found!",
          ephemeral: true,
        });
      }

      // ---------------------------------------------- PLAYER DROP ----------------------------------------------------------
      if (playerDropBool) {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}> <@${player.id}>! Are you sure the **${offeringTeamName}** want to drop ${player.username} **PLAYER DECISION**`,
        );

        await message.react("✅");
        await message.react("❌");

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            [transactionCreator.id, player.id].includes(user.id)
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
                const transactionVerify = client.channels.cache.get(
                  transactionVerifyChannel,
                );
                if (transactionVerify) {
                  const message2 = await transactionVerify.send(
                    `The **${offeringTeamName}** have dropped <@${player.id}> from their **${tierName}** League Roster **PLAYER DECISION**!`,
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
                            .setColor(0xff0000) //red
                            .setTitle(
                              `${offeringTeamName} dropped ${player.username}`,
                            )
                            .setThumbnail(offeringTeamData.image)
                            .setDescription(
                              `<@${player.id}> dropped from ${tierName} Roster **PLAYER DECISION**!`,
                            )
                            .setTimestamp()
                            .setFooter({
                              text: `Dropped by ${transactionCreator.username} | Processed by ${user.username}`,
                            });

                          await officialTransaction.send({ embeds: [embed] });
                          collector2.stop();

                          await member.roles.remove(offeringTeamData.roleId);
                          await member.roles.add(rfaRole);

                          // Handle nickname update
                          const userDisplayName =
                            member.nickname || member.user.displayName;
                          if (userDisplayName) {
                            const awards = [];
                            const possibleAwards = ["🏆", "🌟"];
                            let cleanDisplayName = userDisplayName;

                            for (const emoji of possibleAwards) {
                              while (cleanDisplayName.endsWith(emoji)) {
                                awards.push(emoji);
                                cleanDisplayName = cleanDisplayName
                                  .slice(0, -emoji.length)
                                  .trim();
                              }
                            }

                            awards.reverse();

                            if (cleanDisplayName.includes("|")) {
                              const userNameParts =
                                cleanDisplayName.split(" | ");
                              const newFullName = `${
                                userNameParts[0]
                              } | RFA ${threeWeekFromToday()}${
                                awards.length > 0 ? " " + awards.join("") : ""
                              }`;

                              if (newFullName.length <= 32) {
                                await member.setNickname(newFullName);
                              } else {
                                await transactionVerify.send(
                                  `<@351480764602515487> ${player.username}'s nickname is too long. Please manually update it.`,
                                );
                              }
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
                          content: `The transaction for ${offeringTeamName} dropping <@${player.id}> from ${tierName} has been denied by ${user.username}!`,
                        });
                        collector2.stop();
                      }
                    } catch (error) {
                      console.error(
                        "Error in player drop verification collector:",
                        error,
                      );
                    }
                  });
                }
              }
            } else if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The drop of <@${player.id}> has been cancelled.`,
              );
              collector.stop();
            }
          } catch (error) {
            console.error("Error in player drop collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The drop offer to <@${player.id}> has expired.`,
            );
          }
        });
      }
      // --------------------------------------------- GM DROP ---------------------------------------------------------------
      else {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}>! Are you sure the **${offeringTeamName}** want to drop ${player.username}`,
        );

        await message.react("✅");
        await message.react("❌");

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            [transactionCreator.id].includes(user.id)
          );
        };

        const collector = message.createReactionCollector({
          filter: filter1,
          time: 43_200_000,
        });

        collector.on("collect", async (reaction, user) => {
          try {
            if (reaction.emoji.name === "✅") {
              collector.stop();
              const transactionVerify = client.channels.cache.get(
                transactionVerifyChannel,
              );
              if (transactionVerify) {
                const message2 = await transactionVerify.send(
                  `The **${offeringTeamName}** have dropped <@${player.id}> from their **${tierName}** League Roster!`,
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
                          .setColor(0xff0000)
                          .setTitle(
                            `${offeringTeamName} dropped ${player.username}`,
                          )
                          .setThumbnail(offeringTeamData.image)
                          .setDescription(
                            `<@${player.id}> dropped from ${tierName} League!`,
                          )
                          .setTimestamp()
                          .setFooter({
                            text: `Dropped by ${transactionCreator.username} | Processed by ${user.username}`,
                          });

                        await officialTransaction.send({ embeds: [embed] });
                        collector2.stop();

                        await member.roles.remove(offeringTeamData.roleId);
                        await member.roles.add(faRoles[tierName]);
                        await member.roles.add(FA_LEAGUE_ROLE_ID);

                        // Handle nickname update
                        const userDisplayName =
                          member.nickname || member.user.displayName;
                        if (userDisplayName) {
                          const awards = [];
                          const possibleAwards = ["🏆", "🌟"];
                          let cleanDisplayName = userDisplayName;

                          for (const emoji of possibleAwards) {
                            while (cleanDisplayName.endsWith(emoji)) {
                              awards.push(emoji);
                              cleanDisplayName = cleanDisplayName
                                .slice(0, -emoji.length)
                                .trim();
                            }
                          }

                          awards.reverse();

                          if (cleanDisplayName.includes("|")) {
                            const userNameParts = cleanDisplayName.split(" | ");
                            const newFullName = `${userNameParts[0]} | FA${
                              awards.length > 0 ? " " + awards.join("") : ""
                            }`;

                            if (newFullName.length <= 32) {
                              await member.setNickname(newFullName);
                            } else {
                              await transactionVerify.send(
                                `<@351480764602515487> ${player.username}'s nickname is too long. Please manually update it.`,
                              );
                            }
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
                        content: `The transaction for ${offeringTeamName} dropping <@${player.id}> from ${tierName} has been denied by ${user.username}!`,
                      });
                      collector2.stop();
                    }
                  } catch (error) {
                    console.error(
                      "Error in GM drop verification collector:",
                      error,
                    );
                  }
                });
              }
            } else if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The drop of <@${player.id}> has been cancelled.`,
              );
              collector.stop();
            }
          } catch (error) {
            console.error("Error in GM drop collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The drop offer to <@${player.id}> has expired.`,
            );
          }
        });
      }

      await interaction.editReply({
        content: `Drop process initiated for <@${player.id}>!`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in drop command:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while processing the drop.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "An error occurred while processing the drop.",
          ephemeral: true,
        });
      }
    }
  },
};
