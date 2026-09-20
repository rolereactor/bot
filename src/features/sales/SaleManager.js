import { getLogger } from "../../utils/logger.js";
import { getStorageManager } from "../../utils/storage/storageManager.js";

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// SaleManager
// ─────────────────────────────────────────────────────────────────────────────

export class SaleManager {
  constructor() {
    this.logger = getLogger();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Sale Lookup
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get active sale for an item
   * @param {string} itemId - Item ID
   * @param {string} [guildId] - Optional guild ID for guild-specific sales
   * @returns {Promise<Object|null>} Active sale or null
   */
  async getActiveSale(itemId, guildId = null) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return null;
      }
      return await storage.dbManager.flashSales.getActiveSale(itemId, guildId);
    } catch (error) {
      logger.error(`Failed to get active sale for ${itemId}:`, error);
      return null;
    }
  }

  /**
   * Get all active sales for a guild
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<Array>} Active sales
   */
  async getActiveSales(guildId = null) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return [];
      }
      return await storage.dbManager.flashSales.getActiveSales(guildId);
    } catch (error) {
      logger.error(`Failed to get active sales:`, error);
      return [];
    }
  }

  /**
   * Calculate discounted price for an item
   * @param {Object} item - Shop item
   * @param {Object} sale - Active sale
   * @returns {Object} Price info { original, discounted, discountPercent, savings }
   */
  calculatePrice(item, sale) {
    if (!sale) {
      return {
        original: item.cost,
        discounted: item.cost,
        discountPercent: 0,
        savings: 0,
        hasSale: false,
      };
    }

    let discountedPrice;
    if (sale.fixedPrice !== undefined && sale.fixedPrice !== null) {
      discountedPrice = sale.fixedPrice;
    } else if (sale.discountPercent) {
      discountedPrice = Math.ceil(item.cost * (1 - sale.discountPercent / 100));
    } else {
      return {
        original: item.cost,
        discounted: item.cost,
        discountPercent: 0,
        savings: 0,
        hasSale: false,
      };
    }

    const savings = item.cost - discountedPrice;
    const discountPercent = Math.round((savings / item.cost) * 100);

    return {
      original: item.cost,
      discounted: discountedPrice,
      discountPercent,
      savings,
      hasSale: true,
    };
  }

  /**
   * Check if an item is on sale
   * @param {string} itemId - Item ID
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<Object>} { onSale, priceInfo, sale }
   */
  async checkSale(itemId, guildId = null) {
    const sale = await this.getActiveSale(itemId, guildId);
    if (!sale) {
      return { onSale: false, priceInfo: null, sale: null };
    }

    // We need the item to calculate price, but we can return the sale info
    return {
      onSale: true,
      priceInfo: null, // Will be calculated when item is available
      sale,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Sale Management (Admin)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new flash sale
   * @param {Object} saleData - Sale data
   * @returns {Promise<Object>} Created sale
   */
  async createSale(saleData) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return { success: false, message: "Database not available." };
      }
      return await storage.dbManager.flashSales.createSale(saleData);
    } catch (error) {
      logger.error(`Failed to create sale:`, error);
      return { success: false, message: "Failed to create sale." };
    }
  }

  /**
   * Update a flash sale
   * @param {string} saleId - Sale ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success
   */
  async updateSale(saleId, updates) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return false;
      }
      return await storage.dbManager.flashSales.updateSale(saleId, updates);
    } catch (error) {
      logger.error(`Failed to update sale:`, error);
      return false;
    }
  }

  /**
   * Delete a flash sale
   * @param {string} saleId - Sale ID
   * @returns {Promise<boolean>} Success
   */
  async deleteSale(saleId) {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return false;
      }
      return await storage.dbManager.flashSales.deleteSale(saleId);
    } catch (error) {
      logger.error(`Failed to delete sale:`, error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public — Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Disable expired sales
   * @returns {Promise<number>} Number of disabled sales
   */
  async disableExpiredSales() {
    try {
      const storage = await getStorageManager();
      if (!storage.dbManager?.flashSales) {
        return 0;
      }
      return await storage.dbManager.flashSales.disableExpiredSales();
    } catch (error) {
      logger.error(`Failed to disable expired sales:`, error);
      return 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let instance = null;
export function getSaleManager() {
  if (!instance) instance = new SaleManager();
  return instance;
}
