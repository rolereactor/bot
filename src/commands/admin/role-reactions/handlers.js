import { getLogger } from "../../../utils/logger.js";
import {
  errorEmbed,
  roleCreatedEmbed,
} from "../../../utils/discord/responseMessages.js";
import { getRoleMapping } from "./utils.js";
import { getStorageManager } from "../../../utils/storage/storageManager.js";
import {
  createListRolesEmbed,
  createUpdatedRolesEmbed,
  createPaginationButtons,
} from "./embeds.js";

// Import refactored utility modules
import { validateInteraction, validateBotMember } from "./validation.js";
import { handleDeferral } from "./deferral.js";
import {
  validateGuildPermissions,
  validateChannelPermissions,
  performFinalPermissionCheck,
} from "./permissions.js";
import {
  processRoleInput,
  createRoleReactionMessage,
  addReactionsToMessage,
  handleReactionFailures,
  saveRoleMapping,
} from "./messageOperations.js";
import { THEME_COLOR } from "../../../config/theme.js";
import { getPremiumManager } from "../../../features/premium/PremiumManager.js";
import {
  PremiumFeatures,
  FREE_TIER,
  PRO_TIER,
} from "../../../features/premium/config.js";
import { upgradeLimitEmbed } from "../../../utils/discord/premiumHelp.js";

// Track active setups to prevent duplicates
const activeSetups = new Set();
const activeLists = new Set();

