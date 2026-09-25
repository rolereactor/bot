import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/responseHelpers.js";
import { logRequest } from "../utils/apiShared.js";

const logger = getLogger();

/**
 * List tickets for a guild with optional filtering
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiListTickets(req, res) {
  const { guildId } = req.params;
  const { status, limit: limitParam, skip: skipParam } = req.query;
  logRequest(`List tickets: ${guildId}`, req);

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
    const storage = await getStorageManager();

    if (!storage?.dbManager?.tickets) {
      const { statusCode, response } = createErrorResponse(
        "Ticket service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const options = {};
    if (status && status !== "all") options.status = status;
    if (limitParam) options.limit = Math.min(parseInt(limitParam) || 50, 100);
    if (skipParam) options.skip = parseInt(skipParam) || 0;

    const tickets = await storage.dbManager.tickets.findByGuild(
      guildId,
      options,
    );

    res.json(
      createSuccessResponse({
        guildId,
        count: tickets.length,
        tickets,
      }),
    );
  } catch (error) {
    logger.error(`Error listing tickets for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve tickets",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Get ticket statistics for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiGetTicketStats(req, res) {
  const { guildId } = req.params;
  logRequest(`Get ticket stats: ${guildId}`, req);

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
    const storage = await getStorageManager();

    if (!storage?.dbManager?.tickets) {
      const { statusCode, response } = createErrorResponse(
        "Ticket service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const [stats, staffStats] = await Promise.all([
      storage.dbManager.tickets.getStats(guildId),
      storage.dbManager.tickets.getStaffStats(guildId),
    ]);

    res.json(
      createSuccessResponse({
        guildId,
        stats,
        staffStats,
      }),
    );
  } catch (error) {
    logger.error(`Error getting ticket stats for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve ticket statistics",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * List ticket panels for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiListPanels(req, res) {
  const { guildId } = req.params;
  logRequest(`List panels: ${guildId}`, req);

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
    const storage = await getStorageManager();

    if (!storage?.dbManager?.ticketPanels) {
      const { statusCode, response } = createErrorResponse(
        "Ticket panel service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const panels = await storage.dbManager.ticketPanels.findByGuild(guildId);

    res.json(
      createSuccessResponse({
        guildId,
        count: panels.length,
        panels,
      }),
    );
  } catch (error) {
    logger.error(`Error listing panels for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve ticket panels",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * List panels with stats for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiListPanelsWithStats(req, res) {
  const { guildId } = req.params;
  logRequest(`List panels with stats: ${guildId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.ticketPanels) {
      const { statusCode, response } = createErrorResponse(
        "Ticket panel service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const panels = await storage.dbManager.ticketPanels.findByGuild(guildId);

    const panelsWithStats = panels.map(panel => ({
      panelId: panel.panelId,
      title: panel.title,
      description: panel.description,
      categories: panel.categories,
      settings: panel.settings,
      styling: panel.styling,
      stats: panel.stats || {
        totalTickets: 0,
        openTickets: 0,
        avgCloseTime: 0,
      },
      messageId: panel.messageId,
      channelId: panel.channelId,
      createdAt: panel.createdAt,
      updatedAt: panel.updatedAt,
    }));

    res.json(
      createSuccessResponse({
        guildId,
        count: panelsWithStats.length,
        panels: panelsWithStats,
      }),
    );
  } catch (error) {
    logger.error(
      `Error listing panels with stats for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve panels",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * List transcripts with pagination for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiListTranscripts(req, res) {
  const { guildId } = req.params;
  const { limit: limitParam, skip: skipParam } = req.query;
  logRequest(`List transcripts: ${guildId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.ticketTranscripts) {
      const { statusCode, response } = createErrorResponse(
        "Ticket transcript service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const limit = Math.min(parseInt(limitParam) || 20, 100);
    const skip = parseInt(skipParam) || 0;

    const [transcripts, total] = await Promise.all([
      storage.dbManager.ticketTranscripts.findByGuild(guildId, { limit, skip }),
      storage.dbManager.ticketTranscripts.countByGuild(guildId),
    ]);

    res.json(
      createSuccessResponse({
        guildId,
        total,
        count: transcripts.length,
        skip,
        limit,
        transcripts,
      }),
    );
  } catch (error) {
    logger.error(`Error listing transcripts for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve transcripts",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Get ticket settings for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiGetTicketSettings(req, res) {
  const { guildId } = req.params;
  logRequest(`Get ticket settings: ${guildId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.guildSettings) {
      const { statusCode, response } = createErrorResponse(
        "Guild settings service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const settings = await storage.dbManager.guildSettings.getByGuild(guildId);

    res.json(
      createSuccessResponse({
        guildId,
        ticketSettings: settings?.ticketSettings || null,
      }),
    );
  } catch (error) {
    logger.error(`Error getting ticket settings for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve ticket settings",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Get staff performance stats for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiGetStaffStats(req, res) {
  const { guildId } = req.params;
  logRequest(`Get staff stats: ${guildId}`, req);

  // Pro Engine gate — staff analytics is a premium benefit
  const { getPremiumManager } = await import(
    "../../features/premium/PremiumManager.js"
  );
  const isPro = await getPremiumManager().isFeatureActive(
    guildId,
    "pro_engine",
  );
  if (!isPro) {
    const { statusCode, response } = createErrorResponse(
      "Pro Engine is required to access staff analytics",
      403,
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.tickets) {
      const { statusCode, response } = createErrorResponse(
        "Ticket service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const rawStats = await storage.dbManager.tickets.getStaffStats(guildId);

    const { getDiscordClient } = await import("../utils/apiShared.js");
    const client = getDiscordClient();

    const staffStats = await Promise.all(
      rawStats.slice(0, 10).map(async stat => {
        let staffName = stat._id;
        if (client) {
          try {
            const user = await client.users.fetch(stat._id);
            if (user) staffName = user.displayName || user.username || stat._id;
          } catch (error) {
            logger.debug(
              `Could not resolve staff user ${stat._id}: ${error.message}`,
            );
          }
        }
        return {
          staffId: stat._id,
          staffName,
          ticketsClosed: stat.ticketsClosed,
          avgCloseTimeMinutes: Math.round((stat.avgCloseTime || 0) / 60000),
          avgCloseTimeFormatted: formatDuration(stat.avgCloseTime),
          avgRating:
            stat.avgRating != null
              ? Math.round(stat.avgRating * 10) / 10
              : null,
          ratingCount: stat.ratingCount || 0,
        };
      }),
    );

    res.json(
      createSuccessResponse({
        guildId,
        count: staffStats.length,
        staffStats,
      }),
    );
  } catch (error) {
    logger.error(`Error getting staff stats for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve staff statistics",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Update ticket settings for a guild
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiUpdateTicketSettings(req, res) {
  const { guildId } = req.params;
  const {
    staffRoleId,
    transcriptChannelId,
    notificationChannelId,
    autoCloseDays,
    maxTicketsPerUser,
    allowUserTranscripts,
    welcomeMessage,
    closeMessage,
    csatEnabled,
    csatRelayChannelId,
  } = req.body;
  logRequest(`Update ticket settings: ${guildId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.guildSettings) {
      const { statusCode, response } = createErrorResponse(
        "Guild settings service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const settings = await storage.dbManager.guildSettings.getByGuild(guildId);
    settings.ticketSettings = settings.ticketSettings || {};

    if (staffRoleId !== undefined)
      settings.ticketSettings.staffRoleId = staffRoleId;
    if (transcriptChannelId !== undefined)
      settings.ticketSettings.transcriptChannelId = transcriptChannelId;
    if (notificationChannelId !== undefined)
      settings.ticketSettings.notificationChannelId = notificationChannelId;
    if (autoCloseDays !== undefined)
      settings.ticketSettings.autoCloseDays = autoCloseDays;
    if (maxTicketsPerUser !== undefined)
      settings.ticketSettings.maxTicketsPerUser = maxTicketsPerUser;
    if (allowUserTranscripts !== undefined)
      settings.ticketSettings.allowUserTranscripts = allowUserTranscripts;
    if (welcomeMessage !== undefined)
      settings.ticketSettings.welcomeMessage = welcomeMessage;
    if (closeMessage !== undefined)
      settings.ticketSettings.closeMessage = closeMessage;
    if (csatEnabled !== undefined && typeof csatEnabled === "boolean")
      settings.ticketSettings.csatEnabled = csatEnabled;
    if (csatRelayChannelId !== undefined)
      settings.ticketSettings.csatRelayChannelId =
        typeof csatRelayChannelId === "string" && csatRelayChannelId
          ? csatRelayChannelId
          : null;

    await storage.dbManager.guildSettings.set(guildId, settings);

    res.json(
      createSuccessResponse({
        guildId,
        ticketSettings: settings.ticketSettings,
      }),
    );
  } catch (error) {
    logger.error(`Error updating ticket settings for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to update ticket settings",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Create a new ticket panel
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiCreatePanel(req, res) {
  const { guildId } = req.params;
  const { channelId, title, description, categories, settings, styling } =
    req.body;
  logRequest(`Create panel: ${guildId}`, req);

  if (!channelId) {
    const { statusCode, response } = createErrorResponse(
      "channelId is required",
      400,
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getDiscordClient } = await import("../utils/apiShared.js");
    const client = getDiscordClient();

    if (!client) {
      const { statusCode, response } = createErrorResponse(
        "Discord client unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    let guild;
    try {
      guild = await client.guilds.fetch(guildId);
    } catch {
      const { statusCode, response } = createErrorResponse(
        "Guild not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    let channel;
    try {
      channel = await guild.channels.fetch(channelId);
    } catch {
      const { statusCode, response } = createErrorResponse(
        "Channel not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    if (!channel.isTextBased()) {
      const { statusCode, response } = createErrorResponse(
        "Channel must be a text channel",
        400,
      );
      return res.status(statusCode).json(response);
    }

    const { getTicketPanel } = await import(
      "../../features/ticketing/TicketPanel.js"
    );
    const ticketPanel = getTicketPanel();
    await ticketPanel.initialize();

    const categoryCheck = sanitizeCategories(categories);
    if (!categoryCheck.ok) {
      const { statusCode, response } = createErrorResponse(
        categoryCheck.error,
        400,
      );
      return res.status(statusCode).json(response);
    }

    const result = await ticketPanel.createPanel({
      guildId,
      channelId,
      title,
      description,
      categories: categoryCheck.categories,
      settings,
      styling,
    });

    if (!result.success) {
      const message =
        result.error?.data?.description || "Failed to create ticket panel";
      const { statusCode, response } = createErrorResponse(message, 400);
      return res.status(statusCode).json(response);
    }

    const sendResult = await ticketPanel.sendPanelMessage({
      channel,
      panel: result.panel,
    });

    if (!sendResult.success) {
      // Roll back the DB record so we don't leave a panel without a message
      await ticketPanel.deletePanel(result.panel.panelId);
      const message =
        sendResult.error?.data?.description ||
        "Failed to send panel message to channel";
      const { statusCode, response } = createErrorResponse(message, 500);
      return res.status(statusCode).json(response);
    }

    // Re-fetch so the response includes the messageId saved by sendPanelMessage
    const panel = await ticketPanel.getPanel(result.panel.panelId);

    res.status(201).json(
      createSuccessResponse({
        guildId,
        panel,
        message: "Panel created successfully",
      }),
    );
  } catch (error) {
    logger.error(`Error creating panel for guild ${guildId}:`, error);
    const { statusCode, response } = createErrorResponse(
      "Failed to create ticket panel",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Delete a ticket panel
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiDeletePanel(req, res) {
  const { guildId, panelId } = req.params;
  logRequest(`Delete panel: ${guildId} / ${panelId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.ticketPanels) {
      const { statusCode, response } = createErrorResponse(
        "Ticket panel service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const panel = await storage.dbManager.ticketPanels.findByPanelId(panelId);
    if (!panel || panel.guildId !== guildId) {
      const { statusCode, response } = createErrorResponse(
        "Panel not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    // Best-effort: remove the panel message so members can't click a dead panel
    let messageDeleted = false;
    if (panel.messageId && panel.channelId) {
      try {
        const { getDiscordClient } = await import("../utils/apiShared.js");
        const client = getDiscordClient();
        if (client) {
          const channel = await client.channels.fetch(panel.channelId);
          const message = await channel.messages.fetch(panel.messageId);
          await message.delete();
          messageDeleted = true;
        }
      } catch (error) {
        logger.warn(
          `Could not delete panel message for ${panelId}: ${error.message}`,
        );
      }
    }

    await storage.dbManager.ticketPanels.delete(panelId);

    res.json(
      createSuccessResponse({
        guildId,
        panelId,
        deleted: true,
        messageDeleted,
        message: "Panel deleted successfully",
      }),
    );
  } catch (error) {
    logger.error(
      `Error deleting panel ${panelId} for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to delete ticket panel",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Toggle panel enabled/disabled
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiTogglePanel(req, res) {
  const { guildId, panelId } = req.params;
  logRequest(`Toggle panel: ${guildId} / ${panelId}`, req);

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    if (!storage?.dbManager?.ticketPanels) {
      const { statusCode, response } = createErrorResponse(
        "Ticket panel service unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const panel = await storage.dbManager.ticketPanels.findByPanelId(panelId);
    if (!panel || panel.guildId !== guildId) {
      const { statusCode, response } = createErrorResponse(
        "Panel not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    const success = await storage.dbManager.ticketPanels.update(panelId, {
      "settings.enabled": !panel.settings.enabled,
    });

    if (!success) {
      const { statusCode, response } = createErrorResponse(
        "Failed to toggle ticket panel",
        500,
      );
      return res.status(statusCode).json(response);
    }

    const updated = await storage.dbManager.ticketPanels.findByPanelId(panelId);

    res.json(
      createSuccessResponse({
        guildId,
        panel: updated,
        message: `Panel ${updated.settings.enabled ? "enabled" : "disabled"} successfully`,
      }),
    );
  } catch (error) {
    logger.error(
      `Error toggling panel ${panelId} for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to toggle ticket panel",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Update a ticket panel (title/description) and refresh its Discord message
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiUpdatePanel(req, res) {
  const { guildId, panelId } = req.params;
  const { title, description, categories } = req.body;
  logRequest(`Update panel: ${guildId} / ${panelId}`, req);

  if (
    title === undefined &&
    description === undefined &&
    categories === undefined
  ) {
    const { statusCode, response } = createErrorResponse(
      "title, description, or categories is required",
      400,
    );
    return res.status(statusCode).json(response);
  }

  if (title !== undefined && typeof title !== "string") {
    const { statusCode, response } = createErrorResponse(
      "title must be a string",
      400,
    );
    return res.status(statusCode).json(response);
  }

  if (description !== undefined && typeof description !== "string") {
    const { statusCode, response } = createErrorResponse(
      "description must be a string",
      400,
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getTicketPanel } = await import(
      "../../features/ticketing/TicketPanel.js"
    );
    const ticketPanel = getTicketPanel();
    await ticketPanel.initialize();

    const existing = await ticketPanel.getPanel(panelId);
    if (!existing || existing.guildId !== guildId) {
      const { statusCode, response } = createErrorResponse(
        "Panel not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    let categoryData;
    if (categories !== undefined) {
      const categoryCheck = sanitizeCategories(categories);
      if (!categoryCheck.ok) {
        const { statusCode, response } = createErrorResponse(
          categoryCheck.error,
          400,
        );
        return res.status(statusCode).json(response);
      }

      const { getPremiumManager } = await import(
        "../../features/premium/PremiumManager.js"
      );
      const { FREE_TIER, PRO_ENGINE } = await import(
        "../../features/ticketing/config.js"
      );
      const isPro = await getPremiumManager().isFeatureActive(
        guildId,
        "pro_engine",
      );
      const maxCategories = isPro
        ? PRO_ENGINE.MAX_CATEGORIES
        : FREE_TIER.MAX_CATEGORIES;
      if (categoryCheck.categories.length > maxCategories) {
        const { statusCode, response } = createErrorResponse(
          `Maximum ${maxCategories} categories allowed per panel`,
          400,
        );
        return res.status(statusCode).json(response);
      }
      categoryData = categoryCheck.categories;
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (categoryData) updateData.categories = categoryData;

    const result = await ticketPanel.updatePanel(panelId, updateData);
    if (!result.success) {
      const message =
        result.error?.data?.description || "Failed to update panel";
      const { statusCode, response } = createErrorResponse(message, 400);
      return res.status(statusCode).json(response);
    }

    // Refresh the Discord panel message so it reflects the new content
    let messageRefreshed = false;
    if (existing.messageId) {
      const { getDiscordClient } = await import("../utils/apiShared.js");
      const client = getDiscordClient();
      if (client) {
        try {
          const guild = await client.guilds.fetch(guildId);
          const refresh = await ticketPanel.refreshPanelMessage(guild, panelId);
          messageRefreshed = refresh.success;
        } catch {
          messageRefreshed = false;
        }
      }
    }

    const panel = await ticketPanel.getPanel(panelId);

    res.json(
      createSuccessResponse({
        guildId,
        panel,
        messageRefreshed,
        message: "Panel updated successfully",
      }),
    );
  } catch (error) {
    logger.error(
      `Error updating panel ${panelId} for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to update ticket panel",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Refresh a panel's Discord message from its stored data
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function apiRefreshPanel(req, res) {
  const { guildId, panelId } = req.params;
  logRequest(`Refresh panel: ${guildId} / ${panelId}`, req);

  try {
    const { getDiscordClient } = await import("../utils/apiShared.js");
    const client = getDiscordClient();

    if (!client) {
      const { statusCode, response } = createErrorResponse(
        "Discord client unavailable",
        503,
      );
      return res.status(statusCode).json(response);
    }

    const { getTicketPanel } = await import(
      "../../features/ticketing/TicketPanel.js"
    );
    const ticketPanel = getTicketPanel();
    await ticketPanel.initialize();

    const existing = await ticketPanel.getPanel(panelId);
    if (!existing || existing.guildId !== guildId) {
      const { statusCode, response } = createErrorResponse(
        "Panel not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    let guild;
    try {
      guild = await client.guilds.fetch(guildId);
    } catch {
      const { statusCode, response } = createErrorResponse(
        "Guild not found",
        404,
      );
      return res.status(statusCode).json(response);
    }

    const result = await ticketPanel.refreshPanelMessage(guild, panelId);
    if (!result.success) {
      const { statusCode, response } = createErrorResponse(
        result.error || "Failed to refresh panel message",
        400,
      );
      return res.status(statusCode).json(response);
    }

    res.json(
      createSuccessResponse({
        guildId,
        panelId,
        refreshed: true,
        message: "Panel message refreshed successfully",
      }),
    );
  } catch (error) {
    logger.error(
      `Error refreshing panel ${panelId} for guild ${guildId}:`,
      error,
    );
    const { statusCode, response } = createErrorResponse(
      "Failed to refresh panel message",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * Format milliseconds into a human-readable duration
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Validate and normalize panel categories from an API request
 * @param {unknown} raw - Raw categories value from request body
 * @returns {{ ok: boolean, categories?: Array, error?: string }} Result
 */
function sanitizeCategories(raw) {
  if (raw === undefined || raw === null) return { ok: true };

  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "categories must be a non-empty array" };
  }

  const usedIds = new Set();
  const categories = [];

  for (let i = 0; i < raw.length; i++) {
    const cat = raw[i];
    if (!cat || typeof cat !== "object") {
      return { ok: false, error: "Each category must be an object" };
    }
    const label = typeof cat.label === "string" ? cat.label.trim() : "";
    if (!label) {
      return { ok: false, error: "Each category needs a label" };
    }
    if (label.length > 80) {
      return {
        ok: false,
        error: "Category labels must be 80 characters or fewer",
      };
    }

    let id =
      typeof cat.id === "string" && cat.id.trim()
        ? cat.id
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
        : `cat-${i + 1}`;
    while (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);

    categories.push({
      id,
      label,
      emoji:
        typeof cat.emoji === "string" && cat.emoji.trim()
          ? cat.emoji.trim()
          : "📧",
      description: typeof cat.description === "string" ? cat.description : "",
      color: typeof cat.color === "number" ? cat.color : 0x5865f2,
    });
  }

  return { ok: true, categories };
}
