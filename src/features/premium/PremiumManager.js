import { PremiumFeatures } from "./config.js";
import { getStorageManager } from "../../utils/storage/storageManager.js";
import { getLogger } from "../../utils/logger.js";
import { getCommandHandler } from "../../utils/core/commandHandler.js";
import { WEBSITE_URL } from "../../config/domains.js";

const logger = getLogger();

/**
 * Grace period in days after expiration before disabling the feature.
 * During the grace period, the feature remains active but the user is warned.
 */
const GRACE_PERIOD_DAYS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// PremiumManager
// ─────────────────────────────────────────────────────────────────────────────

export class PremiumManager {
  constructor() {
    this.client = null;
    /** @type {Set<string>} In-memory cache to prevent warning spam within one session */
    this.sentWarnings = new Set();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set Discord client for notifications
   * @param {import('discord.js').Client} client
   */
  setClient(client) {
    this.client = client;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Feature lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a guild has a specific premium feature active
   * @param {string} guildId - Discord guild ID
   * @param {string} featureId - Feature ID from config.js
   * @returns {Promise<boolean>}
   */
  async isFeatureActive(guildId, featureId) {
    try {
      const db = await this._db();
      if (!db) return false;

      const settings = await db.guildSettings.getByGuild(guildId);

      // For pro_engine, also check spark_pro (Spark Shop purchases)
      if (featureId === "pro_engine") {
        const corePro = settings?.premiumFeatures?.pro_engine;
        const sparkPro = settings?.premiumFeatures?.spark_pro;

        // Check Core Pro
        if (corePro?.active && corePro.nextDeductionDate) {
          // Trials: no grace period — expires exactly on trialEndsAt
          if (corePro.isTrial && corePro.period === "trial") {
            if (new Date(corePro.nextDeductionDate) >= new Date()) return true;
          } else {
            const graceDeadline = new Date(corePro.nextDeductionDate);
            if (!isNaN(graceDeadline.getTime())) {
              graceDeadline.setDate(
                graceDeadline.getDate() + GRACE_PERIOD_DAYS,
              );
              if (graceDeadline >= new Date()) return true;
            }
          }
        }

        // Check Spark Pro
        if (sparkPro?.active && sparkPro.expiresAt) {
          if (new Date(sparkPro.expiresAt) >= new Date()) return true;
        }

        return false;
      }

      const sub = settings?.premiumFeatures?.[featureId];
      if (!sub?.active) return false;

      // If no valid expiry date, feature is not active
      if (!sub.nextDeductionDate && !sub.expiresAt) return false;

      // For Spark Pro, check expiresAt directly (no grace period)
      if (featureId === "spark_pro") {
        return new Date(sub.expiresAt) >= new Date();
      }

      // Allow access during grace period
      const expiryDate = sub.nextDeductionDate || sub.expiresAt;
      const graceDeadline = new Date(expiryDate);
      if (isNaN(graceDeadline.getTime())) return false;

      graceDeadline.setDate(graceDeadline.getDate() + GRACE_PERIOD_DAYS);

      return graceDeadline >= new Date();
    } catch (error) {
      logger.error(
        `Error checking feature status for guild ${guildId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Check Pro Engine status and return error embed if not active
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {string} featureName - Name of the premium feature
   * @returns {Promise<{isPro: boolean, response?: object}>}
   */
  async checkProAndRespond(interaction, featureName) {
    const guildId = interaction.guildId;
    const isPro = await this.isFeatureActive(guildId, "pro_engine");
    const isSparkPro = await this.isFeatureActive(guildId, "spark_pro");

    if (isPro || isSparkPro) {
      return { isPro: true };
    }

    const { errorEmbed } = await import(
      "../../utils/discord/responseMessages.js"
    );
    const { CORE_STATUS } = await import("./config.js");

    const response = errorEmbed({
      title: "Pro Engine Required",
      description: `${featureName} is a premium feature.`,
      solution: `Enable ${CORE_STATUS.PRO.name} on our **[website](${WEBSITE_URL})** to unlock this feature! You can also use \`/shop\` to purchase temporary Pro access with Sparks.`,
      emoji: CORE_STATUS.PRO.emoji,
      isPremium: true,
    });

    return { isPro: false, response };
  }

  /**
   * Activate a premium feature for a guild
   * @param {string} guildId - Discord guild ID
   * @param {string} featureId - Feature ID
   * @param {string} userId - User ID who is paying
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async activateFeature(guildId, featureId, userId) {
    const feature = this._resolveFeature(featureId);
    if (!feature) {
      return { success: false, message: "Invalid feature ID" };
    }

    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return {
          success: false,
          message: "Database connection required for Premium features.",
        };
      }
      const db = storage.dbManager;

      // 1. Check user balance
      const creditData = await storage.getCoreCredits(userId);
      const balance = Math.round((creditData?.credits || 0) * 100) / 100;
      if (balance < feature.cost) {
        return {
          success: false,
          message: `Insufficient Cores. You need ${feature.cost} Cores, but you only have ${balance}.`,
        };
      }

      // 2. Deduct credits atomically (conditional — cannot go negative)
      const cost = Math.round(feature.cost * 100) / 100;
      const deduction = await db.coreCredits.deductCredits(userId, cost);
      if (!deduction.success) {
        return {
          success: false,
          message: `Insufficient Cores. You need ${feature.cost} Cores, but you only have ${balance}.`,
        };
      }

      // 3. Log the transaction
      await this._logTransaction(db, {
        guildId,
        userId,
        featureId,
        featureName: feature.name,
        type: "activation",
        amount: -feature.cost,
      });

      // 4. Update guild settings
      const settings = await db.guildSettings.getByGuild(guildId);
      const premiumFeatures = settings.premiumFeatures || {};

      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + feature.periodDays);

      premiumFeatures[featureId] = {
        active: true,
        payerUserId: userId,
        activatedAt: new Date(),
        lastDeductionDate: new Date(),
        nextDeductionDate: nextDate,
        cost: feature.cost,
        period: feature.period,
      };

      await db.guildSettings.set(guildId, { ...settings, premiumFeatures });

      // 5. Sync guild commands if Pro Engine activated
      if (featureId === PremiumFeatures.PRO.id) {
        const commandHandler = getCommandHandler();
        await commandHandler.syncGuildCommands(
          guildId,
          settings.disabledCommands || [],
        );
      }

      logger.info(
        `✨ Premium feature ${featureId} activated for guild ${guildId} by user ${userId}`,
      );

      // 6. Notify the user
      await this._notify(db, userId, {
        type: "pro_activated",
        title: `${feature.name} Activated!`,
        message: `${feature.name} is now active. -${feature.cost} Cores deducted. Next renewal: ${nextDate.toLocaleDateString()}.`,
        icon: "pro",
        metadata: { guildId, featureId, cost: feature.cost },
      });

      return {
        success: true,
        message: `Feature ${feature.name} activated successfully until ${nextDate.toLocaleDateString()}`,
      };
    } catch (error) {
      logger.error(`Failed to activate feature ${featureId}:`, error);
      return { success: false, message: "An internal error occurred." };
    }
  }

  /**
   * Activate a free trial of Pro Engine for a guild (no core deduction)
   * @param {string} guildId - Discord guild ID
   * @param {string} [userId] - Optional user ID who triggered the trial
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async activateTrial(guildId, userId = null) {
    const featureId = PremiumFeatures.PRO.id;

    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { success: false, message: "Database connection required." };
      }
      const db = storage.dbManager;

      // Check if trial already used
      const settings = await db.guildSettings.getByGuild(guildId);
      const existing = settings?.premiumFeatures?.[featureId];

      if (existing?.trialUsed) {
        return {
          success: false,
          message: "Free trial has already been used for this server.",
        };
      }

      // Calculate trial end date
      const { ProTrialConfig } = await import("./config.js");
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + ProTrialConfig.durationDays);

      // Activate trial — no core deduction
      const premiumFeatures = settings?.premiumFeatures || {};
      premiumFeatures[featureId] = {
        active: true,
        isTrial: true,
        trialUsed: true,
        trialEndsAt,
        payerUserId: userId,
        activatedAt: new Date(),
        lastDeductionDate: new Date(),
        nextDeductionDate: trialEndsAt,
        cost: 0,
        period: "trial",
      };

      await db.guildSettings.set(guildId, {
        ...settings,
        premiumFeatures,
      });

      // Sync guild commands for Pro Engine
      const commandHandler = getCommandHandler();
      await commandHandler.syncGuildCommands(
        guildId,
        settings?.disabledCommands || [],
      );

      logger.info(
        `🎁 Pro Engine trial activated for guild ${guildId} (expires: ${trialEndsAt.toLocaleDateString()})`,
      );

      return {
        success: true,
        message: `Pro Engine trial activated! Valid until ${trialEndsAt.toLocaleDateString()}.`,
      };
    } catch (error) {
      logger.error(`Failed to activate trial for guild ${guildId}:`, error);
      return { success: false, message: "An internal error occurred." };
    }
  }

  /**
   * Cancel a premium feature for a guild.
   * The feature remains active until the current billing cycle ends.
   * @param {string} guildId - Discord guild ID
   * @param {string} featureId - Feature ID
   * @param {string} userId - User ID requesting cancellation
   * @returns {Promise<{success: boolean, message: string, expiresAt?: string}>}
   */
  async cancelFeature(guildId, featureId, userId) {
    try {
      const db = await this._db();
      if (!db)
        return { success: false, message: "Database connection required." };

      const settings = await db.guildSettings.getByGuild(guildId);
      const sub = settings?.premiumFeatures?.[featureId];

      if (!sub?.active) {
        return {
          success: false,
          message: "This feature is not currently active.",
        };
      }

      if (sub.payerUserId !== userId) {
        return {
          success: false,
          message: "Only the user who activated this feature can cancel it.",
        };
      }

      // Mark as cancelled — it stays active until nextDeductionDate
      sub.cancelledAt = new Date();
      sub.cancelledBy = userId;
      sub.autoRenew = false;
      await db.guildSettings.set(guildId, settings);

      const feature = this._resolveFeature(featureId);
      await this._logTransaction(db, {
        guildId,
        userId,
        featureId,
        featureName: feature?.name || featureId,
        type: "cancellation",
        amount: 0,
      });

      const expiresAt = new Date(sub.nextDeductionDate).toLocaleDateString();

      logger.info(
        `🚫 Feature ${featureId} cancelled for guild ${guildId} by ${userId}. Active until ${expiresAt}.`,
      );

      return {
        success: true,
        message: `Subscription cancelled. ${feature?.name || "Feature"} will remain active until ${expiresAt}.`,
        expiresAt: sub.nextDeductionDate,
      };
    } catch (error) {
      logger.error(
        `Error cancelling feature ${featureId} for guild ${guildId}:`,
        error,
      );
      return { success: false, message: "An internal error occurred." };
    }
  }

  /**
   * Get premium subscription status for a guild (used by API)
   * @param {string} guildId - Discord guild ID
   * @param {string} featureId - Feature ID
   * @returns {Promise<object|null>} Subscription details
   */
  async getSubscriptionStatus(guildId, featureId) {
    try {
      const db = await this._db();
      if (!db) return null;

      const settings = await db.guildSettings.getByGuild(guildId);
      const sub = settings?.premiumFeatures?.[featureId];
      if (!sub) return null;

      // For Spark Pro, check if it's active based on expiresAt
      if (featureId === "spark_pro") {
        const isActive =
          sub.active && sub.expiresAt && new Date(sub.expiresAt) >= new Date();
        return {
          active: isActive,
          payerUserId: sub.payerUserId,
          activatedAt: sub.activatedAt,
          expiresAt: sub.expiresAt,
          cost: sub.cost,
          period: sub.period,
          source: "spark_shop",
        };
      }

      return {
        active: sub.active,
        payerUserId: sub.payerUserId,
        activatedAt: sub.activatedAt,
        nextDeductionDate: sub.nextDeductionDate,
        cost: sub.cost,
        period: sub.period,
        cancelled: !!sub.cancelledAt,
        cancelledAt: sub.cancelledAt || null,
        autoRenew: sub.autoRenew !== false,
        isTrial: !!sub.isTrial,
        trialUsed: !!sub.trialUsed,
        trialEndsAt: sub.trialEndsAt || null,
      };
    } catch (error) {
      logger.error(
        `Error getting subscription status for guild ${guildId}:`,
        error,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Renewal processing (called by scheduler)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process periodic renewals for all guilds with premium features.
   * Should be called on a recurring schedule (e.g. every hour).
   */
  async processRenewals() {
    logger.info("🔄 Checking for premium feature renewals...");
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) return;
      const db = storage.dbManager;

      const guilds = await db.guildSettings.collection
        .find({ premiumFeatures: { $exists: true } })
        .toArray();

      const now = new Date();
      const counts = { renewed: 0, disabled: 0, warned: 0 };

      for (const settings of guilds) {
        const guildId = settings.guildId;
        const features = settings.premiumFeatures || {};

        for (const [featureId, sub] of Object.entries(features)) {
          if (!sub.active) continue;

          const feature = this._resolveFeature(featureId);
          if (!feature) {
            await this.disableFeature(guildId, featureId);
            counts.disabled++;
            continue;
          }

          const deductionDate = new Date(sub.nextDeductionDate);

          // Handle cancelled subscriptions
          if (sub.cancelledAt || sub.autoRenew === false) {
            if (deductionDate <= now) {
              await this.disableFeature(guildId, featureId, {
                reason: "cancelled",
              });
              counts.disabled++;
            }
            continue;
          }

          // Handle trial expiry — disable without attempting renewal
          if (sub.isTrial && sub.period === "trial") {
            if (deductionDate <= now) {
              await this.disableFeature(guildId, featureId, {
                reason: "trial_expired",
              });
              counts.disabled++;
            }
            continue;
          }

          // Warn about low balance 3 days before renewal
          if (deductionDate <= this._daysFromNow(3) && deductionDate > now) {
            const didWarn = await this._warnLowBalance(
              guildId,
              feature,
              sub.payerUserId,
            );
            if (didWarn) counts.warned++;
          }

          // Process actual renewal
          if (deductionDate <= now) {
            await this._processRenewal(
              storage,
              db,
              guildId,
              featureId,
              feature,
              sub,
              settings,
              now,
              counts,
            );
          }
        }
      }

      logger.info(
        `🔄 Renewal check complete: ${counts.renewed} renewed, ${counts.disabled} disabled, ${counts.warned} warned`,
      );
    } catch (error) {
      logger.error("Error during premium renewal process:", error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Feature disable + downgrade
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Disable a feature (usually when Cores run out or user cancels)
   * @param {string} guildId
   * @param {string} featureId
   * @param {{ reason?: string }} [options]
   */
  async disableFeature(guildId, featureId, options = {}) {
    const { reason = "insufficient_balance" } = options;

    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) return;
      const db = storage.dbManager;

      const settings = await db.guildSettings.getByGuild(guildId);
      const sub = settings?.premiumFeatures?.[featureId];
      if (!sub) return;

      const payerUserId = sub.payerUserId;

      // Mark as inactive
      sub.active = false;
      sub.disabledAt = new Date();
      sub.disableReason = reason;
      await db.guildSettings.set(guildId, settings);

      // Log the disablement
      const feature = this._resolveFeature(featureId);
      await this._logTransaction(db, {
        guildId,
        userId: payerUserId,
        featureId,
        featureName: feature?.name || featureId,
        type: "disabled",
        amount: 0,
        reason,
      });

      logger.info(
        `🚫 Feature ${featureId} disabled for guild ${guildId}. Reason: ${reason}`,
      );

      // Pro Engine specific: sync commands + downgrade resources
      if (featureId === PremiumFeatures.PRO.id) {
        const commandHandler = getCommandHandler();
        await commandHandler.syncGuildCommands(guildId, []);
        await this._handleProDowngrade(guildId, storage);
      }

      // Notify the payer
      await this._sendDeactivationDM(
        guildId,
        feature || { name: featureId, cost: 0 },
        payerUserId,
        reason,
      );

      await this._notify(db, payerUserId, {
        type: "pro_deactivated",
        title: `${feature?.name || featureId} Deactivated`,
        message:
          reason === "cancelled"
            ? "Subscription was cancelled."
            : "Insufficient Core balance after grace period.",
        icon: "warning",
        metadata: { guildId, featureId, reason },
      });
    } catch (error) {
      logger.error(
        `Error disabling feature ${featureId} for guild ${guildId}:`,
        error,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Renewal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a single feature's renewal attempt
   */
  async _processRenewal(
    storage,
    db,
    guildId,
    featureId,
    feature,
    sub,
    settings,
    now,
    counts,
  ) {
    // 1. Check if Guild Core Vault can cover renewal
    let vaultRenewed = false;
    if (
      db.guildSettings &&
      typeof db.guildSettings.getVaultData === "function"
    ) {
      const vaultData = await db.guildSettings.getVaultData(guildId);
      if (vaultData.balance >= feature.cost) {
        const deductRes = await db.guildSettings.deductVaultCores(
          guildId,
          feature.cost,
        );
        if (deductRes.success) {
          vaultRenewed = true;
        }
      }
    }

    if (vaultRenewed) {
      const nextDate = new Date(sub.nextDeductionDate);
      nextDate.setDate(nextDate.getDate() + feature.periodDays);

      sub.lastDeductionDate = now;
      sub.nextDeductionDate = nextDate;
      sub.cost = feature.cost;
      await db.guildSettings.set(guildId, settings);

      await this._logTransaction(db, {
        guildId,
        userId: sub.payerUserId || "vault",
        featureId,
        featureName: feature.name,
        type: "vault_renewal",
        amount: -feature.cost,
      });

      counts.renewed++;
      logger.info(
        `✅ Renewed feature ${featureId} for guild ${guildId} using Guild Core Vault`,
      );
      return;
    }

    // 2. Fallback to guild owner if auto-deduct is enabled
    const autoDeductEnabled =
      db.guildSettings &&
      typeof db.guildSettings.getAutoDeductFromOwner === "function"
        ? await db.guildSettings.getAutoDeductFromOwner(guildId)
        : false;

    if (autoDeductEnabled) {
      try {
        const guild = await this.client?.guilds?.fetch(guildId);
        if (guild?.ownerId) {
          const ownerCredits = await db.coreCredits.getByUserId(guild.ownerId);
          const ownerBalance =
            Math.round((ownerCredits?.credits || 0) * 100) / 100;

          if (ownerBalance >= feature.cost) {
            const ownerRenewal = await db.coreCredits.deductCredits(
              guild.ownerId,
              feature.cost,
            );

            if (ownerRenewal?.success) {
              const nextDate = new Date(sub.nextDeductionDate);
              nextDate.setDate(nextDate.getDate() + feature.periodDays);

              sub.lastDeductionDate = now;
              sub.nextDeductionDate = nextDate;
              sub.cost = feature.cost;
              await db.guildSettings.set(guildId, settings);

              await this._logTransaction(db, {
                guildId,
                userId: guild.ownerId,
                featureId,
                featureName: feature.name,
                type: "owner_auto_deduct",
                amount: -feature.cost,
              });

              counts.renewed++;
              logger.info(
                `✅ Renewed feature ${featureId} for guild ${guildId} using owner auto-fuel`,
              );

              await this._notify(db, guild.ownerId, {
                type: "pro_renewed",
                title: `${feature.name} Renewed`,
                message: `-${feature.cost} Cores auto-fueled from your balance (vault empty). Next renewal: ${nextDate.toLocaleDateString()}.`,
                icon: "pro",
                metadata: { guildId, featureId, cost: feature.cost },
              });
              return;
            }
          }
        }
      } catch (error) {
        logger.error(`Error in owner auto-fuel for guild ${guildId}:`, error);
      }
    }

    // 3. Fallback to individual payer balance
    const credits = await db.coreCredits.getByUserId(sub.payerUserId);
    const balance = Math.round((credits?.credits || 0) * 100) / 100;

    // Conditional deduct — cannot go negative even if the balance changed
    // since the read above
    const renewal =
      balance >= feature.cost
        ? await db.coreCredits.deductCredits(sub.payerUserId, feature.cost)
        : null;

    if (renewal?.success) {
      // Deduct and renew

      const nextDate = new Date(sub.nextDeductionDate);
      nextDate.setDate(nextDate.getDate() + feature.periodDays);

      sub.lastDeductionDate = now;
      sub.nextDeductionDate = nextDate;
      sub.cost = feature.cost; // Sync with latest config cost
      await db.guildSettings.set(guildId, settings);

      await this._logTransaction(db, {
        guildId,
        userId: sub.payerUserId,
        featureId,
        featureName: feature.name,
        type: "renewal",
        amount: -feature.cost,
      });

      counts.renewed++;
      logger.info(`✅ Renewed feature ${featureId} for guild ${guildId}`);

      await this._notify(db, sub.payerUserId, {
        type: "pro_renewed",
        title: `${feature.name} Renewed`,
        message: `-${feature.cost} Cores deducted for renewal. Next renewal: ${nextDate.toLocaleDateString()}.`,
        icon: "pro",
        metadata: { guildId, featureId, cost: feature.cost },
      });
      return;
    }

    // 4. Insufficient balance — check grace period
    const graceDeadline = new Date(sub.nextDeductionDate);
    graceDeadline.setDate(graceDeadline.getDate() + GRACE_PERIOD_DAYS);

    if (now < graceDeadline) {
      await this._sendGracePeriodWarning(
        guildId,
        feature,
        sub.payerUserId,
        graceDeadline,
        balance,
      );
      counts.warned++;
    } else {
      await this.disableFeature(guildId, featureId, {
        reason: "insufficient_balance",
      });
      counts.disabled++;
    }
  }

  /**
   * Deposit Cores from a user's personal balance into a Guild's Core Vault
   * Available to ALL community members.
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - User ID depositing Cores
   * @param {number} amount - Number of Cores to deposit
   * @param {string} [username] - Depositor username
   * @returns {Promise<{success: boolean, message: string, newVaultBalance?: number}>}
   */
  async depositToGuildVault(guildId, userId, amount, username = "Anonymous") {
    const roundedAmount = Math.round(amount * 100) / 100;
    if (roundedAmount <= 0) {
      return {
        success: false,
        message: "Deposit amount must be greater than 0 Cores.",
      };
    }

    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { success: false, message: "Database connection required." };
      }
      const db = storage.dbManager;

      // Check user balance
      const creditData = await db.coreCredits.getByUserId(userId);
      const balance = Math.round((creditData?.credits || 0) * 100) / 100;
      if (balance < roundedAmount) {
        return {
          success: false,
          message: `Insufficient Cores. You have **${balance.toFixed(2)} Cores**, but tried to deposit **${roundedAmount.toFixed(2)} Cores**.`,
        };
      }

      // Deduct from user (conditional — cannot go negative)
      const deducted = await db.coreCredits.deductCredits(
        userId,
        roundedAmount,
      );
      if (!deducted.success) {
        return {
          success: false,
          message: `Insufficient Cores. You have **${balance.toFixed(2)} Cores**, but tried to deposit **${roundedAmount.toFixed(2)} Cores**.`,
        };
      }

      // Deposit into Guild Vault
      const depositRes = await db.guildSettings.depositVaultCores(
        guildId,
        userId,
        roundedAmount,
        username,
      );

      if (!depositRes.success) {
        // Rollback user credits if vault deposit fails
        await db.coreCredits.updateCredits(userId, roundedAmount);
        return {
          success: false,
          message: "Failed to update Guild Core Vault.",
        };
      }

      // Log transaction
      await this._logTransaction(db, {
        guildId,
        userId,
        featureId: "pro_engine",
        featureName: "Guild Core Vault Deposit",
        type: "vault_deposit",
        amount: -roundedAmount,
      });

      logger.info(
        `🏛️ Guild Vault deposit: ${username} (${userId}) deposited ${roundedAmount} Cores to guild ${guildId}. New Vault Balance: ${depositRes.newBalance}`,
      );

      return {
        success: true,
        message: `Successfully deposited **${roundedAmount.toFixed(2)} Cores** into the Guild Core Vault!`,
        newVaultBalance: depositRes.newBalance,
      };
    } catch (error) {
      logger.error(
        `Failed to deposit to Guild Vault for guild ${guildId}:`,
        error,
      );
      return { success: false, message: "An internal error occurred." };
    }
  }

  /**
   * Check user balance and send a DM warning if it's too low for upcoming renewal
   * @returns {Promise<boolean>} Whether a warning was sent
   */
  async _warnLowBalance(guildId, feature, userId) {
    const warningKey = `${guildId}-${feature.id}-${userId}`;
    if (this.sentWarnings.has(warningKey)) return false;

    try {
      const storage = await getStorageManager();
      const db = storage.dbManager;
      if (!db) return false;

      const creditData = await storage.getCoreCredits(userId);
      const balance = Math.round((creditData?.credits || 0) * 100) / 100;

      if (balance >= feature.cost) return false;

      // Send DM
      const guildName = await this._fetchGuildName(guildId);
      const sent = await this._sendDM(userId, {
        title: "⚠️ Low Core Balance Warning",
        description: `Your **${feature.name}** in **${guildName}** is set to renew soon, but you don't have enough Cores.`,
        fields: [
          { name: "Feature", value: feature.name, inline: true },
          { name: "Required", value: `${feature.cost} Cores`, inline: true },
          {
            name: "Your Balance",
            value: `${balance.toFixed(2)} Cores`,
            inline: true,
          },
          {
            name: "Grace Period",
            value: `You have a **${GRACE_PERIOD_DAYS}-day grace period** after expiration to top up your Cores before the feature is disabled.`,
            inline: false,
          },
        ],
        color: 0xffcc00,
        footer: {
          text: "Refuel your Cores on the dashboard to keep this feature active!",
        },
      });

      this.sentWarnings.add(warningKey);

      if (sent) {
        logger.info(`📧 Sent low balance DM to user ${userId}`);
        await this._notify(db, userId, {
          type: "low_balance",
          title: "Low Core Balance",
          message: `${feature.name} renewal needs ${feature.cost} Cores but you only have ${balance}. Top up to avoid losing the feature.`,
          icon: "warning",
          metadata: {
            guildId,
            featureId: feature.id,
            required: feature.cost,
            balance,
          },
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error in _warnLowBalance:", error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — DM notifications
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send a grace period warning DM
   * Set ALLOW_DM_WARNING=false in env to disable Discord DMs and use dashboard only
   */
  async _sendGracePeriodWarning(
    guildId,
    feature,
    userId,
    graceDeadline,
    balance,
  ) {
    const warningKey = `grace-${guildId}-${feature.id}-${userId}`;
    if (this.sentWarnings.has(warningKey)) return;

    // Check if DM is disabled via env var
    const ALLOW_DM_WARNING = process.env.ALLOW_DM_WARNING !== "false";
    if (!ALLOW_DM_WARNING) {
      // Skip DM, create notification only for dashboard
      await this._createNotificationOnly(
        userId,
        guildId,
        feature,
        balance,
        graceDeadline,
      );
      return;
    }

    const daysLeft = Math.max(
      0,
      Math.ceil((graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );

    const guildName = await this._fetchGuildName(guildId);
    const sent = await this._sendDM(userId, {
      title: "🚨 Grace Period — Top Up Required",
      description: `Your **${feature.name}** subscription in **${guildName}** has expired, but it's still active during the ${GRACE_PERIOD_DAYS}-day grace period.`,
      fields: [
        { name: "Feature", value: feature.name, inline: true },
        { name: "Required", value: `${feature.cost} Cores`, inline: true },
        {
          name: "Your Balance",
          value: `${Math.round(balance * 100) / 100} Cores`,
          inline: true,
        },
        {
          name: "⏰ Time Remaining",
          value: `**${daysLeft} day${daysLeft !== 1 ? "s" : ""}** before the feature is disabled.`,
          inline: false,
        },
      ],
      color: 0xff4444,
      footer: {
        text: "Top up your Cores on the dashboard to keep this feature active!",
      },
    });

    this.sentWarnings.add(warningKey);

    if (sent) {
      logger.info(`🚨 Sent grace period warning DM to user ${userId}`);
      const db = await this._db();
      if (db) {
        await this._notify(db, userId, {
          type: "grace_period",
          title: "Grace Period — Action Required",
          message: `${feature.name} expired. ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left before it's disabled. Top up ${feature.cost} Cores now.`,
          icon: "warning",
          metadata: { guildId, featureId: feature.id, daysLeft, balance },
        });
      }
    }
  }

  /**
   * Send a deactivation DM to the payer
   */
  async _sendDeactivationDM(guildId, feature, userId, reason) {
    const reasonText =
      reason === "cancelled"
        ? "You cancelled the subscription and the billing cycle has ended."
        : `Your Core balance was too low to renew (needed ${feature.cost} Cores) and the ${GRACE_PERIOD_DAYS}-day grace period has expired.`;

    const guildName = await this._fetchGuildName(guildId);
    await this._sendDM(userId, {
      title: "❌ Premium Feature Deactivated",
      description: `**${feature.name}** has been deactivated for **${guildName}**.`,
      fields: [
        { name: "Reason", value: reasonText, inline: false },
        {
          name: "What happens now?",
          value:
            "Your server has been downgraded to Free tier limits:\n" +
            "• Excess scheduled roles have been paused\n" +
            "• Extra ticket panels have been disabled\n" +
            "• Level reward mode reset to **Stack**\n" +
            "• Your data is **not deleted** — re-activate Pro to restore everything.",
          inline: false,
        },
      ],
      color: 0xff4444,
      footer: {
        text: "Visit the dashboard to re-activate or top up your Cores.",
      },
    });

    logger.info(
      `📧 Sent deactivation DM to user ${userId} for ${feature.name} in guild ${guildId}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Pro Engine downgrade handler
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handle proactive cleanup when a guild loses Pro Engine status.
   * Ensures VPS resources are not wasted by excess premium configurations.
   *
   * Actions:
   * 1. Pause excess scheduled roles beyond the free limit (25)
   * 2. Disable extra ticket panels beyond the free limit (1)
   * 3. Reset level reward mode to "stack" if it was "replace"
   *
   * @param {string} guildId
   * @param {Object} storage - StorageManager instance
   */
  async _handleProDowngrade(guildId, storage) {
    const { FREE_TIER } = await import("./config.js");
    const summary = { scheduledPaused: 0, panelsDisabled: 0, modeReset: false };

    try {
      // ── 1. Pause excess scheduled roles ──────────────────────────
      if (storage.dbManager?.scheduledRoles) {
        const allSchedules =
          await storage.dbManager.scheduledRoles.getByGuild(guildId);
        const activeSchedules = Object.values(allSchedules).filter(
          s => !s.executed && !s.cancelled,
        );

        if (activeSchedules.length > FREE_TIER.SCHEDULE_MAX_ACTIVE) {
          const sorted = activeSchedules.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          const toCancel = sorted.slice(FREE_TIER.SCHEDULE_MAX_ACTIVE);

          for (const schedule of toCancel) {
            await storage.dbManager.scheduledRoles.update(schedule.id, {
              cancelled: true,
              cancelledAt: new Date(),
              cancelReason: "pro_downgrade",
            });
            summary.scheduledPaused++;
          }

          logger.info(
            `📋 Pro downgrade: Paused ${summary.scheduledPaused} excess scheduled roles for guild ${guildId}`,
          );
        }
      }

      // ── 2. Disable extra ticket panels ───────────────────────────
      if (storage.dbManager?.ticketPanels) {
        const { FREE_TIER: TICKET_FREE } = await import(
          "../ticketing/config.js"
        );
        const panels = await storage.getTicketPanelsByGuild(guildId);
        const enabledPanels = panels.filter(p => p.settings?.enabled !== false);

        if (enabledPanels.length > TICKET_FREE.MAX_PANELS) {
          const sorted = enabledPanels.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          const toDisable = sorted.slice(TICKET_FREE.MAX_PANELS);

          for (const panel of toDisable) {
            await storage.updateTicketPanel(panel.panelId, {
              "settings.enabled": false,
              "settings.disabledReason": "pro_downgrade",
              "settings.disabledAt": new Date(),
            });
            summary.panelsDisabled++;
          }

          logger.info(
            `🎫 Pro downgrade: Disabled ${summary.panelsDisabled} excess ticket panels for guild ${guildId}`,
          );
        }
      }

      // ── 3. Reset level reward mode to "stack" ────────────────────
      const settings =
        await storage.dbManager.guildSettings.getByGuild(guildId);
      if (settings?.levelRewardMode === "replace") {
        await storage.dbManager.guildSettings.set(guildId, {
          ...settings,
          levelRewardMode: "stack",
        });
        summary.modeReset = true;
        logger.info(
          `⚙️ Pro downgrade: Reset level reward mode to "stack" for guild ${guildId}`,
        );
      }

      // ── Summary ──────────────────────────────────────────────────
      const actions = [];
      if (summary.scheduledPaused > 0)
        actions.push(`${summary.scheduledPaused} schedules paused`);
      if (summary.panelsDisabled > 0)
        actions.push(`${summary.panelsDisabled} panels disabled`);
      if (summary.modeReset) actions.push("reward mode reset to stack");

      logger.info(
        actions.length > 0
          ? `🔽 Pro downgrade complete for guild ${guildId}: ${actions.join(", ")}`
          : `🔽 Pro downgrade for guild ${guildId}: no excess resources to clean up`,
      );
    } catch (error) {
      // Non-fatal — the feature is already disabled, this is best-effort cleanup
      logger.error(
        `Error during Pro downgrade cleanup for guild ${guildId}:`,
        error,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Shared utilities
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the database manager instance (shorthand)
   * @returns {Promise<Awaited<ReturnType<import('../../utils/storage/databaseManager.js').getDatabaseManager>>|null>}
   */
  async _db() {
    const storage = await getStorageManager();
    return storage.dbManager || null;
  }

  /**
   * Resolve a feature config object from its ID
   * @param {string} featureId
   * @returns {Object|undefined}
   */
  _resolveFeature(featureId) {
    return Object.values(PremiumFeatures).find(f => f.id === featureId);
  }

  /**
   * Get a date N days from now
   * @param {number} days
   * @returns {Date}
   */
  _daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * Fetch a guild name, handling fetch errors gracefully
   * @param {string} guildId
   * @returns {Promise<string>}
   */
  async _fetchGuildName(guildId) {
    if (!this.client) return "Unknown Server";
    try {
      const guild = await this.client.guilds.fetch(guildId);
      return guild?.name || "Unknown Server";
    } catch {
      return "Unknown Server";
    }
  }

  /**
   * Send a DM embed to a user. Swallows errors (returns false if failed).
   * @param {string} userId
   * @param {Object} embed - Embed data (title, description, fields, color, footer)
   * @returns {Promise<boolean>}
   */
  async _sendDM(userId, embed) {
    if (!this.client) return false;
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return false;
      await user.send({ embeds: [embed] });
      return true;
    } catch (err) {
      logger.warn(`Could not send DM to user ${userId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Create dashboard notification only (no Discord DM)
   * Used when ALLOW_DM_WARNING=false
   */
  async _createNotificationOnly(
    userId,
    guildId,
    feature,
    balance,
    graceDeadline,
  ) {
    const daysLeft = Math.max(
      0,
      Math.ceil((graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );

    const guildName = await this._fetchGuildName(guildId);

    // Create notification in database for dashboard
    const db = await this._db();
    if (db) {
      await this._notify(db, userId, {
        type: "grace_period",
        title: "Grace Period — Action Required",
        message: `${feature.name} expired in ${guildName}. ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left before it's disabled. Top up ${feature.cost} Cores now.`,
        icon: "warning",
        metadata: { guildId, featureId: feature.id, daysLeft, balance },
      });
    }

    this.sentWarnings.add(`grace-${guildId}-${feature.id}-${userId}`);
  }

  /**
   * Create an in-app notification (non-critical, swallows errors)
   * @param {Object} db - Database manager instance
   * @param {string} userId
   * @param {{ type: string, title: string, message: string, icon: string, metadata?: Object }} data
   */
  async _notify(db, userId, data) {
    if (!db?.notifications) return;
    try {
      await db.notifications.create({ userId, ...data });
    } catch {
      /* non-critical */
    }
  }

  /**
   * Log a premium transaction to the database for audit trail
   * @param {Object} db - Database manager instance
   * @param {Object} transaction - Transaction details
   */
  async _logTransaction(db, transaction) {
    try {
      if (!db.payments) return;
      // Use "vault" provider for vault deposits, "premium_system" for others
      const provider =
        transaction.type === "vault_deposit" ? "vault" : "premium_system";
      await db.payments.create({
        paymentId: `premium_${transaction.type}_${transaction.guildId}_${Date.now()}`,
        discordId: transaction.userId,
        provider,
        type: transaction.type,
        status: "completed",
        amount: 0,
        currency: "CORES",
        coresGranted: transaction.amount,
        tier: transaction.featureId,
        metadata: {
          guildId: transaction.guildId,
          guildName:
            this.client?.guilds.cache.get(transaction.guildId)?.name ||
            "Unknown Server",
          featureName: transaction.featureName,
          reason: transaction.reason || null,
        },
      });
    } catch (error) {
      logger.warn(`Failed to log premium transaction: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let instance = null;
export function getPremiumManager() {
  if (!instance) instance = new PremiumManager();
  return instance;
}
