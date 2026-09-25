import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { THEME, UI_COMPONENTS } from "../../config/theme.js";
import { getLogger } from "../../utils/logger.js";

const logger = getLogger();

/**
 * Whether the CSAT rating prompt is enabled for a guild.
 * Defaults to enabled unless explicitly turned off.
 * @param {Object|null} guildSettings
 * @returns {boolean}
 */
export function isCsatEnabled(guildSettings) {
  return guildSettings?.ticketSettings?.csatEnabled !== false;
}

/**
 * Create the rating prompt embed sent via DM after close
 * @param {string} ticketNumber
 * @param {import('discord.js').Client} [client]
 * @returns {EmbedBuilder}
 */
export function createCsatPromptEmbed(ticketNumber, client) {
  return new EmbedBuilder()
    .setTitle("How was your support?")
    .setDescription(
      `Your ticket **#${ticketNumber}** has been closed.\n\n` +
        `How would you rate the help you received? Tap a star below — ` +
        `it only takes a second, and your feedback helps the staff team.`,
    )
    .setColor(THEME.PRIMARY)
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Ticketing System",
        client?.user?.displayAvatarURL() ?? undefined,
      ),
    )
    .setTimestamp();
}

/**
 * Create the 1–5 star button row
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function createCsatButtons(ticketId) {
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_csat:${ticketId}:${i}`)
        .setLabel(`${i} ★`)
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

/**
 * Create the "Add comment" button row shown after a rating is left
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function createCsatCommentButton(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_csat_comment:${ticketId}`)
      .setLabel("Add a comment")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("💬"),
  );
}

/**
 * Send the CSAT rating prompt to the ticket opener via DM.
 * Called from every close path. Best-effort: silently skips when
 * DMs are closed, the guild disabled CSAT, or the ticket is missing.
 * @param {Object} params
 * @param {import('discord.js').Client} params.client
 * @param {string} params.guildId
 * @param {Object} params.ticket
 * @returns {Promise<boolean>} whether the prompt was delivered
 */
export async function promptCsatOnClose({ client, guildId, ticket }) {
  try {
    if (!client || !ticket?.userId || !ticket?.ticketId) return false;

    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();
    const settings =
      await storage?.dbManager?.guildSettings?.getByGuild(guildId);

    if (!isCsatEnabled(settings)) return false;
    if (ticket.metadata?.feedbackRating != null) return false;

    const user = await client.users.fetch(ticket.userId).catch(() => null);
    if (!user) return false;

    const ticketNumber = ticket.ticketId.split("-").pop();
    await user.send({
      embeds: [createCsatPromptEmbed(ticketNumber, client)],
      components: [createCsatButtons(ticket.ticketId)],
    });
    return true;
  } catch (err) {
    logger.debug(
      `CSAT prompt DM for ticket ${ticket?.ticketId} failed: ${err.message}`,
    );
    return false;
  }
}

/**
 * Post a "New Ticket Feedback" relay embed to the guild's configured
 * relay channel. Best-effort; never blocks the rating handler.
 * @param {Object} params
 * @param {import('discord.js').Client} params.client
 * @param {string} params.guildId
 * @param {string|null} params.relayChannelId
 * @param {Object} params.ticket
 * @param {number} params.rating
 * @param {string|null} params.comment
 * @param {string|null} params.ratedStaffId
 * @param {string} params.raterTag
 * @returns {Promise<boolean>}
 */
export async function sendCsatRelay({
  client,
  guildId,
  relayChannelId,
  ticket,
  rating,
  comment,
  ratedStaffId,
  raterTag,
}) {
  try {
    if (!relayChannelId) return false;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return false;

    const channel = await guild.channels
      .fetch(relayChannelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const embed = new EmbedBuilder()
      .setTitle("⭐ New Ticket Feedback")
      .setColor(
        rating >= 4 ? THEME.SUCCESS : rating >= 3 ? THEME.WARNING : THEME.ERROR,
      )
      .addFields(
        { name: "Rating", value: `${stars} (${rating}/5)`, inline: true },
        { name: "From", value: raterTag, inline: true },
        {
          name: "Ticket",
          value: `#${ticket.ticketId.split("-").pop()}`,
          inline: true,
        },
        {
          name: "Category",
          value: ticket.categoryId || "default",
          inline: true,
        },
        {
          name: "Staff",
          value: ratedStaffId ? `<@${ratedStaffId}>` : "—",
          inline: true,
        },
      )
      .setTimestamp();

    if (comment) {
      embed.addFields({ name: "Comment", value: comment.slice(0, 1024) });
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    logger.debug(
      `CSAT relay for ticket ${ticket?.ticketId} failed: ${err.message}`,
    );
    return false;
  }
}
