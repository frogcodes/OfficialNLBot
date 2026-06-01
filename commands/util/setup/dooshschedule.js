const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const Schedule = require("../../../models/Schedule");
const timeConverter = require("../../../utils/timeConverter");
const embedBuilder = require("../../../utils/embedBuilder");
const config = require("../../../models/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule a match")
    .addIntegerOption((option) =>
      option
        .setName("matchday")
        .setDescription("The matchday number")
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
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("Date of the match (MM/DD/YY)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Time of the match (e.g., 9 PM EST)")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const matchday = interaction.options.getInteger("matchday");
    const tier = interaction.options.getString("tier");
    const team1 = interaction.options.getString("team1");
    const team2 = interaction.options.getString("team2");
    const date = interaction.options.getString("date");
    const time = interaction.options.getString("time");

    try {
      // Find the match in the database
      const match = await Schedule.findOne({
        matchday,
        tier,
        $or: [
          {
            team1: { $regex: new RegExp(team1, "i") },
            team2: { $regex: new RegExp(team2, "i") },
          },
          {
            team1: { $regex: new RegExp(team2, "i") },
            team2: { $regex: new RegExp(team1, "i") },
          },
        ],
      });

      if (!match) {
        return interaction.editReply(
          "Match not found. Please check your inputs and try again."
        );
      }

      // Parse the date and time
      const dateTimeObj = timeConverter.parseDateTime(date, time);
      if (!dateTimeObj) {
        return interaction.editReply(
          'Invalid date or time format. Please use MM/DD/YY for date and format like "9 PM EST" for time.'
        );
      }

      // Update the match in the database
      match.date = dateTimeObj;
      match.time = time;
      match.scheduled = true;
      await match.save();

      // Get the weekly schedule channel
      const channel = await interaction.client.channels.fetch(
        config.channels.weeklySchedule
      );

      if (match.messageId) {
        try {
          // Try to fetch and update the existing message
          const message = await channel.messages.fetch(match.messageId);
          const updatedEmbed = embedBuilder.buildMatchEmbed(match);
          await message.edit({ embeds: [updatedEmbed] });
        } catch (error) {
          console.error("Error updating message:", error);
          // If message not found, create a new one
          const newEmbed = embedBuilder.buildMatchEmbed(match);
          const newMessage = await channel.send({ embeds: [newEmbed] });
          match.messageId = newMessage.id;
          await match.save();
        }
      } else {
        // Create a new message if no messageId exists
        const newEmbed = embedBuilder.buildMatchEmbed(match);
        const newMessage = await channel.send({ embeds: [newEmbed] });
        match.messageId = newMessage.id;
        await match.save();
      }

      // Convert time to different timezones for display
      const timeZones = timeConverter.convertToMultipleTimezones(dateTimeObj);

      // Create response embed
      const responseEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("Match Scheduled Successfully")
        .setDescription(
          `Match between **${match.team1}** and **${match.team2}** has been scheduled.`
        )
        .addFields(
          { name: "Matchday", value: `${match.matchday}`, inline: true },
          {
            name: "Tier",
            value: `${
              match.tier.charAt(0).toUpperCase() + match.tier.slice(1)
            }`,
            inline: true,
          },
          { name: "Date & Time", value: `${date}, ${time}`, inline: true },
          { name: "Time Conversions", value: timeZones.join("\n") }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [responseEmbed] });
    } catch (error) {
      console.error("Error scheduling match:", error);
      return interaction.editReply(
        "An error occurred while scheduling the match. Please try again later."
      );
    }
  },
};
