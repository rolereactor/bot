import { EmbedBuilder } from "discord.js";
import { THEME } from "../../../config/theme.js";
import { emojiConfig } from "../../../config/emojis.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

/**
 * Creates a single item embed for browsing
 * @param {Object} item - Shop item to display
 * @param {number} index - Current item index (0-based)
 * @param {number} total - Total number of items
 * @param {Object} status - User's balance status
 * @param {Object} client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - User's name for author
 * @param {string} [options.avatarURL] - User's avatar URL
 * @returns {EmbedBuilder} Discord embed object
 */
export function createShopItemEmbed(item, index, total, status, client, options = {}) {
  const { username, avatarURL } = options;
  const coreEmoji = emojiConfig.core;
  const sparkEmoji = emojiConfig.spark;

  const balance = item.currency === "cores" ? status.cores : status.sparks;
  const canAfford = balance >= item.cost;
  const costStatus = canAfford ? "✅ Can Afford" : "❌ Not Enough";

  const tradeCmd = getMentionableCommand(client, "trade", options.guildId);
  const inventoryCmd = getMentionableCommand(client, "inventory", options.guildId);

  const embed = new EmbedBuilder()
    .setColor(canAfford ? THEME.SUCCESS : THEME.WARNING)
    .setTitle(`${item.emoji} ${item.name}`)
    .setDescription(item.description);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  const currencyEmoji = item.currency === "cores" ? coreEmoji : sparkEmoji;
  const currencyName = item.currency === "cores" ? "Cores" : "Sparks";

  // Add item-specific details
  if (item.type === "power_cell") {
    embed.addFields(
      {
        name: "What It Does",
        value: `Stores **${item.storedAmount} Cores** that can be activated later or traded to other users.`,
        inline: false,
      },
      {
        name: "How to Use",
        value: "1. Buy this item → goes to your inventory\n2. Trade it to another user via " + tradeCmd + "\n3. Recipient activates it → gets **" + item.storedAmount + " Cores** added to their balance",
        inline: false,
      },
      {
        name: "Cost",
        value: `${currencyEmoji} **${item.cost}** ${currencyName}`,
        inline: true,
      },
      {
        name: "Stores",
        value: `**${item.storedAmount} Cores**`,
        inline: true,
      },
      {
        name: "Your Balance",
        value: `${currencyEmoji} **${balance.toLocaleString()}** ${currencyName}`,
        inline: true,
      },
    );
  } else if (item.type === "engine_module") {
    const durationText = item.durationDays === 1
      ? "1 day"
      : `${item.durationDays} days`;

    embed.addFields(
      {
        name: "What It Does",
        value: "Activates **Pro Engine** for this server, unlocking all premium features for the duration.",
        inline: false,
      },
      {
        name: "How to Use",
        value: "1. Buy this item → goes to your inventory\n2. Activate it via " + inventoryCmd + "\n3. Pro Engine activates for **" + durationText + "**",
        inline: false,
      },
      {
        name: "Cost",
        value: `${currencyEmoji} **${item.cost}** ${currencyName}`,
        inline: true,
      },
      {
        name: "Duration",
        value: `**${durationText}**`,
        inline: true,
      },
      {
        name: "Your Balance",
        value: `${currencyEmoji} **${balance.toLocaleString()}** ${currencyName}`,
        inline: true,
      },
    );
  }

  embed.addFields({
    name: "Status",
    value: costStatus,
    inline: true,
  });

  return embed;
}

/**
 * Creates a list view embed showing all items (compact format)
 * @param {Array} items - All shop items
 * @param {Object} status - User's balance status
 * @param {number} page - Current page number (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {Object} client - Discord client
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.username] - User's name for author
 * @param {string} [options.avatarURL] - User's avatar URL
 * @param {Object} [options.stock] - Guild stock data
 * @param {Object} [options.sales] - Active sales data
 * @returns {EmbedBuilder} Discord embed object
 */
export function createShopListEmbed(items, status, page, totalPages, client, options = {}) {
  const { username, avatarURL, stock, sales, guildId } = options;
  const coreEmoji = emojiConfig.core;
  const sparkEmoji = emojiConfig.spark;

  const buyCmd = getMentionableCommand(client, "shop buy", guildId);

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle("Shop - Page " + page + "/" + totalPages)
    .setDescription("Buy Power Cells and Engine Modules with " + buyCmd);

  if (username && avatarURL) {
    embed.setAuthor({
      name: username,
      iconURL: avatarURL,
    });
  }

  // Build compact list
  const itemList = items.map(item => {
    const currencyEmoji = item.currency === "cores" ? coreEmoji : sparkEmoji;
    const stockInfo = stock?.[item.id];
    const stockText = stockInfo && stockInfo.remaining !== Infinity
      ? ` | ${stockInfo.remaining}/${stockInfo.total}`
      : "";

    // Check for sale
    const sale = sales?.[item.id];
    let priceText;
    if (sale) {
      const discountedPrice = sale.fixedPrice !== undefined
        ? sale.fixedPrice
        : Math.ceil(item.cost * (1 - sale.discountPercent / 100));
      priceText = `~~${item.cost.toLocaleString()}~~ **${discountedPrice.toLocaleString()}** 🔥`;
    } else {
      priceText = item.cost.toLocaleString();
    }

    if (item.type === "power_cell") {
      return `${item.emoji} **${item.name}** | ${currencyEmoji} ${priceText}${stockText}\n> Stores **${item.storedAmount} Cores** — trade or activate later`;
    } else {
      const durationText = item.durationDays === 1 ? "1 day" : `${item.durationDays} days`;
      return `${item.emoji} **${item.name}** | ${currencyEmoji} ${priceText}${stockText}\n> Activates **${durationText}** of Pro Engine`;
    }
  }).join("\n\n");

  embed.addFields({
    name: "\u200b",
    value: itemList,
    inline: false,
  });

  return embed;
}

/**
 * Creates a purchase success embed
 * @param {Object} item - Shop item
 * @param {number} totalCost - Total cost paid
 * @param {Object} client - Discord client
 * @returns {EmbedBuilder} Discord embed object
 */
export function createPurchaseSuccessEmbed(
  item,
  totalCost,
  _client,
) {
  const currencyEmoji = item.currency === "cores" ? emojiConfig.core : emojiConfig.spark;
  const currencyName = item.currency === "cores" ? "Cores" : "Sparks";

  return new EmbedBuilder()
    .setColor(THEME.SUCCESS)
    .setTitle("✅ Purchase Successful!")
    .setDescription(`Successfully purchased **${item.name}**!`)
    .addFields(
      {
        name: "Item",
        value: `${item.emoji} **${item.name}**`,
        inline: true,
      },
      {
        name: "Cost Paid",
        value: `${currencyEmoji} **${totalCost}** ${currencyName}`,
        inline: true,
      },
      {
        name: "Next Step",
        value: "Use `/inventory` to view and activate your item!",
        inline: false,
      },
    );
}

/**
 * Creates a purchase cancelled embed
 * @param {Object} client - Discord client
 * @returns {EmbedBuilder} Discord embed object
 */
export function createPurchaseCancelledEmbed(_client) {
  return new EmbedBuilder()
    .setColor(THEME.SECONDARY)
    .setTitle("❌ Purchase Cancelled")
    .setDescription("The purchase has been cancelled. No currency was deducted.");
}

/**
 * Creates a generic error embed
 * @param {string} description - Error description
 * @param {Object} client - Discord client
 * @returns {EmbedBuilder} Discord embed object
 */
export function createErrorEmbed(description, _client) {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle("❌ Error")
    .setDescription(description);
}
