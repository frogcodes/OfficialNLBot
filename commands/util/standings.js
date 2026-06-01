const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const Canvas = require("canvas");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const positionConfig = {
  recordXRatio: 0.5,
  gpXRatio: 0.86,
  mXRatio: 0.87,
  textYAdjustment: 7,
  gpYAdjustment: -6,
  mYAdjustment: 18,
};

const bannerOutlineConfig = {
  enabled: true,
  width: 3,
  color: "#000000",
  scaleWithCanvas: true,
};
const divisions = {
  ORG: { startCol: "D", startRow: 11, logo: "Organization.png", name: "GROVE" },
  Apex: {
    startCol: "R",
    startRow: 11,
    logo: "apex logo.png",
    name: "SAVANNAH",
  },
  Alpha: {
    startCol: "D",
    startRow: 29,
    logo: "alpha logo.png",
    name: "TSUNAMI",
  },
  Beta: { startCol: "R", startRow: 29, logo: "beta logo.png", name: "VALLEY" },
  Delta: { startCol: "D", startRow: 47, logo: "delta logo.png", name: "DELTA" },
  Omega: { startCol: "R", startRow: 47, logo: "omega logo.png", name: "OMEGA" },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("standings")
    .setDescription("Standings command made by garrydhanoa639")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("week")
        .setDescription("Standings after what week?")
        .setRequired(true),
    ),

  async execute(interaction) {
    const standingsChannel = await interaction.guild.channels.fetch(
      "1181050441845457033",
    );
    let weekNum = interaction.options.getString("week");
    standingsChannel.send(`# Post Week ${weekNum}`);
    const tiers = ["ORG", "Apex", "Alpha", "Beta", "Delta", "Omega"];

    for (const tier of tiers) {
      makeStandingsGraphics(tier, interaction, standingsChannel);
      await new Promise((resolve) => setTimeout(resolve, 17500));
    }
  },
};

