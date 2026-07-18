// utils/teamImage.js
// Team logos as LOCAL files instead of imgur (imgur re-compresses big PNGs to
// JPEG). Discord embeds can reference a message attachment via the
// `attachment://<filename>` scheme, so we attach the local file and point the
// embed at it.
//
// Usage in a command:
//   const { thumbnail, files } = teamImage(teamName, teamData);
//   embed.setThumbnail(thumbnail);                 // null-safe: null = no image
//   channel.send({ embeds: [embed], files });      // MUST include files
//
// Lookup order: local PNG in images/teams/ → teamData.image URL (transition
// fallback) → null. Returning null instead of "" is what stops the
// setThumbnail("Invalid URL") crash on teams with no image yet.

const { AttachmentBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");

const TEAMS_IMAGE_DIR = path.join(__dirname, "..", "images", "teams");

// "Blue Jays" -> "bluejays"
function slugForTeam(teamName) {
  return String(teamName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp"];

// Returns { thumbnail, files } ready to spread into an embed + send.
function teamImage(teamName, teamData) {
  const slug = slugForTeam(teamName);

  if (slug) {
    // Case-insensitive directory scan so "Squirrels.png" resolves on a
    // case-sensitive (Linux) filesystem even though the slug is lowercase.
    let entries = [];
    try {
      entries = fs.readdirSync(TEAMS_IMAGE_DIR);
    } catch {
      /* dir doesn't exist yet */
    }
    const wanted = new Set(IMAGE_EXTS.map((ext) => `${slug}.${ext}`));
    const match = entries.find((file) => wanted.has(file.toLowerCase()));
    if (match) {
      return {
        thumbnail: `attachment://${match}`,
        files: [new AttachmentBuilder(path.join(TEAMS_IMAGE_DIR, match), { name: match })],
      };
    }
  }

  // Transition fallback: keep using the teams.json URL if it's a real one.
  const url = teamData?.image;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return { thumbnail: url, files: [] };
  }

  // No local file and no valid URL — no image (never crashes).
  return { thumbnail: null, files: [] };
}

module.exports = { teamImage, slugForTeam };
