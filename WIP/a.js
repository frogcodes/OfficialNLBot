const RocketLeagueTracker = require("./trackerMMRpull.js");

async function checkPlayer() {
  const tracker = new RocketLeagueTracker();
  const result = await tracker.getPlayerStats("Kompetant", "xbl", false);

  if (result.success) {
    console.log(`Raw Salary: ${result.rawSalary}`);
    console.log(`2s Peak: ${result.peaks.twos}`);
    console.log(`3s Peak: ${result.peaks.threes}`);
  } else {
    console.log(`Error: ${result.error}`);
  }
}

checkPlayer();
