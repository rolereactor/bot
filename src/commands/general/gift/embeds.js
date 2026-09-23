import { EmbedBuilder } from "discord.js";
import { THEME } from "../../../config/theme.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

/**
 * Creates a gift confirmation embed
 * @param {Object} item - Item to gift
 * @param {Object} targetUser - User receiving the item
 * @param {Object} _client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - Sender's username
 * @param {string} [options.avatarURL] - Sender's avatar URL
 * @returns {EmbedBuilder} Discord embed object
 */
export function createGiftConfirmEmbed(item, targetUser, _client, options = {}) {
  const { username, avatarURL } = options;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle("🎁 Confirm Gift")
    .setDescription(`Are you sure you want to gift **${item.name}** to **${targetUser.username}**?`);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  embed.addFields(
    {
      name: "Item",
      value: `${item.emoji} **${item.name}**`,
      inline: true,
    },
    {
      name: "Recipient",
      value: `<@${targetUser.id}>`,
      inline: true,
    },
  );

  if (item.type === "power_cell") {
    embed.addFields({
      name: "Stored Value",
      value: `**${item.storedAmount} Cores**`,
      inline: true,
    });
  } else if (item.type === "engine_module") {
    embed.addFields({
      name: "Duration",
      value: `**${item.durationDays} day${item.durationDays !== 1 ? "s" : ""}**`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Creates a gift success embed
 * @param {Object} item - Item gifted
 * @param {Object} targetUser - User receiving the item
 * @param {Object} client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - Sender's username
 * @param {string} [options.avatarURL] - Sender's avatar URL
 * @param {string} [options.guildId] - Guild ID for command lookup
 * @returns {EmbedBuilder} Discord embed object
 */
export function createGiftSuccessEmbed(item, targetUser, client, options = {}) {
  const { username, avatarURL, guildId } = options;

  const inventoryCommand = getMentionableCommand(client, "inventory", guildId);

  const embed = new EmbedBuilder()
    .setColor(THEME.SUCCESS)
    .setTitle("✅ Gift Successful!")
    .setDescription(`Successfully gifted **${item.name}** to **${targetUser.username}**!`);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  embed.addFields(
    {
      name: "Item",
      value: `${item.emoji} **${item.name}**`,
      inline: true,
    },
    {
      name: "Recipient",
      value: `<@${targetUser.id}>`,
      inline: true,
    },
    {
      name: "Note",
      value: `The recipient can use ${inventoryCommand} to activate this item.`,
      inline: false,
    },
  );

  return embed;
}

/**
 * Creates a generic error embed
 * @param {string} description - Error description
 * @param {Object} _client - Discord client
 * @returns {EmbedBuilder} Discord embed object
 */
export function createErrorEmbed(description, _client) {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle("❌ Error")
    .setDescription(description)
    .setTimestamp();
}
