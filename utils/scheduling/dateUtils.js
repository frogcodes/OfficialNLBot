const { DateTime } = require("luxon");
const { AVAILABILITY_DAYS } = require("./constants.js");

const SCHEDULING_TIME_ZONE = "America/New_York";

function getCurrentWeekStartDate() {
  const now = DateTime.now().setZone(SCHEDULING_TIME_ZONE).startOf("day");
  return now.minus({ days: now.weekday - 1 }).toISODate();
}

function getWeekStartDateFromIso(isoDateTime) {
  const dateTime = DateTime.fromISO(isoDateTime, {
    zone: SCHEDULING_TIME_ZONE,
  }).startOf("day");

  if (!dateTime.isValid) {
    return getCurrentWeekStartDate();
  }

  return dateTime.minus({ days: dateTime.weekday - 1 }).toISODate();
}

function normalizeWeekStartDate(input) {
  if (!input) {
    return getCurrentWeekStartDate();
  }

  const parsed = DateTime.fromFormat(input, "M/d/yyyy", {
    zone: SCHEDULING_TIME_ZONE,
  }).startOf("day");

  if (!parsed.isValid) {
    throw new Error("Invalid week start date. Use MM/DD/YYYY.");
  }

  if (parsed.weekday !== 1) {
    throw new Error("Week start date must be a Monday.");
  }

  return parsed.toISODate();
}

function parseAvailabilityTime(time) {
  const parsed = DateTime.fromFormat(time, "h:mm a 'ET'", {
    zone: SCHEDULING_TIME_ZONE,
  });

  if (!parsed.isValid) {
    throw new Error("Invalid scheduled time.");
  }

  return parsed;
}

function buildScheduledDateTime({ weekStartDate, day, time }) {
  const dayIndex = AVAILABILITY_DAYS.indexOf(day);

  if (dayIndex === -1) {
    throw new Error("Invalid scheduled day.");
  }

  const startDate = DateTime.fromISO(weekStartDate, {
    zone: SCHEDULING_TIME_ZONE,
  }).startOf("day");

  if (!startDate.isValid) {
    throw new Error("Invalid scheduling week start date.");
  }

  const parsedTime = parseAvailabilityTime(time);
  const scheduledDateTime = startDate.plus({ days: dayIndex }).set({
    hour: parsedTime.hour,
    minute: parsedTime.minute,
    second: 0,
    millisecond: 0,
  });

  return {
    date: scheduledDateTime.toISODate(),
    dateTime: scheduledDateTime.toISO(),
    display: scheduledDateTime.toFormat("cccc, LLLL d, yyyy 'at' h:mm a 'ET'"),
    timestamp: Math.floor(scheduledDateTime.toSeconds()),
    timeZone: SCHEDULING_TIME_ZONE,
  };
}

function formatScheduledDateForDiscord(scheduledDate) {
  if (!scheduledDate?.timestamp) {
    return scheduledDate?.display ?? "Unknown time";
  }

  return `<t:${scheduledDate.timestamp}:f> (<t:${scheduledDate.timestamp}:R>)`;
}

module.exports = {
  SCHEDULING_TIME_ZONE,
  buildScheduledDateTime,
  formatScheduledDateForDiscord,
  getCurrentWeekStartDate,
  getWeekStartDateFromIso,
  normalizeWeekStartDate,
};
