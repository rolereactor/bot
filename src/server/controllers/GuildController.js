import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/responseHelpers.js";
import { getDiscordClient, logRequest } from "../utils/apiShared.js";
import { getCommandHandler } from "../../utils/core/commandHandler.js";
import { commandRegistry } from "../../utils/core/commandRegistry.js";
import { GuildHelper } from "../helpers/GuildHelper.js";

const logger = getLogger();

/**
 * Check which of the provided guild IDs the bot is currently in
 */
export async function apiCheckGuilds(req, res) {
  logRequest("Check guilds", req);
  const { guildIds } = req.body;

  if (!guildIds || !Array.isArray(guildIds)) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "Guild IDs are required",
          400,
          "Provide guildIds as an array",
        ).response,
      );
  }

  const client = getDiscordClient();
  if (!client)
    return res
      .status(503)
      .json(createErrorResponse("Bot client not available", 503).response);

  try {
    const installedGuilds = guildIds.filter(id => client.guilds.cache.has(id));
    res.json(createSuccessResponse({ installedGuilds }));
  } catch (error) {
    logger.error("❌ Error checking guilds:", error);
    res
      .status(500)
      .json(
        createErrorResponse("Failed to check guilds", 500, error.message)
          .response,
      );
  }
}

/**
 * List all guilds the bot is currently in
 */
export async function apiListGuilds(req, res) {
  logRequest("List guilds", req);
  const client = getDiscordClient();
  if (!client)
    return res
      .status(503)
      .json(createErrorResponse("Bot client not available", 503).response);

  try {
    const guilds = await Promise.all(
      client.guilds.cache.map(async guild => {
        try {
          await client.guilds
            .fetch({ guild: guild.id, withCounts: true })
            .catch(() => null);
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 128 }),
            memberCount: guild.memberCount,
            joinedAt: guild.joinedAt,
            ownerId: guild.ownerId,
            isPartnered: guild.partnered,
            isVerified: guild.verified,
          };
        } catch (err) {
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 128 }),
            memberCount: guild.memberCount,
            error: err.message,
          };
        }
      }),
    );

    res.json(createSuccessResponse({ guilds, total: guilds.length }));
  } catch (error) {
    logger.error("❌ Error listing guilds:", error);
    res
      .status(500)
      .json(
        createErrorResponse("Failed to list guilds", 500, error.message)
          .response,
      );
  }
}

/**
 * Serialize Date objects to ISO strings for React Server Components compatibility
 * @param {*} value - The value to serialize
 * @returns {*} The serialized value
 */
function serializeDates(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeDates);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeDates(val);
    }
    return result;
  }
  return value;
}

const EDITABLE_GUILD_SETTING_FIELDS = new Set([
  "experienceSystem",
  "disabledCommands",
  "levelRewards",
  "levelRewardMode",
  "autoDeductFromOwner",
]);

function pickEditableGuildSettings(updates) {
  const editableUpdates = {};

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return editableUpdates;
  }

  for (const [key, value] of Object.entries(updates)) {
    if (EDITABLE_GUILD_SETTING_FIELDS.has(key)) {
      editableUpdates[key] = value;
    }
  }

  return editableUpdates;
}

/**
 * Get guild settings and available commands
 */
