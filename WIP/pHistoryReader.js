// process_scraped_final.js
// Usage: node process_scraped_final.js ./data/<channelId>.json
// Outputs:
//   ./data/processed.json
//   ./data/manual_review.json

const fs = require("fs");
const path = require("path");

// CONFIG - teams, tiers, thresholds
const TEAMS = [
  "Blue Jays",
  "Capybaras",
  "Cardinals",
  "Cheetahs",
  "Elephants",
  "Kangaroos",
  "Owls",
  "Squirrels",
  "Lions",
  "Stingrays",
  "Sharks",
  "Turtles",
  "Whales",
  "Gorillas",
  "Lynx",
  "Narwhals",
  "Raccoons",
  "Yetis",
  "Huskies",
  "Panthers",
  "Wolves",
  "Eagles",
];
const TIERS = ["Apex", "Alpha", "Beta", "Delta", "Omega"];

// Helpers
function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateMMDDYYYY(dateLike) {
  if (!dateLike) return null;
  // Accept ISO or localDate formats
  const d = new Date(dateLike);
  if (!isNaN(d.getTime())) {
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
  }
  // fallback parse m/d/yyyy or mm-dd-yyyy
  const parts = String(dateLike)
    .trim()
    .split(/[\/\-]/)
    .map((p) => p.trim());
  if (parts.length === 3) {
    let [m, day, y] = parts;
    m = pad2(Number(m));
    day = pad2(Number(day));
    if (y.length === 2) y = "20" + y;
    return `${m}/${day}/${y}`;
  }
  return null;
}

function extractUserIdsFromText(text) {
  if (!text) return [];
  const regex = /<@!?(\d+)>/g;
  const ids = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function gatherEmbedText(msg) {
  let acc = "";
  if (!msg.embeds) return acc;
  for (const emb of msg.embeds) {
    if (emb.title) acc += " " + emb.title;
    if (emb.description) acc += " " + emb.description;
    if (emb.fields && Array.isArray(emb.fields)) {
      for (const f of emb.fields)
        acc += " " + (f.name || "") + " " + (f.value || "");
    }
    if (emb.footer && emb.footer.text) acc += " " + emb.footer.text;
  }
  return acc.trim();
}

// normalized team detection (no external libs)
function normalizeTeamFromText(text) {
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
  for (const team of TEAMS) {
    const canonical = team.toLowerCase();
    const compact = canonical.replace(/\s+/g, "");
    const plural = canonical + "s";
    if (
      cleaned.includes(canonical) ||
      cleaned.includes(compact) ||
      cleaned.includes(plural)
    )
      return team;
  }
  return null;
}

// normalized tier detection (no external libs)
function normalizeTierFromText(text) {
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
  const map = {
    omega: "Omega",
    o: "Omega",
    alpha: "Alpha",
    a: "Alpha",
    beta: "Beta",
    b: "Beta",
    gamma: "Gamma",
    g: "Gamma",
    delta: "Delta",
    d: "Delta",
    apex: "Apex",
  };
  for (const k of Object.keys(map)) {
    // require a word boundary-ish match to reduce false positives
    if (new RegExp("\\b" + k + "\\b").test(cleaned)) return map[k];
  }
  return null;
}

function detectReason(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(re-?sign|resign)\b/.test(t)) return "re-signed";
  if (/\b(sign(ed|ing)?|signup|signing|signed)\b/.test(t)) return "signed";
  if (/\b(draft|drafted)\b/.test(t)) return "drafted";
  if (/\b(release|released|drop|dropped|waive|waived)\b/.test(t))
    return "released";
  if (/\b(trade|traded)\b/.test(t)) return "traded";
  if (/\b(promot|promotion|promoted|demot|demoted|move to|move)\b/.test(t))
    return "tier_change";
  return null;
}

function parseTradeTeams(text) {
  // "from X to Y"
  let from = null,
    to = null;
  const fromTo = text.match(
    /from\s+([a-z0-9\-\_@&<>\s]{2,40})\s+to\s+([a-z0-9\-\_@&<>\s]{2,40})/i
  );
  if (fromTo) {
    from = normalizeTeamFromText(fromTo[1]);
    to = normalizeTeamFromText(fromTo[2]);
    return { from, to };
  }
  // "to X"
  const toOnly = text.match(/\bto\s+([a-z0-9\-\_@&<>\s]{2,40})/i);
  if (toOnly) {
    to = normalizeTeamFromText(toOnly[1]);
  }
  // "Owls to Lions" simple
  const simple = text.match(/([A-Za-z ]{2,30})\s+to\s+([A-Za-z ]{2,30})/);
  if (simple) {
    const a = normalizeTeamFromText(simple[1]);
    const b = normalizeTeamFromText(simple[2]);
    if (a && b) return { from: a, to: b };
  }
  return { from, to };
}

