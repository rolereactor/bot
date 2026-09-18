import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { getStorageManager } from "../../../utils/storage/storageManager.js";
import { PremiumManager } from "../../../features/premium/PremiumManager.js";
import { getSparkShopManager } from "../../../features/spark-shop/SparkShopManager.js";
import {
  createStatusEmbed,
  createVaultEmbed,
  createMeEmbed,
  createFuelersEmbed,
  createFuelConfirmationEmbed,
  createFuelCancelledEmbed,
  createFuelSuccessEmbed,
} from "./embeds.js";

const logger = getLogger();
const premiumManager = new PremiumManager();
const sparkShopManager = getSparkShopManager();

/**
 * Main execution handler for /engine command
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("discord.js").Client} client
 */
export async function execute(interaction, client) {
  if (!interaction.guildId) {
    await interaction.reply({
      content:
        "❌ The `/engine` command can only be used inside a Discord server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let subcommand = "unknown";

  try {
    subcommand = interaction.options.getSubcommand();

    // Defer immediately to beat Discord's 3-second acknowledgement window.
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    switch (subcommand) {
      case "status":
        await handleStatus(interaction, client);
        break;

      case "vault":
        await handleVault(interaction, client);
        break;

      case "me":
        await handleMe(interaction, client);
        break;

      case "fuelers":
        await handleFuelers(interaction, client);
        break;

      case "fuel":
        await handleFuel(interaction, client);
        break;

      default:
        await interaction.editReply({ content: "Unknown subcommand." });
        break;
    }
  } catch (error) {
    // [10062] = Unknown interaction (expired token). Nothing we can do — swallow silently.
    if (error?.code === 10062) {
      logger.warn(
        `/engine interaction expired before response (${subcommand})`,
      );
      return;
    }
    logger.error(`Error in /engine command (${subcommand}):`, error);
    const errorMsg = "An unexpected error occurred while processing `/engine`.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `❌ ${errorMsg}`,
        components: [],
      });
    } else {
      await interaction.reply({
        content: `❌ ${errorMsg}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handles /engine status
 */
async function handleStatus(interaction, client) {
  const guildId = interaction.guildId;
  const storage = await getStorageManager();
  const db = storage.dbManager;

  const isPro = await premiumManager.isFeatureActive(guildId, "pro_engine");
  const sub = await premiumManager.getSubscriptionStatus(guildId, "pro_engine");
  const isSparkPro = await sparkShopManager.hasSparkPro(guildId);
  const sparkProSub = await premiumManager.getSubscriptionStatus(
    guildId,
    "spark_pro",
  );
  const vaultData = db?.guildSettings
    ? await db.guildSettings.getVaultData(guildId)
    : { balance: 0, history: [] };

  const embed = createStatusEmbed({
    guild: interaction.guild,
    isPro,
    sub,
    vaultData,
    client,
    isSparkPro,
    sparkProSub,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles /engine vault
 */
async function handleVault(interaction, client) {
  const guildId = interaction.guildId;
  const storage = await getStorageManager();
  const db = storage.dbManager;

  const vaultData = db?.guildSettings
    ? await db.guildSettings.getVaultData(guildId)
    : { balance: 0, history: [] };

  const embed = createVaultEmbed({
    guild: interaction.guild,
    vaultData,
    client,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles /engine me
 */
async function handleMe(interaction, client) {
  const guildId = interaction.guildId;
  const storage = await getStorageManager();
  const db = storage.dbManager;

  const vaultData = db?.guildSettings
    ? await db.guildSettings.getVaultData(guildId)
    : { balance: 0, history: [] };

  const embed = createMeEmbed({
    guild: interaction.guild,
    user: interaction.user,
    vaultData,
    client,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles /engine fuelers
 */
async function handleFuelers(interaction, client) {
  const guildId = interaction.guildId;
  const storage = await getStorageManager();
  const db = storage.dbManager;

  const vaultData = db?.guildSettings
    ? await db.guildSettings.getVaultData(guildId)
    : { balance: 0, history: [] };

  const embed = createFuelersEmbed({
    guild: interaction.guild,
    vaultData,
    client,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles /engine fuel
 */
async function handleFuel(interaction, client) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const amount = interaction.options.getNumber("cores", true);

  if (amount < 1) {
    await interaction.editReply({
      content: "❌ You must deposit at least **1 Core**.",
    });
    return;
  }

  // Pre-flight balance check before showing confirmation prompt
  const storage = await getStorageManager();
  let userBalance = null;
  if (storage?.dbManager?.coreCredits) {
    try {
      const creditData = await storage.getCoreCredits(userId);
      userBalance = Math.round((creditData?.credits || 0) * 100) / 100;
      if (userBalance < amount) {
        await interaction.editReply({
          content: `❌ Insufficient Cores. You have **${userBalance.toFixed(2)} Cores**, but tried to deposit **${amount.toFixed(2)} Cores**.`,
        });
        return;
      }
    } catch (_err) {
      // Ignore pre-check fetch error, PremiumManager will handle error if balance fails
    }
  }

  const confirmEmbed = createFuelConfirmationEmbed({
    guild: interaction.guild,
    user: interaction.user,
    amount,
    userBalance,
    client,
  });

  const confirmId = `confirm_fuel_${interaction.id}`;
  const cancelId = `cancel_fuel_${interaction.id}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm Fueling")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⛽"),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️"),
  );

  const response = await interaction.editReply({
    embeds: [confirmEmbed],
    components: [row],
  });

  // Collect button response (30 second timeout)
  try {
    const confirmation = await response.awaitMessageComponent({
      filter: i =>
        i.user.id === userId &&
        (i.customId === confirmId || i.customId === cancelId),
      componentType: ComponentType.Button,
      time: 30000,
    });

    await confirmation.deferUpdate();

    if (confirmation.customId === cancelId) {
      const cancelEmbed = createFuelCancelledEmbed(interaction.user, client);
      await interaction.editReply({
        embeds: [cancelEmbed],
        components: [],
      });
      return;
    }

    // Process actual deposit after confirmation
    const result = await premiumManager.depositToGuildVault(
      guildId,
      userId,
      amount,
      username,
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`,
        embeds: [],
        components: [],
      });
      return;
    }

    const successEmbed = createFuelSuccessEmbed({
      guild: interaction.guild,
      user: interaction.user,
      amount,
      newVaultBalance: result.newVaultBalance,
      client,
    });

    // Update ephemeral interaction response
    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });

    // Also post public announcement in channel so the community can celebrate!
    if (interaction.channel && typeof interaction.channel.send === "function") {
      interaction.channel
        .send({
          embeds: [successEmbed],
        })
        .catch(() => {});
    }
  } catch (_e) {
    // Collector timed out or failed
    const cancelEmbed = createFuelCancelledEmbed(interaction.user, client);
    cancelEmbed.setDescription(
      "⏱️ Confirmation timed out. Fueling was not processed.",
    );
    await interaction
      .editReply({
        embeds: [cancelEmbed],
        components: [],
      })
      .catch(() => {});
  }
}
