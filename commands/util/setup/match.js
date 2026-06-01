const Schedule = require("../../../models/Schedule");

module.exports = {
  data: (subcommand) =>
    subcommand
      .setName("match")
      .setDescription("Add a single match to the schedule")
      .addIntegerOption((option) =>
        option
          .setName("season")
          .setDescription("Season number")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("matchday")
          .setDescription("Matchday number")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("tier")
          .setDescription("The tier of the match")
          .setRequired(true)
          .addChoices(
            { name: "Apex", value: "apex" },
            { name: "Alpha", value: "alpha" },
            { name: "Beta", value: "beta" },
            { name: "Delta", value: "delta" },
            { name: "Omega", value: "omega" }
          )
      )
      .addStringOption((option) =>
        option.setName("team1").setDescription("First team").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("team2").setDescription("Second team").setRequired(true)
      ),

  async execute(interaction) {
    await interaction.deferReply();

    const seasonNumber = interaction.options.getInteger("season");
    const matchday = interaction.options.getInteger("matchday");
    const tier = interaction.options.getString("tier");
    const team1 = interaction.options.getString("team1");
    const team2 = interaction.options.getString("team2");

    try {
      // Find the week for this matchday
      const existingMatch = await Schedule.findOne({
        season: seasonNumber,
        matchday: { $exists: true },
      }).sort({ matchday: 1 });

      let week = 1;
      if (existingMatch && existingMatch.week) {
        // If we have existing matches with weeks, try to find the right week
        const matchForWeek = await Schedule.findOne({
          season: seasonNumber,
          matchday: matchday,
        });

        if (matchForWeek && matchForWeek.week) {
          week = matchForWeek.week;
        } else {
          // Estimate the week based on matchday
          week = Math.ceil(matchday / 1.5); // Rough estimate assuming some weeks have 2 matchdays
        }
      }

      // Create a new match
      const match = new Schedule({
        season: seasonNumber,
        matchday,
        week,
        tier,
        team1,
        team2,
        scheduled: false,
      });

      await match.save();

      return interaction.editReply(
        `Match added successfully: Week ${week}, Matchday ${matchday}, ${
          tier.charAt(0).toUpperCase() + tier.slice(1)
        } tier - ${team1} vs ${team2}`
      );
    } catch (error) {
      console.error("Error adding match:", error);
      return interaction.editReply("An error occurred while adding the match.");
    }
  },
};
