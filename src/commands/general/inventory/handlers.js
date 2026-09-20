import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { getSparkShopManager } from "../../../features/spark-shop/SparkShopManager.js";
import { getShopItem } from "../../../config/shopConfig.js";
import {
  createInventoryEmbed,
  createItemDetailEmbed,
  createUseConfirmEmbed,
  createUseSuccessEmbed,
  createErrorEmbed,
} from "./embeds.js";

const logger = getLogger();
const sparkShopManager = getSparkShopManager();

/**
 * Main execution handler for /inventory command
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("discord.js").Client} _client
 */
export async function execute(interaction, _client) {
  let subcommand = "view";

  try {
    subcommand = interaction.options.getSubcommand() || "view";

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    switch (subcommand) {
      case "use":
        await handleUse(interaction);
        break;

      case "view":
      default:
        await handleView(interaction);
        break;
    }
  } catch (error) {
    logger.error(`Error in /inventory command (${subcommand}):`, error);
    const errorMsg = "An unexpected error occurred while processing `/inventory`.";
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
 * Enrich inventory items with fresh data from SHOP_ITEMS
 * @param {Array} items - Raw inventory items from database
 * @returns {Array} Enriched items with shop data
 */
function enrichItems(items) {
  return items.map(item => {
    const shopItem = getShopItem(item.itemId);
    if (!shopItem) {
      return { ...item, name: "Unknown Item", emoji: "❓", type: "unknown" };
    }
    return {
      ...item,
      name: shopItem.name,
      description: shopItem.description,
      emoji: shopItem.emoji,
      type: shopItem.type,
      category: shopItem.category,
      currency: shopItem.currency,
      cost: shopItem.cost,
      storedAmount: shopItem.storedAmount || 0,
      durationDays: shopItem.durationDays || 0,
    };
  });
}

/**
 * Handles /inventory view — shows all items in inventory
 */
async function handleView(interaction) {
  const inventory = await sparkShopManager.getInventory(interaction.user.id);
  const enrichedItems = enrichItems(inventory.items);

  if (enrichedItems.length === 0) {
    const embed = createInventoryEmbed([], interaction.client, {
      username: interaction.user.username,
      avatarURL: interaction.user.displayAvatarURL(),
      guildId: interaction.guildId,
    });

    await interaction.editReply({
      embeds: [embed],
      components: [],
    });
    return;
  }

  let currentIndex = 0;

  const createComponents = (idx, total) => {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("inv_prev")
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(idx === 0),
      new ButtonBuilder()
        .setCustomId("inv_use")
        .setLabel("Use Item")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("inv_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(idx === total - 1),
    );

    return [navRow];
  };

  const embed = createItemDetailEmbed(
    enrichedItems[currentIndex],
    currentIndex,
    enrichedItems.length,
    inventory,
    interaction.client,
    {
      username: interaction.user.username,
      avatarURL: interaction.user.displayAvatarURL(),
    },
  );

  const response = await interaction.editReply({
    embeds: [embed],
    components: createComponents(currentIndex, enrichedItems.length),
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: i => i.user.id === interaction.user.id,
  });

  collector.on("collect", async buttonInteraction => {
    await buttonInteraction.deferUpdate();

    const { customId } = buttonInteraction;

    if (customId === "inv_prev" && currentIndex > 0) {
      currentIndex--;
    } else if (customId === "inv_next" && currentIndex < enrichedItems.length - 1) {
      currentIndex++;
    } else if (customId === "inv_use") {
      const item = enrichedItems[currentIndex];
      await processUse(interaction, item);
      collector.stop("used");
      return;
    }

    const updatedEmbed = createItemDetailEmbed(
      enrichedItems[currentIndex],
      currentIndex,
      enrichedItems.length,
      inventory,
      interaction.client,
      {
        username: interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL(),
      },
    );

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: createComponents(currentIndex, enrichedItems.length),
    });
  });

  collector.on("end", async () => {
    const disabledNav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("inv_prev")
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("inv_use")
        .setLabel("Use Item")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("inv_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    await interaction.editReply({ components: [disabledNav] });
  });
}

/**
 * Handles /inventory use — activate an item
 */
async function handleUse(interaction) {
  const itemId = interaction.options.getString("item", true);
  const inventory = await sparkShopManager.getInventory(interaction.user.id);

  const item = inventory.items.find(i => i.itemId === itemId && !i.used);
  if (!item) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Item not found in your inventory. Use `/inventory view` to see available items.",
          interaction.client,
        ),
      ],
      components: [],
    });
    return;
  }

  const enrichedItem = enrichItems([item])[0];
  await processUse(interaction, enrichedItem);
}

/**
 * Process using an item with confirmation
 */
async function processUse(interaction, item) {
  const confirmEmbed = createUseConfirmEmbed(
    item,
    interaction.client,
    {
      username: interaction.user.username,
      avatarURL: interaction.user.displayAvatarURL(),
    },
  );

  const confirmId = `confirm_use_${interaction.id}`;
  const cancelId = `cancel_use_${interaction.id}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm Use")
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
      await interaction.editReply({
        embeds: [createErrorEmbed("Item use cancelled.", interaction.client)],
        components: [],
      });
      return;
    }

    // Use the item
    const result = await sparkShopManager.useInventoryItem(
      interaction.user.id,
      interaction.guildId,
      item.itemId,
    );

    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.message, interaction.client)],
        components: [],
      });
      return;
    }

    const successEmbed = createUseSuccessEmbed(
      item,
      result,
      interaction.client,
      {
        username: interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL(),
      },
    );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });
  } catch (_e) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Confirmation timed out.", interaction.client)],
      components: [],
    });
  }
}
