const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const teams = require("../../data/teams.json");
const { teamImage } = require("../../utils/teamImage.js");
const { faRoles, captainRoles, leagueRoles } = require("../../data/roles.json");
const esubCap = require("../../utils/esubCap.js");

// Channel / role IDs
const transactionRequestChannel = "1363033776648622120"; // transactions request
const officialTransactionChannel = "1181050441845457037"; // transactions channel
const rfaRole = "1198452739378786324";
const zookeeper = "1181050438926209076";
const handler = "1181050438926209074";

const OFFER_EXPIRY = 43_200_000; // 12 hours

const tierChoices = ["Apex", "Alpha", "Beta", "Delta", "Omega"].map((t) => ({
  name: t,
  value: t,
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("esub")
    .setDescription("Request an emergency sub (FA) for your team in a tier")
    .addUserOption((option) =>
      option
        .setName("player-in")
        .setDescription("The Free Agent subbing IN")
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName("player-out")
        .setDescription("The rostered player subbing OUT")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("The tier of the esub")
        .setRequired(true)
        .addChoices(...tierChoices),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      const { client, guild } = interaction;

      const playerIn = interaction.options.getUser("player-in");
      const playerOut = interaction.options.getUser("player-out");
      const tier = interaction.options.getString("tier");

      if (playerIn.id === playerOut.id) {
        return interaction.editReply({
          content: "The player subbing in and out can't be the same person!",
        });
      }

      // Initiator must have a team role (identifies the org)
      const initiatorTeamEntry = Object.entries(teams).find(([_, teamData]) =>
        interaction.member.roles.cache.has(teamData.roleId),
      );
      if (!initiatorTeamEntry) {
        return interaction.editReply({ content: "You don't have a team role!" });
      }
      const [teamName, teamData] = initiatorTeamEntry;

      // Initiator must be management for this esub: the tier's captain, or an
      // org handler/zookeeper. (No transaction team involvement.)
      const isOrgStaff =
        interaction.member.roles.cache.has(handler) ||
        interaction.member.roles.cache.has(zookeeper);
      const isTierCaptain = interaction.member.roles.cache.has(
        captainRoles[tier],
      );
      if (!isOrgStaff && !isTierCaptain) {
        return interaction.editReply({
          content: `You must be the **${tier}** captain or a handler/zookeeper to esub in ${tier}.`,
        });
      }

      // Cap check (per team + tier)
      const currentCount = esubCap.getCount(teamName, tier);
      if (currentCount >= esubCap.ESUB_CAP) {
        return interaction.editReply({
          content: `**${teamName}** have already used all ${esubCap.ESUB_CAP} of their **${tier}** esubs this season.`,
        });
      }

      // IN player must be in the server, not RFA, and an FA of this tier
      const memberIn = guild.members.cache.get(playerIn.id);
      if (!memberIn) {
        return interaction.editReply({
          content: "The player subbing in was not found in this server!",
        });
      }
      if (memberIn.roles.cache.has(rfaRole)) {
        return interaction.editReply({
          content: "The player subbing in is an RFA. Please wait for it to expire.",
        });
      }
      if (!memberIn.roles.cache.has(faRoles[tier])) {
        return interaction.editReply({
          content: `The player subbing in must be a **${tier}** Free Agent.`,
        });
      }

      // OUT player must be rostered on this team in this tier
      const memberOut = guild.members.cache.get(playerOut.id);
      if (!memberOut) {
        return interaction.editReply({
          content: "The player subbing out was not found in this server!",
        });
      }
      if (!memberOut.roles.cache.has(teamData.roleId)) {
        return interaction.editReply({
          content: `The player subbing out must be rostered on **${teamName}**.`,
        });
      }
      if (!memberOut.roles.cache.has(leagueRoles[tier])) {
        return interaction.editReply({
          content: `The player subbing out must be rostered in **${tier}**.`,
        });
      }

      // Post the request to the transactions-request channel
      const requestChannel = client.channels.cache.get(
        transactionRequestChannel,
      );
      if (!requestChannel) {
        return interaction.editReply({
          content: "Transactions request channel not found!",
        });
      }

      const requestMsg = await requestChannel.send(
        `🆘 **ESUB REQUEST** 🆘\n\n` +
          `**${teamName}** want to emergency-sub <@${playerIn.id}> **IN** for <@${playerOut.id}> in **${tier}**.\n\n` +
          `<@${playerIn.id}> react ✅ to accept, and a **${tier} captain / handler / zookeeper** react ✅ to approve. ❌ to cancel.\n` +
          `(${currentCount}/${esubCap.ESUB_CAP} ${tier} esubs used) — expires in 12 hours.`,
      );

      await requestMsg.react("✅");
      await requestMsg.react("❌");

      // A user counts as "management" for this esub if they are the tier's
      // captain or an org handler/zookeeper.
      const isManagement = async (user) => {
        const m = await guild.members.fetch(user.id).catch(() => null);
        if (!m) return false;
        return (
          m.roles.cache.has(handler) ||
          m.roles.cache.has(zookeeper) ||
          m.roles.cache.has(captainRoles[tier])
        );
      };

      const filter = async (reaction, user) => {
        if (user.bot) return false;
        if (!["✅", "❌"].includes(reaction.emoji.name)) return false;
        if (user.id === playerIn.id) return true;
        return await isManagement(user);
      };

      const collector = requestMsg.createReactionCollector({
        filter,
        time: OFFER_EXPIRY,
      });

      let playerReacted = false;
      let mgmtReacted = false;
      let finalized = false;

      collector.on("collect", async (reaction, user) => {
        try {
          if (reaction.emoji.name === "❌") {
            collector.stop("cancelled");
            await requestChannel.send(
              `❌ The esub request (<@${playerIn.id}> in for <@${playerOut.id}>, **${teamName}** ${tier}) was cancelled by ${user.username}.`,
            );
            return;
          }

          // ✅ path
          if (user.id === playerIn.id) playerReacted = true;
          if (await isManagement(user)) mgmtReacted = true;

          if (playerReacted && mgmtReacted && !finalized) {
            finalized = true;
            collector.stop("approved");

            // Re-check the cap at finalize time (guards against races)
            if (esubCap.getCount(teamName, tier) >= esubCap.ESUB_CAP) {
              await requestChannel.send(
                `⚠️ **${teamName}** have hit the ${esubCap.ESUB_CAP} **${tier}** esub cap; this esub was not recorded.`,
              );
              if (requestMsg.deletable) await requestMsg.delete().catch(() => {});
              return;
            }

            const newCount = esubCap.increment(teamName, tier);

            const official = client.channels.cache.get(
              officialTransactionChannel,
            );
            if (official) {
              const now = Math.floor(Date.now() / 1000);
              const { thumbnail, files } = teamImage(teamName, teamData);
              const embed = new EmbedBuilder()
                .setColor(teamData.color)
                .setTitle(`${teamName} ${tier} Emergency Sub`)
                .setThumbnail(thumbnail)
                .setDescription(
                  `<@${playerIn.id}> **in** for <@${playerOut.id}> (**${tier}**)`,
                )
                .addFields(
                  {
                    name: "Esubs used",
                    value: `${newCount}/${esubCap.ESUB_CAP}`,
                    inline: true,
                  },
                  {
                    name: "Time",
                    value: `<t:${now}:F>`,
                    inline: true,
                  },
                )
                .setTimestamp()
                .setFooter({ text: `Approved by ${user.username}` });

              await official.send({ embeds: [embed], files });
            }

            if (requestMsg.deletable) await requestMsg.delete().catch(() => {});
          }
        } catch (error) {
          console.error("Error in esub collector:", error);
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          await requestChannel
            .send(
              `⏰ The esub request (<@${playerIn.id}> in for <@${playerOut.id}>, **${teamName}** ${tier}) has expired.`,
            )
            .catch(() => {});
        }
      });

      await interaction.editReply({
        content: `Esub request (<@${playerIn.id}> in for <@${playerOut.id}>, **${tier}**) posted in the transactions request channel.`,
      });
    } catch (error) {
      console.error("Error in esub command:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ content: "An error occurred while processing the esub." })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content: "An error occurred while processing the esub.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  },
};
