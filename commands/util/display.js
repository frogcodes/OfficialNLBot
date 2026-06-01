const { SlashCommandBuilder } = require("discord.js");
const Schedule = require("../../models/Schedule");
const embedBuilder = require("../../utils/embedBuilder");
const scheduleManager = require("../../utils/scheduleManager");
const config = require("../../models/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("display")
    .setDescription("Display commands for the schedule")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("schedule")
        .setDescription("Display the schedule for a specific week")
        .addIntegerOption((option) =>
          option
            .setName("season")
            .setDescription("Season number")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("week")
            .setDescription("Week number (defaults to current week)")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "Channel to post the schedule (defaults to current channel)"
            )
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("force_new")
            .setDescription(
              "Force creation of new embeds even if they already exist"
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pause")
        .setDescription("Pause the automatic weekly schedule updates")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resume")
        .setDescription("Resume the automatic weekly schedule updates")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "schedule") {
      await displaySchedule(interaction);
    } else if (subcommand === "pause") {
      await pauseUpdates(interaction);
    } else if (subcommand === "resume") {
      await resumeUpdates(interaction);
    }
  },
};

async function displaySchedule(interaction) {
  try {
    console.log("[DISPLAY] Starting schedule display");

    // Get season (default to current season if not specified)
    let season = interaction.options.getInteger("season");
    if (!season) {
      season = await scheduleManager.getCurrentSeason();
    }

    // Get week (default to current week if not specified)
    let week = interaction.options.getInteger("week");
    if (!week) {
      week = await scheduleManager.getCurrentWeek(season);
    }

    // Check if we should force creation of new embeds
    const forceNew = interaction.options.getBoolean("force_new") || false;

    console.log(
      `[DISPLAY] Parameters: season=${season}, week=${week}, forceNew=${forceNew}`
    );

    // Get target channel (default to current channel if not specified)
    const targetChannel =
      interaction.options.getChannel("channel") || interaction.channel;

    // Get all matches for this season and week
    const weekMatches = await Schedule.find({
      season: season,
      week: week,
    }).sort({ tier: 1, matchday: 1 });

    if (!weekMatches || weekMatches.length === 0) {
      console.log(
        `[DISPLAY] No matches found for season ${season}, week ${week}`
      );
      return interaction.editReply(
        `No matches found for Season ${season}, Week ${week}.`
      );
    }

    console.log(
      `[DISPLAY] Found ${weekMatches.length} matches for season ${season}, week ${week}`
    );

    // Get unique tiers for this week
    const tiers = [...new Set(weekMatches.map((match) => match.tier))].sort(
      (a, b) => {
        const tierOrder = { apex: 0, alpha: 1, beta: 2, delta: 3, omega: 4 };
        return tierOrder[a] - tierOrder[b];
      }
    );

    console.log(
      `[DISPLAY] Found ${tiers.length} tiers for week ${week}: ${tiers.join(
        ", "
      )}`
    );

    // Check if we already have messages for this week
    const storedMessages = await scheduleManager.getScheduleMessages(
      season,
      week
    );

    // If we have stored messages and aren't forcing new ones, try to update them
    if (storedMessages && !forceNew) {
      try {
        console.log(
          `[DISPLAY] Found stored messages for season ${season}, week ${week}`
        );

        // Check if the header message exists and is in this channel
        let headerExists = false;
        try {
          const headerMessage = await targetChannel.messages.fetch(
            storedMessages.headerMessageId
          );
          headerExists = true;

          // Update the header message
          await headerMessage.edit({
            content: `**Season ${season} - Week ${week} Schedule** (Last updated: ${new Date().toLocaleString()})`,
          });
          console.log(`[DISPLAY] Updated existing header message`);
        } catch (headerError) {
          console.log(
            `[DISPLAY] Header message not found or not in this channel`
          );
          headerExists = false;
        }

        // Check if tier embeds exist and are in this channel
        let allEmbedsExist = headerExists;
        const existingTierMessages = [];

        for (const tierMessage of storedMessages.tierMessages) {
          try {
            const message = await targetChannel.messages.fetch(
              tierMessage.messageId
            );

            // Update the embed
            const tierMatches = weekMatches.filter(
              (match) => match.tier === tierMessage.tier
            );
            if (tierMatches.length > 0) {
              const embed = embedBuilder.buildTierWeekScheduleEmbed(
                season,
                week,
                tierMessage.tier,
                tierMatches
              );
              await message.edit({ embeds: [embed] });
              console.log(
                `[DISPLAY] Updated existing embed for tier ${tierMessage.tier}`
              );
              existingTierMessages.push(tierMessage);
            }
          } catch (tierError) {
            console.log(
              `[DISPLAY] Tier ${tierMessage.tier} message not found or not in this channel`
            );
            allEmbedsExist = false;
          }
        }

        // If all messages exist and were updated, we're done
        if (allEmbedsExist) {
          console.log(`[DISPLAY] Successfully updated all existing messages`);
          await interaction.editReply(
            `Schedule for Season ${season}, Week ${week} has been updated in ${targetChannel}.`
          );
          return;
        }

        // If some messages exist but not all, delete the existing ones and create new ones
        console.log(`[DISPLAY] Some messages missing, recreating all messages`);

        // Delete existing messages
        if (headerExists) {
          try {
            const headerMessage = await targetChannel.messages.fetch(
              storedMessages.headerMessageId
            );
            await headerMessage.delete();
            console.log(`[DISPLAY] Deleted existing header message`);
          } catch (deleteError) {
            console.log(
              `[DISPLAY] Could not delete header message: ${deleteError.message}`
            );
          }
        }

        for (const tierMessage of existingTierMessages) {
          try {
            const message = await targetChannel.messages.fetch(
              tierMessage.messageId
            );
            await message.delete();
            console.log(
              `[DISPLAY] Deleted existing embed for tier ${tierMessage.tier}`
            );
          } catch (deleteError) {
            console.log(
              `[DISPLAY] Could not delete tier ${tierMessage.tier} message: ${deleteError.message}`
            );
          }
        }
      } catch (error) {
        console.error("[DISPLAY] Error handling existing messages:", error);
      }
    } else if (storedMessages && forceNew) {
      console.log(
        `[DISPLAY] Force new option selected, deleting any existing messages`
      );

      // Try to delete stored messages, but don't worry if they don't exist
      try {
        const headerMessage = await targetChannel.messages
          .fetch(storedMessages.headerMessageId)
          .catch(() => null);
        if (headerMessage) {
          await headerMessage.delete();
          console.log(`[DISPLAY] Deleted existing header message`);
        }

        for (const tierMessage of storedMessages.tierMessages) {
          const message = await targetChannel.messages
            .fetch(tierMessage.messageId)
            .catch(() => null);
          if (message) {
            await message.delete();
            console.log(
              `[DISPLAY] Deleted existing embed for tier ${tierMessage.tier}`
            );
          }
        }
      } catch (error) {
        console.log(
          `[DISPLAY] Error deleting some stored messages: ${error.message}`
        );
      }
    }

    // Create a header message
    console.log(
      `[DISPLAY] Sending header message to channel ${targetChannel.id}`
    );
    const headerMessage = await targetChannel.send({
      content: `**Season ${season} - Week ${week} Schedule** (Last updated: ${new Date().toLocaleString()})`,
    });

    // Create an embed for each tier
    const tierMessages = [];

    for (const tier of tiers) {
      const tierMatches = weekMatches.filter((match) => match.tier === tier);

      if (tierMatches.length === 0) {
        console.log(`[DISPLAY] No matches found for tier ${tier}, skipping`);
        continue;
      }

      console.log(
        `[DISPLAY] Creating embed for tier ${tier} with ${tierMatches.length} matches`
      );
      const embed = embedBuilder.buildTierWeekScheduleEmbed(
        season,
        week,
        tier,
        tierMatches
      );

      try {
        const tierMessage = await targetChannel.send({
          embeds: [embed],
        });

        tierMessages.push({
          tier,
          messageId: tierMessage.id,
        });

        console.log(
          `[DISPLAY] Created embed for tier ${tier} with message ID ${tierMessage.id}`
        );
      } catch (error) {
        console.error(`[DISPLAY] Error sending embed for tier ${tier}:`, error);
      }
    }

    // Store the message IDs in the database for future updates
    try {
      await scheduleManager.storeScheduleMessages(
        season,
        week,
        headerMessage.id,
        tierMessages
      );
      console.log(
        `[DISPLAY] Stored message IDs for season ${season}, week ${week}`
      );
    } catch (error) {
      console.error(`[DISPLAY] Error storing message IDs:`, error);
    }

    // Reply to the interaction
    await interaction.editReply(
      `Schedule for Season ${season}, Week ${week} has been displayed in ${targetChannel}. The schedule will update automatically each week.`
    );
    console.log(`[DISPLAY] Schedule display completed successfully`);
  } catch (error) {
    console.error("[DISPLAY] Error displaying schedule:", error);
    await interaction.editReply(
      "An error occurred while displaying the schedule."
    );
  }
}

