import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import {
  botHasRequiredPermissions,
  getMissingBotPermissions,
  formatPermissionName,
} from "../../../utils/discord/permissions.js";
import { getDatabaseManager } from "../../../utils/storage/databaseManager.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";
import { createGoodbyeSettingsEmbed } from "./embeds.js";
import { createGoodbyeSettingsComponents } from "./components.js";
import { validateGoodbyeInputs, processGoodbyeSettings } from "./utils.js";

/**
 * Handle the goodbye setup logic
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} _client
 */
export async function handleSetup(interaction, _client) {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!botHasRequiredPermissions(interaction.guild)) {
      const missingPermissions = getMissingBotPermissions(interaction.guild);
      const permissionNames = missingPermissions
        .map(formatPermissionName)
        .join(", ");

      return interaction.editReply(
        errorEmbed({
          title: "Missing Bot Permissions",
          description: `I need the following permissions to configure the goodbye system: **${permissionNames}**`,
          solution:
            "Please ask a server administrator to grant me these permissions and try again.",
          fields: [
            {
              name: "🔧 How to Fix",
              value:
                "Go to Server Settings → Roles → Find my role → Enable the missing permissions",
              inline: false,
            },
            {
              name: "📋 Required Permissions",
              value: "• Send Messages (to send goodbye messages)",
              inline: false,
            },
          ],
        }),
      );
    }

    const channel = interaction.options.getChannel("channel");
    const message = interaction.options.getString("message");
    const enabled = interaction.options.getBoolean("enabled");
    const embedFormat = interaction.options.getBoolean("embed");

    const validation = validateGoodbyeInputs({
      channel,
      message,
      enabled,
      embed: embedFormat,
    });

    if (!validation.valid) {
      return interaction.editReply(
        errorEmbed({
          title: "Invalid Input",
          description: validation.reason,
          solution: "Please correct the input and try again.",
        }),
      );
    }

    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const newSettings = processGoodbyeSettings(currentSettings, {
      channel,
      message,
      enabled,
      embed: embedFormat,
    });

    await dbManager.goodbyeSettings.set(interaction.guild.id, newSettings);

    const updatedSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const embed = createGoodbyeSettingsEmbed(
      interaction,
      updatedSettings,
      channel,
    );

    const components = createGoodbyeSettingsComponents(updatedSettings);

    const dashboardRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://rolereactor.xyz/dashboard/${interaction.guild.id}`),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [...components.map(c => c.toJSON()), dashboardRow.toJSON()],
    });

    const duration = Date.now() - startTime;
    logger.info(
      `Goodbye system configured for ${interaction.guild.name} (${interaction.guild.id}) by ${interaction.user.tag} (${duration}ms)`,
    );
  } catch (error) {
    logger.error("Error in handleSetup:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to configure goodbye system.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle the goodbye settings logic
 * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} _client
 */
export async function handleSettings(interaction, _client) {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get database manager
    const dbManager = await getDatabaseManager();

    if (!dbManager.goodbyeSettings) {
      return interaction.editReply(
        errorEmbed({
          title: "Database Error",
          description: "Goodbye settings repository is not available.",
          solution: "Please try again later or contact support.",
        }),
      );
    }

    // Get current settings
    const settings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Get goodbye channel
    const goodbyeChannel = settings.channelId
      ? interaction.guild.channels.cache.get(settings.channelId)
      : null;

    // Create response embed
    const embed = createGoodbyeSettingsEmbed(
      interaction,
      settings,
      goodbyeChannel,
    );

    // Create components
    const components = createGoodbyeSettingsComponents(settings);

    // Send response
    await interaction.editReply({
      embeds: [embed],
      components,
    });

    // Log the activity
    logger.info(
      `Goodbye settings viewed by ${interaction.user.tag} (${interaction.user.id}) in ${interaction.guild.name} (${interaction.guild.id}) (${Date.now() - startTime}ms)`,
    );
  } catch (error) {
    logger.error(
      `Failed to view goodbye settings for ${interaction.guild.name}`,
      error,
    );
    await interaction.editReply(
      errorEmbed({
        title: "Settings Error",
        description: "An error occurred while retrieving goodbye settings.",
        solution: "Please try again or contact support if the issue persists.",
      }),
    );
  }
}
