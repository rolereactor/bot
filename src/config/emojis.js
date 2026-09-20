/**
 * Custom emojis configuration for different environments
 * Manages Discord emoji IDs and formatting for development and production
 */
class EmojiConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || "development";
  }

  /**
   * Get custom emojis configuration based on environment
   * @returns {Object} Custom emojis for current environment
   */
  get customEmojis() {
    // Different emoji IDs for different environments
    const emojiConfigs = {
      development: {
        core: "1548258466735329280",
        spark: "1548258526831321098",
        coreBasicBadge: "1427982373244637244",
        corePremiumBadge: "1427982777466359859",
        coreEliteBadge: "1427983161513607288",
        // Power Cells
        powerCellAaa: "", // TODO: Upload emoji
        powerCellAa: "",  // TODO: Upload emoji
        powerCellC: "",   // TODO: Upload emoji
        powerCellD: "",   // TODO: Upload emoji
        // Engine Modules
        piston: "",       // TODO: Upload emoji
        turbocharger: "", // TODO: Upload emoji
        supercharger: "", // TODO: Upload emoji
      },
      production: {
        core: "1427267639457222737",
        spark: "", // TODO: Upload spark_icon.png to prod server and paste ID here
        coreBasicBadge: "1427984193756987452",
        corePremiumBadge: "1427984335377793136",
        coreEliteBadge: "1427984418420555906",
        // Power Cells
        powerCellAaa: "", // TODO: Upload emoji
        powerCellAa: "",  // TODO: Upload emoji
        powerCellC: "",   // TODO: Upload emoji
        powerCellD: "",   // TODO: Upload emoji
        // Engine Modules
        piston: "",       // TODO: Upload emoji
        turbocharger: "", // TODO: Upload emoji
        supercharger: "", // TODO: Upload emoji
      },
    };

    const emojis = emojiConfigs[this.environment] || emojiConfigs.development;

    // Convert to Discord emoji format
    const formattedEmojis = {};
    for (const [name, id] of Object.entries(emojis)) {
      if (!id) continue;
      // Convert camelCase to snake_case for Discord emoji format
      const emojiName = name.replace(/([A-Z])/g, "_$1").toLowerCase();
      formattedEmojis[name] = `<:${emojiName}:${id}>`;
    }

    return formattedEmojis;
  }

  /**
   * Safe getter for custom emoji with fallback standard emoji
   * @param {string} name - Custom emoji name (e.g. 'core', 'spark')
   * @param {string} fallback - Fallback unicode emoji if custom ID is missing
   * @returns {string}
   */
  get(name, fallback = "✨") {
    const formatted = this.customEmojis[name];
    if (
      formatted &&
      !formatted.includes(":undefined>") &&
      !formatted.includes(":>")
    ) {
      return formatted;
    }
    return fallback;
  }

  /**
   * Helper to get Core currency emoji
   * @returns {string}
   */
  get core() {
    return this.get("core", "🔮");
  }

  /**
   * Helper to get Spark currency emoji
   * @returns {string}
   */
  get spark() {
    return this.get("spark", "⚡");
  }

  /**
   * Get Power Cell emoji by size
   * @param {string} size - Power cell size ('aaa', 'aa', 'c', 'd')
   * @returns {string} Custom or fallback emoji
   */
  getPowerCellEmoji(size) {
    const sizeMap = {
      aaa: { name: "powerCellAaa", fallback: "🔋" },
      aa: { name: "powerCellAa", fallback: "🔋" },
      c: { name: "powerCellC", fallback: "🔋" },
      d: { name: "powerCellD", fallback: "🔋" },
    };
    const config = sizeMap[size] || sizeMap.aaa;
    return this.get(config.name, config.fallback);
  }

  /**
   * Get Engine Module emoji
   * @param {string} type - Engine module type ('piston', 'turbocharger', 'supercharger')
   * @returns {string} Custom or fallback emoji
   */
  getEngineModuleEmoji(type) {
    const typeMap = {
      piston: { name: "piston", fallback: "⚙️" },
      turbocharger: { name: "turbocharger", fallback: "⚙️" },
      supercharger: { name: "supercharger", fallback: "⚙️" },
    };
    const config = typeMap[type] || typeMap.piston;
    return this.get(config.name, config.fallback);
  }

  /**
   * Get the appropriate badge emoji for a core tier
   * @param {string} tier - The core tier name (e.g., "Core Basic", "Core Premium", "Core Elite")
   * @returns {string} The badge emoji for the tier, or fallback emoji if not found
   */
  getTierBadge(tier) {
    const badges = {
      "Core Basic": this.customEmojis.coreBasicBadge || "🥉",
      "Core Premium": this.customEmojis.corePremiumBadge || "🥈",
      "Core Elite": this.customEmojis.coreEliteBadge || "🥇",
      Bronze: "🧪",
    };

    return badges[tier] || "⭐";
  }

  /**
   * Get all emojis as a single object
   * @returns {Object} Complete emoji configuration object
   */
  getAll() {
    return {
      customEmojis: this.customEmojis,
      core: this.core,
      spark: this.spark,
    };
  }
}

// Export singleton instance
export const emojiConfig = new EmojiConfig();
export default emojiConfig;
