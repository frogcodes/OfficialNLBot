const RocketLeagueTracker = require("./trackerMMRpull.js");
const { google } = require("googleapis");

const SHEET_ID = process.env.enrollmentSheetId;
const CREDENTIALS = process.env.credentials;

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Add this helper function at the top
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkPlayer(trackers) {
  const twos = [];
  const threes = [];
  const passedTrackers = [];
  const checker = new RocketLeagueTracker();
  let closestFailure = null; // Track the closest failure with score
  const skippedTrackers = []; // Track skipped trackers

  for (const tracker of trackers) {
    if (!tracker) continue;

    const tComponents = tracker.split("/");
    const result = await checker.getPlayerStats(
      tComponents[6], //name
      tComponents[5], //platform
      false, //useCurl bool
    );

    if (!result.success && result.skippable) {
      console.log(`⚠ Skipping ${tComponents[6]} - ${result.error}`);
      skippedTrackers.push(`${tComponents[5]}/${tComponents[6]}`);
      continue;
    }

    if (!result.success) {
      let notes = "Requirements not met";
      let closenessScore = 0; // Higher = closer to passing

      if (result.error === "Not enough account wins") {
        notes = `Needs ${result.winsNeeded} more wins`;
        closenessScore = result.wins || 0; // More wins = closer

        if (result.peaks) {
          twos.push(result.peaks.twos);
          threes.push(result.peaks.threes);
        }
      } else if (result.games) {
        // Calculate how close they are to meeting requirements
        const totalGames = result.games.total || 0;
        const currentTwos = result.games.twos || 0;
        const currentThrees = result.games.threes || 0;
        const maxCurrent = Math.max(currentTwos, currentThrees);

        // Score based on: total games progress + current season progress
        closenessScore = totalGames + maxCurrent * 10; // Weight current season more

        if (totalGames < 350) {
          notes = `${totalGames}/350 past 3`;
          if (!(currentTwos >= 100 || currentThrees >= 100)) {
            notes += ` & ${maxCurrent}/100 this season`;
          }
        } else if (currentTwos < 100 && currentThrees < 100) {
          notes = `${maxCurrent}/100 this season`;
        }

        if (result.peaks) {
          twos.push(result.peaks.twos);
          threes.push(result.peaks.threes);
        }
      }

      // Update closest failure only if this one is closer (and no one has passed yet)
      if (passedTrackers.length === 0) {
        if (!closestFailure || closenessScore > closestFailure.score) {
          closestFailure = {
            notes: notes,
            score: closenessScore,
            username: result.username,
          };
        }
      }

      console.log(`✗ ${result.username} - ${notes} (score: ${closenessScore})`);
    }

    if (result.success) {
      twos.push(result.peaks.twos);
      threes.push(result.peaks.threes);
      passedTrackers.push(result.username);

      // Clear closest failure since someone passed
      closestFailure = null;

      console.log(`✓ ${result.username} passed`);
    }

    await delay(10000);
  }

  // Build final notes string
  let finalNotes = closestFailure ? closestFailure.notes : "";

  // Append skipped trackers to notes if any exist
  if (skippedTrackers.length > 0) {
    const skippedList = skippedTrackers.join(", ");
    finalNotes += finalNotes
      ? `; ${skippedList} failed`
      : `${skippedList} failed`;
  }

  return {
    twosMmr: twos.length > 0 ? Math.max(...twos) : 0,
    threesMmr: threes.length > 0 ? Math.max(...threes) : 0,
    success: passedTrackers.length > 0,
    notes: finalNotes,
  };
}

module.exports = async function autoSalary(playerID) {
  // Read Database sheet to find player row
  await delay(10000);
  const readRes = await sheets.spreadsheets.values.get({
    auth: auth,
    spreadsheetId: SHEET_ID,
    range: "Admissions!A:Z", // Read full row to get trackers
  });

  const rows = readRes.data.values || [];
  const rowIndex = rows.findIndex((row) => String(row[0]) === playerID);

  if (rowIndex === -1) {
    throw new Error(`Player ID ${playerID} not found`);
  }

  // Get trackers from columns D through Z (indices 4-25)
  const rowData = rows[rowIndex];
  const trackers = rowData.slice(3, 26).filter(Boolean); // Get E:Z, remove empty values

  if (trackers.length === 0) {
    throw new Error(`No trackers found for player ID ${playerID}`);
  }

  // Check player and get MMR values
  const { twosMmr, threesMmr, success, notes } = await checkPlayer(trackers);

  // Update only columns B and C (2s and 3s)
  const sheetRow = rowIndex + 1;
  if (!success) {
    const range = `Admissions!H${sheetRow}`;

    await sheets.spreadsheets.values.update({
      auth: auth,
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "RAW",
      resource: {
        values: [[notes]],
      },
    });

    console.log(`Updated notes for ${playerID}: ${notes}`);
  }

  if (success) {
    const range = `Admissions!B${sheetRow}:C${sheetRow}`;

    await sheets.spreadsheets.values.update({
      auth: auth,
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "RAW",
      resource: {
        values: [[twosMmr, threesMmr]],
      },
    });

    console.log(`Updated player ${playerID}: 2s=${twosMmr}, 3s=${threesMmr}`);
  }

  return {
    playerID,
    twosMmr,
    threesMmr,
    success,
    notes,
    action: success ? "Updated MMR" : "Updated notes",
  };
};
