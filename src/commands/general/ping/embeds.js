import { EmbedBuilder } from "discord.js";
import { THEME } from "../../../config/theme.js";
import { getLatencyIndicator } from "./utils.js";

export function createPingEmbed(
  status,
  statusEmoji,
  statusColor,
  statusDescription,
  apiLatency,
  latency,
  uptimeString,
  client,
  _user,
) {
  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle("Bot Status Check")
    .setDescription(`**${statusEmoji} ${statusDescription}**`)
    .addFields(
      {
        name: "Discord API Latency",
        value: `\`${apiLatency}ms\` ${getLatencyIndicator(apiLatency)}`,
        inline: true,
      },
      {
        name: "Response Time",
        value: `\`${latency}ms\` ${getLatencyIndicator(latency)}`,
        inline: true,
      },
      {
        name: "Bot Uptime",
        value: `\`${uptimeString}\``,
        inline: true,
      },
    );

  // Add helpful tips based on status
  if (apiLatency >= 400) {
    embed.addFields({
      name: "Tips for Better Performance",
      value: [
        "• **Check your internet connection** - Try refreshing Discord",
        "• **Use a wired connection** - Wi-Fi can cause delays",
        "• **Close other applications** - High CPU usage affects performance",
        "• **Try a different server** - Sometimes switching servers helps",
      ].join("\n"),
      inline: false,
    });
  } else if (apiLatency >= 200) {
    embed.addFields({
      name: "Performance Tips",
      value: [
        "• Your connection is working fine",
        "• Consider using a wired connection for better performance",
        "• Close unnecessary browser tabs or applications",
      ].join("\n"),
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Great Performance!",
      value:
        "Your connection is excellent! Everything should be working smoothly.",
      inline: false,
    });
  }

  // Add server information
  embed.addFields({
    name: "Server Info",
    value: [
      `**Servers**: ${client.guilds.cache.size} servers`,
      `**Users**: ${client.users.cache.size} users`,
      `**Channels**: ${client.channels.cache.size} channels`,
    ].join("\n"),
    inline: false,
  });

  return embed;
}

export function createErrorEmbed(_user) {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle("Connection Check Failed")
    .setDescription(
      "Sorry! I couldn't check the connection status right now.\n\n" +
        "This might be due to:\n" +
        "• Temporary Discord API issues\n" +
        "• Network connectivity problems\n" +
        "• Bot maintenance\n\n" +
        "Please try again in a few moments!",
    );
}