function datesAreChronologicallyValid(signed, released) {
  if (!signed || !released) return true;
  const [sm, sd, sy] = signed.split("/").map(Number);
  const [rm, rd, ry] = released.split("/").map(Number);
  const signedDate = new Date(sy, sm - 1, sd);
  const releasedDate = new Date(ry, rm - 1, rd);
  return releasedDate >= signedDate;
}

// Entry validation (must have signed OR released)
function entryHasAtLeastOneDate(e) {
  return !!e.signed || !!e.released;
}

// MAIN
if (process.argv.length < 3) {
  console.error("Usage: node processContracts.js <scraped_file.json>");
  process.exit(1);
}
const inputPath = process.argv[2];
if (!fs.existsSync(inputPath)) {
  console.error("File not found:", inputPath);
  process.exit(1);
}

const RAW = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// RAW is newest->oldest per your note; we want chronological oldest->newest
const chronological = Array.isArray(RAW) ? RAW.slice().reverse() : [];

const players = {}; // userId -> [entries]
const manual = []; // manual review items (contain original scraped message)

for (const msg of chronological) {
  const rawContent = msg.content || "";
  const embedText = gatherEmbedText(msg);
  const parsingText = [rawContent, embedText].filter(Boolean).join(" ").trim();
  const parsedDate = formatDateMMDDYYYY(
    msg.localDate || msg.createdAt || msg.timestamp || null
  );

  // collect all mentioned users from message mentions and embed text
  const mentionedSet = new Set();
  if (msg.mentions && msg.mentions.users && Array.isArray(msg.mentions.users)) {
    // handle if your scraper stored mentions.users as array
    for (const u of msg.mentions.users) {
      if (typeof u === "string") mentionedSet.add(u);
      else if (u && u.id) mentionedSet.add(u.id);
    }
  } else if (
    msg.mentions &&
    msg.mentions.users &&
    typeof msg.mentions.users === "object"
  ) {
    // some scrapers might store a map -> gather keys
    try {
      Object.keys(msg.mentions.users).forEach((k) => mentionedSet.add(k));
    } catch (e) {}
  }

  // also extract mention patterns from content + embed text
  extractUserIdsFromText(parsingText).forEach((id) => mentionedSet.add(id));

  // if still empty, manual (we'll include the message original)
  if (mentionedSet.size === 0) {
    manual.push({
      messageId: msg.id || null,
      channelId: msg.channelId || msg.channel || null,
      content: rawContent,
      reason: "no_user_mentioned_in_content_or_embeds",
      date: parsedDate,
      original: msg,
    });
    continue;
  }

  // process each mentioned user separately
  for (const userId of Array.from(mentionedSet)) {
    // prepare containers
    if (!players[userId]) players[userId] = [];
    const entries = players[userId];

    // Determine reason from parsingText (includes embed text)
    const reason = detectReason(parsingText);
    if (!reason) {
      manual.push({
        messageId: msg.id || null,
        channelId: msg.channelId || msg.channel || null,
        content: rawContent,
        reason: "unknown_reason",
        date: parsedDate,
        original: msg,
      });
      continue;
    }

    if (reason === "re-signed") {
      // log but don't change structure (per your rule)
      manual.push({
        messageId: msg.id || null,
        channelId: msg.channelId || msg.channel || null,
        content: rawContent,
        reason: "resign_ignored",
        date: parsedDate,
        original: msg,
      });
      continue;
    }

    // detect team/tier from parsingText (includes embed)
    const team = normalizeTeamFromText(parsingText);
    const tier = normalizeTierFromText(parsingText);

    // Signed / Drafted
    if (reason === "signed" || reason === "drafted") {
      if (!team || !tier || !parsedDate) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "incomplete_sign_or_draft",
          team: team || null,
          tier: tier || null,
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      const entry = {
        tier: tier,
        team: team,
        reason: reason,
        signed: parsedDate,
        released: null,
      };

      // push new entry (do not alter older entries per your C choice)
      entries.push(entry);

      // sanity check chronological validity if released exists later; we will validate in post-processing
      continue;
    }

    // Released
    if (reason === "released") {
      if (!parsedDate) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "release_missing_date",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      // close most recent open entry if present
      if (entries.length === 0) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "release_without_open_entry",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      // find last entry with released === null
      let lastOpen = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!entries[i].released) {
          lastOpen = entries[i];
          break;
        }
      }
      if (!lastOpen) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "release_but_no_open_entry",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      // assign release date; if team/tier missing in lastOpen, try to fill
      lastOpen.released = parsedDate;
      if (!lastOpen.team && team) lastOpen.team = team;
      if (!lastOpen.tier && tier) lastOpen.tier = tier;
      lastOpen.reason = lastOpen.reason || "released";
      continue;
    }

    // Trade
    if (reason === "traded") {
      if (!parsedDate) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "trade_missing_date",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      const trade = parseTradeTeams(parsingText);
      const toTeam = trade.to || team || null;
      if (!toTeam) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "trade_missing_to_team",
          parsed: trade,
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      if (entries.length === 0) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "trade_without_open_entry",
          to: toTeam,
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      // close last open if exists
      let lastOpen = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!entries[i].released) {
          lastOpen = entries[i];
          break;
        }
      }
      if (!lastOpen) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "trade_but_no_open_entry",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      lastOpen.released = parsedDate;
      // open new entry for toTeam; signed = parsedDate
      const newTier = tier || lastOpen.tier || null;
      const newEntry = {
        tier: newTier,
        team: toTeam,
        reason: "traded",
        signed: parsedDate,
        released: null,
      };
      entries.push(newEntry);
      continue;
    }

    // Tier change
    if (reason === "tier_change") {
      if (!parsedDate || !tier) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "tier_change_incomplete",
          tierDetected: tier || null,
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      if (entries.length === 0) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "tier_change_without_open_entry",
          tier: tier,
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      let lastOpen = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!entries[i].released) {
          lastOpen = entries[i];
          break;
        }
      }
      if (!lastOpen) {
        manual.push({
          messageId: msg.id || null,
          channelId: msg.channelId || msg.channel || null,
          content: rawContent,
          reason: "tier_change_but_no_open_entry",
          date: parsedDate,
          original: msg,
        });
        continue;
      }

      lastOpen.released = parsedDate;
      // open new entry with same team, new tier
      entries.push({
        tier: tier,
        team: lastOpen.team || team || null,
        reason: "tier_change",
        signed: parsedDate,
        released: null,
      });
      continue;
    }

    // fallback: manual
    manual.push({
      messageId: msg.id || null,
      channelId: msg.channelId || msg.channel || null,
      content: rawContent,
      reason: "unhandled_reason",
      date: parsedDate,
      original: msg,
    });
  } // end per-user loop
} // end messages loop

