// commands/util/illegalRosterCheck.js
//
// Automatic illegal-roster checker.
//
// Every midnight ET (and on demand via /check-illegal-rosters) this reads the
// "Rosters" tab of the roster sheet and, for every team, checks:
//   1. Salary cap  — the salary cell must NOT contain a "-" (e.g. "Left: -5").
//   2. Captain     — the captain cell must NOT contain "Error".
// Any team with a violation gets pinged in the alert channel with the exact
// tiers it needs to fix.
//
// Env vars required: rosterSheetId, credentials (same as upload-roster.js).
//
// Scheduled from events/ready.js via scheduleIllegalRosterCheck(client).

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { DateTime } = require("luxon");
const { google } = require("googleapis");

// ═══ CONFIG — edit here ══════════════════════════════════════════════════════

const ROSTER_SHEET_ID = process.env.rosterSheetId;
const CREDENTIALS = process.env.credentials;

// Tab that holds the team roster blocks.
const SHEET_TAB = "Rosters";

// Channel where illegal-roster alerts are posted.
// TODO: replace with the real channel ID.
const ALERT_CHANNEL_ID = "1181050441048522798";

// ── Base team (Capybaras, top-left block) cell layout ────────────────────────
// Every other team is this same block, shifted by the offsets below.
const BASE_CELLS = {
  Apex: { salary: "L35", captain: "H36" },
  Alpha: { salary: "R35", captain: "N36" },
  Beta: { salary: "F40", captain: "C41" },
  Delta: { salary: "L40", captain: "H41" },
  Omega: { salary: "R40", captain: "N41" },
};

// ── Grid layout ──────────────────────────────────────────────────────────────
// Teams read left→right across a band, then wrap to the next band down.
// TEAMS_PER_BAND teams sit side by side before wrapping.
//
//   grid index i  ->  band = floor(i / TEAMS_PER_BAND), col = i % TEAMS_PER_BAND
//   column shift  =  col  * COLUMN_OFFSET   (cells move right)
//   row shift     =  band * ROW_OFFSET      (cells move down)
//
// ⚠ VERIFY THESE: you told me +5 columns / +23 rows, but +5 makes Cardinals'
// Beta-captain land on H41 — the same cell as Capybaras' Delta captain. That
// almost certainly means the real column offset is larger. Open the Rosters tab,
// read Cardinals' Apex-salary cell, and set COLUMN_OFFSET = (its column number
// minus Capybaras' Apex-salary column L=12). Same idea for ROW_OFFSET using
// Cheetahs (the team directly below Capybaras).
const TEAMS_PER_BAND = 2;
const COLUMN_OFFSET = 20; // columns to the right per grid column
const ROW_OFFSET = 23; // rows down per grid band

// Teams in grid order (left→right, then down). Index 0 = Capybaras (base block).
// ⚠ VERIFY: only Capybaras, Cardinals, Cheetahs were confirmed. The rest are a
// best-guess continuation — reorder/trim to match the actual Rosters tab.
const TEAM_GRID = [
  "Capybaras",
  "Cardinals",
  "Cheetahs",
  "Eagles",
  "Elephants",
  "Huskies",
  "Lynx",
  "Narwhals",
  "Owls",
  "Pandas",
  "Raccoons",
  "Squirrels",
  "Stingrays",
  "Turtles",
  "Wolves",
  "Yetis",
];

// Team name -> Discord role ID (for pinging). Sourced from upload-roster.js.
const TEAM_ROLES = {
  Bears: "1181050438896844816",
  "Blue Jays": "1181050438909444126",
  Capybaras: "1181050438909444118",
  Cardinals: "1181050438909444125",
  Cheetahs: "1181050438909444117",
  Eagles: "1181050438896844818",
  Elephants: "1181050438896844819",
  Gorillas: "1272802875898204261",
  Huskies: "1336434110721163358",
  Kangaroos: "1181050438896844815",
  Lions: "1227739279359217767",
  Lynx: "1272806442243592192",
  Narwhals: "1272804311688151162",
  Owls: "1181050438909444124",
  Pandas: "1519127852291723304",
  Panthers: "1181050438909444119",
  Penguins: "1519127879944900758",
  Raccoons: "1272804635136098345",
  Sharks: "1181050438909444122",
  Squirrels: "1181050438926209077",
  Stingrays: "1181050438909444120",
  Turtles: "1181050438909444121",
  Whales: "1181050438909444123",
  Wolves: "1181050438896844817",
  Yetis: "1272803821709557820",
};

