import { getLogger } from "../../utils/logger.js";
import { getStorageManager } from "../../utils/storage/storageManager.js";
import {
  SHOP_LIMITS,
  MONTHLY_STOCK,
  getShopItem,
} from "../../config/shopConfig.js";

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// SparkShopManager
// ─────────────────────────────────────────────────────────────────────────────

export class SparkShopManager {
  constructor() {
    this.logger = getLogger();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Purchase
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Purchase an item from the shop
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID (for Engine Modules)
   * @param {string} itemId - Item ID from SHOP_ITEMS
   * @returns {Promise<{success: boolean, message?: string, item?: Object}>}
   */
  async purchase(userId, guildId, itemId) {
    const item = getShopItem(itemId);
    if (!item) {
      return { success: false, message: "Invalid item." };
    }

    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { success: false, message: "Database connection required." };
      }
      const db = storage.dbManager;

      // Check for active sale
      let finalPrice = item.cost;
      let saleInfo = null;
      if (db.flashSales) {
        const sale = await db.flashSales.getActiveSale(itemId, guildId);
        if (sale) {
          if (sale.fixedPrice !== undefined && sale.fixedPrice !== null) {
            finalPrice = sale.fixedPrice;
          } else if (sale.discountPercent) {
            finalPrice = Math.ceil(
              item.cost * (1 - sale.discountPercent / 100),
            );
          }
          saleInfo = sale;
        }
      }

      const creditData = await db.coreCredits.getByUserId(userId);

      // Check daily purchase limit
      const today = new Date().toISOString().split("T")[0];
      const purchases = creditData?.sparkProPurchases || [];
      const todayPurchases = purchases.filter(
        p =>
          p.purchasedAt &&
          new Date(p.purchasedAt).toISOString().split("T")[0] === today,
      );

      const limit = SHOP_LIMITS[item.category] || 5;
      if (todayPurchases.length >= limit) {
        return {
          success: false,
          message: `Daily purchase limit reached for this category (${limit} per day).`,
        };
      }

      // Check monthly guild stock (per guild, first come first served)
      const stockLimit = MONTHLY_STOCK[item.id];
      if (stockLimit !== undefined) {
        const guildStock = await this._getGuildStock(db, guildId, item.id);
        if (guildStock.remaining <= 0) {
          return {
            success: false,
            message: `This item is out of stock for this server. Stock resets next month.`,
          };
        }
      }

      // Check currency and deduct (using finalPrice with sale discount)
      if (item.currency === "cores") {
        const currentCores = Math.round((creditData?.credits || 0) * 100) / 100;
        if (currentCores < finalPrice) {
          return {
            success: false,
            message: `Insufficient Cores. You need **${finalPrice} Cores**, but you only have **${currentCores} Cores**.`,
          };
        }

        const deduction = await db.coreCredits.deductCredits(
          userId,
          finalPrice,
        );
        if (!deduction.success) {
          return {
            success: false,
            message: `Insufficient Cores. Your balance changed.`,
          };
        }
      } else if (item.currency === "sparks") {
        const currentSparks = Math.floor(creditData?.sparks || 0);
        if (currentSparks < finalPrice) {
          return {
            success: false,
            message: `Insufficient Sparks. You need **${finalPrice} Sparks**, but you only have **${currentSparks} Sparks**.`,
          };
        }

        const deduction = await db.coreCredits.deductSparks(userId, finalPrice);
        if (!deduction.success) {
          return {
            success: false,
            message: `Insufficient Sparks. Your balance changed.`,
          };
        }
      }

      // Add item to inventory (reference pattern — only store itemId + dynamic data)
      const inventoryItem = {
        itemId: item.id,
        purchasedAt: new Date(),
        used: false,
        usedAt: null,
        activatedInGuild: null,
      };

      const inventory = creditData?.sparkInventory || [];
      inventory.push(inventoryItem);

      await db.coreCredits.collection.updateOne(
        { userId },
        { $set: { sparkInventory: inventory } },
        { upsert: true },
      );

      // Decrement guild stock after successful purchase
      if (stockLimit !== undefined) {
        await this._decrementGuildStock(db, guildId, item.id);
      }

      // Log purchase
      await this._logPurchase(db, {
        userId,
        guildId,
        itemId: item.id,
        itemName: item.name,
        currency: item.currency,
        amountDeducted: finalPrice,
      });

      // Add to purchase history
      await db.coreCredits.updateSparks(userId, 0); // Touch to update lastUpdated
      await this._addPurchaseToHistory(db, userId, item, finalPrice, saleInfo);

      logger.info(
        `🛒 Shop purchase: User ${userId} bought ${item.name} for ${finalPrice} ${item.currency} (added to inventory)`,
      );

      return {
        success: true,
        message: `Successfully purchased **${item.name}**!`,
        item,
        finalPrice,
        saleInfo,
      };
    } catch (error) {
      logger.error(
        `Failed to process shop purchase for user ${userId}:`,
        error,
      );
      return { success: false, message: "An internal error occurred." };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Status
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get guild stock for all items
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object>} Stock info for all items
   */
  async getGuildStock(guildId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return {};
      }
      const db = storage.dbManager;

