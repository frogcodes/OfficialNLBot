const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { captainRoles } = require("../../data/roles.json");
const teams = require("../../data/teams.json");
const {
  refreshSchedulingControlMessage,
} = require("../../utils/scheduling/controlMessage.js");
const {
  normalizeWeekStartDate,
} = require("../../utils/scheduling/dateUtils.js");
const { ensureAvailabilitySession } = require("../../utils/scheduling/service.js");
const {
  loadSchedule,
  setMatchThreadId,
} = require("../../utils/scheduling/scheduleStore.js");

const SCHEDULING_TEAM_ID = "1273103635294982246";
const zookeeperID = "1181050438926209076";
const handlerID = "1181050438926209074";
const schedChannels = {
  Apex: "1409328870326534217",
  Alpha: "1409328900626190427",
  Beta: "1409329070445170768",
  Delta: "1409329142394126407",
  Omega: "1409329220617895986",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("thread-create")
    .setDescription("Create the weekly scheduling threads")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option
        .setName("week-number")
        .setDescription("The week number for threads")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("week-start-date")
        .setDescription("Monday date for this scheduling week (MM/DD/YYYY)")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const weekNum = interaction.options.getInteger("week-number");
    const weekStartInput = interaction.options.getString("week-start-date");
    let weekStartDate;

    try {
      weekStartDate = normalizeWeekStartDate(weekStartInput);
    } catch (error) {
      return await interaction.editReply(error.message);
    }

    const schedule = loadSchedule();
    let week = schedule.weeks[weekNum];

    try {
      for (const gameday of week.gamedays) {
        for (const match of gameday.matches) {
          for (const tier of Object.keys(match.tiers)) {
            // establish roles to filter
            let team1Role = teams[match.teams[0]].roleId;
            let team2Role = teams[match.teams[1]].roleId;
            let tierCaptainRoleID = captainRoles[tier];

            // Fetch the roles concurrently
            const [team1RoleObj, team2RoleObj] = await Promise.all([
              interaction.guild.roles.fetch(team1Role),
              interaction.guild.roles.fetch(team2Role),
            ]);

            // Then get the members of each role
            const team1Members = team1RoleObj.members;
            const team2Members = team2RoleObj.members;

            // Merge members you want to allow
            const allowedMembers = new Map();

            // Add team1 members
            team1Members.forEach((member) => {
              if (
                member.roles.cache.has(tierCaptainRoleID) ||
                member.roles.cache.has(zookeeperID) ||
                member.roles.cache.has(handlerID)
              ) {
                allowedMembers.set(member.id, member);
              }
            });

            // Add team2 members
            team2Members.forEach((member) => {
              if (
                member.roles.cache.has(tierCaptainRoleID) ||
                member.roles.cache.has(zookeeperID) ||
                member.roles.cache.has(handlerID)
              ) {
                allowedMembers.set(member.id, member);
              }
            });

            const channel = await interaction.guild.channels.fetch(
              schedChannels[tier],
            );

            // Create the thread first (remove permissionOverwrites)
            const thread = await channel.threads.create({
              name: `🔴GD ${gameday.gamedayNum} - ${match.teams[0]} vs ${match.teams[1]} - ${tier}`,
              autoArchiveDuration: 10080,
              type: 12, // private thread
            });

            // ADD THIS SECTION - Add members to the private thread
            const membersToAdd = Array.from(allowedMembers.values());

            // Add individual members
            for (const member of membersToAdd) {
              try {
                await thread.members.add(member.id);
              } catch (error) {
                console.error(
                  `Failed to add member ${member.displayName}:`,
                  error,
                );
              }
            }

            // Add members with the scheduling team role
            try {
              const schedulingRole =
                await interaction.guild.roles.fetch(SCHEDULING_TEAM_ID);
              if (schedulingRole) {
                for (const member of schedulingRole.members.values()) {
                  await thread.members.add(member.id);
                }
              }
            } catch (error) {
              console.error("Failed to add scheduling team members:", error);
            }

            //update thread id (serialized + atomic through the schedule store)
            await setMatchThreadId({
              weekIndex: weekNum,
              gamedayNum: gameday.gamedayNum,
              teams: match.teams,
              tier,
              threadId: thread.id,
            });

            //team hosting procedure
            const team1_is_home = Math.random() < 0.5;
            const team2_is_home = !team1_is_home;

            const team1_location = team1_is_home ? "HOME" : "AWAY";
            const team2_location = team2_is_home ? "HOME" : "AWAY";
            const homeRole = team1_is_home ? team1Role : team2Role;
            const welcomeIntro =
              `Welcome <@&${team1Role}> (${team1_location}) and ` +
              `<@&${team2Role}> (${team2_location})! This thread is for ` +
              `your ${tier} GD ${gameday.gamedayNum} match.`;
            const welcomeMessage = [
              welcomeIntro,
              "",
              "- The **HOME** team creates the lobby.",
              "- The **AWAY** team must report the match within 24 hours of finishing.",
              "*The game window is Monday–Sunday. All games are due by Sunday.",
              "IMPORTANT: Games must be scheduled by **WEDNESDAY**.",
              "",
              "If you need an extension, you must request it by **WEDNESDAY**.",
              "",
              "Use the scheduling controls below to submit availability.",
            ].join("\n");

            // send welcome message
            await thread.send({
              content: welcomeMessage,
            });

            ensureAvailabilitySession({
              threadId: thread.id,
              tier,
              teamRoleIds: [team1Role, team2Role],
              homeRoleId: homeRole,
              weekStartDate,
            });

            await refreshSchedulingControlMessage(thread, thread.id);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      await interaction.editReply("Threads created successfully!");
    } catch (error) {
      console.error("Error creating threads:", error);
      await interaction.editReply("Failed to create some threads. Check logs.");
    }
  },
};
