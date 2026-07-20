const AVAILABILITY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const AVAILABILITY_TIMES = [
  "12:00 AM ET",
  "1:00 AM ET",
  "2:00 AM ET",
  "3:00 AM ET",
  "4:00 AM ET",
  "5:00 AM ET",
  "6:00 AM ET",
  "7:00 AM ET",
  "8:00 AM ET",
  "9:00 AM ET",
  "10:00 AM ET",
  "11:00 AM ET",
  "12:00 PM ET",
  "1:00 PM ET",
  "2:00 PM ET",
  "3:00 PM ET",
  "4:00 PM ET",
  "5:00 PM ET",
  "6:00 PM ET",
  "7:00 PM ET",
  "8:00 PM ET",
  "9:00 PM ET",
  "10:00 PM ET",
  "11:00 PM ET",
];

const SCHEDULING_TEAM_ROLE_ID = "1273103635294982246";

// Team management (Nature League's GM/AGM equivalents). These can submit
// availability and confirm times for their team alongside the tier captain.
const MANAGEMENT_ROLE_IDS = [
  "1181050438926209076", // zookeeper
  "1181050438926209074", // handler
];

module.exports = {
  AVAILABILITY_DAYS,
  AVAILABILITY_TIMES,
  MANAGEMENT_ROLE_IDS,
  SCHEDULING_TEAM_ROLE_ID,
};
