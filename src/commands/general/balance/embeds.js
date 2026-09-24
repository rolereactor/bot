import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { THEME } from "../../../config/theme.js";
import { emojiConfig } from "../../../config/emojis.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

/**
 * Creates a balance embed showing user's Cores & Sparks
 * @param {Object} userData - User's Core credit data
 * @param {string} username - User's name for the author line
 * @param {string} avatarURL - User's avatar URL
 * @param {Object} [options={}] - Additional metadata for the embed
 * @param {Object|null} [options.client] - Discord client for clickable commands
 * @param {string|null} [options.guildId] - Guild ID for command lookup
 * @returns {Object} Object with embeds and components arrays
 */
export function createBalanceEmbed(
  userData,
  username,
  avatarURL,
  _options = {},
) {
  const totalCredits = Number((userData.credits || 0).toFixed(2));
  const totalSparks = Math.floor(userData.sparks || 0);

  const coreEmoji = emojiConfig.core;
  const sparkEmoji = emojiConfig.spark;

  const client = _options.client;
  const guildId = _options.guildId;

  const voteCmd = getMentionableCommand(client, "vote", guildId);
  const shopCmd = getMentionableCommand(client, "shop", guildId);
  const engineCmd = getMentionableCommand(client, "engine", guildId);

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setAuthor({ name: username, iconURL: avatarURL })
    .setDescription(
      `Earn Cores with ${voteCmd} and ${shopCmd} • Use ${engineCmd} for Pro features`,
    )
    .addFields(
      {
        name: `${coreEmoji} Cores`,
        value: `**${totalCredits.toLocaleString()}**`,
        inline: true,
      },
      {
        name: "\u200B",
        value: "\u200B",
        inline: true,
      },
      {
        name: `${sparkEmoji} Sparks`,
        value: `**${totalSparks.toLocaleString()}**`,
        inline: true,
      },
    )
    .setFooter({
      text: "Shop: Items • Inventory: Your items • Engine: Pro features",
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("balance_shop")
      .setLabel("Shop")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🛒"),
    new ButtonBuilder()
      .setCustomId("balance_inventory")
      .setLabel("Inventory")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📦"),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Creates a generic error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {string} _avatarURL - Client avatar URL (unused)
 * @returns {EmbedBuilder} Discord embed object
 */
export function createErrorEmbed(title, description, _avatarURL) {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle(`❌ ${title}`)
    .setDescription(description);
}

/**
 * Creates a validation error embed
 * @param {Array<string>} errors - Array of error messages
 * @param {Object} _client - Discord client (unused)
 * @returns {EmbedBuilder} Discord embed object
 */
export function createValidationErrorEmbed(errors, _client) {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle("❌ Validation Error")
    .setDescription("Please fix the following errors:")
    .addFields({
      name: "Errors",
      value: errors.map((error, index) => `${index + 1}. ${error}`).join("\n"),
      inline: false,
    });
}
