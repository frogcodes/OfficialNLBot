const AVAILABILITY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
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
  MANAGEMENT_ROLE_IDS,
  SCHEDULING_TEAM_ROLE_ID,
};
