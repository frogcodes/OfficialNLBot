const moment = require('moment-timezone');

module.exports = {
  parseDateTime(dateStr, timeStr) {
    // Parse date in MM/DD/YY format
    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) {
      return null;
    }
    
    // Parse time (e.g., "9 PM EST")
    const timeRegex = /(\d+)(?::(\d+))?\s*(AM|PM)?\s*(.*)?/i;
    const timeMatch = timeStr.match(timeRegex);
    
    if (!timeMatch) {
      return null;
    }
    
    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3] ? timeMatch[3].toUpperCase() : 'PM';
    const timezone = timeMatch[4] ? timeMatch[4].trim().toUpperCase() : 'EST';
    
    // Convert to 24-hour format
    let hour24 = hour;
    if (period === 'PM' && hour < 12) {
      hour24 += 12;
    } else if (period === 'AM' && hour === 12) {
      hour24 = 0;
    }
    
    // Create date object in the specified timezone
    const month = parseInt(dateParts[0]) - 1; // Month is 0-indexed in JS
    const day = parseInt(dateParts[1]);
    const year = 2000 + parseInt(dateParts[2]); // Assuming 20xx for YY
    
    // Create moment object in the specified timezone
    const tzMap = {
      'EST': 'America/New_York',
      'CST': 'America/Chicago',
      'MST': 'America/Denver',
      'PST': 'America/Los_Angeles',
      'EDT': 'America/New_York',
      'CDT': 'America/Chicago',
      'MDT': 'America/Denver',
      'PDT': 'America/Los_Angeles',
      'ET': 'America/New_York',
      'CT': 'America/Chicago',
      'MT': 'America/Denver',
      'PT': 'America/Los_Angeles',
      'UTC': 'UTC',
      'GMT': 'UTC'
    };
    
    const tz = tzMap[timezone] || 'America/New_York';
    const dateTime = moment.tz({ year, month, day, hour: hour24, minute }, tz);
    
    return dateTime.toDate();
  },
  
  formatDate(date) {
    return moment(date).format('MM/DD/YY');
  },
  
  formatDateTime(date) {
    return moment(date).format('MM/DD/YY h:mm A');
  },
  
  formatTimeOnly(date) {
    return moment(date).format('h:mm A');
  },
  
  convertToMultipleTimezones(date) {
    const timezones = [
      { name: 'Eastern Time', zone: 'America/New_York' },
      { name: 'Central Time', zone: 'America/Chicago' },
      { name: 'Mountain Time', zone: 'America/Denver' },
      { name: 'Pacific Time', zone: 'America/Los_Angeles' },
      { name: 'UTC', zone: 'UTC' }
    ];
    
    return timezones.map(tz => {
      const time = moment(date).tz(tz.zone).format('h:mm A');
      return `${time} (${tz.name})`;
    });
  },
  
  getTimeUntil(date) {
    const now = moment();
    const target = moment(date);
    const duration = moment.duration(target.diff(now));
    
    if (duration.asSeconds() < 0) {
      return 'Already passed';
    }
    
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();
    
    let result = '';
    if (days > 0) {
      result += `${days} day${days !== 1 ? 's' : ''} `;
    }
    if (hours > 0 || days > 0) {
      result += `${hours} hour${hours !== 1 ? 's' : ''} `;
    }
    result += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    
    return result;
  },
  
  getRelativeTimeString(date) {
    return moment(date).fromNow();
  },
  
  isValidDate(dateStr) {
    // Check if date is in MM/DD/YY format
    const regex = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01])\/(\d{2})$/;
    if (!regex.test(dateStr)) {
      return false;
    }
    
    const [month, day, year] = dateStr.split('/').map(Number);
    const fullYear = 2000 + year;
    
    // Check if date is valid
    const date = new Date(fullYear, month - 1, day);
    return date.getMonth() === month - 1 && 
           date.getDate() === day && 
           date.getFullYear() === fullYear;
  },
  
  isValidTime(timeStr) {
    // Check if time is in a valid format (e.g., "9 PM EST", "9:30 PM", etc.)
    const regex = /^(0?[1-9]|1[0-2])(?::([0-5][0-9]))?\s*(AM|PM)(?:\s+([A-Z]{3,4}))?$/i;
    return regex.test(timeStr);
  },
  
  getTimezoneAbbreviation(timezone) {
    const now = new Date();
    const isDST = this.isDaylightSavingTime(now);
    
    const timezoneMap = {
      'America/New_York': isDST ? 'EDT' : 'EST',
      'America/Chicago': isDST ? 'CDT' : 'CST',
      'America/Denver': isDST ? 'MDT' : 'MST',
      'America/Los_Angeles': isDST ? 'PDT' : 'PST',
      'UTC': 'UTC'
    };
    
    return timezoneMap[timezone] || timezone;
  },
  
  isDaylightSavingTime(date) {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    
    const stdTimezoneOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    return date.getTimezoneOffset() < stdTimezoneOffset;
  },
  
  formatDateForDisplay(date) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const d = new Date(date);
    const dayName = dayNames[d.getDay()];
    const monthName = monthNames[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    
    return `${dayName}, ${monthName} ${day}, ${year}`;
  },
  
  getNextWeekday(weekday) {
    // weekday is 0-6, where 0 is Sunday and 6 is Saturday
    const now = new Date();
    const currentDay = now.getDay(); // 0-6
    const daysUntilNextWeekday = (7 + weekday - currentDay) % 7;
    
    // If today is the target weekday, return next week's date
    const daysToAdd = daysUntilNextWeekday === 0 ? 7 : daysUntilNextWeekday;
    
    const nextWeekday = new Date(now);
    nextWeekday.setDate(now.getDate() + daysToAdd);
    
    // Set to midnight
    nextWeekday.setHours(0, 0, 0, 0);
    
    return nextWeekday;
  },
  
  getStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  },
  
  getEndOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
};