// Post-processing: validate entries (must have at least one date) and chronology
for (const [userId, arr] of Object.entries(players)) {
  const keep = [];
  for (const entry of arr) {
    // must have at least signed OR released
    if (!entryHasAtLeastOneDate(entry)) {
      manual.push({
        messageId: null,
        channelId: null,
        content: `Entry for user ${userId} missing both dates`,
        reason: "entry_missing_both_dates",
        entry,
        original: null,
      });
      continue;
    }
    // if both present, check chronology
    if (
      entry.signed &&
      entry.released &&
      !datesAreChronologicallyValid(entry.signed, entry.released)
    ) {
      manual.push({
        messageId: null,
        channelId: null,
        content: `Release before sign for user ${userId}`,
        reason: "release_before_sign",
        parsed: entry,
        original: null,
      });
      continue;
    }
    // normalize capitalization for team/tier if possible
    if (entry.team) {
      const match = TEAMS.find(
        (t) => t.toLowerCase() === entry.team.toLowerCase()
      );
      if (match) entry.team = match;
    }
    if (entry.tier) {
      const matchTier = TIERS.find(
        (t) => t.toLowerCase() === entry.tier.toLowerCase()
      );
      if (matchTier) entry.tier = matchTier;
    }
    keep.push(entry);
  }
  if (keep.length > 0) players[userId] = keep;
  else delete players[userId];
}

// Save outputs
const outDir = path.join(".", "data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const processedPath = path.join(outDir, "processed.json");
const manualPath = path.join(outDir, "manual_review.json");

fs.writeFileSync(processedPath, JSON.stringify(players, null, 2));
fs.writeFileSync(manualPath, JSON.stringify(manual, null, 2));

console.log("✅ Processing complete.");
console.log("Processed players:", Object.keys(players).length);
console.log("Manual review items:", manual.length);
console.log("Saved:", processedPath);
console.log("Saved:", manualPath);
