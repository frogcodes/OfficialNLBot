const { Events, AttachmentBuilder } = require("discord.js");
const Canvas = require("canvas");

const CHANNEL_ID = process.env.welcomeChannel; // Replace with the welcome channel ID

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const canvas = Canvas.createCanvas(800, 300);
    const context = canvas.getContext("2d");
    Canvas.registerFont("./impact.ttf", { family: "impact" });

    // Load the base welcome image
    const background = await Canvas.loadImage("./welcomebase2.png");
    context.drawImage(background, 0, 0, canvas.width, canvas.height);

    // Draw the user's avatar
    const avatar = await Canvas.loadImage(
      member.user.displayAvatarURL({
        extension: "png",
        size: 1024,
        forceStatic: true,
      })
    );
    const avatarSize = 200; // Diameter of the avatar circle
    const avatarX = canvas.width / 2 - avatarSize / 2; // Center the avatar horizontally
    const avatarY = 5; // Position avatar near the top

    // Draw a circular border
    context.beginPath();
    context.arc(
      canvas.width / 2,
      avatarSize / 1.5 - 24,
      avatarSize / 2 + 2,
      0,
      Math.PI * 2,
      true
    ); // Border circle
    context.fillStyle = "#ffffff"; // Border color (white)
    context.fill();
    context.closePath();

    // Clip and draw the avatar
    context.save();
    context.beginPath();
    context.arc(
      canvas.width / 2,
      avatarSize / 1.5 - 24,
      avatarSize / 2,
      0,
      Math.PI * 2,
      true
    );
    context.closePath();
    context.clip();
    context.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    context.restore();

    // Add "Welcome" text with black stroke
    context.font = "110px impact";
    context.fillStyle = "#ffffff"; // White text color
    context.strokeStyle = "#000000"; // Black stroke color
    context.lineWidth = 2; // Stroke thickness
    context.textAlign = "center";
    context.fillText("Welcome", canvas.width / 2, avatarY + avatarSize + 30);
    context.strokeText("Welcome", canvas.width / 2, avatarY + avatarSize + 30);

    // Add username text with black stroke
    context.font = "80px impact";
    context.fillText(
      `${member.user.username}`,
      canvas.width / 2,
      avatarY + avatarSize + 95
    );
    context.strokeText(
      `${member.user.username}`,
      canvas.width / 2,
      avatarY + avatarSize + 95
    );

    const attachment = new AttachmentBuilder(canvas.toBuffer(), {
      name: "welcome-image.png",
    });

    const channel = member.guild.channels.cache.get(CHANNEL_ID);
    if (channel) {
      channel.send({
        content: `Welcome <@${member.id}> to Nature League!\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n To signup, head over to <#1222700404572164126>. Make sure to check out <#1181050439689568370>, <#1181050439689568369>, and <#1181050440612319347>. \nHave a good day! <:NLMainLogo:1239024463631220827>`,
        files: [attachment],
      });
    }
  },
};
