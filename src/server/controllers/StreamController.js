import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/responseHelpers.js";
import { logRequest } from "../utils/apiShared.js";
import { generateAuthUrl } from "../../features/streaming/utils/oauth.js";
import { DEFAULT_STREAM_CONFIG } from "../../features/streaming/utils/streamConfig.js";
import { getStreamBotAccount } from "../../features/streaming/utils/streamBotAccount.js";
import { GLOBAL_DEFAULT_TWITCH_COMMANDS } from "../../features/streaming/utils/defaultCommands.js";
import { getStreamingManager } from "../../features/streaming/StreamingManager.js";

const logger = getLogger();

function getSm() {
  try {
    return getStreamingManager();
  } catch {
    return null;
  }
}

function getStorageManagerAsync() {
  return import("../../utils/storage/storageManager.js").then(m =>
    m.getStorageManager(),
  );
}

function ok(res, data) {
  return res.json(createSuccessResponse(data));
}

function err(res, message, status = 500, hint = null) {
  const { statusCode, response } = createErrorResponse(message, status, hint);
  return res.status(statusCode).json(response);
}

// ─── Connection Management ───────────────────────────────────────────────────

export async function apiGetStreamStatus(req, res) {
  logRequest("Stream status", req);
  const { guildId } = req.params;

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    const connections = sm.getConnectionStatus(guildId);
    const storage = await getStorageManagerAsync();
    const dbConnections = storage?.dbManager?.streamConnections
      ? await storage.dbManager.streamConnections.getByGuild(guildId)
      : [];

    const enriched = connections.map(conn => {
      const db = dbConnections.find(
        d =>
          d.platform === conn.platform &&
          d.platformLogin === conn.platformLogin,
      );
      return {
        ...conn,
        alertsEnabled: db?.alertsEnabled ?? true,
        alertChannelId: db?.alertChannelId ?? null,
        commandsEnabled: db?.commandsEnabled ?? false,
        commandPrefix: db?.commandPrefix ?? "!",
      };
    });

    const { config } = await import("../../config/config.js");
    const platforms = {
      twitch: { enabled: true },
      youtube: { enabled: config.youtube.enabled },
      kick: { enabled: false },
    };

    return ok(res, { connections: enriched, platforms });
  } catch (error) {
    logger.error("Failed to get stream status", error);
    return err(res, "Failed to get stream status", 500, error.message);
  }
}

export async function apiGenerateConnectUrl(req, res) {
  logRequest("Stream connect", req);
  const { guildId } = req.params;
  const { platform } = req.query;
  const userId = req.user?.id;

  if (!userId) return err(res, "Authentication required", 401);

  try {
    const state = `${guildId}:${userId}:${Date.now()}`;
    const { setTwitchUserState, setYouTubeUserState } = await import(
      "../../utils/oauthStateStore.js"
    );

    if (platform === "youtube") {
      const { config } = await import("../../config/config.js");
      if (!config.youtube.enabled) {
        return err(res, "YouTube is not enabled", 400);
      }

      setYouTubeUserState(state, {
        guildId,
        userId,
        createdAt: Date.now(),
      });

      const { generateYouTubeAuthUrl } = await import(
        "../../features/streaming/utils/youtubeOauth.js"
      );
      const url = generateYouTubeAuthUrl(state);
      return ok(res, { url });
    }

    // Default to Twitch
    setTwitchUserState(state, {
      guildId,
      userId,
      createdAt: Date.now(),
    });

    const url = generateAuthUrl(state);
    return ok(res, { url });
  } catch (error) {
    logger.error("Failed to generate connect URL", error);
    return err(res, "Failed to generate connect URL", 500, error.message);
  }
}

