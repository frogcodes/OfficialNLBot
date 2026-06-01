const Schedule = require('../models/Schedule');
const scheduleManager = require('../utils/scheduleManager');
const embedBuilder = require('../utils/embedBuilder');
const config = require('../../config/config');

module.exports = {
  async execute(client) {
    try {
      // Check if auto-update is enabled
      const autoUpdateEnabled = await scheduleManager.isAutoUpdateEnabled();
      
      if (!autoUpdateEnabled) {
        console.log('[WEEKLY] Automatic weekly schedule updates are paused.');
        return;
      }
      
      console.log('[WEEKLY] Running weekly schedule update...');
      
      // Get the current season and week
      const season = await scheduleManager.getCurrentSeason();
      const week = await scheduleManager.getCurrentWeek(season);
      
      console.log(`[WEEKLY] Updating schedule for Season ${season}, Week ${week}`);
      
      // Get the schedule channel
      const channel = await client.channels.fetch(config.channels.weeklySchedule);
      
      if (!channel) {
        console.error('[WEEKLY] Weekly schedule channel not found');
        return;
      }
      
      // Get all matches for this season and week
      const weekMatches = await Schedule.find({ 
        season: season, 
        week: week 
      }).sort({ tier: 1, matchday: 1 });
      
      console.log(`[WEEKLY] Found ${weekMatches.length} matches for season ${season}, week ${week}`);
      
      if (weekMatches.length === 0) {
        console.log(`[WEEKLY] No matches found for Season ${season}, Week ${week}`);
        return;
      }
      
      // Get unique tiers for this week
      const tiers = [...new Set(weekMatches.map(match => match.tier))].sort((a, b) => {
        const tierOrder = { 'apex': 0, 'alpha': 1, 'beta': 2, 'delta': 3, 'omega': 4 };
        return tierOrder[a] - tierOrder[b];
      });
      
      // Check if we already have messages for this week
      const storedMessages = await scheduleManager.getScheduleMessages(season, week);
      
      if (storedMessages) {
        try {
          // Try to update existing messages
          console.log(`[WEEKLY] Found stored messages for season ${season}, week ${week}`);
          
          // Update header message
          try {
            const headerMessage = await channel.messages.fetch(storedMessages.headerMessageId);
            await headerMessage.edit({
              content: `**Season ${season} - Week ${week} Schedule** (Last updated: ${new Date().toLocaleString()})`
            });
            console.log(`[WEEKLY] Updated header message`);
          } catch (headerError) {
            console.error(`[WEEKLY] Error updating header message:`, headerError);
          }
          
          // Update tier embeds
          for (const tierMessage of storedMessages.tierMessages) {
            try {
              const tierMatches = weekMatches.filter(match => match.tier === tierMessage.tier);
              if (tierMatches.length > 0) {
                const embed = embedBuilder.buildTierWeekScheduleEmbed(season, week, tierMessage.tier, tierMatches);
                
                const message = await channel.messages.fetch(tierMessage.messageId);
                await message.edit({ embeds: [embed] });
                console.log(`[WEEKLY] Updated embed for tier ${tierMessage.tier}`);
              }
            } catch (tierError) {
              console.error(`[WEEKLY] Error updating tier ${tierMessage.tier} message:`, tierError);
            }
          }
          
          console.log(`[WEEKLY] Updated existing schedule messages for Season ${season}, Week ${week}`);
          return;
        } catch (error) {
          console.error('[WEEKLY] Error updating existing messages:', error);
          // If updating fails, create new messages
        }
      }
      
      // If we don't have stored messages or updating them failed, create new ones
      console.log(`[WEEKLY] Creating new schedule messages for season ${season}, week ${week}`);
      
      // Create a header message
      const headerMessage = await channel.send({
        content: `**Season ${season} - Week ${week} Schedule** (Last updated: ${new Date().toLocaleString()})`
      });
      
      // Create an embed for each tier
      const tierMessages = [];
      
      for (const tier of tiers) {
        const tierMatches = weekMatches.filter(match => match.tier === tier);
        
        if (tierMatches.length === 0) {
          console.log(`[WEEKLY] No matches found for tier ${tier}, skipping`);
          continue;
        }
        
        const embed = embedBuilder.buildTierWeekScheduleEmbed(season, week, tier, tierMatches);
        
        try {
          const message = await channel.send({ embeds: [embed] });
          tierMessages.push({
            tier,
            messageId: message.id
          });
          console.log(`[WEEKLY] Created embed for tier ${tier}`);
        } catch (sendError) {
          console.error(`[WEEKLY] Error sending embed for tier ${tier}:`, sendError);
        }
      }
      
      // Store the message IDs
      try {
        await scheduleManager.storeScheduleMessages(season, week, headerMessage.id, tierMessages);
        console.log(`[WEEKLY] Stored message IDs for season ${season}, week ${week}`);
      } catch (storeError) {
        console.error(`[WEEKLY] Error storing message IDs:`, storeError);
      }
      
      console.log(`[WEEKLY] Weekly schedule update completed for season ${season}, week ${week}`);
      
    } catch (error) {
      console.error('[WEEKLY] Error updating weekly schedule:', error);
    }
  }
};
