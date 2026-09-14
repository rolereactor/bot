import {
  MessageFlags,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getLogger } from "../../logger.js";
import { getDatabaseManager } from "../../storage/databaseManager.js";
import { errorEmbed } from "../../discord/responseMessages.js";
import { hasAdminPermissions } from "../../discord/permissions.js";
import { EMOJIS, THEME } from "../../../config/theme.js";
import { createGoodbyeSettingsEmbed } from "../../../commands/admin/goodbye/embeds.js";
import { createGoodbyeSettingsComponents } from "../../../commands/admin/goodbye/components.js";
import {
  createGoodbyeEmbed,
  processGoodbyeMessage,
} from "../../discord/goodbyeUtils.js";

/**
 * Handle goodbye configure button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeConfigure(interaction) {
  const logger = getLogger();

  try {
    // Defer the interaction immediately to prevent timeout
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    }

    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.editReply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to configure the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
      );
    }

    // Get current settings
    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Create and show the configuration page
    const { createGoodbyeConfigPageEmbed } = await import(
      "../../../commands/admin/goodbye/modals.js"
    );
    const { createGoodbyeConfigPageComponents } = await import(
      "../../../commands/admin/goodbye/components.js"
    );

    const embed = createGoodbyeConfigPageEmbed(interaction, currentSettings);
    const components = createGoodbyeConfigPageComponents(
      interaction.guild,
      currentSettings,
    );

    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye configuration page displayed for guild ${interaction.guild.name} by user ${interaction.user.tag}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeConfigure:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to process configure request.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye configure message button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeConfigureMessage(interaction) {
  const logger = getLogger();

  try {
    // Check permissions first before any interaction handling
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to configure the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
      );
    }

    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Create and show the message configuration modal
    const { createGoodbyeConfigModal } = await import(
      "../../../commands/admin/goodbye/modals.js"
    );
    const modal = createGoodbyeConfigModal(currentSettings);

    await interaction.showModal(modal);

    logger.info(
      `Goodbye message configuration modal displayed for guild ${interaction.guild.name} by user ${interaction.user.tag}`,
    );
  } catch (error) {
    logger.error(
      "Error displaying goodbye message configuration modal:",
      error,
    );

    // Only reply if we haven't already replied
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        errorEmbed({
          title: "Error",
          description: "Failed to display goodbye message configuration modal.",
          solution:
            "Please try again or contact support if the issue persists.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye select channel button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeSelectChannel(interaction) {
  const logger = getLogger();

  try {
    // Defer the interaction immediately to prevent timeout
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    }

    // Get available text channels
    const textChannels = interaction.guild.channels.cache
      .filter(channel => channel.type === 0)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
      }))
      .slice(0, 25); // Discord limit

    if (textChannels.length === 0) {
      return interaction.editReply(
        errorEmbed({
          title: "No Channels Available",
          description: "No text channels found in this server.",
          solution: "Create a text channel first, then try again.",
        }),
      );
    }

    // Get current settings to set default selection
    const dbManager = await getDatabaseManager();
    const settings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const embed = {
      title: "Select a channel for goodbye messages",
      description:
        "Choose where goodbye messages will be sent when members leave your server.",
      color: THEME.PRIMARY,
      fields: [
        {
          name: `${EMOJIS.ACTIONS.INSTRUCTIONS} Instructions`,
          value:
            "Select a channel from the dropdown below. This will be where goodbye messages are sent.",
          inline: false,
        },
      ],
    };

    // Create select options with current channel marked
    const selectOptions = textChannels.map(channel => ({
      label: `#${channel.name}`,
      value: channel.id,
      emoji: EMOJIS.UI.CHANNELS,
      default: settings.channelId === channel.id,
    }));

    // Add current channel if it's not in the list
    if (
      settings.channelId &&
      !selectOptions.find(opt => opt.value === settings.channelId)
    ) {
      const currentChannel = interaction.guild.channels.cache.get(
        settings.channelId,
      );
      if (currentChannel) {
        selectOptions.unshift({
          label: `#${currentChannel.name} (Current)`,
          value: settings.channelId,
          emoji: EMOJIS.UI.CHANNELS,
          default: true,
        });
      }
    }

    const channelSelectMenu = new StringSelectMenuBuilder()
      .setCustomId("goodbye_channel_select")
      .setPlaceholder("Select a channel for goodbye messages")
      .addOptions(selectOptions);

    // Create action rows
    const selectRow = new ActionRowBuilder().addComponents(channelSelectMenu);
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("goodbye_back_to_settings")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJIS.ACTIONS.BACK),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [selectRow, backButton],
    });

    logger.info(
      `Channel selection displayed for guild ${interaction.guild.name} by user ${interaction.user.tag}`,
    );
  } catch (error) {
    logger.error("Error displaying channel configuration:", error);

    // Only reply if we haven't already replied
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        errorEmbed({
          title: "Error",
          description: "Failed to display channel configuration.",
          solution:
            "Please try again or contact support if the issue persists.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye reset button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeReset(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to reset the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: [MessageFlags.Ephemeral] },
      );
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const dbManager = await getDatabaseManager();

    // Reset to default settings
    const defaultSettings = {
      guildId: interaction.guild.id,
      enabled: false,
      channelId: null,
      message: `**{user}** left the server\nThanks for being part of **{server}**! ${EMOJIS.ACTIONS.WAVE}`,
      embedEnabled: true,
      embedColor: THEME.PRIMARY,
      embedTitle: `${EMOJIS.ACTIONS.GOODBYE} Goodbye from {server}!`,
      embedDescription: "Thanks for being part of our community!",
      embedThumbnail: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dbManager.goodbyeSettings.set(interaction.guild.id, defaultSettings);

    // Get updated settings
    const updatedSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const goodbyeChannel = updatedSettings.channelId
      ? interaction.guild.channels.cache.get(updatedSettings.channelId)
      : null;

    const embed = createGoodbyeSettingsEmbed(
      interaction,
      updatedSettings,
      goodbyeChannel,
    );

    const components = createGoodbyeSettingsComponents(updatedSettings);

    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye system reset by ${interaction.user.tag} in ${interaction.guild.name}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeReset:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to reset goodbye system.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye system toggle
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeToggle(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to toggle the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: [MessageFlags.Ephemeral] },
      );
    }

    await interaction.deferUpdate();

    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Prevent enabling without a channel configured
    if (!currentSettings.enabled && !currentSettings.channelId) {
      return interaction.editReply(
        errorEmbed({
          title: "Channel Required",
          description:
            "Please configure a goodbye channel first before enabling.",
          solution: "Use the Configure button to set a channel.",
        }),
      );
    }

    // Toggle the enabled state
    const newSettings = {
      ...currentSettings,
      enabled: !currentSettings.enabled,
      updatedAt: new Date(),
    };

    await dbManager.goodbyeSettings.set(interaction.guild.id, newSettings);

    // Get updated settings
    const updatedSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const goodbyeChannel = updatedSettings.channelId
      ? interaction.guild.channels.cache.get(updatedSettings.channelId)
      : null;

    const embed = createGoodbyeSettingsEmbed(
      interaction,
      updatedSettings,
      goodbyeChannel,
    );

    const components = createGoodbyeSettingsComponents(updatedSettings);

    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye system ${updatedSettings.enabled ? "enabled" : "disabled"} by ${interaction.user.tag} in ${interaction.guild.name}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeToggle:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to toggle goodbye system.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye format toggle
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeFormat(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to change the goodbye format.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: [MessageFlags.Ephemeral] },
      );
    }

    await interaction.deferUpdate();

    const dbManager = await getDatabaseManager();
    const currentSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    // Toggle the embed format
    const newSettings = {
      ...currentSettings,
      embedEnabled: !currentSettings.embedEnabled,
      updatedAt: new Date(),
    };

    await dbManager.goodbyeSettings.set(interaction.guild.id, newSettings);

    // Get updated settings
    const updatedSettings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    const goodbyeChannel = updatedSettings.channelId
      ? interaction.guild.channels.cache.get(updatedSettings.channelId)
      : null;

    const embed = createGoodbyeSettingsEmbed(
      interaction,
      updatedSettings,
      goodbyeChannel,
    );

    const components = createGoodbyeSettingsComponents(updatedSettings);

    await interaction.editReply({
      embeds: [embed],
      components,
    });

    logger.info(
      `Goodbye format changed to ${updatedSettings.embedEnabled ? "embed" : "text"} by ${interaction.user.tag} in ${interaction.guild.name}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeFormat:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to change goodbye format.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye test message
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeTest(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to test the goodbye system.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: [MessageFlags.Ephemeral] },
      );
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const dbManager = await getDatabaseManager();
    const settings = await dbManager.goodbyeSettings.getByGuild(
      interaction.guild.id,
    );

    if (!settings.enabled || !settings.channelId) {
      return interaction.editReply(
        errorEmbed({
          title: "Goodbye System Not Configured",
          description:
            "The goodbye system is not enabled or no channel is set.",
          solution:
            "Use `/goodbye setup` to configure the goodbye system first.",
        }),
      );
    }

    const goodbyeChannel = interaction.guild.channels.cache.get(
      settings.channelId,
    );

    if (!goodbyeChannel) {
      return interaction.editReply(
        errorEmbed({
          title: "Channel Not Found",
          description: "The configured goodbye channel no longer exists.",
          solution: "Use `/goodbye setup` to set a new goodbye channel.",
        }),
      );
    }

    // Check bot permissions in the goodbye channel
    const botMember = interaction.guild.members.me;
    const channelPermissions = goodbyeChannel.permissionsFor(botMember);

    if (!channelPermissions.has("SendMessages")) {
      return interaction.editReply(
        errorEmbed({
          title: "Permission Error",
          description: `I don't have permission to send messages in ${goodbyeChannel.toString()}`,
          solution:
            "Please grant me Send Messages permission in the goodbye channel.",
        }),
      );
    }

    // If using embeds, also check for EmbedLinks permission
    if (settings.embedEnabled && !channelPermissions.has("EmbedLinks")) {
      return interaction.editReply(
        errorEmbed({
          title: "Permission Error",
          description: `I don't have permission to embed links in ${goodbyeChannel.toString()}`,
          solution:
            "Please grant me Embed Links permission in the goodbye channel.",
        }),
      );
    }

    // Use the actual interaction member for testing
    const testMember = interaction.member;

    // Send the actual goodbye message to the configured channel
    let messageResult = null;
    let sentMessage = null;
    try {
      if (settings.embedEnabled) {
        const embed = createGoodbyeEmbed(settings, testMember);
        sentMessage = await goodbyeChannel.send({ embeds: [embed] });
        messageResult = "Embed message sent successfully";
      } else {
        const processedMessage = processGoodbyeMessage(
          settings.message ||
            `**{user}** left the server\nThanks for being part of **{server}**! ${EMOJIS.ACTIONS.WAVE}`,
          testMember,
        );
        sentMessage = await goodbyeChannel.send(processedMessage);
        messageResult = "Text message sent successfully";
      }
    } catch (error) {
      messageResult = `Failed to send message: ${error.message}`;
    }

    // Create direct link to the sent message if available
    let messageLink = "";
    if (sentMessage) {
      messageLink = `\n\n[**View Test Message**](${sentMessage.url})`;
    }

    await interaction.editReply({
      embeds: [
        {
          title: "Goodbye System Test Results",
          description: `Test completed in ${goodbyeChannel.toString()}${messageLink}\n\n**Message Test:** ${messageResult}`,
          color: THEME.SUCCESS,
          fields: [
            {
              name: "Test Details",
              value: `**Format:** ${settings.embedEnabled ? "Embed" : "Text"}\n**Channel:** ${goodbyeChannel.toString()}\n**Message:** ${settings.message || "Default message"}`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
      flags: MessageFlags.Ephemeral,
    });

    logger.info(
      `Goodbye test message sent by ${interaction.user.tag} in ${interaction.guild.name}`,
    );
  } catch (error) {
    logger.error("Error in handleGoodbyeTest:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        errorEmbed({
          title: "Error",
          description: "Failed to send test goodbye message.",
          solution: "Please try again or contact support.",
        }),
      );
    }
  }
}

/**
 * Handle goodbye settings edit
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGoodbyeEdit(interaction) {
  const logger = getLogger();

  try {
    // Check permissions
    if (!hasAdminPermissions(interaction.member)) {
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Manage Server permissions to edit goodbye settings.",
          solution: "Contact a server administrator for assistance.",
        }),
        { flags: [MessageFlags.Ephemeral] },
      );
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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
      `Goodbye settings viewed by ${interaction.user.tag} (${interaction.user.id}) in ${interaction.guild.name} (${interaction.guild.id})`,
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