export async function apiDisconnectPlatform(req, res) {
  logRequest("Stream disconnect", req);
  const { guildId } = req.params;
  const { platform } = req.query;
  const userId = req.user?.id;

  if (!userId) return err(res, "Authentication required", 401);

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    await sm.disconnectAccount(guildId, userId, platform || "twitch");
    return ok(res, { message: "Disconnected successfully" });
  } catch (error) {
    logger.error("Failed to disconnect stream", error);
    return err(res, "Failed to disconnect", 500, error.message);
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────

export async function apiGetStreamConfig(req, res) {
  logRequest("Stream config get", req);
  const { guildId } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    const connections = storage?.dbManager?.streamConnections
      ? await storage.dbManager.streamConnections.getByGuild(guildId)
      : [];

    const conn = connections.find(c => c.platform === "twitch");
    if (!conn) return ok(res, { config: DEFAULT_STREAM_CONFIG });

    return ok(res, {
      config: {
        alertsEnabled: conn.alertsEnabled ?? true,
        alertChannelId: conn.alertChannelId ?? null,
        commandsEnabled: conn.commandsEnabled ?? false,
        commandPrefix: conn.commandPrefix ?? "!",
        alertTypes: conn.alertTypes ?? DEFAULT_STREAM_CONFIG.alertTypes,
      },
    });
  } catch (error) {
    logger.error("Failed to get stream config", error);
    return err(res, "Failed to get config", 500, error.message);
  }
}

export async function apiUpdateStreamConfig(req, res) {
  logRequest("Stream config update", req);
  const { guildId } = req.params;
  const userId = req.user?.id;
  const updates = req.body;

  if (!userId) return err(res, "Authentication required", 401);

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    await sm.updateSettings(guildId, userId, "twitch", updates);
    return ok(res, { message: "Config updated" });
  } catch (error) {
    logger.error("Failed to update stream config", error);
    return err(res, "Failed to update config", 500, error.message);
  }
}

// ─── Alert Test ─────────────────────────────────────────────────────────────

export async function apiTestAlert(req, res) {
  logRequest("Stream alert test", req);
  const { guildId } = req.params;
  const { type } = req.body;

  if (!type) return err(res, "Alert type is required", 400);

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    const storage = await getStorageManagerAsync();
    const connections = storage?.dbManager?.streamConnections
      ? await storage.dbManager.streamConnections.getByGuild(guildId)
      : [];
    const conn = connections.find(c => c.platform === "twitch");
    if (!conn) return err(res, "No Twitch connection found", 404);

    const { buildAlertTestEmbed } = await import(
      "../../commands/admin/stream/embeds.js"
    );
    const embed = buildAlertTestEmbed(type);
    if (!embed) return err(res, "Invalid alert type", 400);

    const client = sm.client;
    const channel = client?.channels?.cache.get(conn.alertChannelId);
    if (!channel) return err(res, "Alert channel not found", 404);

    await channel.send({ embeds: [embed] });
    return ok(res, { message: "Test alert sent" });
  } catch (error) {
    logger.error("Failed to test alert", error);
    return err(res, "Failed to send test alert", 500, error.message);
  }
}

// ─── Chat Commands ──────────────────────────────────────────────────────────

export async function apiListCommands(req, res) {
  logRequest("Stream commands list", req);
  const { guildId } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    const guildCmds = storage?.dbManager?.twitchCommands
      ? await storage.dbManager.twitchCommands.listByGuild(guildId)
      : [];

    const builtIn = GLOBAL_DEFAULT_TWITCH_COMMANDS.map(c => ({
      name: c.name,
      description: c.description || c.name,
      userlevel: c.userlevel || "everyone",
      response: c.response,
      enabled: true,
      isBuiltIn: true,
    }));

    const custom = guildCmds.map(c => ({
      name: c.name,
      description: c.description || c.name,
      userlevel: c.userlevel || "everyone",
      response: c.response,
      enabled: c.enabled !== false,
      isBuiltIn: false,
    }));

    return ok(res, { commands: [...builtIn, ...custom] });
  } catch (error) {
    logger.error("Failed to list commands", error);
    return err(res, "Failed to list commands", 500, error.message);
  }
}

export async function apiAddCommand(req, res) {
  logRequest("Stream command add", req);
  const { guildId } = req.params;
  const { name, response, description, userlevel } = req.body;

  if (!name || !response)
    return err(res, "Name and response are required", 400);

  const builtIn = GLOBAL_DEFAULT_TWITCH_COMMANDS.find(
    c => c.name === name.toLowerCase(),
  );
  if (builtIn) return err(res, "Cannot override built-in commands", 400);

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchCommands)
      return err(res, "Commands storage unavailable", 503);

    const existing = await storage.dbManager.twitchCommands.getByName(
      guildId,
      name,
    );
    if (existing) return err(res, `Command "${name}" already exists`, 409);

    await storage.dbManager.twitchCommands.create(guildId, {
      name: name.toLowerCase(),
      response,
      description: description || "",
      userlevel: userlevel || "everyone",
      enabled: true,
    });

    return ok(res, { message: `Command "${name}" added` });
  } catch (error) {
    logger.error("Failed to add command", error);
    return err(res, "Failed to add command", 500, error.message);
  }
}

