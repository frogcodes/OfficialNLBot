const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const schedulePath = path.join(__dirname, "../../data/schedule.json");
const teams = require("../../data/teams.json");
const { captainRoles } = require("../../data/roles.json");

const scheduledChannelId = "1291170555856162887";

function loadSchedule() {
  const raw = fs.readFileSync(schedulePath, "utf8");
  return JSON.parse(raw);
}

function saveSchedule(schedule) {
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
}

// Create an array of team names for choices
const teamChoices = Object.keys(teams).map((name) => ({
  name: name,
  value: name,
}));

// Define tier choices based on your schedule structure
const tierChoices = [
  { name: "Apex", value: "Apex" },
  { name: "Alpha", value: "Alpha" },
  { name: "Beta", value: "Beta" },
  { name: "Delta", value: "Delta" },
  { name: "Omega", value: "Omega" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule a match between two teams")
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Select the tier")
        .setRequired(true)
        .addChoices(...tierChoices)
    )
    .addStringOption((option) =>
      option
        .setName("team1")
        .setDescription("Select the first team")
        .setRequired(true)
        .addChoices(...teamChoices)
    )
    .addStringOption((option) =>
      option
        .setName("team2")
        .setDescription("Select the second team")
        .setRequired(true)
        .addChoices(...teamChoices)
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("Date of the match (MM/DD/YYYY HH:MM)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("gameday")
        .setDescription("Gameday Number of the match")
        .setRequired(true)
        .addChoices(
          { name: "Gameday 1", value: "1" },
          { name: "Gameday 2", value: "2" },
          { name: "Gameday 3", value: "3" },
          { name: "Gameday 4", value: "4" },
          { name: "Gameday 5", value: "5" },
          { name: "Gameday 6", value: "6" },
          { name: "Gameday 7", value: "7" },
          { name: "Gameday 8", value: "8" },
          { name: "Gameday 9", value: "9" },
          { name: "Gameday 10", value: "10" },
          { name: "Gameday 11", value: "11" },
          { name: "Gameday 12", value: "12" },
          { name: "Gameday 13", value: "13" },
          { name: "Gameday 14", value: "14" },
          { name: "Gameday 15", value: "15" },
          { name: "Gameday 16", value: "16" },
          { name: "Gameday 17", value: "17" },
          { name: "Gameday 18", value: "18" },
          { name: "Gameday 19", value: "19" },
          { name: "Gameday 20", value: "20" },
          { name: "Gameday 21", value: "21" },
          { name: "Gameday 22", value: "22" },
          { name: "Gameday 23", value: "23" }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const tier = interaction.options.getString("tier");
    const team1Name = interaction.options.getString("team1");
    const team2Name = interaction.options.getString("team2");
    const dateInput = interaction.options.getString("date");
    const gamedayNum = interaction.options.getString("gameday");

    // Validate teams are different
    if (team1Name === team2Name) {
      return interaction.editReply("❌ A team cannot play against itself.");
    }

    // Lookup teams from teams.json
    const team1 = teams[team1Name];
    const team2 = teams[team2Name];

    if (!team1 || !team2) {
      return interaction.editReply("❌ One of the teams is invalid.");
    }

    // Validate date format
    const dateRegex =
      /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4} ([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!dateRegex.test(dateInput)) {
      return interaction.editReply(
        "❌ Invalid date format. Use MM/DD/YYYY HH:MM (e.g., 12/25/2024 15:30)"
      );
    }

    // Load schedule.json
    let schedule;
    try {
      if (fs.existsSync(schedulePath)) {
        schedule = loadSchedule();

        // Ensure schedule has the required structure
        if (!schedule.weeks || !Array.isArray(schedule.weeks)) {
          return interaction.editReply(
            "❌ Invalid schedule format. Please contact an administrator."
          );
        }
      } else {
        return interaction.editReply(
          "❌ Schedule file not found. Please contact an administrator."
        );
      }
    } catch (error) {
      console.error("Error loading schedule.json:", error);
      return interaction.editReply(
        "❌ Error loading schedule data. Please contact an administrator."
      );
    }

    // Find the match in the schedule
    let foundMatch = null;
    let foundWeek = null;
    let foundGameday = null;

    for (const week of schedule.weeks) {
      const gameday = week.gamedays.find((g) => g.gamedayNum === gamedayNum);

      if (gameday) {
        for (const match of gameday.matches) {
          const hasTeam1 = match.teams.includes(team1Name);
          const hasTeam2 = match.teams.includes(team2Name);

          if (
            hasTeam1 &&
            hasTeam2 &&
            match.tiers[tier] &&
            !match.tiers[tier].scheduled
          ) {
            foundMatch = match;
            foundWeek = week;
            foundGameday = gameday;
            break;
          }
        }
      }
      if (foundMatch) break;
    }

    if (!foundMatch) {
      return interaction.editReply(
        `No unscheduled match found for ${team1Name} vs ${team2Name} on Gameday ${gamedayNum}.`
      );
    }

    // Get the thread using the stored thread ID
    if (!foundMatch.tiers[tier].threadID) {
      return interaction.editReply(
        `❌ No thread ID found for this ${tier} match. Please contact an administrator.`
      );
    }

    const thread = interaction.guild.channels.cache.get(
      foundMatch.tiers[tier].threadID
    );

    if (!thread) {
      return interaction.editReply(
        `❌ Could not find the match thread (ID: ${foundMatch.tiers[tier].threadID}). The thread may have been deleted.`
      );
    }

    // Ask captains to confirm inside the thread
    const confirmMessage = await thread.send({
      content: `**Match Scheduling Confirmation**\n\n**Week ${foundWeek.weekNumber} - Gameday ${foundGameday.gamedayNum}**\nCaptains of <@&${team1.roleId}> and <@&${team2.roleId}>, please confirm this **${tier}** tier match is scheduled for **${dateInput}**.\n\n✅ React with ✅ to confirm\n❌ React with ❌ to cancel`,
    });

    await confirmMessage.react("✅");
    await confirmMessage.react("❌");

    const filter = (reaction, user) => {
      if (user.bot) return false;
      return reaction.emoji.name === "✅" || reaction.emoji.name === "❌";
    };

    const collector = confirmMessage.createReactionCollector({
      filter,
      time: 1000 * 60 * 60 * 12, // 12 hours
    });

    let confirmedCaptains = new Set();
    let cancelledBy = null;

    collector.on("collect", async (reaction, user) => {
      if (user.id === interaction.client.user.id) return;

      const member = interaction.guild.members.cache.get(user.id);
      if (!member) return;

      // Check if user is captain of either team
      console.log(`Checking captain status for user ${user.tag} (${user.id})`);
      console.log(`Tier: ${tier}`);
      console.log(`Captain role for tier: ${captainRoles[tier]}`);
      console.log(`Team1: ${team1Name}, Role ID: ${team1.roleId}`);
      console.log(`Team2: ${team2Name}, Role ID: ${team2.roleId}`);
      console.log(
        `User's roles:`,
        member.roles.cache.map((role) => `${role.name} (${role.id})`)
      );

      const hasCaptainRole = member.roles.cache.has(captainRoles[tier]);
      const hasTeam1Role = member.roles.cache.has(team1.roleId);
      const hasTeam2Role = member.roles.cache.has(team2.roleId);

      console.log(
        `Has captain role (${captainRoles[tier]}): ${hasCaptainRole}`
      );
      console.log(`Has team1 role (${team1.roleId}): ${hasTeam1Role}`);
      console.log(`Has team2 role (${team2.roleId}): ${hasTeam2Role}`);

      const isCaptain1 = hasCaptainRole && hasTeam1Role;
      const isCaptain2 = hasCaptainRole && hasTeam2Role;

      console.log(`Is captain of team1: ${isCaptain1}`);
      console.log(`Is captain of team2: ${isCaptain2}`);
      console.log(`Is valid captain: ${isCaptain1 || isCaptain2}`);

      if (!isCaptain1 && !isCaptain2) {
        // Remove reaction if user is not a captain
        await reaction.users.remove(user.id);
        return;
      }

      if (reaction.emoji.name === "❌") {
        cancelledBy = user;
        collector.stop("cancelled");
        return;
      }

      if (reaction.emoji.name === "✅") {
        confirmedCaptains.add(user.id);

        // Need confirmation from at least one captain from each team
        const team1Confirmed = Array.from(confirmedCaptains).some((id) => {
          const member = interaction.guild.members.cache.get(id);
          return (
            member?.roles.cache.has(captainRoles[tier]) &&
            member?.roles.cache.has(team1.roleId)
          );
        });

        const team2Confirmed = Array.from(confirmedCaptains).some((id) => {
          const member = interaction.guild.members.cache.get(id);
          return (
            member?.roles.cache.has(captainRoles[tier]) &&
            member?.roles.cache.has(team2.roleId)
          );
        });

        if (team1Confirmed && team2Confirmed) {
          collector.stop("confirmed");
        }
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "cancelled") {
        await thread.send(
          `❌ Match scheduling cancelled by <@${cancelledBy.id}>.`
        );
        return interaction.editReply("❌ Match scheduling was cancelled.");
      }

      if (reason !== "confirmed") {
        await thread.send("⏰ Match scheduling timed out. Please try again.");
        return interaction.editReply(
          "⏰ Match scheduling timed out. Please try again."
        );
      }

      // reload and update schedule.json - only flip the boolean
      schedule = loadSchedule();

      for (const week of schedule.weeks) {
        for (const gameday of week.gamedays) {
          for (const match of gameday.matches) {
            if (
              match.teams.includes(team1Name) &&
              match.teams.includes(team2Name) &&
              match.tiers[tier]
            ) {
              match.tiers[tier].scheduled = true;
            }
          }
        }
      }
      try {
        saveSchedule(schedule);
      } catch (error) {
        console.error("Error writing schedule.json:", error);
        await thread.send(
          "❌ Error saving schedule. Please contact an administrator."
        );
        return interaction.editReply(
          "❌ Error saving schedule. Please contact an administrator."
        );
      }
      // Send embed to scheduled games channel
      const scheduledChannel =
        interaction.guild.channels.cache.get(scheduledChannelId);

      const embed = new EmbedBuilder()
        .setTitle("📅 Match Scheduled!")
        .setDescription(`**${team1Name}** vs **${team2Name}**`)
        .addFields(
          {
            name: "Gameday",
            value: foundGameday.gamedayNum.toString(),
            inline: true,
          },
          { name: "Tier", value: tier, inline: true },
          { name: "Date & Time", value: dateInput, inline: false }
        )
        .setColor(0x00ff00) // Green color
        .setTimestamp();

      if (scheduledChannel) {
        try {
          await scheduledChannel.send({ embeds: [embed] });
        } catch (error) {
          console.error("Error sending to scheduled channel:", error);
        }
      }

      const newName = thread.name.replace("🔴", "").trim();
      await thread.setName(newName);

      await thread.send(
        `✅ **${tier}** tier match successfully scheduled for **${dateInput}**!`
      );
      await interaction.editReply("✅ Match scheduled successfully.");
    });
  },
};
