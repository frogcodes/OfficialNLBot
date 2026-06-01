const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const Config = require('../models/config');

module.exports = {
  async getCurrentMatchday() {
    // Get the most recent matchday that hasn't been fully scheduled yet
    const currentDate = new Date();
    const currentSeason = await this.getCurrentSeason();
    
    const matches = await Schedule.find({ season: currentSeason })
      .sort({ matchday: 1 });
    
    if (!matches || matches.length === 0) {
      return 1; // Default to matchday 1 if no matches found
    }
    
    // Find the earliest matchday with unscheduled matches
    const matchdayGroups = {};
    matches.forEach(match => {
      if (!matchdayGroups[match.matchday]) {
        matchdayGroups[match.matchday] = [];
      }
      matchdayGroups[match.matchday].push(match);
    });
    
    for (const [matchday, matchList] of Object.entries(matchdayGroups)) {
      const unscheduled = matchList.some(match => !match.scheduled);
      if (unscheduled) {
        return parseInt(matchday);
      }
    }
    
    // If all matches are scheduled, return the last matchday
    return Math.max(...Object.keys(matchdayGroups).map(Number));
  },
  
  async getCurrentSeason() {
    // Get the most recent season
    const latestMatch = await Schedule.findOne().sort({ season: -1 });
    return latestMatch ? latestMatch.season : 1;
  },
  
  async getCurrentWeek(season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    // Get the current date
    const currentDate = new Date();
    
    // Get the season start date from config
    const config = await Config.findOne({ key: 'seasonStart' });
    let seasonStart;
    
    if (config && config.value) {
      seasonStart = new Date(config.value);
    } else {
      // Default to current date if no season start is configured
      seasonStart = currentDate;
      
      // Save the current date as season start
      await Config.findOneAndUpdate(
        { key: 'seasonStart' },
        { key: 'seasonStart', value: seasonStart.toISOString() },
        { upsert: true }
      );
    }
    
    // Calculate the week number based on the difference in days
    const daysDiff = Math.floor((currentDate - seasonStart) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysDiff / 7) + 1;
    
    // Get the maximum week number for this season
    const maxWeek = await Schedule.findOne({ season }).sort({ week: -1 });
    const maxWeekNumber = maxWeek ? maxWeek.week : 1;
    
    // Return the current week, but don't exceed the maximum week
    return Math.min(weekNumber, maxWeekNumber);
  },
  
  async getNextWeek(season = null) {
    const currentWeek = await this.getCurrentWeek(season);
    
    // Get the maximum week number for this season
    if (!season) {
      season = await this.getCurrentSeason();
    }
    const maxWeek = await Schedule.findOne({ season }).sort({ week: -1 });
    const maxWeekNumber = maxWeek ? maxWeek.week : 1;
    
    // Return the next week, but don't exceed the maximum week
    return Math.min(currentWeek + 1, maxWeekNumber);
  },
  
  async getMatchesForMatchday(matchday, season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    return Schedule.find({ matchday, season }).sort({ tier: 1 });
  },
  
  async getMatchesForWeek(week, season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    return Schedule.find({ week, season }).sort({ matchday: 1, tier: 1 });
  },
  
  async getUnscheduledMatches(matchday, season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    return Schedule.find({ 
      matchday, 
      season,
      scheduled: false
    }).sort({ tier: 1 });
  },
  
  async getTeamMentions(teamName) {
    const team = await Team.findOne({ name: { $regex: new RegExp(`^${teamName}$`, 'i') } });
    
    if (!team) {
      return { role: teamName, members: [] };
    }
    
    const mentions = {
      role: `<@&${team.roleId}>`,
      members: []
    };
    
    if (team.members.gm) {
      mentions.members.push(`<@${team.members.gm}>`);
    }
    
    if (team.members.agm) {
      mentions.members.push(`<@${team.members.agm}>`);
    }
    
    team.members.captains.forEach(captainId => {
      mentions.members.push(`<@${captainId}>`);
    });
    
    return mentions;
  },
  
  async storeScheduleMessages(season, week, headerMessageId, tierMessages) {
    // Store the message IDs in the database for future updates
    await Config.findOneAndUpdate(
      { key: `schedule_${season}_${week}` },
      { 
        key: `schedule_${season}_${week}`,
        value: JSON.stringify({
          headerMessageId,
          tierMessages
        })
      },
      { upsert: true }
    );
  },
  
  async getScheduleMessages(season, week) {
    // Get the stored message IDs from the database
    const config = await Config.findOne({ key: `schedule_${season}_${week}` });
    
    if (config && config.value) {
      return JSON.parse(config.value);
    }
    
    return null;
  },
  
  async isAutoUpdateEnabled() {
    const config = await Config.findOne({ key: 'autoUpdateEnabled' });
    return config ? config.value !== 'false' : true; // Default to enabled
  },
  
  async setAutoUpdateEnabled(enabled) {
    await Config.findOneAndUpdate(
      { key: 'autoUpdateEnabled' },
      { key: 'autoUpdateEnabled', value: enabled.toString() },
      { upsert: true }
    );
  },
  
  async setSeasonStartDate(date) {
    await Config.findOneAndUpdate(
      { key: 'seasonStart' },
      { key: 'seasonStart', value: date.toISOString() },
      { upsert: true }
    );
  },
  
  async getSeasonStartDate() {
    const config = await Config.findOne({ key: 'seasonStart' });
    return config && config.value ? new Date(config.value) : new Date();
  },
  
  async getWeekMatchdays(week, season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    const weekMatches = await Schedule.find({ week, season });
    return [...new Set(weekMatches.map(match => match.matchday))].sort((a, b) => a - b);
  },
  
  async getWeekTiers(week, season = null) {
    if (!season) {
      season = await this.getCurrentSeason();
    }
    
    const weekMatches = await Schedule.find({ week, season });
    return [...new Set(weekMatches.map(match => match.tier))].sort((a, b) => {
      const tierOrder = { 'apex': 0, 'alpha': 1, 'beta': 2, 'delta': 3, 'omega': 4 };
      return tierOrder[a] - tierOrder[b];
    });
  }
};
