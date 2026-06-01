const { SlashCommandBuilder } = require('discord.js');
const teamCommand = require('./setup/team');
const matchCommand = require('./setup/match');
const seasonCommand = require('./setup/season');
const importCommand = require('./setup/import');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup commands for the bot')
    .addSubcommand(teamCommand.data)
    .addSubcommand(matchCommand.data)
    .addSubcommand(seasonCommand.data)
    .addSubcommand(importCommand.data),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'team':
        return teamCommand.execute(interaction);
      case 'match':
        return matchCommand.execute(interaction);
      case 'season':
        return seasonCommand.execute(interaction);
      case 'import':
        return importCommand.execute(interaction);
      default:
        return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
    }
  },
};
