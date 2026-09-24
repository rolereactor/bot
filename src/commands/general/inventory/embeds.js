import { EmbedBuilder } from "discord.js";
import { THEME } from "../../../config/theme.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

/**
 * Creates the main inventory embed showing all items
 * @param {Array} items - Inventory items
 * @param {Object} client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.guildId] - Guild ID for command lookup
 * @returns {EmbedBuilder} Discord embed object
 */
export function createInventoryEmbed(items, client, options = {}) {
  const { guildId } = options;

  const shopCommand = getMentionableCommand(client, "shop", guildId);

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle("🎒 Inventory");

  if (items.length === 0) {
    embed.setDescription(
      `... nothing in inventory ! buy something now in the shop — ${shopCommand}`,
    );
  } else {
    const itemList = items
      .map(item => {
        const status = item.used ? "✅" : "⏳";
        return `${status} ${item.emoji} **${item.name}**`;
      })
      .join("\n");

    embed.setDescription(itemList);
  }

  return embed;
}

/**
 * Creates a detailed view of a single inventory item
 * @param {Object} item - Inventory item
 * @param {number} index - Current item index (0-based)
 * @param {number} total - Total number of items
 * @param {Object} inventory - Full inventory data
 * @param {Object} _client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - User's name for author
 * @param {string} [options.avatarURL] - User's avatar URL
 * @returns {EmbedBuilder} Discord embed object
 */
export function createItemDetailEmbed(
  item,
  index,
  total,
  inventory,
  _client,
  options = {},
) {
  const { username, avatarURL } = options;

  const status = item.used ? "✅ Used" : "⏳ Ready";

  const embed = new EmbedBuilder()
    .setColor(item.used ? THEME.SECONDARY : THEME.SUCCESS)
    .setTitle(`${item.emoji} ${item.name}`)
    .setDescription(status);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  if (item.type === "power_cell") {
    embed.addFields({
      name: "Price",
      value: `**${item.cost} Cores**`,
      inline: true,
    });
  } else if (item.type === "engine_module") {
    embed.addFields({
      name: "Price",
      value: `**${item.cost} Sparks**`,
      inline: true,
    });
  }

  if (item.used && item.usedAt) {
    const usedDate = new Date(item.usedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    embed.addFields({
      name: "Used On",
      value: usedDate,
      inline: true,
    });
  }

  if (inventory.sparkProExpiry && inventory.sparkProExpiry > new Date()) {
    const timeLeft = Math.ceil(
      (inventory.sparkProExpiry - new Date()) / (1000 * 60 * 60 * 24),
    );
    embed.addFields({
      name: "Active Spark Pro",
      value: `Expires in **${timeLeft} day${timeLeft !== 1 ? "s" : ""}**`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Creates a confirmation embed for using an item
 * @param {Object} item - Inventory item
 * @param {Object} _client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - User's name for author
 * @param {string} [options.avatarURL] - User's avatar URL
 * @returns {EmbedBuilder} Discord embed object
 */
export function createUseConfirmEmbed(item, _client, options = {}) {
  const { username, avatarURL } = options;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle(`⚠️ Use ${item.name}?`);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  if (item.type === "power_cell") {
    embed.setDescription(
      `Costs **${item.cost} Cores** — adds ${item.storedAmount} Cores to balance`,
    );
  } else if (item.type === "engine_module") {
    embed.setDescription(
      `Costs **${item.cost} Sparks** — activates ${item.durationDays} day${item.durationDays !== 1 ? "s" : ""} of Pro Engine`,
    );
  }

  return embed;
}

/**
 * Creates a success embed for using an item
 * @param {Object} item - Inventory item
 * @param {Object} result - Use result
 * @param {Object} _client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - User's name for author
 * @param {string} [options.avatarURL] - User's avatar URL
 * @returns {EmbedBuilder} Discord embed object
 */
export function createUseSuccessEmbed(item, result, _client, options = {}) {
  const { username, avatarURL } = options;

  const embed = new EmbedBuilder()
    .setColor(THEME.SUCCESS)
    .setTitle(`✅ ${item.name} activated!`);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  if (result.type === "power_cell") {
    embed.setDescription(
      `**${result.coresAdded} Cores** added to your balance`,
    );
  } else if (result.type === "engine_module") {
    const expiryText = result.expiresAt
      ? `Expires: <t:${Math.floor(result.expiresAt.getTime() / 1000)}:R>`
      : "Active now";
    embed.setDescription(expiryText);
  }

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
    .setDescription(description);
}
