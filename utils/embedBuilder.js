const { EmbedBuilder } = require('discord.js');
const timeConverter = require('./timeConverter');

module.exports = {
  timeConverter, // Make timeConverter accessible to other modules
  
  buildMatchEmbed(match) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Matchday ${match.matchday}: ${match.team1} vs ${match.team2}`)
      .setDescription(`**Tier:** ${match.tier.charAt(0).toUpperCase() + match.tier.slice(1)}`)
      .setTimestamp();

    if (match.scheduled && match.date) {
      // Create Discord timestamps for user's local time
      const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
      
      embed.addFields(
        { name: 'Date & Time', value: `<t:${timestamp}:f>`, inline: true },
        { name: 'Relative Time', value: `<t:${timestamp}:R>`, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Status', value: 'To be determined', inline: true }
      );
    }

    return embed;
  },

  buildWeeklyScheduleEmbed(matchday, matches) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Matchday ${matchday} Schedule`)
      .setDescription(`Total matches: ${matches.length}`)
      .setTimestamp();

    // First, let's log the matches to debug
    console.log(`Building embed for matchday ${matchday} with ${matches.length} matches`);
    
    // Group matches by tier
    const tierGroups = {};
    
    matches.forEach(match => {
      if (!tierGroups[match.tier]) {
        tierGroups[match.tier] = [];
      }
      tierGroups[match.tier].push(match);
      console.log(`Added match to tier ${match.tier}: ${match.team1} vs ${match.team2}`);
    });
    
    console.log(`Grouped into ${Object.keys(tierGroups).length} tiers`);
    
    // Sort tiers
    const sortOrder = ['apex', 'alpha', 'beta', 'delta', 'omega'];
    const sortedTiers = Object.keys(tierGroups).sort((a, b) => 
      sortOrder.indexOf(a) - sortOrder.indexOf(b)
    );
    
    // Add fields for each tier
    for (const tier of sortedTiers) {
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      let fieldValue = '';
      
      // Sort matches alphabetically by team1 name
      tierGroups[tier].sort((a, b) => a.team1.localeCompare(b.team1));
      
      // Add each match to the field with match numbers if needed
      tierGroups[tier].forEach((match, index) => {
        // Add a match number if there are multiple matches
        const matchNumber = tierGroups[tier].length > 1 ? `Match ${index + 1}: ` : '';
        
        if (match.scheduled && match.date) {
          // Create a Discord timestamp that will show in the user's local time
          const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
          
          // Format: <t:timestamp:f> shows date and time in user's locale
          // Format: <t:timestamp:R> shows relative time (e.g., "in 2 days")
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: <t:${timestamp}:f> (<t:${timestamp}:R>)\n`;
        } else {
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: To be determined\n`;
        }
      });
      
      // Make sure field value isn't empty and doesn't exceed Discord's limits
      if (fieldValue.length === 0) {
        fieldValue = "No matches found";
      }
      
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1020) + "...";
      }
      
      embed.addFields({ name: `${tierName} Tier (${tierGroups[tier].length} matches)`, value: fieldValue });
    }

    // If no fields were added (no matches), add a placeholder
    if (embed.data.fields?.length === 0) {
      embed.addFields({ name: 'No Matches', value: 'No matches found for this matchday.' });
    }

    // Add a footer with navigation instructions
    embed.setFooter({ text: 'Use the dropdown menu below to navigate between matchdays' });

    return embed;
  },

  buildUnscheduledMatchEmbed(match) {
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(`Unscheduled Match: ${match.team1} vs ${match.team2}`)
      .setDescription(`**Tier:** ${match.tier.charAt(0).toUpperCase() + match.tier.slice(1)}`)
      .addFields(
        { name: 'Matchday', value: `${match.matchday}`, inline: true },
        { name: 'Status', value: 'This match has not been scheduled yet!', inline: true }
      )
      .setFooter({ text: 'Please use /schedule to set a time for this match' })
      .setTimestamp();
  },
  
  buildScheduleSummaryEmbed(season, matchdays) {
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`Season ${season} Schedule Summary`)
      .setDescription(`Overview of all ${matchdays.length} matchdays`)
      .setTimestamp();
    
    matchdays.forEach(matchday => {
      const scheduledCount = matchday.matches.filter(m => m.scheduled).length;
      const totalCount = matchday.matches.length;
      const progressBar = this.generateProgressBar(scheduledCount, totalCount);
      
      embed.addFields({
        name: `Matchday ${matchday.matchday}`,
        value: `${progressBar} (${scheduledCount}/${totalCount} scheduled)`
      });
    });
    
    return embed;
  },
  
  generateProgressBar(current, total, size = 10) {
    const percentage = Math.round((current / total) * size);
    const filled = '█'.repeat(percentage);
    const empty = '░'.repeat(size - percentage);
    return filled + empty;
  },
  
  buildTeamScheduleEmbed(teamName, matches) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${teamName}'s Schedule`)
      .setDescription(`All matches for ${teamName}`)
      .setTimestamp();
    
    // Group matches by matchday
    const matchdayGroups = {};
    matches.forEach(match => {
      if (!matchdayGroups[match.matchday]) {
        matchdayGroups[match.matchday] = [];
      }
      matchdayGroups[match.matchday].push(match);
    });
    
    // Sort matchdays numerically
    const sortedMatchdays = Object.keys(matchdayGroups).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Add fields for each matchday
    for (const matchday of sortedMatchdays) {
      let fieldValue = '';
      const matchList = matchdayGroups[matchday];
      
      // Sort matches by tier
      const sortOrder = { 'apex': 1, 'alpha': 2, 'beta': 3, 'delta': 4, 'omega': 5 };
      matchList.sort((a, b) => sortOrder[a.tier] - sortOrder[b.tier]);
      
      matchList.forEach(match => {
        const tierName = match.tier.charAt(0).toUpperCase() + match.tier.slice(1);
        const opponent = match.team1 === teamName ? match.team2 : match.team1;
        
        if (match.scheduled && match.date) {
          const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
          fieldValue += `**${tierName}** vs ${opponent}: <t:${timestamp}:f> (<t:${timestamp}:R>)\n`;
        } else {
          fieldValue += `**${tierName}** vs ${opponent}: To be determined\n`;
        }
      });
      
      // Make sure field value isn't empty and doesn't exceed Discord's limits
      if (fieldValue.length === 0) {
        fieldValue = "No matches found";
      }
      
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1020) + "...";
      }
      
      embed.addFields({ name: `Matchday ${matchday}`, value: fieldValue });
    }
    
    return embed;
  },
  
  buildTierScheduleEmbed(tier, matches) {
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
    
    const embed = new EmbedBuilder()
      .setColor(this.getTierColor(tier))
      .setTitle(`${tierName} Tier Schedule`)
      .setDescription(`All matches for the ${tierName} tier`)
      .setTimestamp();
    
    // Group matches by matchday
    const matchdayGroups = {};
    matches.forEach(match => {
      if (!matchdayGroups[match.matchday]) {
        matchdayGroups[match.matchday] = [];
      }
      matchdayGroups[match.matchday].push(match);
    });
    
    // Sort matchdays numerically
    const sortedMatchdays = Object.keys(matchdayGroups).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Add fields for each matchday
    for (const matchday of sortedMatchdays) {
      let fieldValue = '';
      const matchList = matchdayGroups[matchday];
      
      // Sort matches alphabetically by team1 name
      matchList.sort((a, b) => a.team1.localeCompare(b.team1));
      
      // Add each match to the field with match numbers if needed
      matchList.forEach((match, index) => {
        // Add a match number if there are multiple matches
        const matchNumber = matchList.length > 1 ? `Match ${index + 1}: ` : '';
        
        if (match.scheduled && match.date) {
          const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: <t:${timestamp}:f> (<t:${timestamp}:R>)\n`;
        } else {
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: To be determined\n`;
        }
      });
      
      // Make sure field value isn't empty and doesn't exceed Discord's limits
      if (fieldValue.length === 0) {
        fieldValue = "No matches found";
      }
      
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1020) + "...";
      }
      
      embed.addFields({ name: `Matchday ${matchday} (${matchList.length} matches)`, value: fieldValue });
    }
    
    return embed;
  },
  
  buildMatchdayOverviewEmbed(season, matchday, matches) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Season ${season} - Matchday ${matchday} Overview`)
      .setDescription(`${matches.length} total matches`)
      .setTimestamp();
    
    // Group matches by tier
    const tierGroups = {};
    matches.forEach(match => {
      if (!tierGroups[match.tier]) {
        tierGroups[match.tier] = [];
      }
      tierGroups[match.tier].push(match);
    });
    
    // Sort tiers
    const sortOrder = ['apex', 'alpha', 'beta', 'delta', 'omega'];
    const sortedTiers = Object.keys(tierGroups).sort((a, b) => 
      sortOrder.indexOf(a) - sortOrder.indexOf(b)
    );
    
    // Add fields for each tier
    for (const tier of sortedTiers) {
      let fieldValue = '';
      const tierMatches = tierGroups[tier];
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      
      // Count scheduled matches
      const scheduledCount = tierMatches.filter(m => m.scheduled).length;
      const progressBar = this.generateProgressBar(scheduledCount, tierMatches.length, 10);
      
      fieldValue += `${progressBar} (${scheduledCount}/${tierMatches.length} scheduled)\n\n`;
      
      // Sort matches alphabetically by team1 name
      tierMatches.sort((a, b) => a.team1.localeCompare(b.team1));
      
      // Add each match to the field with match numbers if needed
      tierMatches.forEach((match, index) => {
        // Add a match number if there are multiple matches
        const matchNumber = tierMatches.length > 1 ? `Match ${index + 1}: ` : '';
        
        if (match.scheduled && match.date) {
          const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: <t:${timestamp}:f> (<t:${timestamp}:R>)\n`;
        } else {
          fieldValue += `${matchNumber}**${match.team1}** vs **${match.team2}**: To be determined\n`;
        }
      });
      
      // Make sure field value isn't empty and doesn't exceed Discord's limits
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1020) + "...";
      }
      
      embed.addFields({ name: `${tierName} Tier (${tierMatches.length} matches)`, value: fieldValue });
    }
    
    return embed;
  },
  
  buildTierWeekScheduleEmbed(season, week, tier, matches) {
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
    
    const embed = new EmbedBuilder()
      .setColor(this.getTierColor(tier))
      .setTitle(`${tierName} Tier - Week ${week}`)
      .setDescription(`${matches.length} matches this week`)
      .setTimestamp();

    // Sort matches by matchday
    matches.sort((a, b) => a.matchday - b.matchday);
    
    // Group matches by matchday
    const matchdayGroups = {};
    matches.forEach(match => {
      if (!matchdayGroups[match.matchday]) {
        matchdayGroups[match.matchday] = [];
      }
      matchdayGroups[match.matchday].push(match);
    });
    
    // Add fields for each matchday
    const sortedMatchdays = Object.keys(matchdayGroups).sort((a, b) => parseInt(a) - parseInt(b));
    
    for (const matchday of sortedMatchdays) {
      let fieldValue = '';
      const matchdayMatches = matchdayGroups[matchday];
      
      matchdayMatches.forEach(match => {
        if (match.scheduled && match.date) {
          // Create a Discord timestamp that will show in the user's local time
          const timestamp = Math.floor(new Date(match.date).getTime() / 1000);
          
          // Format: <t:timestamp:f> shows date and time in user's locale
          // Format: <t:timestamp:R> shows relative time (e.g., "in 2 days")
          fieldValue += `**${match.team1}** vs **${match.team2}**: <t:${timestamp}:f> (<t:${timestamp}:R>)\n`;
        } else {
          fieldValue += `**${match.team1}** vs **${match.team2}**: To be determined\n`;
        }
      });
      
      // Make sure field value isn't empty and doesn't exceed Discord's limits
      if (fieldValue.length === 0) {
        fieldValue = "No matches found";
      }
      
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1020) + "...";
      }
      
      embed.addFields({ name: `Matchday ${matchday}`, value: fieldValue });
    }

    // If no fields were added (no matches), add a placeholder
    if (!embed.data.fields || embed.data.fields.length === 0) {
      embed.addFields({ name: 'No Matches', value: 'No matches found for this tier this week.' });
    }

    return embed;
  },
  
  getTierColor(tier) {
    const tierColors = {
      'apex': '#FF0000',   // Red
      'alpha': '#0000FF',  // Blue
      'beta': '#00FF00',   // Green
      'delta': '#FFA500',  // Orange
      'omega': '#800080'   // Purple
    };
    
    return tierColors[tier] || '#0099ff';
  }
};
