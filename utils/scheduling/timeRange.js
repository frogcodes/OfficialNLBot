const { AVAILABILITY_DAYS } = require("./constants.js");

// Times that land before this hour (e.g. 12:00 AM - 4:45 AM ET) belong to the
// previous evening's "night", so we push them onto a continuous timeline that
// starts in the evening and rolls past midnight. 5 PM ET = 1020, 11 PM = 1380,
// 12 AM = 1440, 3 AM = 1620. This makes ranges like "10 PM - 1 AM" contiguous.
const NIGHT_ROLL_HOUR = 5;
const MINUTES_PER_DAY = 1440;

const DAY_ALIASES = (() => {
  const map = new Map();
  for (const day of AVAILABILITY_DAYS) {
    map.set(day.toLowerCase(), day);
    map.set(day.slice(0, 3).toLowerCase(), day);
  }
  // A few forgiving extras.
  map.set("tues", "Tuesday");
  map.set("thur", "Thursday");
  map.set("thurs", "Thursday");
  return map;
})();

function parseDayName(input) {
  if (!input) {
    return null;
  }
  return DAY_ALIASES.get(String(input).trim().toLowerCase()) ?? null;
}

function to12Hour(hour24) {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, period };
}

// Parse a single time token ("8", "8:30", "8:30 PM", "18:15", "1am") into a
// normalized minute value on the night timeline (see NIGHT_ROLL_HOUR).
function parseTimeToken(raw) {
  if (raw == null) {
    throw new Error("Missing a time.");
  }

  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\bet\b/g, "")
    .replace(/\./g, "")
    .trim();

  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) {
    throw new Error(
      `Could not read the time "${String(raw).trim()}". Try 8, 8:30, or 8:30 PM.`,
    );
  }

  const rawHour = parseInt(match[1], 10);
  const minute = match[2] != null ? parseInt(match[2], 10) : 0;
  const meridiem = match[3] || null;

  if (minute % 15 !== 0) {
    throw new Error(
      `Times must be on 15-minute marks (:00, :15, :30, :45). Got "${String(raw).trim()}".`,
    );
  }

  let hour24;
  if (meridiem === "pm") {
    hour24 = rawHour === 12 ? 12 : rawHour + 12;
  } else if (meridiem === "am") {
    hour24 = rawHour === 12 ? 0 : rawHour;
  } else if (rawHour === 0) {
    hour24 = 0; // midnight
  } else if (rawHour >= 1 && rawHour <= 4) {
    hour24 = rawHour; // AM (night-league heuristic)
  } else if (rawHour >= 5 && rawHour <= 11) {
    hour24 = rawHour + 12; // PM (night-league heuristic)
  } else if (rawHour === 12) {
    hour24 = 0; // treat bare "12" as midnight
  } else {
    hour24 = rawHour; // already 24h (13-23)
  }

  if (hour24 < 0 || hour24 > 23) {
    throw new Error(`"${String(raw).trim()}" is not a valid time.`);
  }

  const base = hour24 * 60 + minute;
  return hour24 < NIGHT_ROLL_HOUR ? base + MINUTES_PER_DAY : base;
}

function normalizedToDisplay(normalized) {
  const realMinutes =
    normalized >= MINUTES_PER_DAY ? normalized - MINUTES_PER_DAY : normalized;
  const hour24 = Math.floor(realMinutes / 60);
  const minute = realMinutes % 60;
  const { hour, period } = to12Hour(hour24);
  return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}

const SHORT_DAY = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

// A post-midnight time (normalized past 1440) belongs to the calendar day AFTER
// the day it was entered under. Return that real weekday so displays never hide
// the roll (e.g. a time typed under "Saturday" that lands at 1 AM is a Sunday).
function resolveDayForNormalized(dayLabel, normalized) {
  if (normalized < MINUTES_PER_DAY) {
    return dayLabel;
  }
  const index = AVAILABILITY_DAYS.indexOf(dayLabel);
  if (index === -1) {
    return dayLabel;
  }
  return AVAILABILITY_DAYS[(index + 1) % AVAILABILITY_DAYS.length];
}

