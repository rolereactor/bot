import { MessageFlags } from "discord.js";
import { getLogger } from "../../logger.js";
import { getDatabaseManager } from "../../storage/databaseManager.js";
import { errorEmbed } from "../../discord/responseMessages.js";
import { hasAdminPermissions } from "../../discord/permissions.js";
import { validateModalInput } from "../../validation/formValidation.js";
import { INPUT_LIMITS } from "../../validation/inputValidation.js";
import { EMOJIS } from "../../../config/theme.js";

/**
 * Handle goodbye configuration modal submission
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleGoodbyeConfigModal(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to configure the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: MessageFlags.Ephemeral },
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get form data
    const rawMessageInput =
      interaction.fields.getTextInputValue("goodbye_message");

    const messageValidation = validateModalInput(
      rawMessageInput,
      "Goodbye Message",
      {
        required: false,
        maxLength: INPUT_LIMITS.MESSAGE_CONTENT,
        stripHtml: true,
        removeScripts: true,
      },
    );

    if (!messageValidation.valid) {
      return interaction.editReply({
        embeds: [messageValidation.error],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sanitizedMessage = messageValidation.sanitized;

    // Get current settings to preserve other values
    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Update only the message, preserve other settings
    const newSettings = {
      ...currentSettings,
      message:
        sanitizedMessage ||
        `**{user}** left the server\nThanks for being part of **{server}**! ${EMOJIS.ACTIONS.WAVE}`,
      updatedAt: new Date(),
    };

    await dbManager.goodbyeSettings.set(interaction.guild.id, newSettings);

    // Get updated settings for display
    const updatedSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Return to configuration page with updated settings
    const { createGoodbyeConfigPageEmbed } = await import(
      "../../../commands/admin/goodbye/modals.js"
    );
    const { createGoodbyeConfigPageComponents } = await import(
      "../../../commands/admin/goodbye/components.js"
    );

    const embed = createGoodbyeConfigPageEmbed(interaction, updatedSettings);
    const components = createGoodbyeConfigPageComponents(
      interaction.guild,
      updatedSettings,
    );

    // Update the original message
    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye message configured via modal by ${interaction.user.tag} in ${interaction.guild.name}`,
      {
        messageLength: sanitizedMessage?.length || 0,
      },
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeConfigModal:", error);
    await interaction.editReply(
      errorEmbed({
        title: "Configuration Error",
        description: "Failed to save goodbye configuration.",
        solution: "Please try again or contact support if the issue persists.",
      }),
    );
  }
}
