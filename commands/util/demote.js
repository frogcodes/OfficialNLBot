const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const teams = require("../../data/teams.json");
const { captainRoles, leagueRoles } = require("../../data/roles.json");

// These should be actual channel IDs
const offerChannelID = "1363033838841757817";
const transactionVerifyChannel = "1363033776648622120";
const officialTransactionChannel = "1181050441845457037";
const TRANSACTION_TEAM_ROLE = "1181050438926209083";
const zookeeper = "1181050438926209076";
const handler = "1181050438926209074";

// Tier hierarchy for validation
const TIER_HIERARCHY = ["Omega", "Delta", "Beta", "Alpha", "Apex"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Demote a player from captain or down a tier")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to demote")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Select the tier to demote the player to")
        .setRequired(true)
        .addChoices(
          { name: "Apex", value: "Apex" },
          { name: "Alpha", value: "Alpha" },
          { name: "Beta", value: "Beta" },
          { name: "Delta", value: "Delta" },
          { name: "Omega", value: "Omega" }
        )
    )
    .addBooleanOption((option) =>
      option
        .setName("captain")
        .setDescription("Remove captain role from this player?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("demotion")
        .setDescription("Demote this player down a tier?")
        .setRequired(false)
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      const { client } = interaction;

      const player = interaction.options.getUser("player");
      const captainDemotion =
        interaction.options.getBoolean("captain") || false;
      const tierDemotion = interaction.options.getBoolean("demotion") || false;
      const tier = interaction.options.getString("tier");

      const member = interaction.guild.members.cache.get(player.id);
      if (!member) {
        return interaction.editReply({
          content: "Player not found in this server!",
          ephemeral: true,
        });
      }

      const captainRoleEntry = Object.entries(captainRoles).find(
        ([_, roleId]) => member.roles.cache.has(roleId)
      );

      const leagueRolesEntry = Object.entries(leagueRoles).find(([_, roleId]) =>
        member.roles.cache.has(roleId)
      );

      const offeringTeamEntry = Object.entries(teams).find(([_, teamData]) =>
        interaction.member.roles.cache.has(teamData.roleId)
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

      // Validate player is on the team
      if (!member.roles.cache.has(offeringTeamEntry[1].roleId)) {
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

      if (captainDemotion && tierDemotion) {
        return interaction.editReply({
          content:
            "You cannot remove captain and demote a player in the same transaction",
          ephemeral: true,
        });
      } else if (!captainDemotion && !tierDemotion) {
        return interaction.editReply({
          content: "You must select either captain demotion or tier demotion",
          ephemeral: true,
        });
      }

      // Additional validation for captain demotion
      if (captainDemotion && !member.roles.cache.has(captainRoles[tier])) {
        return interaction.editReply({
          content: `Player is not a ${tier} captain!`,
          ephemeral: true,
        });
      }

      // Additional validation for tier demotion
      if (tierDemotion && leagueRolesEntry) {
        const [currentTier] = leagueRolesEntry;
        const currentIndex = TIER_HIERARCHY.indexOf(currentTier);
        const targetIndex = TIER_HIERARCHY.indexOf(tier);

        if (targetIndex >= currentIndex) {
          return interaction.editReply({
            content: `Cannot demote from ${currentTier} to ${tier}. Player must move to a lower tier!`,
            ephemeral: true,
          });
        }
      }

      // ------------------------------------ Captain Demotion -----------------------------------------------------------------------------------------------
      if (captainDemotion) {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}> are you sure you want to remove <@${player.id}> from **${offeringTeamName} ${tier} Captain**? ✅ to confirm or ❌ to cancel. This will expire in 12 hours.`
        );

        await message.react("✅");
        await message.react("❌");

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            user.id === transactionCreator.id
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
                transactionVerifyChannel
              );
              if (transactionVerify) {
                const message2 = await transactionVerify.send(
                  `The **${offeringTeamName}** have removed <@${player.id}> from **${tier} Captain**!`
                );

                await message2.react("✅");
                await message2.react("❌");

                const filter2 = async (reaction, user) => {
                  const member = await reaction.message.guild.members.fetch(
                    user.id
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
                        officialTransactionChannel
                      );
                      if (officialTransaction) {
                        const embed = new EmbedBuilder()
                          .setColor(0xff0000)
                          .setTitle(
                            `${offeringTeamName} demote ${player.username}`
                          )
                          .setThumbnail(offeringTeamData.image)
                          .setDescription(
                            `<@${player.id}> is removed from ${offeringTeamName} ${tier} Captain`
                          )
                          .setTimestamp()
                          .setFooter({
                            text: `Demotion by ${transactionCreator.username} | Processed by ${user.username}`,
                          });

                        await officialTransaction.send({ embeds: [embed] });
                        collector2.stop();

                        await member.roles.remove(captainRoles[tier]);

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
                        content: `The transaction for ${offeringTeamName} demoting <@${player.id}> from ${tier} Captain has been denied by ${user.username}!`,
                      });
                    }
                  } catch (error) {
                    console.error(
                      "Error in captain demotion verification collector:",
                      error
                    );
                  }
                });
              }
            } else if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The captain demotion for <@${player.id}> has been **cancelled**.`
              );
              collector.stop();
            }
          } catch (error) {
            console.error("Error in captain demotion collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The captain demotion for <@${player.id}> has **expired**.`
            );
          }
        });

        await interaction.editReply({
          content: `Captain demotion initiated for <@${player.id}>!`,
          ephemeral: true,
        });
      }

      // -------------------------------------------------------------------- Tier Demotion -------------------------------------------------------------------------------------
      else if (tierDemotion) {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}> are you sure you want to demote <@${player.id}> to **${offeringTeamName} ${tier}**? ✅ to confirm or ❌ to cancel. This will expire in 12 hours.`
        );

        await message.react("✅");
        await message.react("❌");

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            user.id === transactionCreator.id
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
                transactionVerifyChannel
              );
              if (transactionVerify) {
                const message2 = await transactionVerify.send(
                  `The **${offeringTeamName}** have demoted <@${player.id}> to **${tier}**!`
                );

                await message2.react("✅");
                await message2.react("❌");

                const filter2 = async (reaction, user) => {
                  const member = await reaction.message.guild.members.fetch(
                    user.id
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
                        officialTransactionChannel
                      );
                      if (officialTransaction) {
                        const embed = new EmbedBuilder()
                          .setColor(0xff0000)
                          .setTitle(
                            `${offeringTeamName} demote ${player.username}`
                          )
                          .setThumbnail(offeringTeamData.image)
                          .setDescription(
                            `<@${player.id}> is demoted to ${offeringTeamName} ${tier}!`
                          )
                          .setTimestamp()
                          .setFooter({
                            text: `Demoted by ${transactionCreator.username} | Processed by ${user.username}`,
                          });

                        await officialTransaction.send({ embeds: [embed] });
                        collector2.stop();

                        // Update league roles
                        if (
                          leagueRolesEntry &&
                          !member.roles.cache.has(leagueRoles[tier])
                        ) {
                          await member.roles.remove(leagueRolesEntry[1]);
                          await member.roles.add(leagueRoles[tier]);
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
                        content: `The transaction for ${offeringTeamName} demoting <@${player.id}> to ${tier} has been denied by ${user.username}!`,
                      });
                    }
                  } catch (error) {
                    console.error(
                      "Error in tier demotion verification collector:",
                      error
                    );
                  }
                });
              }
            } else if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The tier demotion for <@${player.id}> has been **cancelled**.`
              );
              collector.stop();
            }
          } catch (error) {
            console.error("Error in tier demotion collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The tier demotion for <@${player.id}> has **expired**.`
            );
          }
        });

        await interaction.editReply({
          content: `Tier demotion initiated for <@${player.id}>!`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("Error in demote command:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while processing the demotion.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "An error occurred while processing the demotion.",
          ephemeral: true,
        });
      }
    }
  },
};
