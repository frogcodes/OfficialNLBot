const { AttachmentBuilder } = require("discord.js");
const Team = require("../../../models/Team");
const Schedule = require("../../../models/Schedule");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: (subcommand) =>
    subcommand
      .setName("season")
      .setDescription("Initialize a new season")
      .addIntegerOption((option) =>
        option
          .setName("season")
          .setDescription("Season number")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("weeks")
          .setDescription("Number of weeks in the season")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("format")
          .setDescription("Format of the template file")
          .setRequired(true)
          .addChoices(
            { name: "CSV", value: "csv" },
            { name: "TXT", value: "txt" },
            { name: "Auto-generate", value: "auto" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("double_header_weeks")
          .setDescription(
            "Weeks with double headers (comma-separated, e.g., 1,3,5)"
          )
          .setRequired(false)
      ),

  async execute(interaction) {
    try {
      console.log(`[SEASON] Starting season setup command execution`);
      await interaction.deferReply();

      const seasonNumber = interaction.options.getInteger("season");
      const weeks = interaction.options.getInteger("weeks");
      const format = interaction.options.getString("format");
      const doubleHeaderWeeksStr =
        interaction.options.getString("double_header_weeks") || "";

      console.log(
        `[SEASON] Parameters: season=${seasonNumber}, weeks=${weeks}, format=${format}, doubleHeaderWeeks=${doubleHeaderWeeksStr}`
      );

      try {
        // Check if season already exists
        console.log(
          `[SEASON] Checking if season ${seasonNumber} already exists`
        );
        const existingMatches = await Schedule.findOne({
          season: seasonNumber,
        });

        if (existingMatches) {
          console.log(
            `[SEASON] Season ${seasonNumber} already exists, aborting`
          );
          return interaction.editReply(
            `Season ${seasonNumber} already has matches. Please use a different season number.`
          );
        }

        // Parse double header weeks
        console.log(
          `[SEASON] Parsing double header weeks: ${doubleHeaderWeeksStr}`
        );
        const doubleHeaderWeeks = doubleHeaderWeeksStr
          ? doubleHeaderWeeksStr
              .split(",")
              .map((w) => parseInt(w.trim()))
              .filter((w) => !isNaN(w) && w > 0 && w <= weeks)
          : [];

        console.log(
          `[SEASON] Parsed double header weeks: ${
            doubleHeaderWeeks.join(", ") || "None"
          }`
        );

        // Calculate total matchdays
        const totalMatchdays = weeks + doubleHeaderWeeks.length;
        console.log(`[SEASON] Total matchdays: ${totalMatchdays}`);

        // Create a mapping from matchday to week
        const matchdayToWeek = {};
        let currentMatchday = 1;

        for (let week = 1; week <= weeks; week++) {
          matchdayToWeek[currentMatchday] = week;
          currentMatchday++;

          // If this is a double header week, add another matchday
          if (doubleHeaderWeeks.includes(week)) {
            matchdayToWeek[currentMatchday] = week;
            currentMatchday++;
          }
        }

        console.log(
          `[SEASON] Season ${seasonNumber} will have ${totalMatchdays} matchdays across ${weeks} weeks`
        );
        console.log(
          `[SEASON] Double header weeks: ${
            doubleHeaderWeeks.join(", ") || "None"
          }`
        );
        console.log("[SEASON] Matchday to week mapping:", matchdayToWeek);

        if (format === "auto") {
          console.log(`[SEASON] Auto-generating matches`);
          // Auto-generate matches based on teams in the database
          const allTeams = await Team.find({});

          console.log(`[SEASON] Found ${allTeams.length} teams in database`);
          console.log(
            "[SEASON] All teams found:",
            allTeams.map((team) => ({ name: team.name, tiers: team.tiers }))
          );

          if (allTeams.length < 2) {
            console.log(
              `[SEASON] Not enough teams (${allTeams.length}) to generate matches`
            );
            return interaction.editReply(
              "Not enough teams registered to auto-generate matches. Please register at least 2 teams first."
            );
          }

          // Group teams by tier
          const teamsByTier = {};
          const validTiers = ["apex", "alpha", "beta", "delta", "omega"];

          validTiers.forEach((tier) => {
            teamsByTier[tier] = [];
          });

          allTeams.forEach((team) => {
            team.tiers.forEach((tier) => {
              if (validTiers.includes(tier)) {
                teamsByTier[tier].push(team.name);
              }
            });
          });

          console.log("[SEASON] Teams grouped by tier:", teamsByTier);

          // Generate matches for each tier
          const matches = [];

          for (const [tier, teams] of Object.entries(teamsByTier)) {
            if (teams.length < 2) {
              console.log(
                `[SEASON] Skipping tier ${tier} - not enough teams (${teams.length})`
              );
              continue; // Skip tiers with less than 2 teams
            }

            console.log(
              `[SEASON] Generating matches for tier ${tier} with ${teams.length} teams`
            );

            // Create all possible team combinations
            const combinations = [];
            for (let i = 0; i < teams.length; i++) {
              for (let j = i + 1; j < teams.length; j++) {
                combinations.push([teams[i], teams[j]]);
              }
            }

            console.log(
              `[SEASON] Created ${combinations.length} unique combinations for tier ${tier}`
            );
            console.log(`[SEASON] Combinations:`, combinations);

            // Ensure we have enough matches for all matchdays
            // If we don't have enough unique combinations, we'll repeat them
            const matchesNeeded = totalMatchdays;
            let combinationsToUse = [];

            // Repeat combinations until we have enough for all matchdays
            while (combinationsToUse.length < matchesNeeded) {
              combinationsToUse = [...combinationsToUse, ...combinations];
            }

            // Trim to exact number needed
            combinationsToUse = combinationsToUse.slice(0, matchesNeeded);

            console.log(
              `[SEASON] Created ${combinationsToUse.length} combinations (with repeats if needed) for tier ${tier}`
            );

            // Assign one match per matchday for this tier
            for (let matchday = 1; matchday <= totalMatchdays; matchday++) {
              const week = matchdayToWeek[matchday];
              const comboIndex = matchday - 1; // 0-based index

              matches.push({
                season: seasonNumber,
                matchday,
                week,
                tier,
                team1: combinationsToUse[comboIndex][0],
                team2: combinationsToUse[comboIndex][1],
                scheduled: false,
              });

              console.log(
                `[SEASON] Added match: Week ${week}, Matchday ${matchday}, ${tier} - ${combinationsToUse[comboIndex][0]} vs ${combinationsToUse[comboIndex][1]}`
              );
            }
          }

          // Save matches to database
          if (matches.length === 0) {
            console.log(`[SEASON] No matches could be generated`);
            return interaction.editReply(
              "No matches could be generated. Please check that teams are registered with tiers."
            );
          }

          console.log(`[SEASON] Saving ${matches.length} matches to database`);
          try {
            await Schedule.insertMany(matches);
            console.log(
              `[SEASON] Successfully saved ${matches.length} matches to database`
            );
          } catch (dbError) {
            console.error(
              `[SEASON] Error saving matches to database:`,
              dbError
            );
            throw new Error(`Database error: ${dbError.message}`);
          }

          // Create a summary of generated matches
          console.log(`[SEASON] Creating summary of generated matches`);
          const tierCounts = {};
          const matchdayCounts = {};
          const weekCounts = {};
          const tierMatchdayCounts = {};
          const weekTierCounts = {};

          matches.forEach((match) => {
            // Count by tier
            if (!tierCounts[match.tier]) {
              tierCounts[match.tier] = 0;
            }
            tierCounts[match.tier]++;

            // Count by matchday
            if (!matchdayCounts[match.matchday]) {
              matchdayCounts[match.matchday] = 0;
            }
            matchdayCounts[match.matchday]++;

            // Count by week
            if (!weekCounts[match.week]) {
              weekCounts[match.week] = 0;
            }
            weekCounts[match.week]++;

            // Count by tier and matchday
            const tierMatchdayKey = `${match.tier}-${match.matchday}`;
            if (!tierMatchdayCounts[tierMatchdayKey]) {
              tierMatchdayCounts[tierMatchdayKey] = 0;
            }
            tierMatchdayCounts[tierMatchdayKey]++;

            // Count by week and tier
            const weekTierKey = `${match.week}-${match.tier}`;
            if (!weekTierCounts[weekTierKey]) {
              weekTierCounts[weekTierKey] = 0;
            }
            weekTierCounts[weekTierKey]++;
          });

          console.log(`[SEASON] Match counts by tier:`, tierCounts);
          console.log(`[SEASON] Match counts by matchday:`, matchdayCounts);
          console.log(`[SEASON] Match counts by week:`, weekCounts);

          // Split the summary into multiple messages to avoid Discord's 2000 character limit
          // Message 1: Overview and tier summary
          let summaryPart1 = `Successfully auto-generated ${matches.length} matches for Season ${seasonNumber}:\n\n`;

          // Add tier summary
          summaryPart1 += `**Matches by Tier:**\n`;
          for (const [tier, count] of Object.entries(tierCounts)) {
            summaryPart1 += `- ${
              tier.charAt(0).toUpperCase() + tier.slice(1)
            }: ${count} matches\n`;
          }

          // Message 2: Week summary
          let summaryPart2 = `**Matches by Week:**\n`;
          for (let i = 1; i <= weeks; i++) {
            const count = weekCounts[i] || 0;
            const isDoubleHeader = doubleHeaderWeeks.includes(i);
            summaryPart2 += `- Week ${i}${
              isDoubleHeader ? " (Double Header)" : ""
            }: ${count} matches\n`;

            // Add tier breakdown for this week
            const tierBreakdown = [];
            for (const tier of validTiers) {
              const tierCount = weekTierCounts[`${i}-${tier}`] || 0;
              if (tierCount > 0) {
                tierBreakdown.push(
                  `${
                    tier.charAt(0).toUpperCase() + tier.slice(1)
                  }: ${tierCount}`
                );
              }
            }

            if (tierBreakdown.length > 0) {
              summaryPart2 += `  (${tierBreakdown.join(", ")})\n`;
            }
          }

          // Message 3: Matchday summary (might need to be split further)
          let summaryPart3 = `**Matches by Matchday:**\n`;
          const matchdayMessages = [];
          let currentMessage = summaryPart3;
          const maxLength = 1900; // Leave some buffer

          for (let i = 1; i <= totalMatchdays; i++) {
            const count = matchdayCounts[i] || 0;
            const week = matchdayToWeek[i];
            const matchdayLine = `- Matchday ${i} (Week ${week}): ${count} matches\n`;

            // Add tier breakdown for this matchday
            let tierBreakdownLine = "";
            const tierBreakdown = [];
            for (const tier of validTiers) {
              const tierCount = tierMatchdayCounts[`${tier}-${i}`] || 0;
              if (tierCount > 0) {
                tierBreakdown.push(
                  `${
                    tier.charAt(0).toUpperCase() + tier.slice(1)
                  }: ${tierCount}`
                );
              }
            }

            if (tierBreakdown.length > 0) {
              tierBreakdownLine = `  (${tierBreakdown.join(", ")})\n`;
            }

            // Check if adding this line would exceed the limit
            if (
              currentMessage.length +
                matchdayLine.length +
                tierBreakdownLine.length >
              maxLength
            ) {
              // Start a new message
              matchdayMessages.push(currentMessage);
              currentMessage = `**Matches by Matchday (continued):**\n${matchdayLine}${tierBreakdownLine}`;
            } else {
              currentMessage += matchdayLine + tierBreakdownLine;
            }
          }

          // Add the last message
          if (currentMessage.length > 0) {
            matchdayMessages.push(currentMessage);
          }

          console.log(`[SEASON] Auto-generation completed successfully`);

          // Send all messages
          await interaction.editReply(summaryPart1);
          await interaction.followUp(summaryPart2);

          for (const message of matchdayMessages) {
            await interaction.followUp(message);
          }

          return;
        } else {
          console.log(`[SEASON] Creating template file in ${format} format`);
          // Create a template file
          let fileContent = "";
          let fileName = "";

          if (format === "csv") {
            // Create a template CSV file
            fileContent = "matchday,week,tier,team1,team2\n";

            // Add example rows for each matchday
            for (let matchday = 1; matchday <= totalMatchdays; matchday++) {
              const week = matchdayToWeek[matchday];
              fileContent += `${matchday},${week},apex,Team1,Team2\n`;
              fileContent += `${matchday},${week},alpha,Team1,Team2\n`;
              fileContent += `${matchday},${week},beta,Team1,Team2\n`;
            }

            fileName = `season${seasonNumber}_template.csv`;
          } else {
            // Create a template TXT file
            fileContent = "Format: matchday,week,tier,team1,team2\n\n";

            // Add example rows for each matchday
            for (let matchday = 1; matchday <= totalMatchdays; matchday++) {
              const week = matchdayToWeek[matchday];
              fileContent += `${matchday},${week},apex,Team1,Team2\n`;
              fileContent += `${matchday},${week},alpha,Team1,Team2\n`;
              fileContent += `${matchday},${week},beta,Team1,Team2\n`;
            }

            fileName = `season${seasonNumber}_template.txt`;
          }

          // Create a temporary file
          const tempFilePath = path.join(
            __dirname,
            `../../../temp_${fileName}`
          );
          try {
            fs.writeFileSync(tempFilePath, fileContent);
            console.log(`[SEASON] Template file created at ${tempFilePath}`);
          } catch (fsError) {
            console.error(`[SEASON] Error creating template file:`, fsError);
            throw new Error(`File system error: ${fsError.message}`);
          }

          // Create an attachment from the file
          const attachment = new AttachmentBuilder(tempFilePath, {
            name: fileName,
          });

          // Create a summary of the season structure
          let summary = `Season ${seasonNumber} initialized with ${totalMatchdays} matchdays across ${weeks} weeks.\n\n`;

          if (doubleHeaderWeeks.length > 0) {
            summary += `Double header weeks: ${doubleHeaderWeeks.join(
              ", "
            )}\n\n`;
          }

          summary += `Matchday to Week mapping:\n`;
          for (let i = 1; i <= totalMatchdays; i++) {
            summary += `- Matchday ${i}: Week ${matchdayToWeek[i]}\n`;
          }

          summary += `\nPlease fill out the attached template with your matches and then use \`/setup import\` to import the schedule.`;

          try {
            await interaction.editReply({
              content: summary,
              files: [attachment],
            });
            console.log(`[SEASON] Template file sent to user`);
          } catch (replyError) {
            console.error(`[SEASON] Error sending reply:`, replyError);
            throw new Error(`Discord API error: ${replyError.message}`);
          }

          // Clean up the temporary file after a delay
          setTimeout(() => {
            try {
              fs.unlinkSync(tempFilePath);
              console.log(`[SEASON] Temporary file deleted: ${tempFilePath}`);
            } catch (err) {
              console.error("[SEASON] Error deleting temporary file:", err);
            }
          }, 5000);
        }
      } catch (error) {
        console.error("[SEASON] Error initializing season:", error);
        return interaction.editReply(
          `An error occurred while initializing the season: ${error.message}`
        );
      }
    } catch (outerError) {
      console.error("[SEASON] Unhandled error in season command:", outerError);

      // Try to reply if we haven't already
      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply(
            `A critical error occurred: ${outerError.message}`
          );
        } else if (!interaction.replied) {
          await interaction.reply(
            `A critical error occurred: ${outerError.message}`
          );
        }
      } catch (replyError) {
        console.error("[SEASON] Error sending error reply:", replyError);
      }
    }
  },
};