async function pauseUpdates(interaction) {
  try {
    console.log("[DISPLAY] Attempting to pause auto-updates");

    // Check if user has admin permissions
    if (!interaction.member.permissions.has("ADMINISTRATOR")) {
      console.log(
        `[DISPLAY] User ${interaction.user.tag} lacks admin permissions to pause updates`
      );
      return interaction.editReply(
        "You need administrator permissions to pause schedule updates."
      );
    }

    // Update the config to pause updates
    await scheduleManager.setAutoUpdateEnabled(false);
    console.log("[DISPLAY] Auto-updates paused successfully");

    return interaction.editReply(
      "Automatic weekly schedule updates have been paused. Use `/display resume` to resume updates."
    );
  } catch (error) {
    console.error("[DISPLAY] Error pausing updates:", error);
    await interaction.editReply(
      "An error occurred while pausing schedule updates."
    );
  }
}

async function resumeUpdates(interaction) {
  try {
    console.log("[DISPLAY] Attempting to resume auto-updates");

    // Check if user has admin permissions
    if (!interaction.member.permissions.has("ADMINISTRATOR")) {
      console.log(
        `[DISPLAY] User ${interaction.user.tag} lacks admin permissions to resume updates`
      );
      return interaction.editReply(
        "You need administrator permissions to resume schedule updates."
      );
    }

    // Update the config to resume updates
    await scheduleManager.setAutoUpdateEnabled(true);
    console.log("[DISPLAY] Auto-updates resumed successfully");

    return interaction.editReply(
      "Automatic weekly schedule updates have been resumed."
    );
  } catch (error) {
    console.error("[DISPLAY] Error resuming updates:", error);
    await interaction.editReply(
      "An error occurred while resuming schedule updates."
    );
  }
}