      const stock = {};
      for (const itemId of Object.keys(MONTHLY_STOCK)) {
        stock[itemId] = await this._getGuildStock(db, guildId, itemId);
      }
      return stock;
    } catch (error) {
      logger.error(`Failed to get guild stock for ${guildId}:`, error);
      return {};
    }
  }

  /**
   * Get user's balance and purchase history
   * @param {string} userId - Discord user ID
   * @returns {Promise<Object>}
   */
  async getUserStatus(userId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { cores: 0, sparks: 0, purchases: [], sparkProExpiry: null };
      }
      const db = storage.dbManager;

      const creditData = await db.coreCredits.getByUserId(userId);
      return {
        cores: Math.round((creditData?.credits || 0) * 100) / 100,
        sparks: Math.floor(creditData?.sparks || 0),
        purchases: creditData?.sparkProPurchases || [],
        sparkProExpiry: creditData?.sparkProExpiry
          ? new Date(creditData.sparkProExpiry)
          : null,
      };
    } catch (error) {
      logger.error(`Failed to get shop status for user ${userId}:`, error);
      return { cores: 0, sparks: 0, purchases: [], sparkProExpiry: null };
    }
  }

  /**
   * Check if a guild has active Spark Pro
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<boolean>}
   */
  async hasSparkPro(guildId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) return false;

      const settings =
        await storage.dbManager.guildSettings.getByGuild(guildId);
      const sparkPro = settings?.premiumFeatures?.spark_pro;

      if (!sparkPro?.active) return false;
      if (!sparkPro.expiresAt) return false;

      return new Date(sparkPro.expiresAt) >= new Date();
    } catch (error) {
      logger.error(`Error checking Spark Pro for guild ${guildId}:`, error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Inventory
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get user's inventory of purchased items
   * @param {string} userId - Discord user ID
   * @returns {Promise<Object>} Inventory data
   */
  async getInventory(userId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { items: [], sparkProExpiry: null };
      }
      const db = storage.dbManager;

      const creditData = await db.coreCredits.getByUserId(userId);
      const items = creditData?.sparkInventory || [];
      const sparkProExpiry = creditData?.sparkProExpiry
        ? new Date(creditData.sparkProExpiry)
        : null;

      return { items, sparkProExpiry };
    } catch (error) {
      logger.error(`Failed to get inventory for user ${userId}:`, error);
      return { items: [], sparkProExpiry: null };
    }
  }

  /**
   * Use an item from inventory
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID
   * @param {string} itemId - Item ID to use
   * @returns {Promise<Object>} Use result
   */
  async useInventoryItem(userId, guildId, itemId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { success: false, message: "Database connection required." };
      }
      const db = storage.dbManager;

      const creditData = await db.coreCredits.getByUserId(userId);
      const items = creditData?.sparkInventory || [];

      const itemIndex = items.findIndex(i => i.itemId === itemId && !i.used);

      if (itemIndex === -1) {
        return {
          success: false,
          message: "Item not found or already used.",
        };
      }

      const shopItem = getShopItem(itemId);

      if (!shopItem) {
        return { success: false, message: "Invalid item." };
      }

      // Handle different item types (use shopItem for fresh data)
      if (shopItem.type === "power_cell") {
        // Add stored Cores to user's balance
        const addResult = await db.coreCredits.updateCredits(
          userId,
          shopItem.storedAmount,
        );
        if (!addResult.success) {
          return { success: false, message: "Failed to add Cores to balance." };
        }

        // Mark item as used
        items[itemIndex].used = true;
        items[itemIndex].usedAt = new Date();
        items[itemIndex].activatedInGuild = guildId;

        await db.coreCredits.collection.updateOne(
          { userId },
          { $set: { sparkInventory: items } },
          { upsert: true },
        );

        logger.info(
          `🔋 Power Cell used: User ${userId} activated ${shopItem.name} and received ${shopItem.storedAmount} Cores`,
        );

        return {
          success: true,
          type: "power_cell",
          coresAdded: shopItem.storedAmount,
        };
      } else if (shopItem.type === "engine_module") {
        // Activate Pro Engine for the guild
        const activationResult = await this._activateEngineModule(
          db,
          userId,
          guildId,
          shopItem,
        );

        if (!activationResult.success) {
          return { success: false, message: activationResult.message };
        }

        // Mark item as used
        items[itemIndex].used = true;
        items[itemIndex].usedAt = new Date();
        items[itemIndex].activatedInGuild = guildId;

        await db.coreCredits.collection.updateOne(
          { userId },
          { $set: { sparkInventory: items } },
          { upsert: true },
        );

        logger.info(
          `⚙️ Engine Module used: User ${userId} activated ${shopItem.name} in guild ${guildId}`,
        );

        return {
          success: true,
          type: "engine_module",
          expiresAt: activationResult.expiresAt,
        };
      }

      return { success: false, message: "Unknown item type." };
    } catch (error) {
      logger.error(`Failed to use inventory item:`, error);
      return { success: false, message: "Failed to use item." };
    }
  }

  /**
   * Gift an item to another user
   * @param {string} fromUserId - Sender's user ID
   * @param {string} toUserId - Recipient's user ID
   * @param {string} itemId - Item ID to gift
   * @returns {Promise<Object>} Gift result
   */
  async giftItem(fromUserId, toUserId, itemId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager) {
        return { success: false, message: "Database connection required." };
      }
      const db = storage.dbManager;

      // Get sender's inventory
      const senderData = await db.coreCredits.getByUserId(fromUserId);
      const senderInventory = senderData?.sparkInventory || [];

      const itemIndex = senderInventory.findIndex(
        i => i.itemId === itemId && !i.used,
      );

      if (itemIndex === -1) {
        return {
          success: false,
          message: "Item not found in your inventory or already used.",
        };
      }

      const item = senderInventory[itemIndex];
      const shopItem = getShopItem(itemId);

      // Remove from sender's inventory
      senderInventory.splice(itemIndex, 1);
      await db.coreCredits.collection.updateOne(
        { userId: fromUserId },
        { $set: { sparkInventory: senderInventory } },
        { upsert: true },
      );

      // Add to recipient's inventory (reference pattern — only itemId + dynamic data)
      const recipientData = await db.coreCredits.getByUserId(toUserId);
      const recipientInventory = recipientData?.sparkInventory || [];

      const giftedItem = {
        itemId: item.itemId,
        purchasedAt: new Date(),
        used: false,
        usedAt: null,
        activatedInGuild: null,
        giftedBy: fromUserId,
      };

      recipientInventory.push(giftedItem);
      await db.coreCredits.collection.updateOne(
        { userId: toUserId },
        { $set: { sparkInventory: recipientInventory } },
        { upsert: true },
      );

      logger.info(
        `🎁 Gift: User ${fromUserId} gifted ${shopItem?.name || itemId} to user ${toUserId}`,
      );

      return {
        success: true,
        item: giftedItem,
        shopItem,
      };
    } catch (error) {
      logger.error(`Failed to gift item:`, error);
      return { success: false, message: "Failed to gift item." };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Activation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Activate an Engine Module for a guild
   */
  async _activateEngineModule(db, userId, guildId, item) {
    try {
      const settings = await db.guildSettings.getByGuild(guildId);
      const premiumFeatures = settings?.premiumFeatures || {};

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + item.durationDays);

      // If Spark Pro is already active, extend it
      const existing = premiumFeatures.spark_pro;
      if (existing?.active && existing.expiresAt) {
        const existingExpiry = new Date(existing.expiresAt);
        if (existingExpiry > now) {
          existingExpiry.setDate(existingExpiry.getDate() + item.durationDays);
          expiresAt.setTime(existingExpiry.getTime());
        }
      }

      premiumFeatures.spark_pro = {
        active: true,
        payerUserId: userId,
        activatedAt: now,
        expiresAt,
        cost: item.cost,
        period: "spark",
        source: "shop",
      };

      await db.guildSettings.set(guildId, { ...settings, premiumFeatures });

      return { success: true, expiresAt };
    } catch (error) {
      logger.error("Failed to activate Engine Module:", error);
      return { success: false, message: "Activation failed." };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Guild Stock Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get guild stock for an item
   * @param {Object} db - Database manager
   * @param {string} guildId - Guild ID
   * @param {string} itemId - Item ID
   * @returns {Promise<Object>} Stock info { remaining, total, resetAt }
   */
  async _getGuildStock(db, guildId, itemId) {
    try {
      const total = MONTHLY_STOCK[itemId];
      if (total === undefined) {
        return { remaining: Infinity, total: Infinity, resetAt: null };
      }

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const settings = await db.guildSettings.getByGuild(guildId);
      const stockData = settings?.monthlyStock || {};
      const itemStock = stockData[itemId] || {};

      // Check if stock is for current month
      if (itemStock.monthKey !== monthKey) {
        // New month, reset stock
        return { remaining: total, total, resetAt: this._getNextMonthReset() };
      }

      return {
        remaining: Math.max(0, total - (itemStock.used || 0)),
        total,
        resetAt: this._getNextMonthReset(),
      };
    } catch (error) {
      logger.error(
        `Failed to get guild stock for ${guildId}:${itemId}:`,
        error,
      );
      return {
        remaining: MONTHLY_STOCK[itemId] || 0,
        total: MONTHLY_STOCK[itemId] || 0,
        resetAt: null,
      };
    }
  }

  /**
   * Decrement guild stock after purchase
   * @param {Object} db - Database manager
   * @param {string} guildId - Guild ID
   * @param {string} itemId - Item ID
   */
  async _decrementGuildStock(db, guildId, itemId) {
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const settings = await db.guildSettings.getByGuild(guildId);
      const stockData = settings?.monthlyStock || {};
      const itemStock = stockData[itemId] || {};

      // Initialize or reset for new month
      if (itemStock.monthKey !== monthKey) {
        stockData[itemId] = { monthKey, used: 1 };
      } else {
        stockData[itemId] = { ...itemStock, used: (itemStock.used || 0) + 1 };
      }

      await db.guildSettings.set(guildId, {
        ...settings,
        monthlyStock: stockData,
      });
    } catch (error) {
      logger.error(
        `Failed to decrement guild stock for ${guildId}:${itemId}:`,
        error,
      );
    }
  }

  /**
   * Get next month reset date
   * @returns {Date} First day of next month
   */
  _getNextMonthReset() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Logging
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log a shop purchase to the payments collection
   */
  async _logPurchase(db, data) {
    try {
      if (!db.payments) return;

      await db.payments.create({
        paymentId: `shop_${data.userId}_${Date.now()}`,
        discordId: data.userId,
        provider: "shop",
        type: "shop_purchase",
        status: "completed",
        amount: 0,
        currency: data.currency.toUpperCase(),
        sparksGranted: data.currency === "sparks" ? -data.amountDeducted : 0,
        metadata: {
          guildId: data.guildId,
          itemId: data.itemId,
          itemName: data.itemName,
          coresDeducted: data.currency === "cores" ? data.amountDeducted : 0,
        },
      });
    } catch (error) {
      logger.warn(`Failed to log shop purchase: ${error.message}`);
    }
  }

  /**
   * Add purchase to user's history
   */
  async _addPurchaseToHistory(
    db,
    userId,
    item,
    finalPrice = item.cost,
    saleInfo = null,
  ) {
    try {
      const creditData = await db.coreCredits.getByUserId(userId);
      const purchases = creditData?.sparkProPurchases || [];

      purchases.push({
        itemId: item.id,
        itemName: item.name,
        currency: item.currency,
        originalCost: item.cost,
        finalCost: finalPrice,
        hadSale: !!saleInfo,
        purchasedAt: new Date(),
      });

      // Keep last 50 purchases
      const recentPurchases = purchases.slice(-50);

      await db.coreCredits.collection.updateOne(
        { userId },
        { $set: { sparkProPurchases: recentPurchases } },
        { upsert: true },
      );
    } catch (error) {
      logger.warn(`Failed to add purchase to history: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let instance = null;
export function getSparkShopManager() {
  if (!instance) instance = new SparkShopManager();
  return instance;
}