export async function apiGetGuildSettings(req, res) {
  const { guildId } = req.params;
  logRequest(`Get guild settings: ${guildId}`, req);

  if (!guildId)
    return res
      .status(400)
      .json(createErrorResponse("Guild ID is required", 400).response);

  try {
    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();
    const commandHandler = getCommandHandler();

    if (!dbManager?.guildSettings)
      return res
        .status(503)
        .json(
          createErrorResponse("GuildSettingsRepository not available", 503)
            .response,
        );

    const settings = await dbManager.guildSettings.getByGuild(guildId);

    // Get welcome settings from the separate welcome_settings collection
    let welcomeSettings = null;
    if (dbManager.welcomeSettings) {
      welcomeSettings = await dbManager.welcomeSettings.getByGuild(guildId);
      // Remove internal fields for API response
      if (welcomeSettings) {
        welcomeSettings = {
          enabled: welcomeSettings.enabled ?? false,
          channelId: welcomeSettings.channelId ?? null,
          message:
            welcomeSettings.message ?? "Welcome **{user}** to **{server}**! 🎉",
          autoRoleId: welcomeSettings.autoRoleId ?? null,
          embed: welcomeSettings.embedEnabled ?? true,
        };
      }
    }

    // Get goodbye settings from the separate goodbye_settings collection
    let goodbyeSettings = null;
    if (dbManager.goodbyeSettings) {
      goodbyeSettings = await dbManager.goodbyeSettings.getByGuild(guildId);
      if (goodbyeSettings) {
        goodbyeSettings = {
          enabled: goodbyeSettings.enabled ?? false,
          channelId: goodbyeSettings.channelId ?? null,
          message:
            goodbyeSettings.message ?? "Goodbye **{user}**! We'll miss you. 👋",
          embed: goodbyeSettings.embedEnabled ?? true,
        };
      }
    }

    const client = getDiscordClient();

    if (!commandRegistry.initialized) await commandRegistry.initialize(client);

    const commandDetails = commandHandler
      .getAllCommands()
      .map(name => {
        const info = commandHandler.getCommandInfo(name);
        const metadata = commandRegistry.getCommandMetadata(name);
        if (!info || name === "help" || name === "invite") return null;

        let category = metadata?.category || "general";
        category = category.charAt(0).toUpperCase() + category.slice(1);

        return { name: info.name, description: info.description, category };
      })
      .filter(Boolean);

    const { getPremiumManager } = await import(
      "../../features/premium/PremiumManager.js"
    );
    const { PremiumFeatures } = await import(
      "../../features/premium/config.js"
    );
    const premiumManager = getPremiumManager();

    const isProActive = await premiumManager.isFeatureActive(
      guildId,
      PremiumFeatures.PRO.id,
    );
    const guildStats = await GuildHelper.getEnrichedGuildStats(guildId);
    const proSubscription = await premiumManager.getSubscriptionStatus(
      guildId,
      PremiumFeatures.PRO.id,
    );

    const responseData = {
      settings: {
        ...settings,
        welcomeSystem: welcomeSettings,
        goodbyeSystem: goodbyeSettings,
      },
      guildStats,
      premiumFeatures: settings.premiumFeatures || {},
      isPremium: { pro: isProActive },
      subscription: proSubscription
        ? {
            activatedAt: proSubscription.activatedAt,
            expiresAt: proSubscription.nextDeductionDate,
            cancelled: proSubscription.cancelled,
            cancelledAt: proSubscription.cancelledAt,
            autoRenew: proSubscription.autoRenew,
            cost: proSubscription.cost,
            period: proSubscription.period,
            lastDeductionDate:
              proSubscription.lastDeductionDate || proSubscription.activatedAt,
            isTrial: !!proSubscription.isTrial,
            trialUsed: !!proSubscription.trialUsed,
            trialEndsAt: proSubscription.trialEndsAt || null,
          }
        : null,
      availableCommands: commandDetails,
      premiumConfig: PremiumFeatures,
    };

    // Serialize Date objects to ISO strings for React Server Components
    res.json(createSuccessResponse(serializeDates(responseData)));
  } catch (error) {
    logger.error(`❌ Error getting settings for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to retrieve guild settings",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Get guild channels
 */
export async function apiGetGuildChannels(req, res) {
  const { guildId } = req.params;
  logRequest(`Get guild channels: ${guildId}`, req);

  const client = getDiscordClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild)
    return res
      .status(404)
      .json(createErrorResponse("Guild not found", 404).response);

  try {
    await guild.channels.fetch();
    const channels = guild.channels.cache
      .filter(c => c.type === 0 || c.type === 5)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        position: c.rawPosition,
      }))
      .sort((a, b) => a.position - b.position);

    res.json(createSuccessResponse({ channels }));
  } catch (error) {
    logger.error(`❌ Error getting channels for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to retrieve guild channels",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Get guild roles
 */
export async function apiGetGuildRoles(req, res) {
  const { guildId } = req.params;
  logRequest(`Get guild roles: ${guildId}`, req);

  const client = getDiscordClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild)
    return res
      .status(404)
      .json(createErrorResponse("Guild not found", 404).response);

  try {
    await guild.roles.fetch();
    const roles = guild.roles.cache
      .filter(r => !r.managed)
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        rawPosition: r.rawPosition,
        hoist: r.hoist,
        managed: r.managed,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
      }))
      .sort((a, b) => b.rawPosition - a.rawPosition);

    res.json(createSuccessResponse({ roles }));
  } catch (error) {
    logger.error(`❌ Error getting roles for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to retrieve guild roles",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Get guild emojis
 */
export async function apiGetGuildEmojis(req, res) {
  const { guildId } = req.params;
  logRequest(`Get guild emojis: ${guildId}`, req);

  const client = getDiscordClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild)
    return res
      .status(404)
      .json(createErrorResponse("Guild not found", 404).response);

  try {
    await guild.emojis.fetch();
    const emojis = guild.emojis.cache.map(e => ({
      id: e.id,
      name: e.name,
      animated: e.animated,
      url: e.url,
      identifier: `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`,
    }));

    res.json(createSuccessResponse({ emojis }));
  } catch (error) {
    logger.error(`❌ Error getting emojis for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to retrieve guild emojis",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Update guild settings
 */
export async function apiUpdateGuildSettings(req, res) {
  const { guildId } = req.params;
  const updates = req.body;
  logRequest(`Update guild settings: ${guildId}`, req);

  try {
    const editableUpdates = pickEditableGuildSettings(updates);
    const hasWelcomeUpdate =
      updates?.welcomeSystem &&
      typeof updates.welcomeSystem === "object" &&
      !Array.isArray(updates.welcomeSystem);
    const hasGoodbyeUpdate =
      updates?.goodbyeSystem &&
      typeof updates.goodbyeSystem === "object" &&
      !Array.isArray(updates.goodbyeSystem);

    if (
      !hasWelcomeUpdate &&
      !hasGoodbyeUpdate &&
      Object.keys(editableUpdates).length === 0
    ) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "No editable guild settings provided",
            400,
            "Only dashboard-editable guild settings can be updated through this endpoint.",
          ).response,
        );
    }

    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();
    const existingSettings = await dbManager.guildSettings.getByGuild(guildId);

    // Handle welcome system settings separately
    let welcomeSettings = null;
    if (hasWelcomeUpdate) {
      if (dbManager.welcomeSettings) {
        // Map the API format to the database format
        const welcomeUpdates = {
          enabled: updates.welcomeSystem.enabled ?? false,
          channelId: updates.welcomeSystem.channelId ?? null,
          message:
            updates.welcomeSystem.message ??
            "Welcome **{user}** to **{server}**! 🎉",
          autoRoleId: updates.welcomeSystem.autoRoleId ?? null,
          embedEnabled: updates.welcomeSystem.embed ?? true,
        };
        await dbManager.welcomeSettings.set(guildId, welcomeUpdates);
        welcomeSettings = welcomeUpdates;
      }
    }

    // Handle goodbye system settings separately
    let goodbyeSettings = null;
    if (hasGoodbyeUpdate) {
      if (dbManager.goodbyeSettings) {
        const goodbyeUpdates = {
          enabled: updates.goodbyeSystem.enabled ?? false,
          channelId: updates.goodbyeSystem.channelId ?? null,
          message:
            updates.goodbyeSystem.message ??
            "Goodbye **{user}**! We'll miss you. 👋",
          embedEnabled: updates.goodbyeSystem.embed ?? true,
        };
        await dbManager.goodbyeSettings.set(guildId, goodbyeUpdates);
        goodbyeSettings = goodbyeUpdates;
      }
    }

    const newSettings = {
      ...existingSettings,
      ...editableUpdates,
      updatedAt: new Date(),
    };

    if (editableUpdates.disabledCommands) {
      const { getPremiumManager } = await import(
        "../../features/premium/PremiumManager.js"
      );
      const { PremiumFeatures } = await import(
        "../../features/premium/config.js"
      );
      const premiumManager = getPremiumManager();
      const isActive = await premiumManager.isFeatureActive(
        guildId,
        PremiumFeatures.PRO.id,
      );

      if (!isActive)
        return res
          .status(403)
          .json(
            createErrorResponse(
              "Pro Engine is a premium feature.",
              403,
              "PREMIUM_REQUIRED_PRO",
            ).response,
          );

      const commandHandler = getCommandHandler();
      commandHandler
        .syncGuildCommands(guildId, newSettings.disabledCommands)
        .catch(err =>
          logger.error(
            `Failed to sync command visibility for guild ${guildId}:`,
            err,
          ),
        );
    }

    await dbManager.guildSettings.set(guildId, newSettings);
    res.json(
      createSuccessResponse({
        message: "Settings updated successfully",
        settings: {
          ...newSettings,
          welcomeSystem: welcomeSettings || existingSettings.welcomeSystem,
          goodbyeSystem: goodbyeSettings || existingSettings.goodbyeSystem,
        },
      }),
    );
  } catch (error) {
    logger.error(`❌ Error updating settings for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to update guild settings",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Test welcome message (preview)
 */
export async function apiTestWelcome(req, res) {
  const { guildId } = req.params;
  logRequest(`Test welcome: ${guildId}`, req);

  const client = getDiscordClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild)
    return res
      .status(404)
      .json(createErrorResponse("Guild not found", 404).response);

  try {
    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();
    const settings = await dbManager.welcomeSettings.getByGuild(guildId);

    if (!settings?.enabled) {
      return res
        .status(400)
        .json(
          createErrorResponse("Welcome system is not enabled", 400).response,
        );
    }

    const { sendTestWelcomeMessage } = await import(
      "../../utils/discord/welcomeUtils.js"
    );

    const result = await sendTestWelcomeMessage(guildId, settings, guild);

    if (result.success) {
      res.json(
        createSuccessResponse({
          message: "Test message sent successfully",
          details: {
            format: result.format,
            roleTest: result.roleTestResult,
          },
        }),
      );
    } else {
      res.status(400).json(createErrorResponse(result.error, 400).response);
    }
  } catch (error) {
    logger.error(`❌ Error testing welcome for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to test welcome message",
          500,
          error.message,
        ).response,
      );
  }
}

/**
 * Test goodbye message (preview)
 */
export async function apiTestGoodbye(req, res) {
  const { guildId } = req.params;
  logRequest(`Test goodbye: ${guildId}`, req);

  const client = getDiscordClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild)
    return res
      .status(404)
      .json(createErrorResponse("Guild not found", 404).response);

  try {
    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();
    const settings = await dbManager.goodbyeSettings.getByGuild(guildId);

    if (!settings?.enabled) {
      return res
        .status(400)
        .json(
          createErrorResponse("Goodbye system is not enabled", 400).response,
        );
    }

    const { sendTestGoodbyeMessage } = await import(
      "../../utils/discord/goodbyeUtils.js"
    );

    const result = await sendTestGoodbyeMessage(guildId, settings, guild);

    if (result.success) {
      res.json(
        createSuccessResponse({
          message: "Test message sent successfully",
          details: {
            format: result.format,
          },
        }),
      );
    } else {
      res.status(400).json(createErrorResponse(result.error, 400).response);
    }
  } catch (error) {
    logger.error(`❌ Error testing goodbye for guild ${guildId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "Failed to test goodbye message",
          500,
          error.message,
        ).response,
      );
  }
}