// "Sunday at 1:00 AM ET" — a day label + normalized minute rendered with the real
// calendar weekday, so a rolled-past-midnight time reads correctly to captains.
function formatDayTime(dayLabel, normalized) {
  return `${resolveDayForNormalized(dayLabel, normalized)} at ${normalizedToDisplay(normalized)} ET`;
}

// Same, driven by a stored proposal. Falls back to the raw day/time strings if an
// older proposal predates timeNormalized being stored.
function formatDayTimeFromProposal(proposal) {
  if (!proposal) {
    return "";
  }
  if (typeof proposal.timeNormalized === "number") {
    return formatDayTime(proposal.day, proposal.timeNormalized);
  }
  return `${proposal.day} at ${proposal.time}`;
}

// Render one interval for display, annotating the real weekday whenever it isn't
// the day the range was entered under: a range that crosses midnight shows the
// end's day ("7:00 PM–1:00 AM (→ Sun)"), and a fully-early-morning range shows
// the rolled day ("12:00 AM–2:00 AM (Mon)").
function describeInterval(dayLabel, interval) {
  const startDay = resolveDayForNormalized(dayLabel, interval.start);
  const startTime = normalizedToDisplay(interval.start);

  if (interval.start === interval.end) {
    return startDay === dayLabel
      ? startTime
      : `${startTime} (${SHORT_DAY[startDay] ?? startDay})`;
  }

  const endDay = resolveDayForNormalized(dayLabel, interval.end);
  const endTime = normalizedToDisplay(interval.end);

  if (startDay === endDay) {
    return startDay === dayLabel
      ? `${startTime}–${endTime}`
      : `${startTime}–${endTime} (${SHORT_DAY[startDay] ?? startDay})`;
  }

  return `${startTime}–${endTime} (→ ${SHORT_DAY[endDay] ?? endDay})`;
}

// Canonical string that dateUtils.buildScheduledDateTime can parse ("h:mm a 'ET'").
function toCanonicalTime(normalized) {
  return `${normalizedToDisplay(normalized)} ET`;
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const merged = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

// Tighten up the spaces that belong INSIDE a range so the only spaces left are
// the ones separating one range from the next. This lets captains separate ranges
// with just a space ("6-8 10-11") without breaking times that legitimately contain
// spaces ("8:30 PM") or spaced-out ranges ("6 - 8", "9 to 11").
function normalizeRangeText(text) {
  return String(text)
    .replace(/\s+and\s+/gi, ",") // "6-7 and 9-11" -> "6-7,9-11"
    .replace(/\s*&\s*/g, ",") // "6-7 & 9-11" -> "6-7,9-11"
    .replace(/\s+to\s+/gi, "-") // "9 to 11" -> "9-11"
    .replace(/\s*(?:-|–|—)\s*/g, "-") // "6 - 8" -> "6-8"
    .replace(/(\d)\s+(am|pm)\b/gi, "$1$2"); // "8 PM" -> "8PM"
}

function splitRangeParts(text) {
  return normalizeRangeText(text)
    .split(/[,;]|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseRangePart(part) {
  const tokens = part
    .split(/\s*(?:-|–|—|to)\s*/i)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 1) {
    const point = parseTimeToken(tokens[0]);
    return { start: point, end: point };
  }

  if (tokens.length !== 2) {
    throw new Error(
      `Could not read "${part}". Use a start-end range like 6:15-7:45.`,
    );
  }

  const start = parseTimeToken(tokens[0]);
  const end = parseTimeToken(tokens[1]);

  if (end < start) {
    throw new Error(
      `"${part}" ends before it starts. For times past midnight add am/pm (e.g. 10 PM-1 AM).`,
    );
  }

  return { start, end };
}

// Parse one day's worth of ranges ("6:15-7:45, 9-11:15") into merged intervals.
function parseDayRanges(text) {
  const intervals = splitRangeParts(text).map(parseRangePart);
  return mergeIntervals(intervals);
}

// Parse the multi-line availability modal input into { [day]: intervals }.
function parseAvailabilityText(text) {
  const availabilityByDay = {};
  const errors = [];

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let dayPart;
    let rangePart;
    const colonIndex = line.indexOf(":");

    if (colonIndex === -1) {
      const spaceMatch = line.match(/^(\S+)\s+(.*)$/);
      if (!spaceMatch) {
        continue;
      }
      [, dayPart, rangePart] = spaceMatch;
    } else {
      dayPart = line.slice(0, colonIndex);
      rangePart = line.slice(colonIndex + 1);
    }

    const day = parseDayName(dayPart);
    if (!day) {
      errors.push(`Unknown day "${dayPart.trim()}".`);
      continue;
    }

    if (!rangePart.trim()) {
      continue; // blank => not available that day
    }

    try {
      const intervals = parseDayRanges(rangePart);
      if (intervals.length > 0) {
        availabilityByDay[day] = mergeIntervals([
          ...(availabilityByDay[day] || []),
          ...intervals,
        ]);
      }
    } catch (error) {
      errors.push(`${day}: ${error.message}`);
    }
  }

  return { availabilityByDay, errors };
}

function formatIntervals(intervals) {
  if (!intervals || intervals.length === 0) {
    return null;
  }

  return intervals
    .map((interval) =>
      interval.start === interval.end
        ? normalizedToDisplay(interval.start)
        : `${normalizedToDisplay(interval.start)}–${normalizedToDisplay(interval.end)}`,
    )
    .join(", ");
}

function formatAvailabilityByDay(availabilityByDay) {
  const lines = AVAILABILITY_DAYS.map((day) => {
    const intervals = availabilityByDay?.[day];
    if (!intervals || intervals.length === 0) {
      return null;
    }
    const formatted = intervals
      .map((interval) => describeInterval(day, interval))
      .join(", ");
    return `- ${day}: ${formatted}`;
  }).filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- No availability entered.";
}

function intersectIntervalLists(listA = [], listB = []) {
  const a = mergeIntervals(listA);
  const b = mergeIntervals(listB);
  const result = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);

    if (start <= end) {
      result.push({ start, end });
    }

    if (a[i].end < b[j].end) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return result;
}

