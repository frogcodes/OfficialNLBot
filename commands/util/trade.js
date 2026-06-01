const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const teams = require("../../data/teams.json");
const leagueRoles = require("../../data/roles.json");

// Configuration
const CONFIG = {
  leagueRoles,
  channels: {
    offer: "1363033838841757817",
    transactionVerify: "1363033776648622120",
    officialTransaction: "1181050441845457037",
  },
  roles: {
    transactionTeam: "1181050438926209083",
    zookeeper: "1181050438926209076",
    handler: "1181050438926209074",
  },
  timers: {
    offerExpiry: 43_200_000, // 12 hours
    verificationExpiry: 86_400_000, // 24 hours
  },
};

class TradeError extends Error {
  constructor(message, ephemeral = true) {
    super(message);
    this.ephemeral = ephemeral;
  }
}

// Helper Functions
function validatePermissions(interaction) {
  const { zookeeper, handler } = CONFIG.roles;
  const isOrgStaff =
    interaction.member.roles.cache.has(zookeeper) ||
    interaction.member.roles.cache.has(handler);

  if (!isOrgStaff) {
    throw new TradeError(
      "You must be a zookeeper or handler to initiate trades!"
    );
  }
}

function validateTeamRole(interaction) {
  const teamEntry = Object.entries(teams).find(([_, teamData]) =>
    interaction.member.roles.cache.has(teamData.roleId)
  );

  if (!teamEntry) {
    throw new TradeError("You don't have a team role!");
  }

  return teamEntry;
}

function validatePlayers(guild, players) {
  const validatedPlayers = [];

  for (const player of players) {
    if (!player) continue;

    const member = guild.members.cache.get(player.id);
    if (!member) {
      throw new TradeError(
        `Player ${player.username} not found in this server!`
      );
    }

    validatedPlayers.push({ user: player, member });
  }

  return validatedPlayers;
}

function validatePlayerTeams(validatedPlayers, teams) {
  const playerTeamInfo = [];

  for (const { user, member } of validatedPlayers) {
    // Find which team this player belongs to
    const playerTeamEntry = Object.entries(teams).find(([_, teamData]) =>
      member.roles.cache.has(teamData.roleId)
    );

    if (!playerTeamEntry) {
      throw new TradeError(`${user.username} is not on any team!`);
    }

    const [teamName, teamData] = playerTeamEntry;

    // Find player's league tier
    const leagueRoleEntry = Object.entries(CONFIG.leagueRoles).find(
      ([_, roleId]) => member.roles.cache.has(roleId)
    );

    if (!leagueRoleEntry) {
      throw new TradeError(`${user.username} doesn't have a league role!`);
    }

    const [tierName] = leagueRoleEntry;

    playerTeamInfo.push({
      user,
      member,
      teamName,
      teamData,
      tierName,
      leagueRoleId: leagueRoleEntry[1],
    });
  }

  return playerTeamInfo;
}

function validateTradeTeams(playerTeamInfo) {
  // Get unique teams involved in trade
  const teamsInvolved = [...new Set(playerTeamInfo.map((p) => p.teamName))];

  if (teamsInvolved.length !== 2) {
    throw new TradeError("Trade must involve exactly 2 teams!");
  }

  // Group players by team
  const team1Players = playerTeamInfo.filter(
    (p) => p.teamName === teamsInvolved[0]
  );
  const team2Players = playerTeamInfo.filter(
    (p) => p.teamName === teamsInvolved[1]
  );

  // Validate each team has 1-3 players
  if (team1Players.length === 0 || team1Players.length > 3) {
    throw new TradeError(
      `${teamsInvolved[0]} must have 1-3 players in the trade!`
    );
  }

  if (team2Players.length === 0 || team2Players.length > 3) {
    throw new TradeError(
      `${teamsInvolved[1]} must have 1-3 players in the trade!`
    );
  }

  return { team1Players, team2Players };
}

async function updatePlayerNickname(member, newTeamName) {
  try {
    const userDisplayName = member.nickname || member.user.displayName;
    if (!userDisplayName) return;

    const awards = [];
    const possibleAwards = ["🏆", "🌟"];
    let cleanDisplayName = userDisplayName;

    // Extract awards from the display name
    for (const emoji of possibleAwards) {
      while (cleanDisplayName.endsWith(emoji)) {
        awards.push(emoji);
        cleanDisplayName = cleanDisplayName.slice(0, -emoji.length).trim();
      }
    }

    awards.reverse();

    let newFullName;
    if (cleanDisplayName.includes("|")) {
      const userNameParts = cleanDisplayName.split(" | ");
      newFullName = `${userNameParts[0]} | ${newTeamName}${
        awards.length > 0 ? " " + awards.join("") : ""
      }`;
    } else {
      newFullName = `${cleanDisplayName} | ${newTeamName}${
        awards.length > 0 ? " " + awards.join("") : ""
      }`;
    }

    if (newFullName.length <= 32) {
      await member.setNickname(newFullName);
    } else {
      console.log(
        `Nickname too long for ${member.user.username}: ${newFullName}`
      );
    }
  } catch (error) {
    console.error(
      `Error updating nickname for ${member.user.username}:`,
      error
    );
  }
}

