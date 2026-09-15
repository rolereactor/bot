import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/responseHelpers.js";
import { getDiscordClient, logRequest } from "../utils/apiShared.js";
import { GuildHelper } from "../helpers/GuildHelper.js";

const logger = getLogger();

/**
 * Get guild role mappings (reaction roles)
 */
export async function apiGetGuildRoleMappings(req, res) {
  const { guildId } = req.params;
  logRequest(`Get guild role mappings: ${guildId}`, req, {
    userId: req.user?.id,
    username: req.user?.username,
  });

  if (!guildId) {
    const { statusCode, response } = createErrorResponse(
      "Guild ID is required",
      400,
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storageManager = await getStorageManager();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 6));

    const allMappings = await storageManager.getRoleMappings();
    const client = getDiscordClient();
    const guild =
      client?.guilds.cache.get(guildId) ||
      (await client?.guilds.fetch(guildId).catch(() => null));

    if (guild) {
      await guild.roles.fetch().catch(() => null);
      await guild.channels.fetch().catch(() => null);
    }

    const sortedMappings = Object.entries(allMappings)
      .filter(([, m]) => m.guildId === guildId)
      .map(([messageId, mapping]) => ({ messageId, mapping }))
      .sort((a, b) => {
        const aTime = new Date(
          a.mapping.createdAt || a.mapping.updatedAt || 0,
        ).getTime();
        const bTime = new Date(
          b.mapping.createdAt || b.mapping.updatedAt || 0,
        ).getTime();
        return bTime - aTime;
      });

    const total = sortedMappings.length;
    const startIndex = (page - 1) * limit;
    const paginatedSlice = sortedMappings.slice(startIndex, startIndex + limit);

    const guildMappings = await Promise.all(
      paginatedSlice.map(({ messageId, mapping }) =>
        GuildHelper.enrichRoleMapping(messageId, mapping, guild),
      ),
    );

    res.json(
      createSuccessResponse({
        roleMappings: guildMappings,
        total,
        page,
        limit,
        hasMore: startIndex + limit < total,
      }),
    );
  } catch (error) {
    logger.error(`❌ Error getting role mappings for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve role mappings",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Delete a guild role mapping
 */
export async function apiDeleteGuildRoleMapping(req, res) {
  const { guildId, messageId } = req.params;
  logRequest(`Delete role mapping: ${messageId} for guild ${guildId}`, req, {
    userId: req.user?.id,
    username: req.user?.username,
  });

  if (!guildId || !messageId) {
    const { statusCode, response } = createErrorResponse(
      "Guild ID and Message ID are required",
      400,
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { removeRoleMapping } = await import(
      "../../utils/discord/roleMappingManager.js"
    );
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storageManager = await getStorageManager();
    const allMappings = await storageManager.getRoleMappings();
    const mapping = allMappings[messageId];

    if (!mapping || mapping.guildId !== guildId) {
      const { statusCode, response } = createErrorResponse(
        "Role mapping not found in this guild",
        404,
      );
      return res.status(statusCode).json(response);
    }

    let messageDeleted = false;
    const client = getDiscordClient();
    if (client) {
      try {
        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(mapping.channelId);
        const msg = channel?.isTextBased()
          ? await channel.messages.fetch(messageId).catch(() => null)
          : null;
        if (msg) {
          await msg.delete();
          messageDeleted = true;
        }
      } catch {}
    }

    await removeRoleMapping(messageId);
    res.json(
      createSuccessResponse({
        message: "Role mapping deleted successfully",
        messageDeleted,
      }),
    );
  } catch (error) {
    logger.error(
      `❌ Error deleting role mapping ${messageId} for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to delete role mapping",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

function mergeReactionRoles(reactions) {
  const mergedReactions = new Map();
  for (const r of reactions) {
    if (!mergedReactions.has(r.emoji)) {
      mergedReactions.set(r.emoji, {
        emoji: r.emoji,
        roleIds: [],
        roleNames: [],
        roleColors: [],
        roleId: r.roleId,
        roleName: r.roleName,
        roleColor: r.roleColor || 0,
      });
    }

    const group = mergedReactions.get(r.emoji);
    if (r.roleIds?.length > 0) {
      group.roleIds.push(...r.roleIds);
      group.roleNames.push(...(r.roleNames || []));
      group.roleColors.push(
        ...(r.roleColors || r.roleIds.map(() => r.roleColor || 0)),
      );
    } else if (r.roleId) {
      group.roleIds.push(r.roleId);
      group.roleNames.push(r.roleName || "");
      group.roleColors.push(r.roleColor || 0);
    }
  }

  const validRoles = [];
  const roleMapping = {};

  for (const group of mergedReactions.values()) {
    const uniqueIds = new Set();
    const finalRoleIds = [];
    const finalRoleNames = [];
    const finalRoleColors = [];

    for (let i = 0; i < group.roleIds.length; i++) {
      const id = group.roleIds[i];
      if (!uniqueIds.has(id)) {
        uniqueIds.add(id);
        finalRoleIds.push(id);
        finalRoleNames.push(group.roleNames[i] || "");
        finalRoleColors.push(group.roleColors[i] || group.roleColor || 0);
      }
    }

    const mapping = {
      roleId: finalRoleIds[0] || group.roleId,
      roleName: finalRoleNames[0] || group.roleName,
      roleColor: finalRoleColors[0] || group.roleColor || 0,
      emoji: group.emoji,
    };

    if (finalRoleIds.length > 1) {
      mapping.roleIds = finalRoleIds;
      mapping.roleNames = finalRoleNames;
      mapping.roleColors = finalRoleColors;
    }

    roleMapping[group.emoji] = mapping;
    validRoles.push(mapping);
  }

  return { validRoles, roleMapping };
}

/**
 * Deploy a new role-reaction setup
 */
export async function apiDeployRoleReactions(req, res) {
  const { guildId } = req.params;
  logRequest(`Deploy role reactions for guild ${guildId}`, req, {
    userId: req.user?.id,
    username: req.user?.username,
  });

  try {
    const client = getDiscordClient();
    if (!client) {
      const { statusCode, response } = createErrorResponse(
        "Bot is not connected",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const {
      title,
      description,
      color,
      channelId,
      selectionMode,
      hideList,
      reactions,
    } = req.body;

    if (!channelId)
      return res
        .status(400)
        .json(createErrorResponse("Channel ID is required", 400).response);
    if (!reactions?.length)
      return res
        .status(400)
        .json(
          createErrorResponse("At least one role mapping is required", 400)
            .response,
        );

    // SECURITY: Verify the bot has permission in the channel
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!guild || !channel || !channel.isTextBased())
      return res
        .status(404)
        .json(createErrorResponse("Guild or Channel not found", 404).response);

    const botMember = guild.members.cache.get(client.user.id);
    const permissions = channel.permissionsFor(botMember);
    if (
      !permissions?.has("SendMessages") ||
      !permissions?.has("AddReactions")
    ) {
      return res
        .status(403)
        .json(createErrorResponse("Missing permissions", 403).response);
    }

    if (selectionMode === "unique") {
      const { getPremiumManager } = await import(
        "../../features/premium/PremiumManager.js"
      );
      const isPro = await getPremiumManager().isFeatureActive(
        guildId,
        "pro_engine",
      );
      if (!isPro) {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "Unique selection mode requires Pro Engine",
              403,
            ).response,
          );
      }
    }

    const { validRoles, roleMapping } = mergeReactionRoles(reactions);

    let embedColor = color || "#9b8bf0";
    if (embedColor && !embedColor.startsWith("#"))
      embedColor = `#${embedColor}`;

    const { createSetupRolesEmbed } = await import(
      "../../commands/admin/role-reactions/embeds.js"
    );
    const embed = createSetupRolesEmbed(
      title,
      description,
      embedColor,
      validRoles,
      client,
      hideList || false,
    );
    const textChannel = /** @type {import('discord.js').TextChannel} */ (
      channel
    );
    const message = await textChannel.send({ embeds: [embed] });

    try {
      if (message.embeds.length > 0) {
        const { EmbedBuilder } = await import("discord.js");
        const updatedEmbed = EmbedBuilder.from(message.embeds[0]).setFooter({
          text: `Role Reactions • ID: ${message.id}`,
          iconURL: message.embeds[0].footer?.iconURL,
        });
        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch {}

    const { addReactionsToMessage } = await import(
      "../../commands/admin/role-reactions/messageOperations.js"
    );
    const reactionResult = await addReactionsToMessage(message, validRoles);

    if (
      !reactionResult.success &&
      reactionResult.failedReactions.length === validRoles.length
    ) {
      await message.delete().catch(() => {});
      return res
        .status(500)
        .json(createErrorResponse("Failed to add reactions", 500).response);
    }

    const { setRoleMapping } = await import(
      "../../utils/discord/roleMappingManager.js"
    );
    const mappingData = { roles: roleMapping, hideList: hideList || false };
    if (selectionMode && selectionMode !== "standard")
      mappingData.selectionMode = selectionMode;

    await setRoleMapping(message.id, guildId, channelId, mappingData);
    res.json(
      createSuccessResponse({
        message: "Role-reaction setup deployed successfully!",
        messageId: message.id,
        channelId,
        roleCount: validRoles.length,
        messageUrl: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
      }),
    );
  } catch (error) {
    logger.error(
      `❌ Error deploying role reactions for guild ${guildId}:`,
      error,
    );
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to deploy role reactions",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Update an existing role-reaction setup
 */
export async function apiUpdateRoleReactions(req, res) {
  const { guildId, messageId } = req.params;
  logRequest(`Update role reactions ${messageId} for guild ${guildId}`, req, {
    userId: req.user?.id,
    username: req.user?.username,
  });

  try {
    const client = getDiscordClient();
    if (!client)
      return res
        .status(503)
        .json(createErrorResponse("Bot is not connected", 503).response);

    const { title, description, color, selectionMode, hideList, reactions } =
      req.body;
    const { getRoleMapping, setRoleMapping } = await import(
      "../../utils/discord/roleMappingManager.js"
    );

    const existingMapping = await getRoleMapping(messageId, guildId);
    if (!existingMapping)
      return res
        .status(404)
        .json(createErrorResponse("Role mapping not found", 404).response);

    if (selectionMode === "unique") {
      const { getPremiumManager } = await import(
        "../../features/premium/PremiumManager.js"
      );
      const isPro = await getPremiumManager().isFeatureActive(
        guildId,
        "pro_engine",
      );
      if (!isPro) {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "Unique selection mode requires Pro Engine",
              403,
            ).response,
          );
      }
    }

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(existingMapping.channelId);
    if (!guild || !channel || !channel.isTextBased())
      return res
        .status(404)
        .json(createErrorResponse("Guild or Channel not found", 404).response);

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message)
      return res
        .status(404)
        .json(createErrorResponse("Message not found", 404).response);

    let roleMapping = {};
    let validRoles = [];
    if (reactions?.length) {
      const merged = mergeReactionRoles(reactions);
      roleMapping = merged.roleMapping;
      validRoles = merged.validRoles;
    }

    const finalRoleMapping = Object.keys(roleMapping).length
      ? roleMapping
      : existingMapping.roles || {};
    const finalValidRoles = validRoles.length
      ? validRoles
      : Object.values(existingMapping.roles || {});

    let embedColor = color || existingMapping.color || "#9b8bf0";
    if (embedColor && !embedColor.startsWith("#"))
      embedColor = `#${embedColor}`;

    const { createSetupRolesEmbed } = await import(
      "../../commands/admin/role-reactions/embeds.js"
    );
    const finalHideList =
      hideList !== undefined ? hideList : existingMapping.hideList || false;
    const embed = createSetupRolesEmbed(
      title || existingMapping.title || "Role Reactions",
      description || existingMapping.description || "React to get a role!",
      embedColor,
      finalValidRoles,
      client,
      finalHideList,
    );

    const { EmbedBuilder } = await import("discord.js");
    const updatedEmbed = EmbedBuilder.from(embed).setFooter({
      text: `Role Reactions • ID: ${messageId}`,
      iconURL: client.user.displayAvatarURL(),
    });

    await message.edit({ embeds: [updatedEmbed] });

    if (validRoles.length) {
      const { syncReactions } = await import(
        "../../commands/admin/role-reactions/messageOperations.js"
      );
      await syncReactions(message, validRoles).catch(() => {});
    }

    const mappingData = {
      roles: finalRoleMapping,
      hideList: finalHideList,
      title: title || existingMapping.title,
      description: description || existingMapping.description,
      color: embedColor,
    };
    if (selectionMode) mappingData.selectionMode = selectionMode;

    await setRoleMapping(
      messageId,
      guildId,
      existingMapping.channelId,
      mappingData,
    );
    res.json(
      createSuccessResponse({
        message: "Role-reaction setup updated successfully!",
        messageId,
        channelId: existingMapping.channelId,
      }),
    );
  } catch (error) {
    logger.error(
      `❌ Error updating role reactions ${messageId} for guild ${guildId}:`,
      error,
    );
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to update role reactions",
          500,
          error.message,
        ).response,
      );
  }
}
