// Shop configuration
// Items users can purchase with Cores or Sparks

import { emojiConfig } from "./emojis.js";

// ============================================================================
// Power Cells — Purchased with Cores
// ============================================================================

export const POWER_CELLS = {
  "power-cell-aaa": {
    id: "power-cell-aaa",
    name: "AAA Power Cell",
    description: "Small energy storage — stores 25 Cores",
    get emoji() { return emojiConfig.getPowerCellEmoji("aaa"); },
    currency: "cores",
    cost: 28,
    storedAmount: 25,
    type: "power_cell",
    size: "aaa",
    category: "power_cells",
  },
  "power-cell-aa": {
    id: "power-cell-aa",
    name: "AA Power Cell",
    description: "Medium energy storage — stores 75 Cores",
    get emoji() { return emojiConfig.getPowerCellEmoji("aa"); },
    currency: "cores",
    cost: 83,
    storedAmount: 75,
    type: "power_cell",
    size: "aa",
    category: "power_cells",
  },
  "power-cell-c": {
    id: "power-cell-c",
    name: "C Power Cell",
    description: "Large energy storage — stores 200 Cores",
    get emoji() { return emojiConfig.getPowerCellEmoji("c"); },
    currency: "cores",
    cost: 220,
    storedAmount: 200,
    type: "power_cell",
    size: "c",
    category: "power_cells",
  },
  "power-cell-d": {
    id: "power-cell-d",
    name: "D Power Cell",
    description: "Extra large energy storage — stores 500 Cores",
    get emoji() { return emojiConfig.getPowerCellEmoji("d"); },
    currency: "cores",
    cost: 550,
    storedAmount: 500,
    type: "power_cell",
    size: "d",
    category: "power_cells",
  },
};

// ============================================================================
// Engine Modules — Purchased with Sparks
// ============================================================================

export const ENGINE_MODULES = {
  "piston": {
    id: "piston",
    name: "Piston",
    description: "Pro Engine access for 1 day",
    get emoji() { return emojiConfig.getEngineModuleEmoji("piston"); },
    currency: "sparks",
    cost: 75,
    durationDays: 1,
    type: "engine_module",
    category: "engine_modules",
  },
  "turbocharger": {
    id: "turbocharger",
    name: "Turbocharger",
    description: "Pro Engine access for 3 days",
    get emoji() { return emojiConfig.getEngineModuleEmoji("turbocharger"); },
    currency: "sparks",
    cost: 175,
    durationDays: 3,
    type: "engine_module",
    category: "engine_modules",
  },
  "supercharger": {
    id: "supercharger",
    name: "Supercharger",
    description: "Pro Engine access for 7 days",
    get emoji() { return emojiConfig.getEngineModuleEmoji("supercharger"); },
    currency: "sparks",
    cost: 350,
    durationDays: 7,
    type: "engine_module",
    category: "engine_modules",
  },
};

// ============================================================================
// Combined shop items
// ============================================================================

export const SHOP_ITEMS = {
  ...POWER_CELLS,
  ...ENGINE_MODULES,
};

// ============================================================================
// Categories for display
// ============================================================================

export const SHOP_CATEGORIES = {
  power_cells: {
    name: "Power Cells",
    emoji: "🔋",
    description: "Store and trade Cores between users",
  },
  engine_modules: {
    name: "Engine Modules",
    emoji: "⚙️",
    description: "Temporary Pro Engine access",
  },
};

// ============================================================================
// Daily purchase limits (per user)
// ============================================================================

export const SHOP_LIMITS = {
  power_cells: 5, // Max Power Cell purchases per day per user
  engine_modules: 2, // Max Engine Module purchases per day per user
};

// ============================================================================
// Monthly stock limits (per guild)
// ============================================================================

export const MONTHLY_STOCK = {
  "power-cell-aaa": 500,
  "power-cell-aa": 300,
  "power-cell-c": 150,
  "power-cell-d": 50,
  "piston": 3,
  "turbocharger": 2,
  "supercharger": 1,
};

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Get all items as an array
 * @returns {Array} Array of shop items
 */
export function getShopItems() {
  return Object.values(SHOP_ITEMS);
}

/**
 * Get items by category
 * @param {string} category - Category name
 * @returns {Array} Array of items in category
 */
export function getShopItemsByCategory(category) {
  return getShopItems().filter(item => item.category === category);
}

/**
 * Get a specific item by ID
 * @param {string} itemId - Item ID
 * @returns {Object|null} Shop item or null if not found
 */
export function getShopItem(itemId) {
  return SHOP_ITEMS[itemId] || null;
}

/**
 * Get Power Cells as array
 * @returns {Array} Array of Power Cell items
 */
export function getPowerCells() {
  return Object.values(POWER_CELLS);
}

/**
 * Get Engine Modules as array
 * @returns {Array} Array of Engine Module items
 */
export function getEngineModules() {
  return Object.values(ENGINE_MODULES);
}