async function executePlayerTrade(team1Players, team2Players) {
  try {
    // Trade team1 players to team2
    for (const playerInfo of team1Players) {
      const { member, teamData: oldTeamData } = playerInfo;
      const newTeamData = team2Players[0].teamData; // Get team2's data

      // Remove old team role, add new team role
      await member.roles.remove(oldTeamData.roleId);
      await member.roles.add(newTeamData.roleId);

      // Update nickname
      await updatePlayerNickname(member, team2Players[0].teamName);
    }

    // Trade team2 players to team1
    for (const playerInfo of team2Players) {
      const { member, teamData: oldTeamData } = playerInfo;
      const newTeamData = team1Players[0].teamData; // Get team1's data

      // Remove old team role, add new team role
      await member.roles.remove(oldTeamData.roleId);
      await member.roles.add(newTeamData.roleId);

      // Update nickname
      await updatePlayerNickname(member, team1Players[0].teamName);
    }
  } catch (error) {
    console.error("Error executing player trade:", error);
    throw new TradeError("Failed to update player roles during trade!");
  }
}

function createTradeEmbed(
  team1Players,
  team2Players,
  transactionCreator,
  approver
) {
  const team1Name = team1Players[0].teamName;
  const team2Name = team2Players[0].teamName;
  const team1Data = team1Players[0].teamData;

  const team1PlayerList = team1Players.map((p) => `<@${p.user.id}>`).join(", ");
  const team2PlayerList = team2Players.map((p) => `<@${p.user.id}>`).join(", ");

  return new EmbedBuilder()
    .setColor(team1Data.color)
    .setTitle(`${team1Name} ⇄ ${team2Name} Trade`)
    .setThumbnail(team1Data.image)
    .addFields(
      {
        name: `${team1Name} receives:`,
        value: team2PlayerList,
        inline: true,
      },
      {
        name: `${team2Name} receives:`,
        value: team1PlayerList,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({
      text: `Trade by ${transactionCreator.username} | Processed by ${approver.username}`,
    });
}

// Main Command
module.exports = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Initiate a trade between two teams")
    .addUserOption((option) =>
      option
        .setName("player1")
        .setDescription("First player in the trade")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("player2")
        .setDescription("Second player in the trade")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("player3")
        .setDescription("Third player in the trade (optional)")
        .setRequired(false)
    )
    .addUserOption((option) =>
      option
        .setName("player4")
        .setDescription("Fourth player in the trade (optional)")
        .setRequired(false)
    )
    .addUserOption((option) =>
      option
        .setName("player5")
        .setDescription("Fifth player in the trade (optional)")
        .setRequired(false)
    )
    .addUserOption((option) =>
      option
        .setName("player6")
        .setDescription("Sixth player in the trade (optional)")
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const { client, guild } = interaction;

      // Get all player options
      const players = [
        interaction.options.getUser("player1"),
        interaction.options.getUser("player2"),
        interaction.options.getUser("player3"),
        interaction.options.getUser("player4"),
        interaction.options.getUser("player5"),
        interaction.options.getUser("player6"),
      ].filter(Boolean); // Remove null/undefined entries

      // Validation
      validatePermissions(interaction);
      const [initiatorTeamName, initiatorTeamData] =
        validateTeamRole(interaction);

      if (players.length < 2) {
        throw new TradeError("Trade must involve at least 2 players!");
      }

      if (players.length > 6) {
        throw new TradeError("Trade can involve at most 6 players!");
      }

      const validatedPlayers = validatePlayers(guild, players);
      const playerTeamInfo = validatePlayerTeams(validatedPlayers, teams);
      const { team1Players, team2Players } = validateTradeTeams(playerTeamInfo);

      // Get offer channel
      const offerChannel = client.channels.cache.get(CONFIG.channels.offer);
      if (!offerChannel) {
        throw new TradeError("Offer channel not found!");
      }

      // Create trade summary
      const team1Name = team1Players[0].teamName;
      const team2Name = team2Players[0].teamName;
      const team1PlayerList = team1Players
        .map((p) => p.user.username)
        .join(", ");
      const team2PlayerList = team2Players
        .map((p) => p.user.username)
        .join(", ");

      // Create confirmation message
      const message = await offerChannel.send(
        `🔄 **TRADE PROPOSAL** 🔄\n\n` +
          `**${team1Name}** trades: ${team1PlayerList}\n` +
          `**${team2Name}** trades: ${team2PlayerList}\n\n` +
          `<@${interaction.user.id}> ✅ to confirm or ❌ to cancel. This will expire in 12 hours.`
      );

      await message.react("✅");
      await message.react("❌");

      const filter = (reaction, user) => {
        return (
          ["✅", "❌"].includes(reaction.emoji.name) &&
          user.id === interaction.user.id
        );
      };

      const collector = message.createReactionCollector({
        filter,
        time: CONFIG.timers.offerExpiry,
      });

      collector.on("collect", async (reaction, user) => {
        try {
          if (reaction.emoji.name === "✅") {
            collector.stop();

            // Proceed to verification
            const transactionVerify = client.channels.cache.get(
              CONFIG.channels.transactionVerify
            );
            if (!transactionVerify) {
              throw new TradeError("Verification channel not found!");
            }

            const verifyMessage = await transactionVerify.send(
              `🔄 **TRADE VERIFICATION** 🔄\n\n` +
                `**${team1Name}** trades: ${team1PlayerList}\n` +
                `**${team2Name}** trades: ${team2PlayerList}\n\n` +
                `Transaction team members, react to approve or deny.`
            );

            await verifyMessage.react("✅");
            await verifyMessage.react("❌");

            const verifyFilter = async (reaction, user) => {
              try {
                const member = await reaction.message.guild.members.fetch(
                  user.id
                );
                return (
                  ["✅", "❌"].includes(reaction.emoji.name) &&
                  member.roles.cache.has(CONFIG.roles.transactionTeam)
                );
              } catch (error) {
                console.error("Error in verification filter:", error);
                return false;
              }
            };

            const verifyCollector = verifyMessage.createReactionCollector({
              filter: verifyFilter,
              time: CONFIG.timers.verificationExpiry,
            });

            verifyCollector.on("collect", async (reaction, user) => {
              try {
                if (user.bot) return;

                if (reaction.emoji.name === "✅") {
                  verifyCollector.stop();

                  // Execute the trade
                  await executePlayerTrade(team1Players, team2Players);

                  // Post to official transaction channel
                  const officialTransaction = client.channels.cache.get(
                    CONFIG.channels.officialTransaction
                  );
                  if (officialTransaction) {
                    const embed = createTradeEmbed(
                      team1Players,
                      team2Players,
                      interaction.user,
                      user
                    );

                    await officialTransaction.send({ embeds: [embed] });
                  }

                  // Clean up messages
                  try {
                    if (message.deletable) await message.delete();
                    if (verifyMessage.deletable) await verifyMessage.delete();
                  } catch (error) {
                    console.error("Error deleting messages:", error);
                  }

                  await offerChannel.send(
                    `✅ **TRADE COMPLETED** between **${team1Name}** and **${team2Name}**!`
                  );
                } else if (reaction.emoji.name === "❌") {
                  verifyCollector.stop();
                  await offerChannel.send(
                    `❌ The trade between **${team1Name}** and **${team2Name}** has been **denied** by ${user.username}!`
                  );
                }
              } catch (error) {
                console.error("Error in trade verification collector:", error);
                verifyCollector.stop();
              }
            });

            verifyCollector.on("end", async (collected, reason) => {
              if (reason === "time") {
                await offerChannel.send(
                  `⏰ Trade verification between **${team1Name}** and **${team2Name}** has **expired**.`
                );
              }
            });
          } else if (reaction.emoji.name === "❌") {
            collector.stop();
            await offerChannel.send(
              `❌ Trade between **${team1Name}** and **${team2Name}** has been **cancelled**.`
            );
          }
        } catch (error) {
          console.error("Error in trade collector:", error);
          collector.stop();
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          await offerChannel.send(
            `⏰ Trade proposal between **${team1Name}** and **${team2Name}** has **expired**.`
          );
        }
      });

      await interaction.reply({
        content: `Trade proposal initiated between **${team1Name}** and **${team2Name}**!`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in trade command:", error);

      const errorMessage =
        error instanceof TradeError
          ? error.message
          : "An unexpected error occurred during the trade process.";

      const ephemeral = error instanceof TradeError ? error.ephemeral : true;

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral });
      }
    }
  },
};
