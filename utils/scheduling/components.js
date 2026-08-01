const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

function buildProposeTimeButton() {
  return new ButtonBuilder()
    .setCustomId("propose_time_start")
    .setLabel("Propose Time")
    .setStyle(ButtonStyle.Secondary);
}

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
    buildProposeTimeButton(),
  );
}

// Modal for typing availability as time ranges — one line per day, prefilled with
// the day labels (or the captain's existing ranges) so they just type after each.
function buildAvailabilityModal(prefillText) {
  return new ModalBuilder()
    .setCustomId("availability_modal")
    .setTitle("Submit Availability (all times ET)")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("availability_text")
          .setLabel("Ranges per day, e.g. Mon: 6:15-7:45, 9-11")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setValue(prefillText ?? ""),
      ),
    );
}

// Modal for entering a single day + time (used by Propose Time, the home
// captain's final-time selection, and staff schedule-set).
function buildTimeEntryModal({ customId, title, dayValue = "", timeValue = "" }) {
  const dayInput = new TextInputBuilder()
    .setCustomId("day")
    .setLabel("Day (e.g. Saturday)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(dayValue);

  const timeInput = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("Time ET (e.g. 8:30 PM)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(timeValue);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(dayInput),
      new ActionRowBuilder().addComponents(timeInput),
    );
}

function buildHomeFinalTimeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("final_overlap_start")
      .setLabel("Select Final Time")
      .setStyle(ButtonStyle.Primary),
    buildProposeTimeButton(),
  );
}

function buildManualProposalRow() {
  return new ActionRowBuilder().addComponents(buildProposeTimeButton());
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
      .setCustomId("propose_time_start")
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

// "Change Availability" reuses the availability_start flow (opens the modal to
// enter/update times). Kept off the status rows so its customId isn't duplicated.
function buildChangeAvailabilityButton({ tier, teamRoleIds = [], homeRoleId = null }) {
  const [team1RoleId = "", team2RoleId = ""] = teamRoleIds;
  return new ButtonBuilder()
    .setCustomId(
      `availability_start:${tier}:${team1RoleId}:${team2RoleId}:${homeRoleId ?? ""}`,
    )
    .setLabel("Change Availability")
    .setStyle(ButtonStyle.Secondary);
}

function buildRescheduleButton() {
  return new ButtonBuilder()
    .setCustomId("scheduling_reschedule")
    .setLabel("Reschedule")
    .setStyle(ButtonStyle.Danger);
}

// Controls present on EVERY panel state (Change Availability + Reschedule).
function buildAlwaysControlsRow(session) {
  return new ActionRowBuilder().addComponents(
    buildChangeAvailabilityButton(session),
    buildRescheduleButton(),
  );
}

module.exports = {
  buildAlwaysControlsRow,
  buildAvailabilityModal,
  buildAvailabilityStartRow,
  buildConfirmedControlRow,
  buildHomeFinalTimeRow,
  buildManualAgreementRow,
  buildManualProposalRow,
  buildOverlapAgreementRow,
  buildProposeTimeButton,
  buildRescheduleButton,
  buildTimeEntryModal,
};
