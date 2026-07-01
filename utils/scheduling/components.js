const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");

const { AVAILABILITY_TIMES } = require("./constants.js");

function buildAvailabilityStartRow({
  tier,
  teamRoleIds = [],
  homeRoleId = null,
}) {
  const [team1RoleId = "", team2RoleId = ""] = teamRoleIds;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `availability_start:${tier}:${team1RoleId}:${team2RoleId}:${homeRoleId ?? ""}`,
      )
      .setLabel("Submit Availability")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildAvailabilityRows(days) {
  return days.map((day) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`availability_day:${day}`)
        .setPlaceholder(`${day} availability`)
        .setMinValues(0)
        .setMaxValues(AVAILABILITY_TIMES.length)
        .addOptions(
          AVAILABILITY_TIMES.map((time) => ({
            label: time,
            value: time,
          })),
        ),
    ),
  );
}

function buildAvailabilitySubmitRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("availability_submit")
      .setLabel("Submit Availability")
      .setStyle(ButtonStyle.Success),
  );
}

function buildHomeFinalTimeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("final_overlap_start")
      .setLabel("Select Final Time")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildManualProposalRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("manual_time_start")
      .setLabel("Propose Manual Time")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildOverlapAgreementRow(proposalId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manual_time_agree:${proposalId}`)
      .setLabel("Confirm Time")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("final_overlap_start")
      .setLabel("Change Time")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildManualAgreementRow(proposalId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manual_time_agree:${proposalId}`)
      .setLabel("Agree To Time")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("manual_time_start")
      .setLabel("Propose Different Time")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildConfirmedControlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("scheduling_confirmed")
      .setLabel("Match Confirmed")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

function buildDaySelectRow(customId, days, placeholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        days.map((day) => ({
          label: day,
          value: day,
        })),
      ),
  );
}

function buildTimeSelectRow(customId, times, placeholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        times.map((time) => ({
          label: time,
          value: time,
        })),
      ),
  );
}

module.exports = {
  buildAvailabilityRows,
  buildAvailabilityStartRow,
  buildAvailabilitySubmitRow,
  buildConfirmedControlRow,
  buildDaySelectRow,
  buildHomeFinalTimeRow,
  buildManualAgreementRow,
  buildManualProposalRow,
  buildOverlapAgreementRow,
  buildTimeSelectRow,
};
