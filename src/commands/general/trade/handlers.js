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
import { getMentionableCommand } from "../../../utils/commandUtils.js";
import {
  createTradeConfirmEmbed,
  createTradeSuccessEmbed,
  createErrorEmbed,
} from "./embeds.js";

const logger = getLogger();
const sparkShopManager = getSparkShopManager();

/**
 * Main execution handler for /trade command
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("discord.js").Client} _client
 */
export async function execute(interaction, _client) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser("user");
    const itemId = interaction.options.getString("item", true);

    // Cannot trade with yourself
    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({
        embeds: [createErrorEmbed("You cannot trade with yourself.", interaction.client)],
        components: [],
      });
      return;
    }

    // Cannot trade with bots
    if (targetUser.bot) {
      await interaction.editReply({
        embeds: [createErrorEmbed("You cannot trade with bot accounts.", interaction.client)],
        components: [],
      });
      return;
    }

    // Check if user has the item in inventory
    const inventory = await sparkShopManager.getInventory(interaction.user.id);
    const rawItem = inventory.items.find(i => i.itemId === itemId && !i.used);

    if (!rawItem) {
      const inventoryCommand = getMentionableCommand(interaction.client, "inventory", interaction.guildId);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Item not found in your inventory. Use ${inventoryCommand} view to see available items.`,
            interaction.client,
          ),
        ],
        components: [],
      });
      return;
    }

    // Enrich item with fresh shop data
    const shopItem = getShopItem(itemId);
    const item = {
      ...rawItem,
      name: shopItem?.name || "Unknown Item",
      description: shopItem?.description || "",
      emoji: shopItem?.emoji || "❓",
      type: shopItem?.type || "unknown",
      category: shopItem?.category || "unknown",
      currency: shopItem?.currency || "unknown",
      cost: shopItem?.cost || 0,
      storedAmount: shopItem?.storedAmount || 0,
      durationDays: shopItem?.durationDays || 0,
    };

    // Show confirmation
    const confirmEmbed = createTradeConfirmEmbed(
      item,
      targetUser,
      interaction.client,
      {
        username: interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL(),
      },
    );

    const confirmId = `confirm_trade_${interaction.id}`;
    const cancelId = `cancel_trade_${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel("Confirm Trade")
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

    // Collect button response (30 second timeout)
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
          embeds: [createErrorEmbed("Trade cancelled.", interaction.client)],
          components: [],
        });
        return;
      }

      // Process trade
      const result = await sparkShopManager.tradeItem(
        interaction.user.id,
        targetUser.id,
        itemId,
      );

      if (!result.success) {
        await interaction.editReply({
          embeds: [createErrorEmbed(result.message, interaction.client)],
          components: [],
        });
        return;
      }

      const successEmbed = createTradeSuccessEmbed(
        item,
        targetUser,
        interaction.client,
        {
          username: interaction.user.username,
          avatarURL: interaction.user.displayAvatarURL(),
          guildId: interaction.guildId,
        },
      );

      await interaction.editReply({
        embeds: [successEmbed],
        components: [],
      });

      logger.info(
        `🔄 Trade: ${interaction.user.username} traded ${item.name} to ${targetUser.username}`,
      );
    } catch (_e) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Confirmation timed out.", interaction.client)],
        components: [],
      });
    }
  } catch (error) {
    logger.error(`Error in /trade command:`, error);
    const errorMsg = "An unexpected error occurred while processing `/trade`.";
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
