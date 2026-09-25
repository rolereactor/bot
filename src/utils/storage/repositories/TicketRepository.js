import { BaseRepository } from "./BaseRepository.js";

/**
 * Repository for managing support tickets
 */
export class TicketRepository extends BaseRepository {
  constructor(db, cache, logger) {
    super(db, "tickets", cache, logger);
    this._ensureIndexes();
  }

  /**
   * Create indexes for optimal query performance
   */
  async _ensureIndexes() {
    try {
      await this.collection.createIndex({ ticketId: 1 }, { unique: true });
      await this.collection.createIndex({ guildId: 1, status: 1 });
      await this.collection.createIndex({ userId: 1, openedAt: -1 });
      await this.collection.createIndex({ claimedBy: 1, status: 1 });
      await this.collection.createIndex(
        { channelId: 1 },
        { unique: true, sparse: true },
      );
      await this.collection.createIndex({ guildId: 1, openedAt: -1 });
      this.logger.debug("TicketRepository indexes ensured");
    } catch (error) {
      this.logger.debug(
        "TicketRepository indexes already exist or error:",
        error.message,
      );
    }
  }

  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data
   * @returns {Promise<Object|null>} Created ticket or null
   */
  async create(ticketData) {
    try {
      const now = new Date();
      const ticket = {
        ticketId: ticketData.ticketId,
        guildId: ticketData.guildId,
        channelId: ticketData.channelId,
        userId: ticketData.userId,
        categoryId: ticketData.categoryId || "default",

        status: ticketData.status || "open",
        priority: ticketData.priority || "normal",

        claimedBy: null,
        claimedAt: null,

        openedAt: new Date(ticketData.openedAt || Date.now()),
        closedAt: null,
        closedBy: null,
        closeReason: null,

        messages: 0,
        participants: [ticketData.userId],

        tags: ticketData.tags || [],

        metadata: {
          userDisplayName: ticketData.userDisplayName || "",
          userJoinedAt: ticketData.userJoinedAt || null,
          channelName: ticketData.channelName || "",
          transcriptSaved: false,
          feedbackRating: null,
          feedbackComment: null,
        },

        createdAt: now,
        updatedAt: now,
      };

      const result = await this.collection.insertOne(ticket);

      if (result.acknowledged) {
        ticket._id = result.insertedId;
        return ticket;
      }
      return null;
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn(`Duplicate ticket detected: ${ticketData.ticketId}`);
        return await this.findByTicketId(ticketData.ticketId);
      }
      this.logger.error("Failed to create ticket", error);
      return null;
    }
  }

  /**
   * Find ticket by ticket ID
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<Object|null>} Ticket document or null
   */
  async findByTicketId(ticketId) {
    try {
      return await this.collection.findOne({ ticketId });
    } catch (error) {
      this.logger.error(`Failed to find ticket ${ticketId}`, error);
      return null;
    }
  }

  /**
   * Find ticket by channel ID
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<Object|null>} Ticket document or null
   */
  async findByChannelId(channelId) {
    try {
      return await this.collection.findOne({ channelId });
    } catch (error) {
      this.logger.error(`Failed to find ticket by channel ${channelId}`, error);
      return null;
    }
  }

  /**
   * Get all tickets for a guild
   * @param {string} guildId - Guild ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of ticket documents
   */
  async findByGuild(guildId, options = {}) {
    try {
      const { status = null, userId = null, limit = 50, skip = 0 } = options;

      const query = { guildId };
      if (status) query.status = status;
      if (userId) query.userId = userId;

      return await this.collection
        .find(query)
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      this.logger.error(`Failed to find tickets for guild ${guildId}`, error);
      return [];
    }
  }

  /**
   * Get tickets by user
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of ticket documents
   */
  async findByUser(userId, guildId, options = {}) {
    try {
      const { status = "all", limit = 20, skip = 0 } = options;

      const query = { userId, guildId };
      if (status !== "all" && status) query.status = status;

      return await this.collection
        .find(query)
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      this.logger.error(`Failed to find tickets for user ${userId}`, error);
      return [];
    }
  }

  /**
   * Get open tickets count for a guild in current month
   * @param {string} guildId - Guild ID
   * @returns {Promise<number>} Ticket count
   */
  async countMonthlyTickets(guildId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const query = {
        guildId,
        openedAt: { $gte: startOfMonth },
      };

      return await this.collection.countDocuments(query);
    } catch (error) {
      this.logger.error(
        `Failed to count monthly tickets for guild ${guildId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Get open tickets count for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<number>} Open ticket count
   */
  async countOpenTickets(guildId) {
    try {
      return await this.collection.countDocuments({ guildId, status: "open" });
    } catch (error) {
      this.logger.error(
        `Failed to count open tickets for guild ${guildId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Update ticket status
   * @param {string} ticketId - Ticket ID
   * @param {string} status - New status
   * @returns {Promise<boolean>} Success status
   */
  async updateStatus(ticketId, status) {
    try {
      const result = await this.collection.updateOne(
        { ticketId },
        {
          $set: {
            status,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to update ticket status ${ticketId}`, error);
      return false;
    }
  }

  /**
   * Claim a ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} staffId - Staff user ID
   * @returns {Promise<boolean>} Success status
   */
  async claim(ticketId, staffId) {
    try {
      const result = await this.collection.updateOne(
        { ticketId },
        {
          $set: {
            claimedBy: staffId,
            claimedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to claim ticket ${ticketId}`, error);
      return false;
    }
  }

  /**
   * Close a ticket
   * @param {string} ticketId - Ticket ID
   * @param {Object} closeData - Close data
   * @returns {Promise<boolean>} Success status
   */
  async close(ticketId, closeData) {
    try {
      const updateData = {
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: closeData.closedBy,
        closeReason: closeData.reason || null,
        updatedAt: new Date().toISOString(),
      };

      const result = await this.collection.updateOne(
        { ticketId },
        { $set: updateData },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to close ticket ${ticketId}`, error);
      return false;
    }
  }

  /**
   * Save CSAT feedback (rating and/or comment) on a closed ticket.
   * Re-rating replaces the previous rating; comment can be set or cleared.
   * @param {string} ticketId - Ticket ID
   * @param {Object} feedback - Feedback data
   * @param {number} [feedback.rating] - Star rating (1-5)
   * @param {string|null} [feedback.ratedStaffId] - Staff member credited for the rating
   * @param {string|null} [feedback.comment] - Optional comment text
   * @returns {Promise<boolean>} Success status
   */
  async setFeedback(ticketId, feedback) {
    try {
      const updateData = { updatedAt: new Date().toISOString() };

      if (feedback.rating !== undefined) {
        updateData["metadata.feedbackRating"] = feedback.rating;
        if (feedback.ratedStaffId !== undefined) {
          updateData["metadata.ratedStaffId"] = feedback.ratedStaffId;
        }
      }
      if (feedback.comment !== undefined) {
        updateData["metadata.feedbackComment"] = feedback.comment;
      }

      const result = await this.collection.updateOne(
        { ticketId },
        { $set: updateData },
      );
      return result.matchedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to set feedback for ticket ${ticketId}`, error);
      return false;
    }
  }

  /**
   * Add participant to ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} userId - User ID to add
   * @returns {Promise<boolean>} Success status
   */
  async addParticipant(ticketId, userId) {
    try {
      const result = await this.collection.updateOne(
        { ticketId },
        {
          $addToSet: { participants: userId },
          $set: { updatedAt: new Date().toISOString() },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(
        `Failed to add participant to ticket ${ticketId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Remove participant from ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} userId - User ID to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeParticipant(ticketId, userId) {
    try {
      const result = await this.collection.updateOne(
        { ticketId },
        {
          $pull: { participants: userId },
          $set: { updatedAt: new Date().toISOString() },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(
        `Failed to remove participant from ticket ${ticketId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Increment message count
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<boolean>} Success status
   */
  async incrementMessageCount(ticketId) {
    try {
      const result = await this.collection.updateOne(
        { ticketId },
        {
          $inc: { messages: 1 },
          $set: { updatedAt: new Date().toISOString() },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(
        `Failed to increment message count for ticket ${ticketId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Get tickets statistics for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object>} Ticket statistics
   */
  async getStats(guildId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const pipeline = [
        {
          $match: {
            guildId,
            openedAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ];

      const results = await this.collection.aggregate(pipeline).toArray();

      const stats = {
        total: 0,
        open: 0,
        closed: 0,
        archived: 0,
      };

      for (const result of results) {
        stats[result._id] = result.count;
        stats.total += result.count;
      }

      return stats;
    } catch (error) {
      this.logger.error(
        `Failed to get ticket stats for guild ${guildId}`,
        error,
      );
      return { total: 0, open: 0, closed: 0, archived: 0 };
    }
  }

  /**
   * Get staff performance statistics
   * @param {string} guildId - Guild ID
   * @returns {Promise<Array>} Staff statistics
   */
  async getStaffStats(guildId) {
    try {
      const pipeline = [
        {
          $match: {
            guildId,
            status: "closed",
            claimedBy: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$claimedBy",
            ticketsClosed: { $sum: 1 },
            avgCloseTime: { $avg: { $subtract: ["$closedAt", "$openedAt"] } },
            avgRating: { $avg: "$metadata.feedbackRating" },
            ratingCount: {
              $sum: {
                $cond: [{ $ne: ["$metadata.feedbackRating", null] }, 1, 0],
              },
            },
          },
        },
        {
          $sort: { ticketsClosed: -1 },
        },
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      this.logger.error(
        `Failed to get staff stats for guild ${guildId}`,
        error,
      );
      return [];
    }
  }

  /**
   * Delete a ticket
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(ticketId) {
    try {
      const result = await this.collection.deleteOne({ ticketId });
      return result.deletedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to delete ticket ${ticketId}`, error);
      return false;
    }
  }

  /**
   * Delete all tickets for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteByGuild(guildId) {
    try {
      const result = await this.collection.deleteMany({ guildId });
      if (this.cache) this.cache.clear();
      return result.acknowledged;
    } catch (error) {
      this.logger.error(`Failed to delete tickets for guild ${guildId}`, error);
      return false;
    }
  }

  /**
   * Get expired tickets (for auto-cleanup)
   * @param {string} guildId - Guild ID
   * @param {number} days - Days of inactivity
   * @returns {Promise<Array>} Array of expired tickets
   */
  async getExpiredTickets(guildId, days) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      return await this.collection
        .find({
          guildId,
          status: "open",
          updatedAt: { $lt: cutoffDate.toISOString() },
        })
        .toArray();
    } catch (error) {
      this.logger.error(
        `Failed to get expired tickets for guild ${guildId}`,
        error,
      );
      return [];
    }
  }
}
