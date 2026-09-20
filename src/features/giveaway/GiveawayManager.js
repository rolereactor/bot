import { EventEmitter } from "events";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { getLogger } from "../../utils/logger.js";
import { getDatabaseManager } from "../../utils/storage/databaseManager.js";
import { FREE_TIER, PRO_TIER, CORE_STATUS } from "../premium/config.js";
import { getPremiumManager } from "../premium/PremiumManager.js";
import { WEBSITE_URL } from "../../config/domains.js";

const logger = getLogger();

class GiveawayManager extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.db = null;
    this.collection = null;
    this.settingsCollection = null;
    this.checkInterval = null;
    this.CHECK_INTERVAL_MS = 30000; // Check every 30 seconds (optimized from 10s)
    this.premiumManager = getPremiumManager();

    // Caching for active giveaways
    this.activeGiveawaysCache = new Map();
    this.cacheTimestamp = null;
    this.CACHE_TTL_MS = 60000; // Cache valid for 1 minute

    // Rate limiting cache: userId => { count, lastGiveaway }
    this.rateLimitCache = new Map();

    // Performance metrics
    this.metrics = {
      lastCheckTime: 0,
      totalChecks: 0,
      giveawaysEnded: 0,
      averageCheckDuration: 0,
    };
  }

  /**
   * Initialize the giveaway manager
   */
  async init() {
    try {
      const dbManager = await getDatabaseManager();
      // Access the database from connectionManager after connect() is called
      await dbManager.connect();
      this.db = dbManager.connectionManager.db;
      this.collection = this.db.collection("giveaways");
      // Create indexes for better query performance
      await this.collection.createIndex({ guildId: 1, status: 1 });
      await this.collection.createIndex({ endTime: 1, status: 1 });
      await this.collection.createIndex({ messageId: 1 });
      await this.collection.createIndex({ host: 1, status: 1 });
      await this.collection.createIndex({ guildId: 1, host: 1, status: 1 });
      await this.collection.createIndex(
        { shortId: 1 },
        { unique: true, sparse: true },
      );

      logger.info("🎉 GiveawayManager initialized");

      // Start the giveaway check interval
      this.startCheckInterval();
    } catch (error) {
      logger.error("❌ Failed to initialize GiveawayManager:", error);
      throw error;
    }
  }

  /**
   * Start the interval to check for ending giveaways
   */
  startCheckInterval() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkEndingGiveaways();
    }, this.CHECK_INTERVAL_MS).unref();

    logger.debug("🕐 Giveaway check interval started");
  }

  /**
   * Stop the check interval
   */
  stopCheckInterval() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.debug("🛑 Giveaway check interval stopped");
    }
  }

  /**
   * Check for giveaways that should end (OPTIMIZED with caching)
   */
  async checkEndingGiveaways() {
    const startTime = Date.now();

    try {
      // Refresh cache if expired
      await this.refreshActiveGiveawaysCache();

      const now = new Date();
      const endingGiveaways = [];

      // Use cached data instead of querying database every time
      for (const [, giveaways] of this.activeGiveawaysCache) {
        for (const giveaway of giveaways) {
          if (giveaway.endTime <= now) {
            endingGiveaways.push(giveaway);
          }
        }
      }

      for (const giveaway of endingGiveaways) {
        await this.endGiveaway(giveaway._id.toString());
      }

      // Update metrics
      this.metrics.totalChecks++;
      this.metrics.giveawaysEnded += endingGiveaways.length;
      const duration = Date.now() - startTime;
      this.metrics.lastCheckTime = duration;
      this.metrics.averageCheckDuration =
        (this.metrics.averageCheckDuration * (this.metrics.totalChecks - 1) +
          duration) /
        this.metrics.totalChecks;

      if (endingGiveaways.length > 0) {
        logger.info(
          `🎉 Ended ${endingGiveaways.length} giveaway(s) in ${duration}ms`,
        );
      }
    } catch (error) {
      logger.error("❌ Error checking ending giveaways:", error);
    }
  }

  /**
   * Refresh active giveaways cache (OPTIMIZED)
   */
  async refreshActiveGiveawaysCache() {
    const now = Date.now();

    // Only refresh if cache is expired
    if (this.cacheTimestamp && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return; // Cache still valid
    }

    try {
      const activeGiveaways = await this.collection
        .find(
          { status: "active" },
          { projection: { guildId: 1, endTime: 1, status: 1 } },
        )
        .toArray();

      // Group by guild for faster lookup
      const grouped = new Map();
      for (const giveaway of activeGiveaways) {
        if (!grouped.has(giveaway.guildId)) {
          grouped.set(giveaway.guildId, []);
        }
        grouped.get(giveaway.guildId).push(giveaway);
      }

      this.activeGiveawaysCache = grouped;
      this.cacheTimestamp = now;

      logger.debug(
        `📦 Refreshed giveaway cache: ${activeGiveaways.length} active giveaways`,
      );
    } catch (error) {
      logger.error("❌ Error refreshing giveaway cache:", error);
    }
  }

  /**
   * Generates a unique 8-character short ID for a giveaway.
   * Combines a timestamp component and a random component.
   * @returns {string} An 8-character alphanumeric string.
   */
  generateShortId() {
    const timestampComponent = (Date.now() % 1000000)
      .toString(36)
      .padStart(4, "0"); // 4 chars from timestamp
    const randomComponent = randomBytes(3).toString("hex").slice(0, 4); // 4 chars from random bytes
    return (timestampComponent + randomComponent).slice(0, 8).toLowerCase();
  }

  /**
   * Create a new giveaway
   * @param {Object} options - Giveaway options
   * @returns {Promise<Object>} Created giveaway
   */
  async create(options) {
    try {
      let shortId = this.generateShortId();
      // Ensure shortId is unique (unlikely to collide, but good practice)
      while (await this.collection.findOne({ shortId })) {
        shortId = this.generateShortId();
      }

      const giveaway = {
        _id: new ObjectId(),
        guildId: options.guildId,
        channelId: options.channelId,
        messageId: null,
        prize: options.prize,
        winners: options.winners || 1,
        host: options.host,
        entries: [],
        requirements: {
          roles: options.requiredRoles || [],
          minAccountAge: options.minAccountAge
            ? options.minAccountAge * 24 * 60 * 60 * 1000
            : 0,
          minServerAge: options.minServerAge
            ? options.minServerAge * 24 * 60 * 60 * 1000
            : 0,
          excludeBots: true,
          minLevel: options.minLevel || 0,
          requireVote: options.requireVote || false,
        },
        bonusEntries: options.bonusEntries || [],
        startTime: new Date(),
        endTime: new Date(Date.now() + options.duration),
        duration: options.duration,
        status: "active",
        winnersData: [],
        shortId: shortId,
        description: options.description || "",
        thumbnail: options.thumbnail || null,
        color: options.color || null,
        reactionEmoji: options.reactionEmoji || "🎁",
        allowBotEntries: false,
        claimPeriod: options.claimPeriod ?? 48, // Default 48 Hours
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.collection.insertOne(giveaway);
      logger.info(
        `🎉 Giveaway created: ${giveaway._id} - Prize: ${giveaway.prize} (Short ID: ${giveaway.shortId})`,
      );

      // Invalidate cache to include new giveaway
      this.invalidateCache();

      return giveaway;
    } catch (error) {
      logger.error("❌ Error creating giveaway:", error);
      throw error;
    }
  }

  /**
   * Get a giveaway by ID or Message ID
   * @param {string} id - Giveaway ID or Message ID
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    try {
      if (!id) return null;

      // If it's a valid ObjectId (24 hex chars)
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        const giveaway = await this.collection.findOne({
          _id: new ObjectId(id),
        });
        if (giveaway) return giveaway;
      }

      // If it's a shortId (8 chars)
      if (id.length === 8) {
        const giveaway = await this.collection.findOne({ shortId: id });
        if (giveaway) return giveaway;
      }

      // Treat as messageId
      return await this.collection.findOne({ messageId: id });
    } catch (error) {
      logger.error("❌ Error getting giveaway by ID:", error);
      throw error;
    }
  }

  /**
   * Get a giveaway by message ID
   * @param {string} messageId - Message ID
   * @returns {Promise<Object|null>}
   */
  async getByMessageId(messageId) {
    try {
      return await this.collection.findOne({ messageId });
    } catch (error) {
      logger.error("❌ Error getting giveaway by message ID:", error);
      throw error;
    }
  }

  /**
   * Get all active giveaways for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<Array>}
   */
  async getActiveForGuild(guildId) {
    try {
      return await this.collection
        .find({
          guildId,
          status: "active",
        })
        .toArray();
    } catch (error) {
      logger.error("❌ Error getting active giveaways:", error);
      throw error;
    }
  }

  /**
   * Get all giveaways for a guild (including ended/cancelled)
   * @param {string} guildId - Guild ID
   * @returns {Promise<Array>}
   */
  async getAllForGuild(guildId) {
    try {
      return await this.collection.find({ guildId }).toArray();
    } catch (error) {
      logger.error("❌ Error getting all giveaways:", error);
      throw error;
    }
  }

  /**
   * Edit a giveaway
   * @param {string} giveawayId - Giveaway ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated giveaway
   */
  async edit(giveawayId, updates) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        throw new Error("Giveaway not found");
      }

      if (giveaway.status !== "active") {
        throw new Error("Can only edit active giveaways");
      }

      const allowedUpdates = [
        "prize",
        "winners",
        "description",
        "endTime",
        "duration",
        "thumbnail",
        "color",
        "requirements",
        "claimPeriod",
      ];
      const updateData = {};

      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          updateData[key] = updates[key];
        }
      }

      updateData.updatedAt = new Date();

      const result = await this.collection.findOneAndUpdate(
        { _id: giveaway._id },
        { $set: updateData },
        { returnDocument: "after" },
      );

      logger.info(`✏️ Giveaway edited: ${giveawayId}`);

      // Log edit
      await this.logGiveawayEvent(giveaway.guildId, "giveaway_edited", {
        giveawayId,
        updates: Object.keys(updateData).filter(k => k !== "updatedAt"),
      });

      // Emit event so the Discord message embed gets updated live
      this.emit("giveawayEdited", result);

      return result;
    } catch (error) {
      logger.error("❌ Error editing giveaway:", error);
      throw error;
    }
  }

  /**
   * Add a user to giveaway entries
   * @param {string} giveawayId - Giveaway ID
   * @param {string} userId - User ID
   * @param {number} entries - Number of entries (default: 1)
   * @returns {Promise<Object>} Result with success status and entries count
   */
  async addEntry(giveawayId, userId, entries = 1) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      if (giveaway.status !== "active") {
        return { success: false, error: "Giveaway is not active" };
      }

      // VPS Protection: Check total entries limit
      const currentTotal = giveaway.entries.reduce(
        (sum, e) => sum + e.count,
        0,
      );
      const isPro = await this.premiumManager.isFeatureActive(
        giveaway.guildId,
        "pro_engine",
      );
      const maxEntries = isPro
        ? PRO_TIER.GIVEAWAY_MAX_ENTRIES
        : FREE_TIER.GIVEAWAY_MAX_ENTRIES;

      if (currentTotal + entries > maxEntries) {
        return {
          success: false,
          error: `This giveaway has reached the maximum entry limit of ${maxEntries.toLocaleString()}. ${isPro ? "" : `Upgrade to **${CORE_STATUS.PRO.emoji} Pro Engine** for unlimited entries! Enable it on our **[website](${WEBSITE_URL})** using Cores.`}`,
        };
      }

      const now = new Date();
      const incExistingFilter = {
        _id: giveaway._id,
        status: "active",
        "entries.userId": userId,
      };
      const incExistingUpdate = {
        $inc: { "entries.$.count": entries },
        $set: { "entries.$.joinedAt": now, updatedAt: now },
      };

      // Atomically increment if the user already has an entry — no whole-array rewrite
      let updated = await this.collection.findOneAndUpdate(
        incExistingFilter,
        incExistingUpdate,
        { returnDocument: "after" },
      );

      if (!updated) {
        // Otherwise push a new entry, guarded to only match if user still has none
        updated = await this.collection.findOneAndUpdate(
          {
            _id: giveaway._id,
            status: "active",
            entries: { $not: { $elemMatch: { userId } } },
          },
          {
            $push: { entries: { userId, count: entries, joinedAt: now } },
            $set: { updatedAt: now },
          },
          { returnDocument: "after" },
        );

        if (!updated) {
          // Lost a race with a concurrent entry by the same user — increment instead
          updated = await this.collection.findOneAndUpdate(
            incExistingFilter,
            incExistingUpdate,
            { returnDocument: "after" },
          );
        }
      }

      if (!updated) {
        return { success: false, error: "Giveaway is not active" };
      }

      const userEntry = updated.entries.find(e => e.userId === userId);
      const totalEntries = updated.entries.reduce((sum, e) => sum + e.count, 0);

      return {
        success: true,
        entries: userEntry ? userEntry.count : entries,
        totalEntries,
      };
    } catch (error) {
      logger.error("❌ Error adding entry:", error);
      throw error;
    }
  }

  /**
   * Remove a user's entries from a giveaway
   * @param {string} giveawayId - Giveaway ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result with success status
   */
  async removeEntry(giveawayId, userId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      await this.collection.updateOne(
        { _id: giveaway._id },
        { $pull: { entries: { userId } }, $set: { updatedAt: new Date() } },
      );

      return { success: true };
    } catch (error) {
      logger.error("❌ Error removing entry:", error);
      throw error;
    }
  }

  /**
   * Get user's entries for a giveaway
   * @param {string} giveawayId - Giveaway ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of entries
   */
  async getUserEntries(giveawayId, userId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return 0;
      }

      const entry = giveaway.entries.find(e => e.userId === userId);
      return entry ? entry.count : 0;
    } catch (error) {
      logger.error("❌ Error getting user entries:", error);
      return 0;
    }
  }

  /**
   * Get total entries for a giveaway
   * @param {string} giveawayId - Giveaway ID
   * @returns {Promise<number>} Total entries
   */
  async getTotalEntries(giveawayId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return 0;
      }

      return giveaway.entries.reduce((sum, e) => sum + e.count, 0);
    } catch (error) {
      logger.error("❌ Error getting total entries:", error);
      return 0;
    }
  }

  /**
   * End a giveaway and select winners
   * @param {string} giveawayId - Giveaway ID
   * @returns {Promise<Object>} Result with winners
   */
  async endGiveaway(giveawayId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      if (giveaway.status !== "active") {
        return { success: false, error: "Giveaway already ended" };
      }

      // Select winners
      const winners = this.selectWinners(giveaway.entries, giveaway.winners);

      // Update giveaway status
      await this.collection.updateOne(
        { _id: giveaway._id },
        {
          $set: {
            status: "ended",
            winnersData: winners,
            updatedAt: new Date(),
            endedAt: new Date(),
          },
        },
      );

      logger.info(
        `🎉 Giveaway ended: ${giveawayId} - Winners: ${winners.length}`,
      );

      // Invalidate cache since giveaway status changed
      this.invalidateCache();

      // Log giveaway end
      await this.logGiveawayEvent(giveaway.guildId, "giveaway_ended", {
        giveawayId,
        winners: winners.length,
        totalEntries: giveaway.entries.reduce((sum, e) => sum + e.count, 0),
      });

      // Emit event for handler to announce winners
      this.emit("giveawayEnded", giveaway, winners);

      return { success: true, winners };
    } catch (error) {
      logger.error("❌ Error ending giveaway:", error);
      throw error;
    }
  }

  /**
   * Select random winners from entries
   * @param {Array} entries - All entries
   * @param {number} winnerCount - Number of winners to select
   * @returns {Array} Selected winners
   */
  selectWinners(entries, winnerCount) {
    // Build weighted pool based on entry count
    const pool = [];

    for (const entry of entries) {
      for (let i = 0; i < entry.count; i++) {
        pool.push(entry.userId);
      }
    }

    if (pool.length === 0) {
      return [];
    }

    // Fisher-Yates shuffle to pick unique winners in O(n)
    // Avoids coupon-collector degeneration when pool is heavily weighted
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Deduplicate: pick first N unique users from shuffled pool
    const seen = new Set();
    const winners = [];
    const maxWinners = Math.min(winnerCount, shuffled.length);

    for (let i = 0; i < shuffled.length && winners.length < maxWinners; i++) {
      if (!seen.has(shuffled[i])) {
        seen.add(shuffled[i]);
        winners.push({
          userId: shuffled[i],
          selectedAt: new Date(),
          claimed: false,
        });
      }
    }

    return winners;
  }

  /**
   * Reroll a giveaway to select new winners
   * @param {string} giveawayId - Giveaway ID
   * @param {number} newWinnerCount - Number of new winners to select
   * @returns {Promise<Object>} Result with new winners
   */
  async rerollGiveaway(giveawayId, newWinnerCount = null) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      if (giveaway.status === "active") {
        return { success: false, error: "Giveaway is still active" };
      }

      const winnerCount = newWinnerCount || giveaway.winners;
      const winners = this.selectWinners(giveaway.entries, winnerCount);

      await this.collection.updateOne(
        { _id: giveaway._id },
        {
          $set: {
            winnersData: winners,
            updatedAt: new Date(),
            rerolledAt: new Date(),
          },
        },
      );

      logger.info(
        `🔄 Giveaway rerolled: ${giveawayId} - New Winners: ${winners.length}`,
      );

      // Log reroll
      await this.logGiveawayEvent(giveaway.guildId, "giveaway_rerolled", {
        giveawayId,
        newWinners: winners.length,
      });

      this.emit("giveawayRerolled", giveaway, winners);

      return { success: true, winners };
    } catch (error) {
      logger.error("❌ Error rerolling giveaway:", error);
      throw error;
    }
  }

  /**
   * Cancel a giveaway (no winners)
   * @param {string} giveawayId - Giveaway ID
   * @returns {Promise<Object>} Result
   */
  async cancelGiveaway(giveawayId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      await this.collection.updateOne(
        { _id: giveaway._id },
        {
          $set: {
            status: "cancelled",
            updatedAt: new Date(),
            cancelledAt: new Date(),
          },
        },
      );

      logger.info(`🚫 Giveaway cancelled: ${giveawayId}`);

      // Log cancellation
      await this.logGiveawayEvent(giveaway.guildId, "giveaway_cancelled", {
        giveawayId,
        host: giveaway.host,
      });

      this.emit("giveawayCancelled", giveaway);

      return { success: true };
    } catch (error) {
      logger.error("❌ Error cancelling giveaway:", error);
      throw error;
    }
  }

  /**
   * Mark a winner as claimed
   * @param {string} giveawayId - Giveaway ID
   * @param {string} userId - Winner's user ID
   * @returns {Promise<Object>} Result
   */
  async markClaimed(giveawayId, userId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      const winner = giveaway.winnersData.find(w => w.userId === userId);

      if (!winner) {
        return { success: false, error: "User is not a winner" };
      }

      // Update individually to not overwrite other winners who might have claimed
      await this.collection.updateOne(
        { _id: giveaway._id, "winnersData.userId": userId },
        {
          $set: {
            "winnersData.$.claimed": true,
            "winnersData.$.claimedAt": new Date(),
            updatedAt: new Date(),
          },
        },
      );

      // Check if all winners claimed
      const allClaimed = giveaway.winnersData.every(w => w.claimed);

      if (allClaimed) {
        await this.collection.updateOne(
          { _id: giveaway._id },
          {
            $set: {
              status: "completed",
              completedAt: new Date(),
            },
          },
        );
      }

      logger.info(`✅ Giveaway prize claimed: ${giveawayId} by ${userId}`);

      // Log claim
      await this.logGiveawayEvent(giveaway.guildId, "prize_claimed", {
        giveawayId,
        winner: userId,
      });

      return { success: true, allClaimed };
    } catch (error) {
      logger.error("❌ Error marking claimed:", error);
      throw error;
    }
  }

  /**
   * Update giveaway message ID
   * @param {string} giveawayId - Giveaway ID
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} Result
   */
  async updateMessageId(giveawayId, messageId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      await this.collection.updateOne(
        { _id: giveaway._id },
        {
          $set: {
            messageId,
            updatedAt: new Date(),
          },
        },
      );

      return { success: true };
    } catch (error) {
      logger.error("❌ Error updating message ID:", error);
      throw error;
    }
  }

  /**
   * Get giveaway statistics for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object>} Statistics
   */
  async getStats(guildId) {
    try {
      const pipeline = [
        { $match: { guildId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalEntries: {
              $sum: {
                $reduce: {
                  input: "$entries",
                  initialValue: 0,
                  in: { $add: ["$$value", "$$this.count"] },
                },
              },
            },
          },
        },
      ];

      const results = await this.collection.aggregate(pipeline).toArray();

      const stats = {
        total: 0,
        active: 0,
        ended: 0,
        completed: 0,
        cancelled: 0,
        totalEntries: 0,
      };

      for (const result of results) {
        stats[result._id] = result.count;
        stats.total += result.count;
        if (result._id !== "cancelled") {
          stats.totalEntries += result.totalEntries || 0;
        }
      }

      return stats;
    } catch (error) {
      logger.error("❌ Error getting stats:", error);
      throw error;
    }
  }

  /**
   * Log giveaway event
   * @param {string} guildId - Guild ID
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  async logGiveawayEvent(guildId, eventType, data) {
    try {
      this.emit("giveawayLog", guildId, eventType, data);
    } catch (error) {
      logger.error("❌ Error logging giveaway event:", error);
    }
  }
  /**
   * Delete a giveaway permanently from the database
   * @param {string} giveawayId - Giveaway ID
   * @returns {Promise<Object>} Result with success status
   */
  async deleteGiveaway(giveawayId) {
    try {
      const giveaway = await this.getById(giveawayId);

      if (!giveaway) {
        return { success: false, error: "Giveaway not found" };
      }

      await this.collection.deleteOne({ _id: giveaway._id });

      logger.info(`🗑️ Giveaway permanently deleted: ${giveawayId}`);

      // Invalidate cache
      this.invalidateCache();

      // Log giveaway delete
      await this.logGiveawayEvent(giveaway.guildId, "giveaway_cancelled", {
        giveawayId,
        reason: "Permanently deleted by admin",
      });

      return { success: true, giveaway };
    } catch (error) {
      logger.error("❌ Error deleting giveaway:", error);
      throw error;
    }
  }

  /**
   * Clean up old giveaways
   * @param {number} daysOld - Delete giveaways older than this many days
   * @returns {Promise<number>} Number of deleted giveaways
   */
  async cleanup(daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await this.collection.deleteMany({
        status: { $in: ["completed", "cancelled"] },
        updatedAt: { $lt: cutoffDate },
      });

      // Invalidate cache after cleanup
      this.activeGiveawaysCache.clear();
      this.cacheTimestamp = null;

      logger.info(`🧹 Cleaned up ${result.deletedCount} old giveaways`);

      return result.deletedCount;
    } catch (error) {
      logger.error("❌ Error cleaning up giveaways:", error);
      throw error;
    }
  }

  /**
   * Get performance metrics (OPTIMIZED)
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.activeGiveawaysCache.size,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : 0,
      checkInterval: this.CHECK_INTERVAL_MS,
      cacheTTL: this.CACHE_TTL_MS,
    };
  }

  /**
   * Invalidate cache (call when giveaways change)
   */
  invalidateCache() {
    this.activeGiveawaysCache.clear();
    this.cacheTimestamp = null;
    logger.debug("🗑️ Giveaway cache invalidated");
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy() {
    this.stopCheckInterval();
    this.removeAllListeners();
    this.rateLimitCache.clear();
    logger.info("🛑 GiveawayManager destroyed");
  }
}

// Export singleton instance
const giveawayManager = new GiveawayManager();

export default giveawayManager;
export { GiveawayManager };
