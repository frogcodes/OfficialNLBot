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
    .setName("promote")
    .setDescription("Promote a player to captain or up a tier")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to promote")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Select the tier to promote the player to")
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
        .setDescription("Promote this player to captain?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("promotion")
        .setDescription("Promote this player up a tier?")
        .setRequired(false)
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      const { client } = interaction;

      const player = interaction.options.getUser("player");
      const captainPromotion =
        interaction.options.getBoolean("captain") || false;
      const tierPromotion =
        interaction.options.getBoolean("promotion") || false;
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

      const isSelfPromotion = transactionCreator.id === player.id;

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

      if (captainPromotion && tierPromotion) {
        return interaction.editReply({
          content:
            "You cannot promote to captain and promote a tier in the same transaction",
          ephemeral: true,
        });
      } else if (!captainPromotion && !tierPromotion) {
        return interaction.editReply({
          content: "You must select either captain promotion or tier promotion",
          ephemeral: true,
        });
      }

      // Additional validation for captain promotion
      if (captainPromotion && member.roles.cache.has(captainRoles[tier])) {
        return interaction.editReply({
          content: `Player is already a ${tier} captain!`,
          ephemeral: true,
        });
      }

      // Additional validation for tier promotion
      if (tierPromotion && leagueRolesEntry) {
        const [currentTier] = leagueRolesEntry;
        const currentIndex = TIER_HIERARCHY.indexOf(currentTier);
        const targetIndex = TIER_HIERARCHY.indexOf(tier);

        if (targetIndex <= currentIndex) {
          return interaction.editReply({
            content: `Cannot promote from ${currentTier} to ${tier}. Player must move to a higher tier!`,
            ephemeral: true,
          });
        }
      }

      // ------------------------------------ Captain Promotion -----------------------------------------------------------------------------------------------
      if (captainPromotion) {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}> wants to promote <@${player.id}> to **${offeringTeamName} ${tier} Captain**!\n\n**Transaction Creator**: <@${transactionCreator.id}> - React ✅ to confirm or ❌ to cancel\n**Player**: <@${player.id}> - React ✅ to accept or ❌ to decline\n\nBoth parties must confirm for this promotion to proceed. This will expire in 12 hours.`
        );

        await message.react("✅");
        await message.react("❌");

        // Track confirmations
        const confirmations = new Set();
        const requiredUsers = isSelfPromotion
          ? [transactionCreator.id]
          : [transactionCreator.id, player.id];

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            requiredUsers.includes(user.id)
          );
        };

        const collector = message.createReactionCollector({
          filter: filter1,
          time: 43_200_000,
        });

        collector.on("collect", async (reaction, user) => {
          try {
            if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The captain promotion for <@${player.id}> has been **cancelled** by <@${user.id}>.`
              );
              collector.stop();
              return;
            }

            if (reaction.emoji.name === "✅") {
              confirmations.add(user.id);

              // Check if both users have confirmed
              if (confirmations.size === requiredUsers.length) {
                collector.stop();
                const transactionVerify = client.channels.cache.get(
                  transactionVerifyChannel
                );
                if (transactionVerify) {
                  const message2 = await transactionVerify.send(
                    `The **${offeringTeamName}** have promoted <@${player.id}> to **${tier} Captain**!`
                  );

                  await message2.react("✅");
                  await message2.react("❌");

                  const filter2 = async (reaction, user) => {
                    const reactingMember =
                      await reaction.message.guild.members.fetch(user.id);
                    return (
                      ["✅", "❌"].includes(reaction.emoji.name) &&
                      reactingMember.roles.cache.has(TRANSACTION_TEAM_ROLE)
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
                            .setColor(0x00ff00)
                            .setTitle(
                              `${offeringTeamName} promote ${player.username}`
                            )
                            .setThumbnail(offeringTeamData.image)
                            .setDescription(
                              `<@${player.id}> is promoted to ${offeringTeamName} ${tier} Captain`
                            )
                            .setTimestamp()
                            .setFooter({
                              text: `Promotion by ${transactionCreator.username} | Processed by ${user.username}`,
                            });

                          await officialTransaction.send({ embeds: [embed] });
                          collector2.stop();

                          await member.roles.add(captainRoles[tier]);

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
                          content: `The transaction for ${offeringTeamName} promoting <@${player.id}> to ${tier} Captain has been denied by ${user.username}!`,
                        });
                        collector2.stop();

                        // Clean up messages
                        if (message.deletable) {
                          await message.delete();
                        }
                        if (message2.deletable) {
                          await message2.delete();
                        }
                      }
                    } catch (error) {
                      console.error(
                        "Error in captain promotion verification collector:",
                        error
                      );
                    }
                  });
                }
              } else {
                // Update message to show partial confirmation
                const confirmedUsers = requiredUsers.filter((id) =>
                  confirmations.has(id)
                );
                const pendingUsers = requiredUsers.filter(
                  (id) => !confirmations.has(id)
                );

                await message.edit(
                  `<@${transactionCreator.id}> wants to promote <@${
                    player.id
                  }> to **${offeringTeamName} ${tier} Captain**!\n\n**Confirmed**: ${confirmedUsers
                    .map((id) => `<@${id}>`)
                    .join(", ")}\n**Pending**: ${pendingUsers
                    .map((id) => `<@${id}>`)
                    .join(
                      ", "
                    )}\n\nBoth parties must confirm for this promotion to proceed. This will expire in 12 hours.`
                );
              }
            }
          } catch (error) {
            console.error("Error in captain promotion collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The captain promotion for <@${player.id}> has **expired**.`
            );
          }
        });

        await interaction.editReply({
          content: `Captain promotion initiated for <@${player.id}>! Both you and the player must confirm.`,
          ephemeral: true,
        });
      }

      // -------------------------------------------------------------------- Tier Promotion -------------------------------------------------------------------------------------
      else if (tierPromotion) {
        const message = await offerChannel.send(
          `<@${transactionCreator.id}> wants to promote <@${player.id}> to **${offeringTeamName} ${tier}**!\n\n**Transaction Creator**: <@${transactionCreator.id}> - React ✅ to confirm or ❌ to cancel\n**Player**: <@${player.id}> - React ✅ to accept or ❌ to decline\n\nBoth parties must confirm for this promotion to proceed. This will expire in 12 hours.`
        );

        await message.react("✅");
        await message.react("❌");

        // Track confirmations
        const confirmations = new Set();
        const requiredUsers = isSelfPromotion
          ? [transactionCreator.id]
          : [transactionCreator.id, player.id];

        const filter1 = (reaction, user) => {
          return (
            ["✅", "❌"].includes(reaction.emoji.name) &&
            requiredUsers.includes(user.id)
          );
        };

        const collector = message.createReactionCollector({
          filter: filter1,
          time: 43_200_000,
        });

        collector.on("collect", async (reaction, user) => {
          try {
            if (reaction.emoji.name === "❌") {
              await offerChannel.send(
                `The tier promotion for <@${player.id}> has been **cancelled** by <@${user.id}>.`
              );
              collector.stop();
              return;
            }

            if (reaction.emoji.name === "✅") {
              confirmations.add(user.id);

              // Check if both users have confirmed
              if (confirmations.size === requiredUsers.length) {
                collector.stop();
                const transactionVerify = client.channels.cache.get(
                  transactionVerifyChannel
                );
                if (transactionVerify) {
                  const message2 = await transactionVerify.send(
                    `The **${offeringTeamName}** have promoted <@${player.id}> to **${tier}**!`
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
                            .setColor(0x00ff00)
                            .setTitle(
                              `${offeringTeamName} promote ${player.username}`
                            )
                            .setThumbnail(offeringTeamData.image)
                            .setDescription(
                              `<@${player.id}> is promoted to ${offeringTeamName} ${tier}!`
                            )
                            .setTimestamp()
                            .setFooter({
                              text: `Promoted by ${transactionCreator.username} | Processed by ${user.username}`,
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
                          content: `The transaction for ${offeringTeamName} promoting <@${player.id}> to ${tier} has been denied by ${user.username}!`,
                        });
                        collector2.stop();

                        // Clean up messages
                        if (message.deletable) {
                          await message.delete();
                        }
                        if (message2.deletable) {
                          await message2.delete();
                        }
                      }
                    } catch (error) {
                      console.error(
                        "Error in tier promotion verification collector:",
                        error
                      );
                    }
                  });
                }
              } else {
                // Update message to show partial confirmation
                const confirmedUsers = requiredUsers.filter((id) =>
                  confirmations.has(id)
                );
                const pendingUsers = requiredUsers.filter(
                  (id) => !confirmations.has(id)
                );

                await message.edit(
                  `<@${transactionCreator.id}> wants to promote <@${
                    player.id
                  }> to **${offeringTeamName} ${tier}**!\n\n**Confirmed**: ${confirmedUsers
                    .map((id) => `<@${id}>`)
                    .join(", ")}\n**Pending**: ${pendingUsers
                    .map((id) => `<@${id}>`)
                    .join(
                      ", "
                    )}\n\nBoth parties must confirm for this promotion to proceed. This will expire in 12 hours.`
                );
              }
            }
          } catch (error) {
            console.error("Error in tier promotion collector:", error);
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            await offerChannel.send(
              `The tier promotion for <@${player.id}> has **expired**.`
            );
          }
        });

        await interaction.editReply({
          content: `Tier promotion initiated for <@${player.id}>! Both you and the player must confirm.`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("Error in promote command:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while processing the promotion.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "An error occurred while processing the promotion.",
          ephemeral: true,
        });
      }
    }
  },
};
