import { getLogger } from "../../logger.js";
import { getDatabaseManager } from "../../storage/databaseManager.js";
import { errorEmbed } from "../../discord/responseMessages.js";
import { hasAdminPermissions } from "../../discord/permissions.js";

/**
 * Handle goodbye channel selection
 * @param {import('discord.js').AnySelectMenuInteraction} interaction
 */
export async function handleGoodbyeChannelSelect(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (
      !hasAdminPermissions(
        /** @type {import('discord.js').GuildMember} */ (interaction.member),
      )
    ) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to configure the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
      );
    }

    await interaction.deferUpdate();

    const selectedChannelId = interaction.values[0];
    const selectedChannel =
      interaction.guild.channels.cache.get(selectedChannelId);

    if (!selectedChannel) {
      return interaction.editReply(
        errorEmbed({
          title: "Channel Not Found",
          description:
            "The selected channel no longer exists or is not accessible.",
          solution: "Please try selecting a different channel.",
        }),
      );
    }

    // Check bot permissions in the selected channel
    const botMember = interaction.guild.members.me;
    const channelPermissions = selectedChannel.permissionsFor(botMember);

    if (!channelPermissions?.has("SendMessages")) {
      return interaction.editReply(
        errorEmbed({
          title: "Permission Error",
          description: `I don't have permission to send messages in ${selectedChannel.toString()}`,
          solution:
            "Please grant me Send Messages permission in the selected channel.",
        }),
      );
    }

    // Get current settings and update with selected channel
    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Update settings with selected channel
    const updatedSettings = {
      ...currentSettings,
      channelId: selectedChannelId,
    };

    await dbManager.goodbyeSettings.set(interaction.guild.id, updatedSettings);

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

    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye channel selected: #${selectedChannel.name} by ${interaction.user.tag} in ${interaction.guild.name}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeChannelSelect:", error);
    await interaction.reply(
      errorEmbed({
        title: "Selection Error",
        description: "Failed to process channel selection.",
        solution: "Please try again or contact support if the issue persists.",
      }),
    );
  }
}
