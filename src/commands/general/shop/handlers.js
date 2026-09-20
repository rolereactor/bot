import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { emojiConfig } from "../../../config/emojis.js";
import { THEME } from "../../../config/theme.js";
import { getSparkShopManager } from "../../../features/spark-shop/SparkShopManager.js";
import { getSaleManager } from "../../../features/sales/SaleManager.js";
import { getShopItems } from "../../../config/shopConfig.js";
import {
  createShopListEmbed,
  createPurchaseSuccessEmbed,
  createPurchaseCancelledEmbed,
  createErrorEmbed,
} from "./embeds.js";

const logger = getLogger();
const sparkShopManager = getSparkShopManager();
const saleManager = getSaleManager();

/**
 * Main execution handler for /shop command
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("discord.js").Client} _client
 */
export async function execute(interaction, _client) {
  let subcommand = "browse";

  try {
    subcommand = interaction.options.getSubcommand() || "browse";

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    switch (subcommand) {
      case "browse":
        await handleBrowse(interaction);
        break;

      case "buy":
        await handleBuy(interaction);
        break;

      default:
        await handleBrowse(interaction);
        break;
    }
  } catch (error) {
    logger.error(`Error in /shop command (${subcommand}):`, error);
    const errorMsg = "An unexpected error occurred while processing `/shop`.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        embeds: [createErrorEmbed(errorMsg, interaction.client)],
        components: [],
      });
    } else {
      await interaction.reply({
        embeds: [createErrorEmbed(errorMsg, interaction.client)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handles /shop browse — shows all items in a compact list with pagination
 */
async function handleBrowse(interaction) {
  const items = getShopItems();
  const status = await sparkShopManager.getUserStatus(interaction.user.id);
  const stock = await sparkShopManager.getGuildStock(interaction.guildId);

  // Fetch active sales and build a lookup map
  const activeSales = await saleManager.getActiveSales(interaction.guildId);
  const sales = {};
  for (const sale of activeSales) {
    sales[sale.itemId] = sale;
  }

  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  let currentPage = 0;

  const createComponents = (page) => {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shop_prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("shop_next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1),
    );

    return [navRow];
  };

  const getEmbed = (page) => {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = items.slice(start, end);

    return createShopListEmbed(pageItems, status, page + 1, totalPages, interaction.client, {
      username: interaction.user.username,
      avatarURL: interaction.user.displayAvatarURL(),
      stock,
      sales,
      guildId: interaction.guildId,
    });
  };

  const response = await interaction.editReply({
    embeds: [getEmbed(currentPage)],
    components: createComponents(currentPage),
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
  });

  collector.on("collect", async buttonInteraction => {
    await buttonInteraction.deferUpdate();

    const { customId } = buttonInteraction;

    if (customId === "shop_prev" && currentPage > 0) {
      currentPage--;
    } else if (customId === "shop_next" && currentPage < totalPages - 1) {
      currentPage++;
    }

    const updatedStatus = await sparkShopManager.getUserStatus(interaction.user.id);
    const updatedStock = await sparkShopManager.getGuildStock(interaction.guildId);

    // Refresh sales data
    const updatedActiveSales = await saleManager.getActiveSales(interaction.guildId);
    const updatedSales = {};
    for (const sale of updatedActiveSales) {
      updatedSales[sale.itemId] = sale;
    }

    const updatedEmbed = createShopListEmbed(
      items.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE),
      updatedStatus,
      currentPage + 1,
      totalPages,
      interaction.client,
      {
        username: interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL(),
        stock: updatedStock,
        sales: updatedSales,
        guildId: interaction.guildId,
      },
    );

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: createComponents(currentPage),
    });
  });
}

/**
 * Handles /shop buy — purchase an item via slash command
 */
async function handleBuy(interaction) {
  const itemId = interaction.options.getString("item", true);
  await processPurchase(interaction, itemId);
}

/**
 * Process a purchase with confirmation
 */
async function processPurchase(interaction, itemId) {
  const { getShopItem } = await import("../../../config/shopConfig.js");
  const item = getShopItem(itemId);

  if (!item) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Invalid item.", interaction.client)],
      components: [],
    });
    return;
  }

  const status = await sparkShopManager.getUserStatus(interaction.user.id);
  const balance = item.currency === "cores" ? status.cores : status.sparks;

  if (balance < item.cost) {
    const currencyName = item.currency === "cores" ? "Cores" : "Sparks";
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          `Insufficient ${currencyName}. You need **${item.cost} ${currencyName}**, but you only have **${balance} ${currencyName}**.`,
          interaction.client,
        ),
      ],
      components: [],
    });
    return;
  }

  // Show confirmation
  const confirmEmbed = createPurchaseConfirmEmbed(item, status, interaction.client, {
    username: interaction.user.username,
    avatarURL: interaction.user.displayAvatarURL(),
  });

  const confirmId = `confirm_shop_${interaction.id}`;
  const cancelId = `cancel_shop_${interaction.id}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm Purchase")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
  );

  const response = await interaction.editReply({
    embeds: [confirmEmbed],
    components: [row],
  });

  try {
    const confirmation = await response.awaitMessageComponent({
      filter: i =>
        i.user.id === interaction.user.id &&
        (i.customId === confirmId || i.customId === cancelId),
      componentType: ComponentType.Button,
      time: 30000,
    });

    await confirmation.deferUpdate();

    if (confirmation.customId === cancelId) {
      const cancelEmbed = createPurchaseCancelledEmbed(interaction.client);
      await interaction.editReply({
        embeds: [cancelEmbed],
        components: [],
      });
      return;
    }

    // Process purchase
    const result = await sparkShopManager.purchase(
      interaction.user.id,
      interaction.guildId,
      itemId,
    );

    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.message, interaction.client)],
        components: [],
      });
      return;
    }

    const successEmbed = createPurchaseSuccessEmbed(
      item,
      item.cost,
      interaction.client,
    );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });

    logger.info(
      `🛒 Shop: ${interaction.user.username} purchased ${item.name} for ${item.cost} ${item.currency}`,
    );
  } catch (_e) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Confirmation timed out.", interaction.client)],
      components: [],
    });
  }
}

/**
 * Creates a purchase confirmation embed
 */
function createPurchaseConfirmEmbed(item, status, client, options = {}) {
  const { username, avatarURL } = options;
  const coreEmoji = emojiConfig.core;
  const sparkEmoji = emojiConfig.spark;

  const currencyEmoji = item.currency === "cores" ? coreEmoji : sparkEmoji;
  const currencyName = item.currency === "cores" ? "Cores" : "Sparks";
  const balance = item.currency === "cores" ? status.cores : status.sparks;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle("🛒 Confirm Purchase")
    .setDescription(`Are you sure you want to purchase **${item.name}**?`);

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
      name: "Cost",
      value: `${currencyEmoji} **${item.cost}** ${currencyName}`,
      inline: true,
    },
    {
      name: "Your Balance",
      value: `${currencyEmoji} **${balance.toLocaleString()}** ${currencyName}`,
      inline: true,
    },
  );

  if (item.type === "power_cell") {
    embed.addFields({
      name: "Stores",
      value: `**${item.storedAmount} Cores** (can be activated later)`,
      inline: false,
    });
  } else if (item.type === "engine_module") {
    embed.addFields({
      name: "Duration",
      value: `**${item.durationDays} day${item.durationDays !== 1 ? "s" : ""}** of Pro access`,
      inline: false,
    });
  }

  return embed.setTimestamp();
}
