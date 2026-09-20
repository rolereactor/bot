import { BaseRepository } from "./BaseRepository.js";

export class CoreCreditsRepository extends BaseRepository {
  constructor(db, cache, logger) {
    super(db, "core_credits", cache, logger);
    this._ensureIndexes();
  }

  async _ensureIndexes() {
    try {
      await this.collection.createIndex({ userId: 1 }, { unique: true });
      this.logger.debug("CoreCreditsRepository indexes ensured");
    } catch (error) {
      this.logger.warn("Failed to ensure CoreCreditsRepository indexes", error);
    }
  }

  async getAll() {
    try {
      const cached = this.cache.get("core_credits_all");
      if (cached) return cached;

      const documents = await this.collection.find({}).toArray();
      const coreCredits = {};
      for (const doc of documents) {
        coreCredits[doc.userId] = doc;
      }

      this.cache.set("core_credits_all", coreCredits);
      return coreCredits;
    } catch (error) {
      this.logger.error("Failed to get all core credits", error);
      return {};
    }
  }

  async getByUserId(userId) {
    try {
      const cacheKey = `core_credits_${userId}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.__none ? null : { sparks: 0, credits: 0, ...cached };
      }

      const userData = await this.collection.findOne({ userId });
      if (userData) {
        const fullData = { sparks: 0, credits: 0, ...userData };
        this.cache.set(cacheKey, fullData);
        return fullData;
      }
      // Negative cache (short TTL) so users without credits don't hit the DB per command
      this.cache.set(cacheKey, { __none: true }, 60 * 1000);
      return null;
    } catch (error) {
      this.logger.error(`Failed to get core credits for user ${userId}`, error);
      return null;
    }
  }

  async setByUserId(userId, userData) {
    try {
      // Ensure userId is included in the document
      const document = { sparks: 0, ...userData, userId };

      const result = await this.collection.replaceOne({ userId }, document, {
        upsert: true,
      });

      // Update cache
      this.cache.set(`core_credits_${userId}`, document);
      this.cache.delete("core_credits_all");

      return result.acknowledged;
    } catch (error) {
      this.logger.error(`Failed to set core credits for user ${userId}`, error);
      return false;
    }
  }

  async updateCredits(userId, creditsChange) {
    try {
      // Round the credits change to 2 decimal places to prevent floating point errors
      const roundedChange = Math.round(creditsChange * 100) / 100;

      const result = await this.collection.updateOne(
        { userId },
        {
          $inc: { credits: roundedChange },
          $set: { lastUpdated: new Date().toISOString() },
        },
        { upsert: true },
      );

      // Invalidate cache
      this.cache.delete(`core_credits_${userId}`);
      this.cache.delete("core_credits_all");

      return result.acknowledged;
    } catch (error) {
      this.logger.error(`Failed to update credits for user ${userId}`, error);
      return false;
    }
  }

  async updateSparks(userId, sparksChange) {
    try {
      const roundedChange = Math.round(sparksChange * 100) / 100;

      const result = await this.collection.updateOne(
        { userId },
        {
          $inc: { sparks: roundedChange },
          $set: { lastUpdated: new Date().toISOString() },
        },
        { upsert: true },
      );

      this.cache.delete(`core_credits_${userId}`);
      this.cache.delete("core_credits_all");

      return result.acknowledged;
    } catch (error) {
      this.logger.error(`Failed to update sparks for user ${userId}`, error);
      return false;
    }
  }

  /**
   * Atomically deduct Cores, refusing to drive the balance negative.
   * The deduction and the balance check happen in one conditional update,
   * so concurrent spenders cannot double-spend the same Cores.
   * @param {string} userId - Discord user ID
   * @param {number} amount - Positive Cores amount to deduct
   * @returns {Promise<{success: boolean, credits?: number}>} Updated balance on success
   */
  async deductCredits(userId, amount) {
    try {
      const roundedAmount = Math.round(amount * 100) / 100;

      const updated = await this.collection.findOneAndUpdate(
        { userId, credits: { $gte: roundedAmount } },
        {
          $inc: { credits: -roundedAmount },
          $set: { lastUpdated: new Date().toISOString() },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        return { success: false };
      }

      this.cache.delete(`core_credits_${userId}`);
      this.cache.delete("core_credits_all");

      return { success: true, credits: updated.credits };
    } catch (error) {
      this.logger.error(`Failed to deduct credits for user ${userId}`, error);
      return { success: false };
    }
  }

  /**
   * Atomically deduct Sparks, refusing to drive the balance negative.
   * The deduction and the balance check happen in one conditional update,
   * so concurrent spenders cannot double-spend the same Sparks.
   * @param {string} userId - Discord user ID
   * @param {number} amount - Positive Sparks amount to deduct
   * @returns {Promise<{success: boolean, sparks?: number}>} Updated balance on success
   */
  async deductSparks(userId, amount) {
    try {
      const roundedAmount = Math.round(amount * 100) / 100;

      const updated = await this.collection.findOneAndUpdate(
        { userId, sparks: { $gte: roundedAmount } },
        {
          $inc: { sparks: -roundedAmount },
          $set: { lastUpdated: new Date().toISOString() },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        return { success: false };
      }

      this.cache.delete(`core_credits_${userId}`);
      this.cache.delete("core_credits_all");

      return { success: true, sparks: updated.sparks };
    } catch (error) {
      this.logger.error(`Failed to deduct sparks for user ${userId}`, error);
      return { success: false };
    }
  }

  async deleteByUserId(userId) {
    try {
      const result = await this.collection.deleteOne({ userId });

      // Invalidate cache
      this.cache.delete(`core_credits_${userId}`);
      this.cache.delete("core_credits_all");

      return result.deletedCount > 0;
    } catch (error) {
      this.logger.error(
        `Failed to delete core credits for user ${userId}`,
        error,
      );
      return false;
    }
  }
}
