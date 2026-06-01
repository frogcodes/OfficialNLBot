const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const readline = require("readline");
const Schedule = require("../../../models/Schedule");

module.exports = {
  data: (subcommand) =>
    subcommand
      .setName("import")
      .setDescription("Import schedule from file")
      .addIntegerOption((option) =>
        option
          .setName("season")
          .setDescription("Season number")
          .setRequired(true)
      )
      .addAttachmentOption((option) =>
        option
          .setName("file")
          .setDescription("CSV or TXT file with schedule data")
          .setRequired(true)
      ),

  async execute(interaction) {
    await interaction.deferReply();

    const seasonNumber = interaction.options.getInteger("season");
    const file = interaction.options.getAttachment("file");

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      return interaction.editReply("Please upload a CSV or TXT file.");
    }

    try {
      // Download the file
      const response = await fetch(file.url);
      if (!response.ok) {
        return interaction.editReply("Failed to download the file.");
      }

      const fileData = await response.text();
      const tempFilePath = path.join(
        __dirname,
        `../../../temp_import_${Date.now()}.${
          file.name.endsWith(".csv") ? "csv" : "txt"
        }`
      );
      fs.writeFileSync(tempFilePath, fileData);

      // Parse the file
      const matches = [];
      let rowCount = 0;

      // Create a promise to handle the file parsing
      const parsePromise = new Promise((resolve, reject) => {
        if (file.name.endsWith(".csv")) {
          // Parse CSV file
          fs.createReadStream(tempFilePath)
            .pipe(csv())
            .on("data", (row) => {
              rowCount++;

              // Validate the row data
              const matchday = parseInt(row.matchday);
              const week = parseInt(row.week || matchday); // Default to matchday if week is not provided
              const tier = row.tier.toLowerCase();
              const team1 = row.team1;
              const team2 = row.team2;

              if (
                isNaN(matchday) ||
                isNaN(week) ||
                !["apex", "alpha", "beta", "delta", "omega"].includes(tier) ||
                !team1 ||
                !team2
              ) {
                reject(
                  new Error(
                    `Invalid data in row ${rowCount}: ${JSON.stringify(row)}`
                  )
                );
                return;
              }

              matches.push({
                season: seasonNumber,
                matchday,
                week,
                tier,
                team1,
                team2,
                scheduled: false,
              });
            })
            .on("end", () => {
              resolve();
            })
            .on("error", (error) => {
              reject(error);
            });
        } else {
          // Parse TXT file
          const lineReader = readline.createInterface({
            input: fs.createReadStream(tempFilePath),
            crlfDelay: Infinity,
          });

          lineReader.on("line", (line) => {
            // Skip empty lines or header lines
            if (!line.trim() || line.includes("Format:")) {
              return;
            }

            rowCount++;
            const parts = line.split(",").map((part) => part.trim());

            if (parts.length < 4) {
              reject(new Error(`Invalid format in line ${rowCount}: ${line}`));
              return;
            }

            let matchday, week, tier, team1, team2;

            if (parts.length >= 5) {
              // Format with week: matchday,week,tier,team1,team2
              matchday = parseInt(parts[0]);
              week = parseInt(parts[1]);
              tier = parts[2].toLowerCase();
              team1 = parts[3];
              team2 = parts[4];
            } else {
              // Old format without week: matchday,tier,team1,team2
              matchday = parseInt(parts[0]);
              week = matchday; // Default to matchday
              tier = parts[1].toLowerCase();
              team1 = parts[2];
              team2 = parts[3];
            }

            if (
              isNaN(matchday) ||
              isNaN(week) ||
              !["apex", "alpha", "beta", "delta", "omega"].includes(tier) ||
              !team1 ||
              !team2
            ) {
              reject(new Error(`Invalid data in line ${rowCount}: ${line}`));
              return;
            }

            matches.push({
              season: seasonNumber,
              matchday,
              week,
              tier,
              team1,
              team2,
              scheduled: false,
            });
          });

          lineReader.on("close", () => {
            resolve();
          });

          lineReader.on("error", (error) => {
            reject(error);
          });
        }
      });

      await parsePromise;

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      if (matches.length === 0) {
        return interaction.editReply("No valid matches found in the file.");
      }

      // Save the matches to the database
      await Schedule.insertMany(matches);

      // Create a summary of imported matches
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

      let summary = `Successfully imported ${matches.length} matches for Season ${seasonNumber}:\n\n`;

      // Add tier summary
      summary += `**Matches by Tier:**\n`;
      for (const [tier, count] of Object.entries(tierCounts)) {
        summary += `- ${
          tier.charAt(0).toUpperCase() + tier.slice(1)
        }: ${count} matches\n`;
      }

      // Add week summary with tier breakdown
      summary += `\n**Matches by Week:**\n`;
      const sortedWeeks = Object.keys(weekCounts).sort(
        (a, b) => parseInt(a) - parseInt(b)
      );
      for (const week of sortedWeeks) {
        summary += `- Week ${week}: ${weekCounts[week]} matches\n`;

        // Add tier breakdown for this week
        const tierBreakdown = [];
        for (const tier of ["apex", "alpha", "beta", "delta", "omega"]) {
          const tierCount = weekTierCounts[`${week}-${tier}`] || 0;
          if (tierCount > 0) {
            tierBreakdown.push(
              `${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${tierCount}`
            );
          }
        }

        if (tierBreakdown.length > 0) {
          summary += `  (${tierBreakdown.join(", ")})\n`;
        }
      }

      // Add matchday summary
      summary += `\n**Matches by Matchday:**\n`;
      const matchdays = Object.keys(matchdayCounts).sort(
        (a, b) => parseInt(a) - parseInt(b)
      );
      for (const matchday of matchdays) {
        const week = matches.find((m) => m.matchday == matchday)?.week || "?";
        summary += `- Matchday ${matchday} (Week ${week}): ${matchdayCounts[matchday]} matches\n`;

        // Add tier breakdown for this matchday
        const tierBreakdown = [];
        for (const tier of ["apex", "alpha", "beta", "delta", "omega"]) {
          const tierCount = tierMatchdayCounts[`${tier}-${matchday}`] || 0;
          if (tierCount > 0) {
            tierBreakdown.push(
              `${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${tierCount}`
            );
          }
        }

        if (tierBreakdown.length > 0) {
          summary += `  (${tierBreakdown.join(", ")})\n`;
        }
      }

      return interaction.editReply(summary);
    } catch (error) {
      console.error("Error importing schedule:", error);
      return interaction.editReply(
        `An error occurred while importing the schedule: ${error.message}`
      );
    }
  },
};
