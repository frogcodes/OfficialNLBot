const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { captainRoles } = require("../../data/roles.json");
const teams = require("../../data/teams.json");

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
    .setName("custom-thread-create")
    .setDescription("Create scheduling threads for a specific match")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("team1")
        .setDescription("First team name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("team2")
        .setDescription("Second team name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("gameday")
        .setDescription("The gameday (e.g., '1', '2', 'Playoffs')")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("custom-message")
        .setDescription("Custom message to include in the thread")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("apex")
        .setDescription("Create thread for Apex tier?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("alpha")
        .setDescription("Create thread for Alpha tier?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("beta")
        .setDescription("Create thread for Beta tier?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("delta")
        .setDescription("Create thread for Delta tier?")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("omega")
        .setDescription("Create thread for Omega tier?")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const team1Name = interaction.options.getString("team1");
    const team2Name = interaction.options.getString("team2");
    const gamedayNum = interaction.options.getString("gameday");
    const customMessage = interaction.options.getString("custom-message") || "";

    // Check if teams exist
    if (!teams[team1Name]) {
      return await interaction.editReply(
        `Error: Team "${team1Name}" not found in teams data.`
      );
    }
    if (!teams[team2Name]) {
      return await interaction.editReply(
        `Error: Team "${team2Name}" not found in teams data.`
      );
    }

    // Determine which tiers to create threads for
    const tiersToCreate = [];
    const tierOptions = ["Apex", "Alpha", "Beta", "Delta", "Omega"];

    for (const tier of tierOptions) {
      const tierOption = interaction.options.getBoolean(tier.toLowerCase());
      // If not specified, default to true (create all threads)
      if (tierOption === null || tierOption === true) {
        tiersToCreate.push(tier);
      }
    }

    if (tiersToCreate.length === 0) {
      return await interaction.editReply(
        "No tiers selected. At least one tier must be enabled."
      );
    }

    const team1Role = teams[team1Name].roleId;
    const team2Role = teams[team2Name].roleId;

    let createdThreads = [];
    let failedThreads = [];

    // Create threads for each selected tier
    for (const tier of tiersToCreate) {
      try {
        const tierCaptainRoleID = captainRoles[tier];

        // Fetch the roles concurrently
        const [team1RoleObj, team2RoleObj] = await Promise.all([
          interaction.guild.roles.fetch(team1Role),
          interaction.guild.roles.fetch(team2Role),
        ]);

        // Get the members of each role
        const team1Members = team1RoleObj.members;
        const team2Members = team2RoleObj.members;

        // Merge members you want to allow
        const allowedMembers = new Map();

        // Add team1 members who are captains, zookeepers, or handlers
        team1Members.forEach((member) => {
          if (
            member.roles.cache.has(tierCaptainRoleID) ||
            member.roles.cache.has(zookeeperID) ||
            member.roles.cache.has(handlerID)
          ) {
            allowedMembers.set(member.id, member);
          }
        });

        // Add team2 members who are captains, zookeepers, or handlers
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
          schedChannels[tier]
        );

        // Create the private thread
        const thread = await channel.threads.create({
          name: `${gamedayNum} - ${team1Name} vs ${team2Name} - ${tier}`,
          autoArchiveDuration: 10080,
          type: 12, // private thread
        });

        // Add individual members to the thread
        const membersToAdd = Array.from(allowedMembers.values());

        for (const member of membersToAdd) {
          try {
            await thread.members.add(member.id);
          } catch (error) {
            console.error(
              `Failed to add member ${member.displayName} to ${tier}:`,
              error
            );
          }
        }

        // Add members with the scheduling team role
        try {
          const schedulingRole = await interaction.guild.roles.fetch(
            SCHEDULING_TEAM_ID
          );
          if (schedulingRole) {
            for (const member of schedulingRole.members.values()) {
              await thread.members.add(member.id);
            }
          }
        } catch (error) {
          console.error(
            `Failed to add scheduling team members to ${tier}:`,
            error
          );
        }

        // Send welcome message
        const welcomeMsg = `Welcome <@&${team1Role}> and <@&${team2Role}>!${
          customMessage ? " " + customMessage : ""
        }`;
        await thread.send(welcomeMsg);

        createdThreads.push(tier);
      } catch (error) {
        console.error(`Failed to create thread for ${tier}:`, error);
        failedThreads.push(tier);
      }
    }

    // Send summary response
    let response = `**Thread Creation Summary**\n`;
    response += `Match: **${team1Name}** vs **${team2Name}** (Gameday ${gamedayNum})\n\n`;

    if (createdThreads.length > 0) {
      response += `✅ Successfully created threads for: ${createdThreads.join(
        ", "
      )}\n`;
    }

    if (failedThreads.length > 0) {
      response += `❌ Failed to create threads for: ${failedThreads.join(
        ", "
      )}\n`;
    }

    await interaction.editReply(response);
  },
};
