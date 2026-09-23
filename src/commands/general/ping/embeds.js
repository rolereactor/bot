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