async function makeStandingsGraphics(tier, interaction, standingsChannel) {
  const safeReply = async (payload) => {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        if (payload && payload.ephemeral) {
          const p = { ...payload };
          delete p.ephemeral;
          p.flags = 64;
          await interaction.reply(p);
        } else {
          await interaction.reply(payload);
        }
      }
    } catch (err) {
      console.error(
        "Failed to send interaction response:",
        err?.message || err,
      );
    }
  };

  if (!interaction.member) {
    await safeReply({
      content: "❌ This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  try {
    const selectedDivision = tier;

    const credentials = JSON.parse(
      fs.readFileSync("./nature-league-bot-4a66b6ad2640.json", "utf8"),
    );
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = "187AXnmM3a4pHXJgeb0rzb1mbPiMKLz0qeHUVPm7q2ys";

    console.log("Using spreadsheet ID:", spreadsheetId);
    console.log("Selected division:", selectedDivision || "All divisions");

    const divisionsToProcess = selectedDivision
      ? { [selectedDivision]: divisions[selectedDivision] }
      : divisions;
    const standingsData = {};

    const columnToNumber = (col) => {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.charCodeAt(i) - 64);
      }
      return num;
    };

    const numberToColumn = (num) => {
      let col = "";
      while (num > 0) {
        num--;
        col = String.fromCharCode(65 + (num % 26)) + col;
        num = Math.floor(num / 26);
      }
      return col;
    };

    for (const [divName, config] of Object.entries(divisionsToProcess)) {
      const quarters = [];
      const q2Col = numberToColumn(columnToNumber(config.startCol) + 7);
      const quarterConfigs = [
        { col: config.startCol, row: config.startRow },
        { col: q2Col, row: config.startRow },
        { col: config.startCol, row: config.startRow + 7 },
        { col: q2Col, row: config.startRow + 7 },
      ];

      for (let q = 0; q < 4; q++) {
        const qConfig = quarterConfigs[q];
        const teamRange = `Standings!${qConfig.col}${qConfig.row}:${
          qConfig.col
        }${qConfig.row + 3}`;
        const recordCol = numberToColumn(columnToNumber(qConfig.col) + 1);
        const recordRange = `Standings!${recordCol}${qConfig.row}:${recordCol}${
          qConfig.row + 3
        }`;
        const gpCol = numberToColumn(columnToNumber(qConfig.col) + 3);
        const gpRange = `Standings!${gpCol}${qConfig.row}:${gpCol}${
          qConfig.row + 3
        }`;
        const mCol = numberToColumn(columnToNumber(qConfig.col) + 4);
        const mRange = `Standings!${mCol}${qConfig.row}:${mCol}${
          qConfig.row + 3
        }`;

        console.log(`Fetching ${divName} Q${q + 1}:`);
        console.log(
          `Teams: ${teamRange}, Records: ${recordRange}, GP: ${gpRange}, M#: ${mRange}`,
        );

        const [teamResponse, recordResponse, gpResponse, mResponse] =
          await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: teamRange }),
            sheets.spreadsheets.values.get({
              spreadsheetId,
              range: recordRange,
            }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: gpRange }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: mRange }),
          ]);

        const teams =
          teamResponse.data.values
            ?.flat()
            .filter((team) => team && team.trim()) || [];
        const records = recordResponse.data.values?.flat() || [];
        const gps = gpResponse.data.values?.flat() || [];
        const ms = mResponse.data.values?.flat() || [];

        const quarterData = teams.map((team, index) => ({
          name: team,
          record: records[index] || "0-0",
          gp: gps[index] || "0",
          m: ms[index] || "*",
        }));

        console.log(`${divName} Q${q + 1} data:`, quarterData);
        quarters.push(quarterData);
      }

      standingsData[divName] = {
        quarters,
        logo: config.logo,
        displayName: config.name,
      };
    }

    let backgroundImage;
    let canvasWidth = 1200;
    let canvasHeight = 675;

    try {
      backgroundImage = await loadImage("./images/background.png");
      canvasWidth = backgroundImage.width;
      canvasHeight = backgroundImage.height;
      console.log(`Background image size: ${canvasWidth}x${canvasHeight}`);
    } catch (err) {
      console.log("Background image not found, using default size");
    }

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");
    Canvas.registerFont("./impact.ttf", { family: "impact" });

    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(0.5, "#16213e");
      gradient.addColorStop(1, "#0f3460");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    const divisionPositions = {
      ORG: { x: 210, y: 145, width: 438, height: 180 },
      Apex: { x: 779, y: 145, width: 438, height: 180 },
      Alpha: { x: 210, y: 375, width: 438, height: 180 },
      Beta: { x: 779, y: 375, width: 438, height: 180 },
      Delta: { x: 210, y: 605, width: 438, height: 180 },
      Omega: { x: 779, y: 605, width: 438, height: 180 },
    };

    const divisionLogoConfig = {
      ORG: { x: 622, y: 70, width: 120, height: 120, file: "Organization.png" },
      Apex: { x: 635, y: 90, width: 90, height: 90, file: "apex logo.png" },
      Alpha: { x: 635, y: 90, width: 90, height: 90, file: "alpha logo.png" },
      Beta: { x: 635, y: 90, width: 90, height: 90, file: "beta logo.png" },
      Delta: { x: 635, y: 90, width: 90, height: 90, file: "delta logo.png" },
      Omega: { x: 635, y: 90, width: 90, height: 90, file: "omega logo.png" },
    };

    for (const [divName, data] of Object.entries(standingsData)) {
      const divPos = divisionPositions[divName];
      if (!divPos) continue;

      const divisionGroupCoords = {
        ORG: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
        Apex: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
        Alpha: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
        Beta: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
        Delta: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
        Omega: [
          { x: 160, y: 125, width: 445, height: 67 },
          { x: 750, y: 125, width: 445, height: 67 },
          { x: 160, y: 480, width: 445, height: 67 },
          { x: 750, y: 480, width: 445, height: 67 },
        ],
      };

      const referenceWidth = 1365;
      const referenceHeight = 768;
      const scaleX = canvasWidth / referenceWidth;
      const scaleY = canvasHeight / referenceHeight;
      const scale = (scaleX + scaleY) / 2;

      const scaleRect = (r) => ({
        x: Math.round(r.x * scaleX),
        y: Math.round(r.y * scaleY),
        width: Math.round(r.width * scaleX),
        height: Math.round(r.height * scaleY),
      });

      const coords = (
        divisionGroupCoords[divName] || divisionGroupCoords["ORG"]
      ).map(scaleRect);
      const teamSpacing = 0;

      try {
        const logoCfg = divisionLogoConfig[divName];
        if (logoCfg && logoCfg.file) {
          const logoSrc = path.join("./images/LOGOS", logoCfg.file);
          const logoImage = await loadImage(logoSrc);
          const logoX = Math.round(logoCfg.x * scaleX);
          const logoY = Math.round(logoCfg.y * scaleY);
          const logoW = Math.round(logoCfg.width * scaleX);
          const logoH = Math.round(logoCfg.height * scaleY);
          ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
        }
      } catch (err) {
        console.warn(
          `Failed to draw logo for ${divName}:`,
          err?.message || err,
        );
      }

      for (let groupIdx = 0; groupIdx < 4; groupIdx++) {
        const groupTeams = data.quarters[groupIdx] || [];
        const pos = coords[groupIdx] || coords[0];
        const groupX = pos.x;
        const groupWidth = pos.width;
        const groupHeight = pos.height;

        for (let i = 0; i < groupTeams.length; i++) {
          const teamData = groupTeams[i];
          const teamY = pos.y + i * (groupHeight + teamSpacing);

          try {
            const teamImagePath = path.join("./images", `${teamData.name}.png`);
            const teamImage = await loadImage(teamImagePath);
            ctx.drawImage(teamImage, groupX, teamY, groupWidth, groupHeight);

            if (bannerOutlineConfig.enabled) {
              ctx.save();
              const outlineWidth = bannerOutlineConfig.scaleWithCanvas
                ? Math.max(1, Math.round(bannerOutlineConfig.width * scale))
                : bannerOutlineConfig.width;
              ctx.lineWidth = outlineWidth;
              ctx.strokeStyle = bannerOutlineConfig.color;
              ctx.strokeRect(
                Math.round(groupX + outlineWidth / 2),
                Math.round(teamY + outlineWidth / 2),
                Math.round(groupWidth - outlineWidth),
                Math.round(groupHeight - outlineWidth),
              );
              ctx.restore();
            }
          } catch (err) {
            const colors = ["#4a90e2", "#e24a4a", "#4ae24a", "#e2a04a"];
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillRect(groupX, teamY, groupWidth, groupHeight);

            if (bannerOutlineConfig.enabled) {
              ctx.save();
              const outlineWidth = bannerOutlineConfig.scaleWithCanvas
                ? Math.max(1, Math.round(bannerOutlineConfig.width * scale))
                : bannerOutlineConfig.width;
              ctx.lineWidth = outlineWidth;
              ctx.strokeStyle = bannerOutlineConfig.color;
              ctx.strokeRect(
                Math.round(groupX + outlineWidth / 2),
                Math.round(teamY + outlineWidth / 2),
                Math.round(groupWidth - outlineWidth),
                Math.round(groupHeight - outlineWidth),
              );
              ctx.restore();
            }

            ctx.fillStyle = "#ffffff";
            ctx.font = "900 18px Impact"; //, "Arial Black", sans-serif
            ctx.textAlign = "left";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1;
            ctx.strokeText(
              teamData.name,
              groupX + 10,
              teamY + Math.floor(groupHeight * 0.55),
            );
            ctx.fillText(
              teamData.name,
              groupX + 10,
              teamY + Math.floor(groupHeight * 0.55),
            );
          }

          ctx.fillStyle = "#ffffff";
          const recordFontPx = Math.max(18, Math.round(33 * scale));
          ctx.font = `900 ${recordFontPx}px Impact`; //, "Arial Black", sans-serif
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = Math.max(2, Math.round(4 * scale));
          ctx.textAlign = "center";

          const recordTextY =
            teamY +
            Math.round(groupHeight / 2) +
            Math.round(positionConfig.textYAdjustment * scale);
          const recordX =
            groupX + Math.floor(groupWidth * positionConfig.recordXRatio);
          ctx.strokeText(teamData.record, recordX, recordTextY);
          ctx.fillText(teamData.record, recordX, recordTextY);

          ctx.textAlign = "left";
          const gpValueX =
            groupX + Math.floor(groupWidth * positionConfig.gpXRatio);
          const gpFontPx = Math.max(14, Math.round(20 * scale));
          ctx.font = `900 ${gpFontPx}px Impact`; //, "Arial Black", sans-serif
          ctx.lineWidth = Math.max(1, Math.round(3 * scale));
          const gpTextY =
            teamY +
            Math.round(groupHeight / 2) +
            Math.round(positionConfig.gpYAdjustment * scale);
          ctx.strokeText(teamData.gp, gpValueX, gpTextY);
          ctx.fillText(teamData.gp, gpValueX, gpTextY);

          const mValueX =
            groupX + Math.floor(groupWidth * positionConfig.mXRatio) - 10;
          const mTextY =
            teamY +
            Math.round(groupHeight / 2) +
            Math.round(positionConfig.mYAdjustment * scale);
          ctx.strokeText(teamData.m, mValueX, mTextY);
          ctx.fillText(teamData.m, mValueX, mTextY);
        }
      }
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "900 16px Impact"; //, "Arial Black", sans-serif
    ctx.textAlign = "center";
    ctx.fillText(
      `Updated: ${new Date().toLocaleString()}`,
      canvasWidth - 120,
      canvasHeight - 5,
    );

    const buffer = canvas.toBuffer("image/png");
    const filename = selectedDivision
      ? `${selectedDivision}_standings.png`
      : "all_standings.png";
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    const content = selectedDivision
      ? `🏆 **${selectedDivision} Division Standings**`
      : `🏆 **Nature League - All Division Standings**`;

    await standingsChannel.send({
      files: [attachment],
    });
  } catch (error) {
    console.error("Error generating standings from Google Sheets:", error);

    if (error.message && error.message.includes("API has not been used")) {
      await safeReply({
        content:
          "❌ **Google Sheets API Error**: Please enable the Google Sheets API:\n" +
          "1. Go to: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=nature-league-469223\n" +
          '2. Click "Enable"\n' +
          "3. Wait 2-3 minutes and try again",
        ephemeral: true,
      });
    } else if (error.code === 403) {
      await safeReply({
        content:
          "❌ **Permission Error**: Make sure the service account has access to the Google Sheet and the API is enabled.",
        ephemeral: true,
      });
    } else {
      await safeReply({
        content:
          "❌ Sorry, you might be pulling data too fast, try again in 10-15 seconds.",
        ephemeral: true,
      });
    }
  }
}