export async function apiEditCommand(req, res) {
  logRequest("Stream command edit", req);
  const { guildId, name } = req.params;
  const updates = req.body;

  const builtIn = GLOBAL_DEFAULT_TWITCH_COMMANDS.find(c => c.name === name);
  if (builtIn) return err(res, "Cannot edit built-in commands", 400);

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchCommands)
      return err(res, "Commands storage unavailable", 503);

    const existing = await storage.dbManager.twitchCommands.getByName(
      guildId,
      name,
    );
    if (!existing) return err(res, `Command "${name}" not found`, 404);

    await storage.dbManager.twitchCommands.update(guildId, name, updates);
    return ok(res, { message: `Command "${name}" updated` });
  } catch (error) {
    logger.error("Failed to edit command", error);
    return err(res, "Failed to edit command", 500, error.message);
  }
}

export async function apiDeleteCommand(req, res) {
  logRequest("Stream command delete", req);
  const { guildId, name } = req.params;

  const builtIn = GLOBAL_DEFAULT_TWITCH_COMMANDS.find(c => c.name === name);
  if (builtIn) return err(res, "Cannot delete built-in commands", 400);

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchCommands)
      return err(res, "Commands storage unavailable", 503);

    await storage.dbManager.twitchCommands.remove(guildId, name);
    return ok(res, { message: `Command "${name}" deleted` });
  } catch (error) {
    logger.error("Failed to delete command", error);
    return err(res, "Failed to delete command", 500, error.message);
  }
}

// ─── Chat Filters ───────────────────────────────────────────────────────────

export async function apiGetFilters(req, res) {
  logRequest("Stream filters get", req);
  const { guildId } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchChatFilters) {
      return ok(res, { filters: { enabled: false } });
    }

    const settings =
      await storage.dbManager.twitchChatFilters.getByGuild(guildId);
    return ok(res, { filters: settings || { enabled: false } });
  } catch (error) {
    logger.error("Failed to get filters", error);
    return err(res, "Failed to get filters", 500, error.message);
  }
}

export async function apiUpdateFilter(req, res) {
  logRequest("Stream filter update", req);
  const { guildId, filter } = req.params;
  const updates = req.body;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchChatFilters) {
      return err(res, "Filters storage unavailable", 503);
    }

    await storage.dbManager.twitchChatFilters.set(guildId, filter, updates);
    return ok(res, { message: `Filter "${filter}" updated` });
  } catch (error) {
    logger.error("Failed to update filter", error);
    return err(res, "Failed to update filter", 500, error.message);
  }
}

// ─── Quotes ─────────────────────────────────────────────────────────────────

export async function apiListQuotes(req, res) {
  logRequest("Stream quotes list", req);
  const { guildId } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchQuotes) return ok(res, { quotes: [] });

    const quotes = await storage.dbManager.twitchQuotes.list(guildId);
    return ok(res, { quotes: quotes || [] });
  } catch (error) {
    logger.error("Failed to list quotes", error);
    return err(res, "Failed to list quotes", 500, error.message);
  }
}

export async function apiAddQuote(req, res) {
  logRequest("Stream quote add", req);
  const { guildId } = req.params;
  const { text } = req.body;

  if (!text) return err(res, "Quote text is required", 400);

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchQuotes)
      return err(res, "Quotes storage unavailable", 503);

    const doc = await storage.dbManager.twitchQuotes.add(guildId, text);
    return ok(res, { message: "Quote added", id: doc.id });
  } catch (error) {
    logger.error("Failed to add quote", error);
    return err(res, "Failed to add quote", 500, error.message);
  }
}

export async function apiDeleteQuote(req, res) {
  logRequest("Stream quote delete", req);
  const { guildId, id } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchQuotes)
      return err(res, "Quotes storage unavailable", 503);

    await storage.dbManager.twitchQuotes.remove(guildId, parseInt(id, 10));
    return ok(res, { message: "Quote deleted" });
  } catch (error) {
    logger.error("Failed to delete quote", error);
    return err(res, "Failed to delete quote", 500, error.message);
  }
}

// ─── Timers ─────────────────────────────────────────────────────────────────