export async function handleSetup(interaction, client) {
  const logger = getLogger();

  logger.debug("Starting role-reaction setup", {
    interactionId: interaction.id,
    user: interaction.user.username,
    channel: interaction.channel.name,
  });

  // Prevent duplicate executions
  if (activeSetups.has(interaction.id)) {
    logger.warn("Setup already in progress for this interaction, skipping");
    return;
  }
  activeSetups.add(interaction.id);

  try {
    // Validate interaction
    const validation = validateInteraction(interaction);
    if (!validation.success) {
      if (!validation.skipCleanup) {
        activeSetups.delete(interaction.id);
      }
      return;
    }

    // Defer reply
    const deferResult = await handleDeferral(interaction, false);
    if (!deferResult.success) {
      if (deferResult.isExpired) {
        logger.warn("Interaction expired during deferral");
      }
      activeSetups.delete(interaction.id);
      return;
    }

    // Validate bot member
    const botMemberValidation = validateBotMember(interaction);
    if (!botMemberValidation.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(
        errorEmbed(botMemberValidation.errorResponse),
      );
    }

    // Validate guild permissions
    const guildPermissionValidation = validateGuildPermissions(interaction);
    if (!guildPermissionValidation.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(guildPermissionValidation.errorResponse);
    }

    // Validate channel permissions
    const channelPermissionValidation = validateChannelPermissions(interaction);
    if (!channelPermissionValidation.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(channelPermissionValidation.errorResponse);
    }

    // Perform final permission check
    const finalPermissionCheck = performFinalPermissionCheck(interaction);
    if (!finalPermissionCheck.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(finalPermissionCheck.errorResponse);
    }

    const premiumManager = getPremiumManager();
    const isPro = await premiumManager.isFeatureActive(
      interaction.guild.id,
      PremiumFeatures.PRO.id,
    );
    const maxMessages = isPro
      ? PRO_TIER.ROLE_REACTION_MAX_MESSAGES
      : FREE_TIER.ROLE_REACTION_MAX_MESSAGES;

    const storageManager = await getStorageManager();
    const allMappings = await storageManager.getRoleMappings();
    const guildMappingCount = Object.entries(allMappings).filter(
      ([, m]) => m.guildId === interaction.guild.id,
    ).length;

    if (guildMappingCount >= maxMessages) {
      activeSetups.delete(interaction.id);
      if (!isPro) {
        return interaction.editReply(
          upgradeLimitEmbed({
            feature: "Role Reaction Panels",
            freeText: `${FREE_TIER.ROLE_REACTION_MAX_MESSAGES} panels`,
            proText: `${PRO_TIER.ROLE_REACTION_MAX_MESSAGES} panels`,
            client: interaction.client,
          }),
        );
      }
      return interaction.editReply(
        errorEmbed({
          title: "Maximum Panels Reached",
          description: `You have reached the maximum limit of **${maxMessages}** active Role Reaction panels.`,
        }),
      );
    }

    // Process role input
    const rolesString = interaction.options.getString("roles");

    const roleProcessingResult = await processRoleInput(
      interaction,
      rolesString,
    );
    if (!roleProcessingResult.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(roleProcessingResult.errorResponse);
    }

    const { validRoles, roleMapping } = roleProcessingResult.data;

    const maxEmojis = isPro
      ? PRO_TIER.ROLE_REACTION_MAX_EMOJIS
      : FREE_TIER.ROLE_REACTION_MAX_EMOJIS;

    if (validRoles.length > maxEmojis) {
      activeSetups.delete(interaction.id);
      if (!isPro) {
        return interaction.editReply(
          upgradeLimitEmbed({
            feature: "Role Reaction Emojis",
            freeText: `${FREE_TIER.ROLE_REACTION_MAX_EMOJIS} emojis per panel`,
            proText: `${PRO_TIER.ROLE_REACTION_MAX_EMOJIS} emojis per panel`,
            client: interaction.client,
          }),
        );
      }
      return interaction.editReply(
        errorEmbed({
          title: "Too Many Reactions",
          description: `A role reaction panel can contain a maximum of **${maxEmojis}** unique reaction emojis. You provided **${validRoles.length}**.`,
        }),
      );
    }

    // Prepare panel data
    const title = interaction.options.getString("title")?.replace(/\\n/g, "\n");
    const description = interaction.options
      .getString("description")
      ?.replace(/\\n/g, "\n");
    let colorHex = interaction.options.getString("color");
    let color = THEME_COLOR;
    if (colorHex) {
      if (!colorHex.startsWith("#")) colorHex = `#${colorHex}`;
      color = colorHex;
    }
    const hideList = interaction.options.getBoolean("hide_list") ?? false;

    // Create role-reaction panel
    const messageResult = await createRoleReactionMessage(
      interaction,
      {
        title,
        description,
        color,
        validRoles,
        hideList,
      },
      client,
    );

    if (!messageResult.success) {
      activeSetups.delete(interaction.id);
      return interaction.editReply(messageResult.errorResponse);
    }

    const message = messageResult.message;

    // Add reactions to the message
    const reactionResult = await addReactionsToMessage(message, validRoles);

    // Handle reaction failures
    const reactionFailureResponse = handleReactionFailures(
      reactionResult.failedReactions,
      validRoles,
    );
    if (reactionFailureResponse) {
      // Delete the message since reactions failed - it's not usable without reactions
      try {
        await message.delete();
        logger.debug("Deleted role-reaction panel due to reaction failures", {
          messageId: message.id,
        });
      } catch (deleteError) {
        logger.warn(
          "Failed to delete role-reaction panel after reaction failure",
          {
            messageId: message.id,
            error: deleteError.message,
          },
        );
      }
      activeSetups.delete(interaction.id);
      return interaction.editReply(reactionFailureResponse);
    }

    // Save role mapping
    await saveRoleMapping(
      message.id,
      interaction.guild.id,
      interaction.channel.id,
      {
        roles: roleMapping,
        hideList,
      },
    );

    // Send success response
    const setupResponse = roleCreatedEmbed({
      messageUrl: message.url,
      roleCount: validRoles.length,
      channelId: interaction.channel.id,
    });
    await interaction.editReply(setupResponse);

    logger.debug("Role-reaction setup completed successfully");
  } catch (error) {
    logger.error("Unexpected error in handleSetup", {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    // Cleanup
    activeSetups.delete(interaction.id);
  }
}

export async function handleList(
  interaction,
  client,
  page = 1,
  isButtonUpdate = false,
) {
  const logger = getLogger();

  // Prevent duplicate executions for non-button updates
  if (!isButtonUpdate) {
    if (activeLists.has(interaction.id)) {
      logger.warn("List already in progress for this interaction, skipping");
      return;
    }
    activeLists.add(interaction.id);
  }

  try {
    // Validate interaction (skip for button updates as they're already acknowledged)
    if (!isButtonUpdate) {
      const validation = validateInteraction(interaction, 2500); // Use 2.5s for list
      if (!validation.success) {
        if (!validation.skipCleanup) {
          activeLists.delete(interaction.id);
        }
        return;
      }
    }

    // Handle deferral
    const deferResult = await handleDeferral(interaction, isButtonUpdate);
    if (!deferResult.success) {
      if (deferResult.isExpired) {
        logger.warn("Interaction expired during deferral");
      }
      if (!isButtonUpdate) activeLists.delete(interaction.id);
      return;
    }

    // Fetch paginated data
    const itemsPerPage = 4;
    logger.debug("Getting storage manager");
    const startTime = Date.now();
    const storageManager = await getStorageManager();
    const storageTime = Date.now() - startTime;
    logger.debug(
      `Storage manager obtained in ${storageTime}ms, getting paginated results`,
    );

    const queryStartTime = Date.now();
    const paginatedResult = await storageManager.getRoleMappingsPaginated(
      interaction.guild.id,
      page,
      itemsPerPage,
    );
    const queryTime = Date.now() - queryStartTime;
    logger.debug(`Paginated results obtained in ${queryTime}ms`);

    const { mappings: guildMappings, pagination } = paginatedResult;

    if (pagination.totalItems === 0) {
      if (!isButtonUpdate) activeLists.delete(interaction.id);
      return interaction.editReply(
        errorEmbed({
          title: "No Role-Reaction Panels Found",
          description:
            "There are no role-reaction panels set up in this server yet.",
          solution:
            "Use `role-reactions setup` to create your first role-reaction panel!",
        }),
      );
    }

    // Validate page number
    const validPage = Math.max(1, Math.min(page, pagination.totalPages));

    // Convert mappings object to array format and sort by latest first
    const guildMappingsArray = Object.entries(guildMappings).sort((a, b) => {
      const aTime = a[1].updatedAt ? new Date(a[1].updatedAt).getTime() : 0;
      const bTime = b[1].updatedAt ? new Date(b[1].updatedAt).getTime() : 0;
      if (bTime === aTime) {
        return b[0].localeCompare(a[0]); // Secondary sort by Message ID (snowflake) descending
      }
      return bTime - aTime;
    });

    const {
      embed,
      totalPages: calculatedTotalPages,
      currentPage,
    } = createListRolesEmbed(
      guildMappingsArray,
      client,
      validPage,
      itemsPerPage,
      pagination,
    );

    // Only add pagination buttons if there are multiple pages
    const components =
      calculatedTotalPages > 1
        ? createPaginationButtons(currentPage, calculatedTotalPages)
        : [];

    await interaction.editReply({
      embeds: [embed],
      components,
      flags: 64,
    });

    logger.debug("Role-reaction list completed successfully");
  } catch (error) {
    logger.error("Unexpected error in handleList", {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    // Cleanup
    if (!isButtonUpdate) {
      activeLists.delete(interaction.id);
    }
  }
}

export async function handleDelete(interaction) {
  const logger = getLogger();

  logger.debug("Starting role-reaction deletion", {
    interactionId: interaction.id,
    user: interaction.user.username,
    guild: interaction.guild.name,
  });

  try {
    // Validate interaction
    const validation = validateInteraction(interaction);
    if (!validation.success) {
      return;
    }

    // Defer reply
    const deferResult = await handleDeferral(interaction, false);
    if (!deferResult.success) {
      if (deferResult.isExpired) {
        logger.warn("Interaction expired during deferral");
      }
      return;
    }

    const messageId = interaction.options.getString("message_id");
    logger.debug("Looking for message ID", {
      messageId,
      guildId: interaction.guild.id,
    });

    const mapping = await getRoleMapping(messageId, interaction.guild.id);
    logger.debug("Mapping found", { mapping });

    if (!mapping) {
      logger.warn("No mapping found for message ID", { messageId });

      // Let's also try to get all mappings to see what's available
      const storageManager = await getStorageManager();
      const allMappings = await storageManager.getRoleMappings();
      const guildMappings = Object.entries(allMappings).filter(
        ([, m]) => m.guildId === interaction.guild.id,
      );
      logger.debug("All mappings in this guild", {
        guildMappings: guildMappings.map(([id, m]) => ({
          messageId: id,
          guildId: m.guildId,
        })),
      });

      return interaction.editReply(
        errorEmbed({
          title: "Message Not Found",
          description:
            "I couldn't find a role-reaction panel with that ID in this server.",
        }),
      );
    }

    // Try to delete the message
    let msg = null;
    const channel = interaction.guild.channels.cache.get(mapping.channelId);
    if (channel) {
      msg = await channel.messages.fetch(messageId).catch(() => null);
    }

    // Remove role mapping
    const { removeRoleMapping } = await import(
      "../../../utils/discord/roleMappingManager.js"
    );
    await removeRoleMapping(messageId);

    // Delete the message if found
    if (msg) {
      await msg.delete().catch(() => null);
    }

    // Send success response
    const { roleDeletedEmbed } = await import(
      "../../../utils/discord/responseMessages.js"
    );
    await interaction.editReply(
      roleDeletedEmbed({
        messageId,
        rolesRemoved: Object.keys(mapping.roles || {}).length,
      }),
    );

    logger.debug("Role-reaction deletion completed successfully");
  } catch (error) {
    logger.error("Unexpected error in handleDelete", {
      error: error.message,
      stack: error.stack,
    });
  }
}

export async function handleUpdate(interaction) {
  const logger = getLogger();

  try {
    // Validate interaction
    const validation = validateInteraction(interaction);
    if (!validation.success) {
      return;
    }

    // Defer reply
    const deferResult = await handleDeferral(interaction, false);
    if (!deferResult.success) {
      if (deferResult.isExpired) {
        logger.warn("Interaction expired during deferral");
      }
      return;
    }

    const messageId = interaction.options.getString("message_id");
    const title = interaction.options.getString("title")?.replace(/\\n/g, "\n");
    const description = interaction.options
      .getString("description")
      ?.replace(/\\n/g, "\n");
    const rolesString = interaction.options.getString("roles");
    const colorHex = interaction.options.getString("color");
    const hideList = interaction.options.getBoolean("hide_list");

    const mapping = await getRoleMapping(messageId, interaction.guild.id);
    if (!mapping) {
      return interaction.editReply(
        errorEmbed({
          title: "Message Not Found",
          description:
            "I couldn't find a role-reaction panel with that ID in this server.",
        }),
      );
    }

    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (hideList !== null) updates.hideList = hideList;

    let roleMapping = mapping.roles;
    if (rolesString) {
      const result = await processRoleInput(interaction, rolesString);
      if (!result.success) {
        return interaction.editReply(result.errorResponse);
      }
      roleMapping = result.data.roleMapping;
      const validRoles = result.data.validRoles;

      const premiumManager = getPremiumManager();
      const isPro = await premiumManager.isFeatureActive(
        interaction.guild.id,
        PremiumFeatures.PRO.id,
      );
      const maxEmojis = isPro
        ? PRO_TIER.ROLE_REACTION_MAX_EMOJIS
        : FREE_TIER.ROLE_REACTION_MAX_EMOJIS;

      if (validRoles.length > maxEmojis) {
        if (!isPro) {
          return interaction.editReply(
            upgradeLimitEmbed({
              feature: "Role Reaction Emojis",
              freeText: `${FREE_TIER.ROLE_REACTION_MAX_EMOJIS} emojis per panel`,
              proText: `${PRO_TIER.ROLE_REACTION_MAX_EMOJIS} emojis per panel`,
              client: interaction.client,
            }),
          );
        }
        return interaction.editReply(
          errorEmbed({
            title: "Too Many Reactions",
            description: `A role reaction panel can contain a maximum of **${maxEmojis}** unique reaction emojis. You provided **${validRoles.length}**.`,
          }),
        );
      }

      updates.roles = roleMapping;
    }

    if (colorHex) {
      const hex = colorHex.startsWith("#") ? colorHex : `#${colorHex}`;
      if (!/^#[0-9A-F]{6}$/i.test(hex)) {
        return interaction.editReply(
          errorEmbed({
            title: "Invalid Color Format",
            description: "Provide a valid 6-digit hex color.",
          }),
        );
      }
      updates.color = hex;
    }

    const updatedMapping = { ...mapping, ...updates };
    const channel = await interaction.guild.channels.fetch(mapping.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = createUpdatedRolesEmbed(
      updatedMapping,
      roleMapping,
      interaction.client,
    ).setFooter({
      text: `Role Reactions • ID: ${messageId}`,
      iconURL: interaction.client.user.displayAvatarURL(),
    });
    await message.edit({ embeds: [embed] });

    // If roles were updated, refresh the reactions
    if (rolesString) {
      try {
        // Sync reactions instead of clearing all (Smart Update)
        const { syncReactions } = await import("./messageOperations.js");
        const result = await processRoleInput(interaction, rolesString);
        if (result.success) {
          const syncResult = await syncReactions(
            message,
            result.data.validRoles,
          );

          logger.debug("Successfully synced reactions", {
            messageId,
            ...syncResult,
          });
        }
      } catch (reactionError) {
        logger.warn("Failed to refresh reactions during update", {
          messageId,
          error: reactionError.message,
        });
        // Continue with the update - the embed was already updated
      }
    }

    const { setRoleMapping: setMap } = await import(
      "../../../utils/discord/roleMappingManager.js"
    );
    await setMap(
      messageId,
      updatedMapping.guildId,
      updatedMapping.channelId,
      roleMapping,
    );

    const { roleUpdatedEmbed } = await import(
      "../../../utils/discord/responseMessages.js"
    );
    const updateResponse = roleUpdatedEmbed({
      updates: Object.keys(updates).join(", "),
      changeCount: Object.keys(updates).length,
      messageUrl: message.url,
      channelId: mapping.channelId,
    });
    await interaction.editReply(updateResponse);

    logger.debug("Role-reaction update completed successfully");
  } catch (error) {
    logger.error("Unexpected error in handleUpdate", {
      error: error.message,
      stack: error.stack,
    });
  }
}

// Handle pagination button interactions
export async function handlePagination(interaction, client) {
  const logger = getLogger();

  logger.debug("Pagination button clicked", { customId: interaction.customId });

  try {
    const customId = interaction.customId;

    // Parse the custom ID to get the action and page number
    const parts = customId.split("_");

    if (parts.length !== 3) {
      logger.warn("Invalid pagination custom ID format", {
        customId,
        parts,
      });
      return;
    }

    const action = parts[1]; // 'prev' or 'next'
    const pageStr = parts[2];
    const page = parseInt(pageStr, 10);

    logger.debug("Debug parsing", {
      customId,
      parts,
      action,
      pageStr,
      page,
      isNaN: isNaN(page),
    });

    if (isNaN(page) || page < 1) {
      logger.warn("Invalid page number", { page, pageStr });
      return;
    }

    logger.debug(`Pagination button clicked: ${action} to page ${page}`);

    // Call handleList with the new page number and button update flag
    logger.debug("Calling handleList for pagination update");
    await handleList(interaction, client, page, true);
    logger.debug("Pagination update completed successfully");
  } catch (error) {
    logger.error("Error in pagination update", {
      error: error.message,
      stack: error.stack,
    });
  }
}
