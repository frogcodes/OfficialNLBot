const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const teams = {
  Narwolves: {
    player1id: "510870588366258186",
    player2id: "913111979399450624",
  },
  "SickLobster's": {
    player1id: "385688440122900480",
    player2id: "956924935597613096",
  },
  ExGrisly: {
    player1id: "1340145164248678401",
    player2id: "766386504183447562",
  },
  "A team": {
    player1id: "1255342444061659156",
    player2id: "546126780973449237",
  },
  "Team Jerry": {
    player1id: "894269932995506206",
    player2id: "938068995964293131",
  },
  Norjee: {
    player1id: "647194725090066438",
    player2id: "859879836013035531",
  },
  "cuteness overload": {
    player1id: "723729219384770581",
    player2id: "1048634383361384479",
  },
  "sum random": {
    player1id: "1428543918320128020",
    player2id: "491861366001369099",
  },
  "The UNCs": {
    player1id: "295337136914169867",
    player2id: "226791489831698433",
  },
  mkg: {
    player1id: "300664346155941890",
    player2id: "554844162965635102",
  },
  "All Stars": {
    player1id: "322862860839419907",
    player2id: "1230211841532366858",
  },
  "The Swordsmen": {
    player1id: "374732776424996867",
    player2id: "450291558613254144",
  },
  111: {
    player1id: "776681685982642176",
    player2id: "528014453254520832",
  },
  "Noon Toad": {
    player1id: "351480764602515487",
    player2id: "341269649545232385",
  },
  "First Order.": {
    player1id: "741891308511166524",
    player2id: "520173345816313857",
  },
  "The Spider Monkeys": {
    player1id: "1353237519340142593",
    player2id: "602671953442242561",
  },
  "FCL Cyclones (rip fcl 2024-2025)": {
    player1id: "464536334581628928",
    player2id: "936612216860454983",
  },
  "Therapists of Christmas Eve": {
    player1id: "1310466334198464602",
    player2id: "Chiefsotherchild",
  },
  "Internet and Yahoo!": {
    player1id: "529912299318673448",
    player2id: "758441489201234001",
  },
  "Perchance.": {
    player1id: "691884481539211345",
    player2id: "349038473992339469",
  },
  "Drunk Driving": {
    player1id: "667947497108275220",
    player2id: "252616997420924928",
  },
  backflipping: {
    player1id: "621175893078835200",
    player2id: "632371331089956926",
  },
  "Ivy's good boys": {
    player1id: "1048527100690321448",
    player2id: "516042621379149825",
  },
  "Space Turtles": {
    player1id: "235794704640376832",
    player2id: "274996211654852610",
  },
  Whoot: {
    player1id: "801945753219629066",
    player2id: "267112342846832662",
  },
  "ferocious femboys": {
    player1id: "841829050098909216",
    player2id: "1105181330339266581",
  },
  "Hell’s Urchins": {
    player1id: "1086736353242386522",
    player2id: "428864280767627264",
  },
  FWB: {
    player1id: "763734801551196160",
    player2id: "333647805870505984",
  },
  Blobfish: {
    player1id: "789617950806114365",
    player2id: "196767856703045632",
  },
  "Stevie Wonders Driving School": {
    player1id: "1254661471502205109",
    player2id: "1358960874903175300",
  },
  "Little Swimmers": {
    player1id: "781988055246176257",
    player2id: "740259174784565359",
  },
  "NUUKERN -_-": {
    player1id: "560810664076247040",
    player2id: "710411367500218411",
  },
  Abyssal_Winter: {
    player1id: "661985842969182208",
    player2id: "1484335463606128762",
  },
  "The Fellers who put BTA": {
    player1id: "697329697716961292",
    player2id: "662815321534496768",
  },
  Goated: {
    player1id: "715219130898448455",
    player2id: "739877205659877416",
  },
  "DUCK KT!": {
    player1id: "563121561603670044",
    player2id: "515698499191570432",
  },
  "Batman & Robin": {
    player1id: "118629980417687552",
    player2id: "379792746145382422",
  },
};

const schedChannel = "1208536539538128957";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("twos-league-threads")
    .setDescription("Create scheduling threads for a 2s league match")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("m1")
        .setDescription("First match teams separate by comma")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("m2")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m3")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m4")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m5")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m6")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m7")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m8")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m9")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("m10")
        .setDescription("match teams separate by comma")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("custom-message")
        .setDescription("Custom message to include in the thread")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const m1 = interaction.options.getString("m1");
    const m2 = interaction.options.getString("m2") || "";
    const m3 = interaction.options.getString("m3") || "";
    const m4 = interaction.options.getString("m4") || "";
    const m5 = interaction.options.getString("m5") || "";
    const m6 = interaction.options.getString("m6") || "";
    const m7 = interaction.options.getString("m7") || "";
    const m8 = interaction.options.getString("m8") || "";
    const m9 = interaction.options.getString("m9") || "";
    const m10 = interaction.options.getString("m10") || "";
    const customMessage = interaction.options.getString("custom-message") || "";

    for (const matchString of [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10]) {
      // Skip empty matches
      if (!matchString || matchString.trim() === "") continue;

      const matchTeams = matchString.split(",").map((t) => t.trim());

      if (matchTeams.length !== 2) {
        return await interaction.editReply(
          `Error: Invalid format for match "${matchString}". Expected format: "Team1,Team2"`,
        );
      }

      let [team1Name, team2Name] = matchTeams;

      // Check if teams exist
      if (!teams[team1Name]) {
        return await interaction.editReply(
          `Error: Team "${team1Name}" not found in teams data.`,
        );
      }
      if (!teams[team2Name]) {
        return await interaction.editReply(
          `Error: Team "${team2Name}" not found in teams data.`,
        );
      }

      try {
        const channel = await interaction.guild.channels.fetch(schedChannel);

        // Create the private thread
        const thread = await channel.threads.create({
          name: `${team1Name} vs ${team2Name}`,
          autoArchiveDuration: 10080,
          type: 12, // private thread
        });

        // Add individual members to the thread
        const membersToAdd = [
          teams[team1Name].player1id,
          teams[team1Name].player2id,
          teams[team2Name].player1id,
          teams[team2Name].player2id,
          "351480764602515487",
        ];

        for (const member of membersToAdd) {
          try {
            await thread.members.add(member.id);
          } catch (error) {
            console.error(`Failed to add member ${member.displayName}`, error);
          }
        }

        // Send welcome message
        const welcomeMsg = `Welcome ${team1Name} ( <@${
          teams[team1Name].player1id
        }> <@${teams[team1Name].player2id}> ) and ${team2Name} ( <@${
          teams[team2Name].player1id
        }> <@${teams[team2Name].player2id}> )!${
          customMessage ? " " + customMessage : ""
        }`;
        await thread.send(welcomeMsg);
      } catch (error) {
        console.error(`Failed to create thread for `, error);
      }
    }

    // Send summary response
    let response = `threads should all be created!`;

    await interaction.editReply(response);
  },
};
