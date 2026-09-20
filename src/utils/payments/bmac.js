import { config } from "../../config/config.js";

/**
 * Buy Me a Coffee API Client
 * Handles fetching supporters, subscriptions, and extras from BMAC API
 * API docs: https://developers.buymeacoffee.com/
 *
 * BMAC Personal Access Tokens do NOT expire — they remain valid until manually revoked.
 */
export class BMACClient {
  constructor() {
    this.apiToken = config.payments.buymeacoffeeApiToken;
    this.baseUrl = "https://developers.buymeacoffee.com/api/v1";
  }

  get enabled() {
    return !!this.apiToken;
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async request(endpoint, options = {}) {
    if (!this.enabled) {
      throw new Error("BMAC API token is not configured");
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new Error(
        "BMAC API token invalid — regenerate at https://developers.buymeacoffee.com",
      );
    }

    if (response.status === 429) {
      throw new Error("BMAC API rate limited — retry later");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BMAC API error ${response.status}: ${text}`);
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `BMAC API returned non-JSON response: ${text.substring(0, 100)}...`,
      );
    }

    return response.json();
  }

  /**
   * Get paginated supporters
   * @param {Object} params
   * @param {number} [params.page=1] - Page number
   * @returns {Promise<Object>} Paginated supporter list
   */
  async getSupporters({ page = 1 } = {}) {
    return this.request(`/supporters?page=${page}`);
  }

  /**
   * Get all supporters (handles pagination automatically)
   * @returns {Promise<Array>} All supporters
   */
  async getAllSupporters() {
    const all = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getSupporters({ page });
      const data = result.data || [];
      all.push(...data);
      hasMore = result.next_page_url !== null && data.length > 0;
      page++;
    }

    return all;
  }

  /**
   * Get a single supporter by ID
   * @param {number} id - Supporter ID
   * @returns {Promise<Object>} Supporter data
   */
  async getSupporter(id) {
    return this.request(`/supporters/${id}`);
  }

  /**
   * Get paginated subscriptions
   * @param {Object} params
   * @param {number} [params.page=1] - Page number
   * @param {string} [params.status] - Filter by status (all, active, inactive)
   * @returns {Promise<Object>} Paginated subscription list
   */
  async getSubscriptions({ page = 1, status } = {}) {
    const params = new URLSearchParams({ page: page.toString() });
    if (status) params.set("status", status);
    return this.request(`/subscriptions?${params}`);
  }

  /**
   * Get all subscriptions (handles pagination automatically)
   * @param {Object} params
   * @param {string} [params.status] - Filter by status (all, active, inactive)
   * @returns {Promise<Array>} All subscriptions
   */
  async getAllSubscriptions({ status } = {}) {
    const all = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getSubscriptions({ page, status });
      const data = result.data || [];
      all.push(...data);
      hasMore = result.next_page_url !== null && data.length > 0;
      page++;
    }

    return all;
  }

  /**
   * Get paginated extras (shop purchases)
   * @param {Object} params
   * @param {number} [params.page=1] - Page number
   * @returns {Promise<Object>} Paginated extras list
   */
  async getExtras({ page = 1 } = {}) {
    return this.request(`/extras?page=${page}`);
  }

  /**
   * Check if token is valid by making a test request
   * @returns {Promise<Object>} Token status info
   */
  async checkTokenStatus() {
    try {
      const result = await this.getSupporters({ page: 1 });
      return {
        valid: true,
        supporterCount: result.total || 0,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

export const bmacClient = new BMACClient();
