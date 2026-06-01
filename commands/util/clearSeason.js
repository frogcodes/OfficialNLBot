const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const teamRoles = {
  apex: "1181050438896844812",
  alpha: "1181054433866551347",
  beta: "1181050438896844810",
  delta: "1181054439134593064",
  omega: "1181050438880071698",
  apexCap: "1181050438896844813",
  alphaCap: "1181054441714090026",
  betaCap: "1181050438896844811",
  deltaCap: "1181054431047995422",
  omegaCap: "1181050438880071699",
  omegaFa: "1181050438771019805",
  deltaFa: "1181054413071196232",
  betaFa: "1181050438787792917",
  alphaFa: "1181054419714977933",
  apexFa: "1181050438787792918",
  "Blue Jays": "1181050438909444126",
  Cardinals: "1181050438909444125",
  Cheetahs: "1181050438909444117",
  Huskies: "1336434110721163358",
  Kangaroos: "1181050438896844815",
  Lions: "1227739279359217767",
  Narwhals: "1272804311688151162",
  Owls: "1181050438909444124",
  Panthers: "1181050438909444119",
  Raccoons: "1272804635136098345",
  Sharks: "1181050438909444122",
  Squirrels: "1181050438926209077",
  Stingrays: "1181050438909444120",
  Whales: "1181050438909444123",
  Wolves: "1181050438896844817",
  Yetis: "1272803821709557820",
  Enrolled: "1337883747629928611",
  Processed: "1337882326566440960",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearseason")
    .setDescription("Remove all team/tier roles and clean up nicknames")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const guild = interaction.guild;

    await interaction.reply({
      content: "Clearing season roles and resetting nicknames...",
      ephemeral: true,
    });

    await guild.members.fetch(); // Make sure cache is full

    const allRoleIds = Object.values(teamRoles).filter((id) => id);

    const logFilePath = path.join(__dirname, "roleRemovalLog.json");

    // Ensure the log file exists
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, JSON.stringify([], null, 2));
    }

    const roleRemovals = []; // Collect log entries

    for (const [id, member] of guild.members.cache) {
      const rolesToRemove = allRoleIds.filter((roleId) =>
        member.roles.cache.has(roleId)
      );

      if (rolesToRemove.length === 0) continue;

      // Remove all roles at once
      try {
        await member.roles.remove(rolesToRemove);

        // Log all removals for this member
        rolesToRemove.forEach((roleId) => {
          roleRemovals.push({
            user: member.user.tag,
            userId: member.id,
            roleRemoved: roleId,
            date: new Date().toISOString(),
          });
        });
      } catch (err) {
        console.error(`Failed to remove roles from ${member.user.tag}:`, err);
      }

      // Clean nickname ONCE per member
      try {
        const originalName = member.nickname || member.user.username;
        let currentName = originalName;
        let awards = [];

        const possibleAwards = ["🏆", "🌟"];
        for (const emoji of possibleAwards) {
          while (currentName.endsWith(emoji)) {
            awards.push(emoji);
            currentName = currentName.slice(0, -emoji.length).trim();
          }
        }
        awards.reverse();

        let newFullName;
        if (!currentName.includes("|")) {
          newFullName = `${currentName} ${awards.join("")}`.trim();
        } else {
          const nameParts = currentName.split(" | ");
          newFullName = `${nameParts[0]} ${awards.join("")}`.trim();
        }

        if (newFullName !== originalName) {
          await member.setNickname(newFullName);
        }
      } catch (err) {
        console.error(`Failed to set nickname for ${member.user.tag}:`, err);
      }
    }

    // Write all logs at once using async I/O
    let logData = [];
    try {
      const fileContent = await fs.promises.readFile(logFilePath, "utf8");
      logData = JSON.parse(fileContent);
    } catch (err) {
      // File doesn't exist or is invalid, start fresh
      console.log("Starting new log file");
    }

    logData.push(...roleRemovals);
    await fs.promises.writeFile(logFilePath, JSON.stringify(logData, null, 2));

    await interaction.editReply({
      content: `✅ Season cleared! Processed ${guild.members.cache.size} members, removed ${roleRemovals.length} role assignments.`,
    });
  },
};
