import { BaseRepository } from "./BaseRepository.js";

export class GuildSettingsRepository extends BaseRepository {
  constructor(db, cache, logger) {
    super(db, "guild_settings", cache, logger);
    this._ensureIndexes();
  }

  async _ensureIndexes() {
    try {
      await this.collection.createIndex({ guildId: 1 }, { unique: true });
      await this.collection.createIndex(
        {
          "premiumFeatures.pro_engine.payerUserId": 1,
          "premiumFeatures.pro_engine.active": 1,
          "premiumFeatures.pro_engine.nextDeductionDate": 1,
        },
        { background: true },
      );
      this.logger.debug("GuildSettingsRepository indexes ensured");
    } catch (error) {
      this.logger.warn(
        "Failed to ensure GuildSettingsRepository indexes",
        error,
      );
    }
  }

  _cacheKey(guildId) {
    return `guild_settings:${guildId}`;
  }

  _invalidate(guildId) {
    if (this.cache) this.cache.delete(this._cacheKey(guildId));
  }

  async getByGuild(guildId) {
    try {
      const cacheKey = this._cacheKey(guildId);
      const cached = this.cache?.get(cacheKey);
      if (cached) return structuredClone(cached);

      const settings = await this.collection.findOne({ guildId });
      const result = settings || {
        guildId,
        experienceSystem: {
          enabled: false,
          messageXP: true,
          commandXP: true,
          roleXP: true,
          voiceXP: true,
          messageXPAmount: { min: 15, max: 25 },
          commandXPAmount: {
            base: 8,
          },
          roleXPAmount: 50,
          messageCooldown: 60,
          commandCooldown: 30,
          levelUpMessages: true,
          levelUpChannel: null,
          noXpChannels: [],
          noXpRoles: [],
          voiceXpSettings: {
            ignoreMuted: true,
            ignoreDeafened: true,
            minOthers: 1,
          },
          // Level formula is fixed at 100 * level^1.5 - no longer configurable
        },
        disabledCommands: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.cache?.set(cacheKey, structuredClone(result));
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get guild settings for guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  async set(guildId, settings) {
    try {
      // Strip _id to avoid immutable field error
      const safeSettings = { ...settings };
      delete safeSettings._id;
      await this.collection.updateOne(
        { guildId },
        { $set: { ...safeSettings, guildId, updatedAt: new Date() } },
        { upsert: true },
      );
      this._invalidate(guildId);
    } catch (error) {
      this.logger.error(
        `Failed to set guild settings for guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  async delete(guildId) {
    try {
      await this.collection.deleteOne({ guildId });
      this._invalidate(guildId);
    } catch (error) {
      this.logger.error(
        `Failed to delete guild settings for guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  async incrementCounter(guildId, counterField) {
    try {
      const result = await this.collection.findOneAndUpdate(
        { guildId },
        {
          $inc: { [counterField]: 1 },
          $setOnInsert: { guildId, createdAt: new Date() },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, returnDocument: "after" },
      );
      this._invalidate(guildId);
      // Navigate the dot path to get the value
      const parts = counterField.split(".");
      let value = result;
      for (const part of parts) {
        value = value?.[part];
      }
      return value || 1;
    } catch (error) {
      this.logger.error(
        `Failed to increment counter ${counterField} for guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Reset a counter field for a guild
   * @param {string} guildId - Guild ID
   * @param {string} counterField - Field path to reset (e.g. "counters.ticket")
   * @returns {Promise<boolean>} Success status
   */
  async resetCounter(guildId, counterField) {
    try {
      await this.collection.updateOne(
        { guildId },
        {
          $set: { [counterField]: 0, updatedAt: new Date() },
        },
        { upsert: true },
      );
      this._invalidate(guildId);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to reset counter ${counterField} for guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  async getAllWithExperienceEnabled() {
    try {
      const settings = await this.collection
        .find({ "experienceSystem.enabled": true })
        .toArray();
      return settings;
    } catch (error) {
      this.logger.error(
        "Failed to get all guilds with experience enabled",
        error,
      );
      throw error;
    }
  }

  // Supporter management methods
  async getSupporters() {
    try {
      const supporters = await this.collection
        .find({}, { projection: { supporters: 1 } })
        .toArray();

      const allSupporters = {};
      supporters.forEach(guild => {
        if (guild.supporters) {
          allSupporters[guild.guildId] = guild.supporters;
        }
      });

      return allSupporters;
    } catch (error) {
      this.logger.error("Failed to get supporters", error);
      return {};
    }
  }

  async setSupporters(supporters) {
    try {
      // Update each guild's supporters
      for (const [guildId, guildSupporters] of Object.entries(supporters)) {
        await this.collection.updateOne(
          { guildId },
          { $set: { supporters: guildSupporters, updatedAt: new Date() } },
          { upsert: true },
        );
        this._invalidate(guildId);
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to set supporters", error);
      return false;
    }
  }

  /**
   * Get Guild Core Vault data for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<{balance: number, history: Array<{userId: string, username: string, amount: number, timestamp: string}>}>}
   */
  async getVaultData(guildId) {
    try {
      const settings = await this.getByGuild(guildId);
      const vault = settings?.coreVault || {};
      return {
        balance: Math.round((vault.balance || 0) * 100) / 100,
        history: vault.history || [],
      };
    } catch (error) {
      this.logger.error(`Failed to get vault data for guild ${guildId}`, error);
      return { balance: 0, history: [] };
    }
  }

  /**
   * Deposit Cores into a guild's Core Vault
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID who is depositing
   * @param {number} amount - Amount of Cores to deposit
   * @param {string} username - Username of the depositor
   * @returns {Promise<{success: boolean, newBalance: number}>}
   */
  async depositVaultCores(guildId, userId, amount, username) {
    try {
      const roundedAmount = Math.round(amount * 100) / 100;
      if (roundedAmount <= 0) return { success: false, newBalance: 0 };

      const timestamp = new Date().toISOString();
      const historyEntry = {
        userId,
        username: username || "Anonymous",
        amount: roundedAmount,
        timestamp,
      };

      const result = await this.collection.findOneAndUpdate(
        { guildId },
        {
          $inc: { "coreVault.balance": roundedAmount },
          $push: {
            "coreVault.history": {
              $each: [historyEntry],
              $slice: -50,
            },
          },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: "after" },
      );

      const newBalance =
        Math.round((result?.coreVault?.balance || roundedAmount) * 100) / 100;
      this._invalidate(guildId);

      return { success: true, newBalance };
    } catch (error) {
      this.logger.error(
        `Failed to deposit vault cores for guild ${guildId}`,
        error,
      );
      return { success: false, newBalance: 0 };
    }
  }

  /**
   * Deduct Cores from a guild's Core Vault (e.g. for Pro Engine renewal)
   * @param {string} guildId - Guild ID
   * @param {number} amount - Amount to deduct
   * @returns {Promise<{success: boolean, newBalance: number}>}
   */
  async deductVaultCores(guildId, amount) {
    try {
      const roundedAmount = Math.round(amount * 100) / 100;
      const vaultData = await this.getVaultData(guildId);
      if (vaultData.balance < roundedAmount) {
        return { success: false, newBalance: vaultData.balance };
      }

      const result = await this.collection.findOneAndUpdate(
        { guildId },
        {
          $inc: { "coreVault.balance": -roundedAmount },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" },
      );

      const newBalance =
        Math.round((result?.coreVault?.balance || 0) * 100) / 100;
      this._invalidate(guildId);

      return { success: true, newBalance };
    } catch (error) {
      this.logger.error(
        `Failed to deduct vault cores for guild ${guildId}`,
        error,
      );
      return { success: false, newBalance: 0 };
    }
  }

  /**
   * Get auto-deduct from owner setting for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<boolean>}
   */
  async getAutoDeductFromOwner(guildId) {
    try {
      const settings = await this.getByGuild(guildId);
      return settings?.autoDeductFromOwner ?? false;
    } catch (error) {
      this.logger.error(
        `Failed to get auto-deduct setting for guild ${guildId}`,
        error,
      );
      return false;
    }
  }

  /**
   * Set auto-deduct from owner setting for a guild
   * @param {string} guildId - Guild ID
   * @param {boolean} enabled - Whether to auto-deduct from owner when vault is empty
   * @returns {Promise<boolean>}
   */
  async setAutoDeductFromOwner(guildId, enabled) {
    try {
      await this.collection.updateOne(
        { guildId },
        {
          $set: {
            autoDeductFromOwner: !!enabled,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      this._invalidate(guildId);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to set auto-deduct setting for guild ${guildId}`,
        error,
      );
      return false;
    }
  }
}