function computeOverlapByDay(dayMapA = {}, dayMapB = {}) {
  const overlap = {};

  for (const day of AVAILABILITY_DAYS) {
    const intersection = intersectIntervalLists(
      dayMapA[day] || [],
      dayMapB[day] || [],
    );
    if (intersection.length > 0) {
      overlap[day] = intersection;
    }
  }

  return overlap;
}

function overlapHasAny(overlapByDay) {
  return Object.keys(overlapByDay || {}).length > 0;
}

function getOverlapDays(overlapByDay) {
  return AVAILABILITY_DAYS.filter(
    (day) => (overlapByDay?.[day] || []).length > 0,
  );
}

function isTimeWithinOverlap(overlapByDay, day, normalized) {
  return (overlapByDay?.[day] || []).some(
    (interval) => normalized >= interval.start && normalized <= interval.end,
  );
}

function countIntervals(availabilityByDay) {
  return Object.values(availabilityByDay || {}).reduce(
    (total, intervals) => total + (intervals?.length || 0),
    0,
  );
}

// Rebuild an editable template string for the availability modal, pre-filling
// any ranges the captain already submitted (using a plain hyphen so the value
// re-parses cleanly).
function buildAvailabilityTemplate(availabilityByDay) {
  return AVAILABILITY_DAYS.map((day) => {
    const formatted = formatIntervals(availabilityByDay?.[day]);
    return `${day}: ${formatted ? formatted.replace(/–/g, "-") : ""}`;
  }).join("\n");
}

module.exports = {
  NIGHT_ROLL_HOUR,
  buildAvailabilityTemplate,
  computeOverlapByDay,
  countIntervals,
  formatAvailabilityByDay,
  formatDayTime,
  formatDayTimeFromProposal,
  formatIntervals,
  getOverlapDays,
  intersectIntervalLists,
  isTimeWithinOverlap,
  normalizedToDisplay,
  overlapHasAny,
  parseAvailabilityText,
  parseDayName,
  parseDayRanges,
  parseTimeToken,
  toCanonicalTime,
};
