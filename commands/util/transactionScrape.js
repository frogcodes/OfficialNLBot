const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scrape")
    .setDescription("Scrape all messages from a channel and save to JSON")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to scrape")
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");

    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "Channel must be a text channel!",
        ephemeral: true,
      });
    }

    await interaction.reply(
      `Scraping messages from **${channel.name}**… this may take a moment.`
    );

    let allMessages = [];
    let lastId = null;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      messages.forEach((msg) => {
        allMessages.push({
          id: msg.id,
          content: msg.content ?? "",
          authorId: msg.author.id,
          authorUsername: msg.author.username,
          createdAt: msg.createdAt,
          localDate: msg.createdAt.toLocaleDateString("en-US"),
          mentions: {
            users: msg.mentions.users.map((u) => u.id),
            roles: msg.mentions.roles.map((r) => r.id),
            channels: msg.mentions.channels.map((c) => c.id),
          },
          attachments: msg.attachments.map((att) => ({
            url: att.url,
            name: att.name,
            contentType: att.contentType,
            size: att.size,
          })),
          embeds: msg.embeds.map((embed) => ({
            title: embed.title,
            description: embed.description,
            url: embed.url,
            fields: embed.fields,
            footer: embed.footer,
            thumbnail: embed.thumbnail,
            author: embed.author,
            timestamp: embed.timestamp,
          })),
        });
      });

      lastId = messages.last().id;
    }

    // Ensure folder
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");

    const filePath = `./data/${channel.id}.json`;
    fs.writeFileSync(filePath, JSON.stringify(allMessages, null, 2));

    return interaction.followUp(
      `✅ Scraped **${allMessages.length} messages**.\nSaved to: \`${filePath}\``
    );
  },
};
