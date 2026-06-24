// commands/util/upload-roster.js
// Slash command + scheduled function that uploads a member roster to Google Sheets.
//
// Env var required: rosterSheetId (the Google Sheets file ID)
// Sheet tab name: "Roster" (must exist in the file before running)
//
// Columns: User | ID | Nickname | <one column per role in ROLE_COLUMNS>
// Each role column shows the role's name if the member has that role, else blank.
//
// Called as a command via /upload-roster and also imported by events/ready.js
// for the weekly auto-run (see INSTRUCTIONS.md for ready.js changes).

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { google } = require("googleapis");

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const ROSTER_SHEET_ID = process.env.rosterSheetId;
const CREDENTIALS = process.env.credentials;
const SHEET_TAB = "Data Input";

// Edit this list to control which role columns appear in the sheet.
// `name` is the header text + the value shown when a member has the role.
// `id` is the Discord role ID. (@everyone's id is the guild/server ID.)
const ROLE_COLUMNS = [
  { name: "Enrolled", id: "1337883747629928611" },
  { name: "Player", id: "1337882326566440960" },
  { name: "RFA", id: "1198452739378786324" },
  { name: "Omega FA", id: "1181050438771019805" },
  { name: "Delta FA", id: "1181054419714977933" },
  { name: "Beta FA", id: "1181050438787792917" },
  { name: "Alpha FA", id: "1181054413071196232" },
  { name: "Apex FA", id: "1181050438787792918" },
  { name: "Omega League", id: "1181050438880071698" },
  { name: "Omega Captain", id: "1181050438880071699" },
  { name: "Delta League", id: "1181054439134593064" },
  { name: "Delta Captain", id: "1181054431047995422" },
  { name: "Beta League", id: "1181050438896844810" },
  { name: "Beta Captain", id: "1181050438896844811" },
  { name: "Alpha League", id: "1181054433866551347" },
  { name: "Alpha Captain", id: "1181054441714090026" },
  { name: "Apex League", id: "1181050438896844812" },
  { name: "Apex Captain", id: "1181050438896844813" },
  { name: "Bears", id: "1181050438896844816" },
  { name: "Blue Jays", id: "1181050438909444126" },
  { name: "Capybaras", id: "1181050438909444118" },
  { name: "Cardinals", id: "1181050438909444125" },
  { name: "Cheetahs", id: "1181050438909444117" },
  { name: "Eagles", id: "1181050438896844818" },
  { name: "Elephants", id: "1181050438896844819" },
  { name: "Gorillas", id: "1272802875898204261" },
  { name: "Huskies", id: "1336434110721163358" },
  { name: "Kangaroos", id: "1181050438896844815" },
  { name: "Lions", id: "1227739279359217767" },
  { name: "Lynx", id: "1272806442243592192" },
  { name: "Narwhals", id: "1272804311688151162" },
  { name: "Owls", id: "1181050438909444124" },
  { name: "Pandas", id: "1519127852291723304" },
  { name: "Panthers", id: "1181050438909444119" },
  { name: "Penguins", id: "1519127879944900758" },
  { name: "Raccoons", id: "1272804635136098345" },
  { name: "Sharks", id: "1181050438909444122" },
  { name: "Squirrels", id: "1181050438926209077" },
  { name: "Stingrays", id: "1181050438909444120" },
  { name: "Turtles", id: "1181050438909444121" },
  { name: "Whales", id: "1181050438909444123" },
  { name: "Wolves", id: "1181050438896844817" },
  { name: "Yetis", id: "1272803821709557820" },
  { name: "Handler", id: "1181050438926209074" },
  { name: "Zookeeper", id: "1181050438926209076" },
];
// ───────────────────────────────────────────────────────────────────────────────

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ─── Core logic ────────────────────────────────────────────────────────────────

// Convert a 1-based column number to its A1 letter (1 -> A, 26 -> Z, 27 -> AA).
function columnLetter(n) {
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function buildRosterRows(guild) {
  const rows = [];

  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;

    const username = member.user.username;
    const id = member.id;
    const nickname = member.nickname || "";

    // One cell per configured role: the role name if held, otherwise blank
    const roleCells = ROLE_COLUMNS.map((role) =>
      member.roles.cache.has(role.id) ? role.name : "",
    );

    rows.push([username, id, nickname, ...roleCells]);
  }

  // Sort by username (case-insensitive)
  rows.sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
  );

  return rows;
}

/**
 * Main upload function. Clears the Roster tab and writes a fresh snapshot.
 * Exported so events/ready.js can call it for the weekly auto-run.
 *
 * @param {Guild} guild
 * @returns {string} Summary message
 */
async function uploadRoster(guild, { skipFetch = false } = {}) {
  if (!ROSTER_SHEET_ID) {
    throw new Error(
      "rosterSheetId is not set in .env. Add it and restart the bot.",
    );
  }

  // Refresh member cache before building the roster. Skip when the caller
  // already has members cached (e.g. on startup) to avoid hammering the
  // gateway's Request Guild Members (opcode 8) rate limit.
  if (!skipFetch) {
    await guild.members.fetch();
  }

  const dataRows = buildRosterRows(guild);

  const header = ["User", "ID", "Nickname", ...ROLE_COLUMNS.map((r) => r.name)];

  const allRows = [header, ...dataRows];
  const authClient = await auth.getClient();

  // Clear existing data across all columns we use (grows with ROLE_COLUMNS)
  const lastCol = columnLetter(header.length);
  await sheets.spreadsheets.values.clear({
    auth: authClient,
    spreadsheetId: ROSTER_SHEET_ID,
    range: `${SHEET_TAB}!A:${lastCol}`,
  });

  // Write fresh data starting at A1
  await sheets.spreadsheets.values.update({
    auth: authClient,
    spreadsheetId: ROSTER_SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: "RAW",
    resource: { values: allRows },
  });

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  console.log(
    `[Roster Uploader] Uploaded ${dataRows.length} members at ${timestamp}.`,
  );

  return `Uploaded at ${timestamp}. Total members: **${dataRows.length}**.`;
}

// ─── Slash command ─────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update-roster-sheets")
    .setDescription("Upload a fresh member roster snapshot to Google Sheets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const summary = await uploadRoster(interaction.guild);
      await interaction.editReply({
        content: `Roster upload complete. ${summary}`,
      });
    } catch (err) {
      console.error("[update-roster-sheets] Error:", err);
      await interaction.editReply({
        content: `Failed to update roster sheets: ${err.message}`,
      });
    }
  },

  uploadRoster,
};
