import { EmbedBuilder } from "discord.js";
import { THEME_COLOR } from "../../config/theme.js";

/**
 * Process goodbye message with placeholders
 * @param {string} message - The message template
 * @param {import('discord.js').GuildMember} member - The guild member who left
 * @returns {string} - Processed message
 */
export function processGoodbyeMessage(message, member) {
  // Get human member count (excluding bots)
  const humanCount = member.guild.members.cache.filter(m => !m.user.bot).size;

  return message
    .replace(/{user}/g, member.user.toString())
    .replace(/{user.name}/g, member.user.username)
    .replace(/{user.tag}/g, member.user.tag)
    .replace(/{user.id}/g, member.user.id)
    .replace(/{server}/g, member.guild.name)
    .replace(/{server.id}/g, member.guild.id)
    .replace(/{memberCount}/g, String(humanCount))
    .replace(/{memberCount.ordinal}/g, getOrdinal(humanCount));
}

/**
 * Create goodbye embed
 * @param {Object} settings - Goodbye settings
 * @param {import('discord.js').GuildMember} member - The guild member who left
 * @returns {EmbedBuilder} - Goodbye embed
 */
export function createGoodbyeEmbed(settings, member) {
  const embed = new EmbedBuilder()
    .setColor(settings.embedColor || THEME_COLOR)
    .setAuthor({
      name: `${member.user.username} left the server`,
      iconURL: member.user.displayAvatarURL({ size: 64 }),
    })
    .setDescription(
      processGoodbyeMessage(
        settings.message ||
          "**{user}** left the server\nThanks for being part of **{server}**! 👋",
        member,
      ),
    )
    .addFields({
      name: "",
      value: "",
      inline: false,
    })
    .addFields({
      name: "📊 Server Statistics",
      value: `**${member.guild.members.cache.filter(m => !m.user.bot).size}** members remaining`,
      inline: true,
    })
    .addFields({
      name: "⏰ Left At",
      value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
      inline: true,
    })
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `${member.guild.name} • Goodbye System`,
      iconURL: member.client.user.displayAvatarURL(),
    });

  return embed;
}

/**
 * Get ordinal number (1st, 2nd, 3rd, etc.)
 * @param {number} num - The number
 * @returns {string} - Ordinal number
 */
function getOrdinal(num) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Send a test goodbye message to the configured channel
 * @param {string} guildId - Guild ID
 * @param {Object} settings - Goodbye settings
 * @param {import('discord.js').Guild} guild - Discord guild object
 * @returns {Object} - Result
 */
export async function sendTestGoodbyeMessage(guildId, settings, guild) {
  if (!settings?.channelId) {
    return {
      success: false,
      error: "No goodbye channel configured",
    };
  }

  const goodbyeChannel = guild.channels.cache.get(settings.channelId);
  if (!goodbyeChannel) {
    return {
      success: false,
      error: "Goodbye channel not found",
    };
  }

  const botMember = guild.members.me;
  const channelPermissions = goodbyeChannel.permissionsFor(botMember);

  if (!channelPermissions?.has("SendMessages")) {
    return {
      success: false,
      error: "Bot lacks permission to send messages in goodbye channel",
    };
  }

  if (settings.embedEnabled && !channelPermissions.has("EmbedLinks")) {
    return {
      success: false,
      error: "Bot lacks permission to embed links in goodbye channel",
    };
  }

  // Use bot's own member for test message
  const testMember = botMember;

  // Send test message
  if (settings.embedEnabled) {
    const embed = createGoodbyeEmbed(settings, testMember);
    await goodbyeChannel.send({ embeds: [embed] });
  } else {
    const processedMessage = processGoodbyeMessage(
      settings.message,
      testMember,
    );
    await goodbyeChannel.send(processedMessage);
  }

  return {
    success: true,
    format: settings.embedEnabled ? "Embed" : "Text",
  };
}
