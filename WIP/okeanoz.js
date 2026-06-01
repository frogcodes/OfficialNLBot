const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// user you're training on
const TARGET_USER_ID = "592025951857147904";

// storage for all dataset samples
const dataset = [];

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  for (const [guildId, guild] of client.guilds.cache) {
    console.log(`📌 Scraping guild: ${guild.name}`);

    const channels = guild.channels.cache.filter(
      (c) => c.isTextBased() && c.type !== 4 // exclude categories
    );

    for (const [channelId, channel] of channels) {
      console.log(`📎 Scanning channel: #${channel.name}`);

      let lastId = null;
      const messagesCollected = [];

      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const batch = await channel.messages.fetch(options).catch(() => null);
        if (!batch || batch.size === 0) break;

        batch.forEach((msg) => messagesCollected.push(msg));
        lastId = batch.last().id;

        console.log(`   → fetched ${messagesCollected.length} msgs so far`);
      }

      // oldest → newest
      messagesCollected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // build context dataset
      for (let i = 2; i < messagesCollected.length; i++) {
        const msg = messagesCollected[i];

        if (msg.author?.id === TARGET_USER_ID && msg.content) {
          dataset.push({
            channel: channel.name,
            context: [
              messagesCollected[i - 2].content,
              messagesCollected[i - 1].content,
            ],
            response: msg.content,
          });
        }
      }
    }
  }

  console.log(`✅ DONE! Created ${dataset.length} samples`);

  fs.writeFileSync("dataset.json", JSON.stringify(dataset, null, 2));
  console.log(`📁 Saved as dataset.json`);

  process.exit(0);
});

client.login(
  "MTIyNTI4MDM3NjgyNjc2MTI2Nw.Gy3HyF.PezKfc7M6wm10LKR_Xk2Hi1Onjrqku1B8ofx14"
);
