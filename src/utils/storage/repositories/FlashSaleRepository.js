import { BaseRepository } from "./BaseRepository.js";

/**
 * Repository for flash sales collection
 * Handles time-limited discounts on shop items
 */
export class FlashSaleRepository extends BaseRepository {
  constructor(db, cache, logger) {
    super(db, "item_sales", cache, logger);
  }

  /**
   * Get active sale for an item
   * @param {string} itemId - Item ID
   * @param {string} [guildId] - Optional guild ID for guild-specific sales
   * @returns {Promise<Object|null>} Active sale or null
   */
  async getActiveSale(itemId, guildId = null) {
    const now = new Date();
    const query = {
      itemId,
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
      enabled: true,
    };

    // Check for guild-specific sale first, then global sale
    if (guildId) {
      const guildSale = await this.collection.findOne({
        ...query,
        $or: [{ guildId }, { guildId: null }],
      });
      return guildSale;
    }

    return this.collection.findOne(query);
  }

  /**
   * Get all active sales for a guild
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<Array>} Active sales
   */
  async getActiveSales(guildId = null) {
    const now = new Date();
    const query = {
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
      enabled: true,
    };

    if (guildId) {
      return this.collection.find({
        ...query,
        $or: [{ guildId }, { guildId: null }],
      }).toArray();
    }

    return this.collection.find(query).toArray();
  }

  /**
   * Create a new flash sale
   * @param {Object} saleData - Sale data
   * @returns {Promise<Object>} Created sale
   */
  async createSale(saleData) {
    const sale = {
      itemId: saleData.itemId,
      discountPercent: saleData.discountPercent,
      fixedPrice: saleData.fixedPrice,
      startsAt: new Date(saleData.startsAt),
      expiresAt: new Date(saleData.expiresAt),
      guildId: saleData.guildId || null,
      enabled: true,
      createdBy: saleData.createdBy,
      createdAt: new Date(),
    };

    const result = await this.collection.insertOne(sale);
    return { ...sale, _id: result.insertedId };
  }

  /**
   * Update a flash sale
   * @param {string} saleId - Sale ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success
   */
  async updateSale(saleId, updates) {
    const result = await this.collection.updateOne(
      { _id: saleId },
      { $set: updates },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Delete a flash sale
   * @param {string} saleId - Sale ID
   * @returns {Promise<boolean>} Success
   */
  async deleteSale(saleId) {
    const result = await this.collection.deleteOne({ _id: saleId });
    return result.deletedCount > 0;
  }

  /**
   * Disable expired sales (cleanup)
   * @returns {Promise<number>} Number of disabled sales
   */
  async disableExpiredSales() {
    const now = new Date();
    const result = await this.collection.updateMany(
      {
        expiresAt: { $lte: now },
        enabled: true,
      },
      { $set: { enabled: false } },
    );
    return result.modifiedCount;
  }
}
