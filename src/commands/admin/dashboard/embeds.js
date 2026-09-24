import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { THEME } from "../../../config/theme.js";

/**
 * Creates the dashboard link embed
 * @param {string} guildId - The guild ID
 * @param {Object} client - Discord client for avatar URL
 * @returns {Object} Embed and components
 */
export function createDashboardEmbed(guildId, client) {
  const dashboardUrl = `${process.env.BOT_WEBSITE_URL || "https://rolereactor.xyz"}/dashboard/${guildId}`;

  const embed = new EmbedBuilder()
    .setTitle("Server Dashboard")
    .setDescription("Click the button below to access your server's dashboard.")
    .setColor(THEME.PRIMARY)
    .setTimestamp()
    .setFooter({
      text: "Role Reactor • Dashboard",
      iconURL: client.user.displayAvatarURL(),
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL(dashboardUrl)
      .setLabel("Open Dashboard")
      .setStyle(ButtonStyle.Link),
  );

  return { embed, components: [row] };
}