export async function apiListTimers(req, res) {
  logRequest("Stream timers list", req);
  const { guildId } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchTimers) return ok(res, { timers: [] });

    const timers = await storage.dbManager.twitchTimers.listByGuild(guildId);
    return ok(res, { timers: timers || [] });
  } catch (error) {
    logger.error("Failed to list timers", error);
    return err(res, "Failed to list timers", 500, error.message);
  }
}

export async function apiAddTimer(req, res) {
  logRequest("Stream timer add", req);
  const { guildId } = req.params;
  const { name, message, interval } = req.body;

  if (!name || !message) return err(res, "Name and message are required", 400);

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchTimers)
      return err(res, "Timers storage unavailable", 503);

    await storage.dbManager.twitchTimers.create(guildId, {
      name,
      message,
      intervalMs: (interval || 300) * 1000,
      enabled: true,
    });

    return ok(res, { message: `Timer "${name}" added` });
  } catch (error) {
    logger.error("Failed to add timer", error);
    return err(res, "Failed to add timer", 500, error.message);
  }
}

export async function apiDeleteTimer(req, res) {
  logRequest("Stream timer delete", req);
  const { guildId, name } = req.params;

  try {
    const storage = await getStorageManagerAsync();
    if (!storage?.dbManager?.twitchTimers)
      return err(res, "Timers storage unavailable", 503);

    await storage.dbManager.twitchTimers.remove(guildId, name);
    return ok(res, { message: `Timer "${name}" deleted` });
  } catch (error) {
    logger.error("Failed to delete timer", error);
    return err(res, "Failed to delete timer", 500, error.message);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

export async function apiGetDiagnostics(req, res) {
  logRequest("Stream diagnostics", req);
  const { guildId } = req.params;

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    const connections = sm.getConnectionStatus(guildId);
    const bot = await getStreamBotAccount();

    const eventSubSessions = sm.eventSubClient?.sessions?.length ?? 0;
    const eventSubReady =
      sm.eventSubClient?.sessions?.filter(s => s.ready).length ?? 0;

    return ok(res, {
      connections,
      botAccount: bot
        ? {
            connected: true,
            source: bot.source,
            login: bot.login || bot.botLogin,
          }
        : { connected: false },
      eventSub: {
        sessions: eventSubSessions,
        ready: eventSubReady,
      },
      lastChatAt: sm.lastChatAt,
      lastCommandReplyAt: sm.lastCommandReplyAt,
    });
  } catch (error) {
    logger.error("Failed to get diagnostics", error);
    return err(res, "Failed to get diagnostics", 500, error.message);
  }
}

/**
 * POST /stream/guilds/:guildId/overlay-token — Generate overlay URL token
 */
export async function apiGenerateOverlayToken(req, res) {
  const { guildId } = req.params;
  const { widget, expiresIn } = req.body || {};

  logRequest("Generate Overlay Token", req, {}, "🔗");

  if (!widget) {
    return err(
      res,
      "widget parameter required (alerts, chat, activity, stats)",
      400,
    );
  }

  try {
    const { generateOverlayToken } = await import("../utils/overlayToken.js");
    const { token, expiresAt } = generateOverlayToken(
      guildId,
      widget,
      expiresIn ? parseInt(expiresIn, 10) * 1000 : undefined,
    );

    const baseUrl =
      process.env.BOT_WEBSITE_URL || process.env.WEBSITE_URL || "";
    const overlayPath = `/overlay/${guildId}/${widget}`;
    const url = baseUrl
      ? `${baseUrl}${overlayPath}?token=${token}`
      : overlayPath;

    return ok(res, { token, url, expiresAt, widget });
  } catch (error) {
    logger.error("Failed to generate overlay token", error);
    return err(res, error.message || "Failed to generate overlay token", 500);
  }
}

/**
 * GET /stream/guilds/:guildId/verify-mod — Verify if bot is a moderator
 */
export async function apiVerifyMod(req, res) {
  const { guildId } = req.params;

  logRequest("Verify Mod Status", req);

  try {
    const sm = getSm();
    if (!sm) return err(res, "Streaming manager not available", 503);

    const twitchPlatform = sm.platforms.get(guildId)?.get("twitch");
    if (!twitchPlatform) {
      return err(res, "Twitch not connected for this guild", 404);
    }

    const isMod = await twitchPlatform.isModerator();
    return ok(res, { isMod });
  } catch (error) {
    logger.error("Failed to verify mod status", error);
    return err(res, "Failed to verify mod status", 500, error.message);
  }
}