// ═════════════════════════════════════════════════════════════════════════════

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ── A1 helpers ───────────────────────────────────────────────────────────────

// 1 -> A, 26 -> Z, 27 -> AA
function columnLetter(n) {
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// A -> 1, Z -> 26, AA -> 27
function columnNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

// Shift an A1 cell by (dCol columns, dRow rows). "L35" + (5,23) -> "Q58"
function shiftCell(cell, dCol, dRow) {
  const match = /^([A-Za-z]+)(\d+)$/.exec(cell);
  if (!match) throw new Error(`Bad cell reference: ${cell}`);
  const col = columnNumber(match[1]) + dCol;
  const row = Number(match[2]) + dRow;
  return `${columnLetter(col)}${row}`;
}

// ── Cell computation ─────────────────────────────────────────────────────────

// For a team at the given grid index, return the { tier, type, cell } list for
// all salary + captain cells, with the grid offset applied.
function cellsForTeam(gridIndex) {
  const band = Math.floor(gridIndex / TEAMS_PER_BAND);
  const col = gridIndex % TEAMS_PER_BAND;
  const dCol = col * COLUMN_OFFSET;
  const dRow = band * ROW_OFFSET;

  const out = [];
  for (const [tier, cells] of Object.entries(BASE_CELLS)) {
    out.push({
      tier,
      type: "salary",
      cell: shiftCell(cells.salary, dCol, dRow),
    });
    out.push({
      tier,
      type: "captain",
      cell: shiftCell(cells.captain, dCol, dRow),
    });
  }
  return out;
}

// ── Violation rules ──────────────────────────────────────────────────────────

function isSalaryViolation(value) {
  return String(value ?? "").includes("-");
}

function isCaptainViolation(value) {
  return String(value ?? "")
    .toLowerCase()
    .includes("error");
}

// ── Core check ───────────────────────────────────────────────────────────────

/**
 * Read the Rosters tab and return an array of violations, one entry per team
 * that has at least one problem:
 *   { team, roleId, salaryTiers: [...], captainTiers: [...] }
 */
async function findIllegalRosters() {
  if (!ROSTER_SHEET_ID) {
    throw new Error("rosterSheetId is not set in .env.");
  }

  // Build a flat descriptor list + matching A1 ranges, in the same order, so we
  // can read every cell for every team in a single batchGet.
  const descriptors = [];
  const ranges = [];
  TEAM_GRID.forEach((team, gridIndex) => {
    for (const c of cellsForTeam(gridIndex)) {
      descriptors.push({ team, tier: c.tier, type: c.type });
      ranges.push(`${SHEET_TAB}!${c.cell}`);
    }
  });

  const authClient = await auth.getClient();
  const res = await sheets.spreadsheets.values.batchGet({
    auth: authClient,
    spreadsheetId: ROSTER_SHEET_ID,
    ranges,
  });

  const valueRanges = res.data.valueRanges || [];

  // Group results by team.
  const byTeam = new Map();
  descriptors.forEach((d, i) => {
    const value = valueRanges[i]?.values?.[0]?.[0] ?? "";
    if (!byTeam.has(d.team)) {
      byTeam.set(d.team, { salaryTiers: [], captainTiers: [] });
    }
    const entry = byTeam.get(d.team);
    if (d.type === "salary" && isSalaryViolation(value)) {
      entry.salaryTiers.push(d.tier);
    } else if (d.type === "captain" && isCaptainViolation(value)) {
      entry.captainTiers.push(d.tier);
    }
  });

  const violations = [];
  for (const [team, entry] of byTeam) {
    if (entry.salaryTiers.length === 0 && entry.captainTiers.length === 0) {
      continue;
    }
    violations.push({
      team,
      roleId: TEAM_ROLES[team] || null,
      salaryTiers: entry.salaryTiers,
      captainTiers: entry.captainTiers,
    });
  }
  return violations;
}

// Build the ping message for a single team's violations.
function buildTeamMessage(v) {
  const mention = v.roleId ? `<@&${v.roleId}>` : `**${v.team}**`;
  const lines = [`${mention} — your roster has issues to fix:`];
  if (v.salaryTiers.length > 0) {
    lines.push(`• **Salary cap** over in: ${v.salaryTiers.join(", ")}`);
  }
  if (v.captainTiers.length > 0) {
    lines.push(`• **Captain error** in: ${v.captainTiers.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Run the full check and post alerts. Returns the violations array.
 * @param {Client} client
 * @param {{ post?: boolean }} opts  post=false to compute without messaging.
 */
async function runIllegalRosterCheck(client, { post = true } = {}) {
  const violations = await findIllegalRosters();

  console.log(
    `[Illegal Roster] Check complete — ${violations.length} team(s) with issues.`,
  );

  if (post && violations.length > 0) {
    const channel = await client.channels
      .fetch(ALERT_CHANNEL_ID)
      .catch(() => null);
    if (!channel) {
      console.error(
        `[Illegal Roster] Alert channel ${ALERT_CHANNEL_ID} not found.`,
      );
    } else {
      for (const v of violations) {
        await channel.send({
          content: buildTeamMessage(v),
          allowedMentions: v.roleId ? { roles: [v.roleId] } : { parse: [] },
        });
      }
    }
  }

  return violations;
}

// ── Midnight-ET scheduler ────────────────────────────────────────────────────

function msUntilMidnightET() {
  const now = new Date();
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const nyMidnight = new Date(nyNow);
  nyMidnight.setHours(24, 0, 0, 0);
  return nyMidnight - nyNow;
}

function scheduleIllegalRosterCheck(client) {
  const delay = msUntilMidnightET();
  console.log(
    `[Illegal Roster] Next check in ${Math.round(delay / 60000)} minutes (midnight ET).`,
  );

  setTimeout(() => {
    runIllegalRosterCheck(client).catch((err) =>
      console.error("[Illegal Roster] Scheduled check failed:", err),
    );
    setInterval(
      () =>
        runIllegalRosterCheck(client).catch((err) =>
          console.error("[Illegal Roster] Scheduled check failed:", err),
        ),
      24 * 60 * 60 * 1000,
    );
  }, delay);
}

// ── Manual slash command (for testing) ───────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("check-illegal-rosters")
    .setDescription("Run the illegal-roster check now")
    .addBooleanOption((option) =>
      option
        .setName("post")
        .setDescription(
          "Also ping teams in the alert channel (default: false)",
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const post = interaction.options.getBoolean("post") ?? false;

    try {
      const violations = await runIllegalRosterCheck(interaction.client, {
        post,
      });

      if (violations.length === 0) {
        await interaction.editReply("✅ No illegal rosters found.");
        return;
      }

      const summary = violations
        .map((v) => {
          const parts = [];
          if (v.salaryTiers.length)
            parts.push(`salary: ${v.salaryTiers.join(", ")}`);
          if (v.captainTiers.length)
            parts.push(`captain: ${v.captainTiers.join(", ")}`);
          return `• **${v.team}** — ${parts.join(" | ")}`;
        })
        .join("\n");

      await interaction.editReply(
        `Found **${violations.length}** team(s) with issues${post ? " (pinged in alert channel)" : ""}:\n${summary}`,
      );
    } catch (err) {
      console.error("[check-illegal-rosters] Error:", err);
      await interaction.editReply(`Check failed: ${err.message}`);
    }
  },

  // Exported for the scheduler in events/ready.js
  scheduleIllegalRosterCheck,
  runIllegalRosterCheck,
  findIllegalRosters,
};
