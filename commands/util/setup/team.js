const Team = require("../../../models/Team");

module.exports = {
  data: (subcommand) =>
    subcommand
      .setName("team")
      .setDescription("Register a team")
      .addStringOption((option) =>
        option.setName("name").setDescription("Team name").setRequired(true)
      )
      .addRoleOption((option) =>
        option.setName("role").setDescription("Team role").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("tiers")
          .setDescription("Tiers separated by commas (e.g., apex,alpha,beta)")
          .setRequired(true)
      )
      .addUserOption((option) =>
        option.setName("gm").setDescription("Team GM").setRequired(false)
      )
      .addUserOption((option) =>
        option.setName("agm").setDescription("Team AGM").setRequired(false)
      ),

  async execute(interaction) {
    await interaction.deferReply();

    const name = interaction.options.getString("name");
    const role = interaction.options.getRole("role");
    const tiersInput = interaction.options.getString("tiers");
    const gm = interaction.options.getUser("gm");
    const agm = interaction.options.getUser("agm");

    const tiers = tiersInput
      .split(",")
      .map((tier) => tier.trim().toLowerCase());

    // Validate tiers
    const validTiers = ["apex", "alpha", "beta", "delta", "omega"];
    const invalidTiers = tiers.filter((tier) => !validTiers.includes(tier));

    if (invalidTiers.length > 0) {
      return interaction.editReply(
        `Invalid tiers: ${invalidTiers.join(
          ", "
        )}. Valid tiers are: ${validTiers.join(", ")}`
      );
    }

    try {
      // Check if team already exists
      const existingTeam = await Team.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
      });

      if (existingTeam) {
        return interaction.editReply(`Team "${name}" already exists.`);
      }

      // Create new team
      const team = new Team({
        name,
        roleId: role.id,
        members: {
          gm: gm ? gm.id : null,
          agm: agm ? agm.id : null,
          captains: [],
        },
        tiers,
      });

      await team.save();

      return interaction.editReply(
        `Team "${name}" has been registered successfully with tiers: ${tiers.join(
          ", "
        )}`
      );
    } catch (error) {
      console.error("Error registering team:", error);
      return interaction.editReply(
        "An error occurred while registering the team."
      );
    }
  },
};
