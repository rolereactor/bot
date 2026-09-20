import dotenv from "dotenv";
import { getAIFeatureCosts, getAvatarContentFilter } from "./ai.js";
import { WEBSITE_URL, API_URL } from "./domains.js";
import { validateEnv } from "./envSchema.js";

// Load environment variables
dotenv.config();
// Overlay the environment-specific file (.env.development / .env.production / etc.)
// so dev config actually takes effect, per project conventions.
// NOTE: `override: true` clobbers any pre-set process.env vars here —
// standalone scripts that must target a different DB must run with
// NODE_ENV=test (no overlay file) to avoid silently using this cluster.
dotenv.config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
  override: true,
});

/**
 * Configuration management class following Discord API best practices
 */
class Config {
  constructor() {
    // Don't validate on construction - allow lazy validation
    // This allows the config to be imported even if env vars aren't set yet
    this._validated = false;
    this._env = null;
  }

  /**
   * Get validated environment (lazy, cached after first call)
   * @returns {ReturnType<typeof validateEnv>}
   */
  get env() {
    if (!this._env) {
      this._env = validateEnv();
    }
    return this._env;
  }

  /**
   * Get current environment
   * @returns {string} Current environment
   */
  get environment() {
    return process.env.NODE_ENV || "development";
  }

  /**
   * Check if running in production
   * @returns {boolean} True if production
   */
  get isProduction() {
    return this.environment === "production";
  }

  /**
   * Check if running in development
   * @returns {boolean} True if development
   */
  get isDevelopment() {
    return this.environment === "development";
  }

  /**
   * Validate required environment variables
   * @throws {Error} If required environment variables are missing
   */
  validateRequiredEnvVars() {
    void this.env; // triggers zod validation (throws if required vars missing)

    // Secondary validation for payments in production
    if (this.isProduction && !process.env.PLISIO_SECRET_KEY) {
      // Logger not available during config init, use console as fallback
      console.warn(
        "⚠️ PLISIO_SECRET_KEY is missing in production. Crypto payments will be disabled.",
      );
    }

    if (
      this.isProduction &&
      !process.env.BOT_API_URL &&
      !process.env.PUBLIC_URL &&
      !process.env.BOT_URL
    ) {
      console.warn(
        "⚠️ No API/Public URL configured in production. Webhooks may not function correctly.",
      );
    }
  }

  /**
   * Get Discord configuration
   * @returns {Object} Discord configuration object
   */
  get discord() {
    return {
      token: process.env.DISCORD_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID,
      developers: this.parseDevelopers(),
    };
  }

  /**
   * Get database configuration
   * @returns {Object} Database configuration object
   */
  get database() {
    return {
      uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
      name: process.env.MONGODB_DB || "role-reactor-bot",
      options: {
        // Connection pool settings - optimized for resource efficiency on MongoDB Atlas Flex
        // Lower minPoolSize = lower resource usage = better efficiency
        // Can be overridden via MONGODB_MIN_POOL_SIZE and MONGODB_MAX_POOL_SIZE env vars
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || "5", 10),
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || "1", 10),
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 30000, // Increased for DNS resolution
        connectTimeoutMS: 30000, // Increased for DNS resolution
        socketTimeoutMS: 60000,
        retryWrites: true,
        retryReads: true,
        w: "majority",
        // Enhanced reconnection options
        heartbeatFrequencyMS: 10000,
        // Add connection optimization
        maxConnecting: parseInt(process.env.MONGODB_MAX_CONNECTING || "2", 10),
        serverApi: {
          version: "1",
          strict: false,
          deprecationErrors: false,
        },
      },
    };
  }

  /**
   * Get logging configuration
   * @returns {Object} Logging configuration object
   */
  get logging() {
    return {
      level: process.env.LOG_LEVEL || "INFO",
      file: process.env.LOG_FILE,
      console: process.env.LOG_CONSOLE !== "false",
    };
  }

  /**
   * Get cache limits configuration
   * @returns {Object} Cache limits configuration object
   */
  get cacheLimits() {
    return {
      MessageManager: 200, // Increased from 100
      UserManager: 1000, // Increased from 500
      // Note: GuildManager, ChannelManager, and RoleManager cannot be overridden
      // They are managed internally by discord.js
      GuildMemberManager: 500, // Increased from 200
      EmojiManager: 100, // Increased from 50
      // Add new cache managers
      ApplicationCommandManager: 50,
      GuildScheduledEventManager: 25,
      StageInstanceManager: 25,
      ThreadManager: 100,
      VoiceStateManager: 200,
    };
  }

  /**
   * Get rate limit configuration
   * @returns {Object} Rate limit configuration object
   */
  get rateLimits() {
    const baseConfig = {
      rest: {
        timeout: 15000,
        retries: 3,
        offset: 750,
        // Enhanced rate limiting
        globalLimit: 50, // Global requests per second
        userLimit: 10, // Per-user requests per second
        guildLimit: 20, // Per-guild requests per second
      },
      ws: {
        properties: {
          browser: "Discord iOS",
        },
        // WebSocket rate limiting
        heartbeatInterval: 41250, // Discord's recommended interval
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
      },
    };

    // Environment-specific adjustments
    if (this.isProduction) {
      return {
        ...baseConfig,
        rest: {
          ...baseConfig.rest,
          timeout: 20000, // Longer timeout for production
          retries: 5, // More retries for production
          offset: 1000, // Larger offset for production
          globalLimit: 100, // Higher limits for production
          userLimit: 20,
          guildLimit: 40,
        },
        ws: {
          ...baseConfig.ws,
          maxReconnectAttempts: 10, // More reconnection attempts for production
          reconnectDelay: 500, // Faster reconnection for production
        },
      };
    }

    return baseConfig;
  }

  /**
   * Get Twitch streaming integration configuration
   * @returns {Object} Twitch configuration object
   */
  get twitch() {
    return {
      clientId: process.env.TWITCH_CLIENT_ID || "",
      clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
      enabled: process.env.TWITCH_STREAMING_ENABLED === "true",
      redirectUri: process.env.TWITCH_REDIRECT_URI || "",
      scopes: [
        "user:read:email",
        "user:read:chat",
        "user:write:chat",
        "channel:bot",
        "channel:read:subscriptions",
        "moderator:read:followers",
        "channel:manage:broadcast",
        "channel:manage:polls",
        "channel:manage:predictions",
        "channel:manage:redemptions",
        "moderator:manage:banned_users",
        "moderator:manage:chat_messages",
        "moderator:read:chatters",
        "moderation:read",
      ],
      // Scopes requested when the dedicated RoleReactor bot account authorizes.
      // These let the bot send chat as itself (a separate account from the
      // broadcaster, e.g. twitch.tv/rolereactor — NO Verified Bot Program needed).
      botScopes: ["user:bot", "user:write:chat", "user:read:chat"],
      // Dedicated bot-account identity. Preferred from env so the bot can post
      // chat as itself (sender_id) without requiring the DB doc from /stream
      // bot-connect. If unset, getStreamBotAccount falls back to the DB doc.
      botUserId: process.env.TWITCH_BOT_USER_ID || "",
      botLogin: process.env.TWITCH_BOT_LOGIN || "",
      botAccessToken: process.env.TWITCH_BOT_ACCESS_TOKEN || "",
      botRefreshToken: process.env.TWITCH_BOT_REFRESH_TOKEN || "",
    };
  }

  /**
   * Get YouTube configuration
   * @returns {Object} YouTube configuration object
   */
  get youtube() {
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID || "",
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
      enabled: process.env.YOUTUBE_STREAMING_ENABLED === "true",
      redirectUri: process.env.YOUTUBE_REDIRECT_URI || "",
      scopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    };
  }

  /**
   * Get Kick configuration
   * @returns {Object} Kick configuration object
   */
  get kick() {
    return {
      clientId: process.env.KICK_CLIENT_ID || "",
      clientSecret: process.env.KICK_CLIENT_SECRET || "",
      enabled: process.env.KICK_STREAMING_ENABLED === "true",
      redirectUri: process.env.KICK_REDIRECT_URI || "",
    };
  }

  /**
   * Parse developers from environment variable
   * @returns {string[]} Array of developer IDs
   */
  parseDevelopers() {
    const developers = process.env.DISCORD_DEVELOPERS;
    if (!developers) return [];

    return developers
      .split(",")
      .map(id => id.trim())
      .filter(id => id);
  }

  /**
   * Check if a user ID is a developer
   * @param {string} userId - Discord user ID
   * @returns {boolean} True if developer
   */
  isDeveloper(userId) {
    if (!userId) return false;
    const developers = this.parseDevelopers();
    return developers.includes(userId);
  }

  /**
   * Get external links for help UI
   * @returns {Object} External links object
   */
  get externalLinks() {
    return {
      name: process.env.BOT_NAME || "Role Reactor Bot",
      website: WEBSITE_URL,
      guide: `${WEBSITE_URL}/docs`,
      github: "https://github.com/rolereactor/bot",
      support: "https://discord.gg/D8tYkU75Ry",
      sponsor: `${WEBSITE_URL}/sponsor`,
      vote:
        process.env.VOTE_URL || "https://top.gg/bot/1392714201558159431/vote",
      invite: null, // Will be generated dynamically by the bot
    };
  }

  /**
   * Get Core pricing configuration
   * @returns {Object} Core pricing configuration object
   */
  get corePricing() {
    const rawPackages = {
      $1: {
        name: "Test",
        baseCores: 15,
        bonusCores: 0,
        description: "Developer testing package",
        estimatedUsage: "~300 chat messages or 3 avatars",
        popular: false,
        hidden: true,
      },
      $5: {
        name: "1 Coffee",
        baseCores: 75,
        bonusCores: 0,
        description: "Perfect for trying AI features",
        estimatedUsage: "~150 image edits or 15 upscales",
        popular: false,
      },
      $10: {
        name: "2 Coffees",
        baseCores: 150,
        bonusCores: 15,
        description: "Most popular choice for regular users",
        estimatedUsage: "~330 image edits or 33 upscales",
        popular: true,
      },
      $25: {
        name: "5 Coffees",
        baseCores: 375,
        bonusCores: 60,
        description: "Best value for power users",
        estimatedUsage: "~870 image edits or 87 upscales",
        popular: false,
      },
      $50: {
        name: "10 Coffees",
        baseCores: 750,
        bonusCores: 150,
        description: "Maximum value for heavy usage",
        estimatedUsage: "~1,800 image edits or 180 upscales",
        features: ["Priority processing", "Dedicated support"],
        popular: false,
      },
      $100: {
        name: "20 Coffees",
        baseCores: 1800,
        bonusCores: 400,
        description: "Best value for serious creators",
        estimatedUsage: "~4,400 image edits or 440 upscales",
        features: ["Priority processing", "Dedicated support", "Early access"],
        popular: false,
      },
    };

    const packages = Object.fromEntries(
      Object.entries(rawPackages).map(([key, pkg]) => {
        const price = parseFloat(key.replace("$", ""));
        const totalCores = pkg.baseCores + pkg.bonusCores;
        const rate = totalCores / price;
        return [
          key,
          {
            ...pkg,
            price,
            totalCores,
            rate: parseFloat(rate.toFixed(2)),
          },
        ];
      }),
    );

    return {
      packages,
      // Moderation auto-escalation thresholds
      // Set to 0 to disable auto-escalation
      autoEscalation: {
        timeoutAfterWarnings:
          parseInt(process.env.MODERATION_TIMEOUT_AFTER_WARNINGS, 10) || 3, // Auto-timeout after 3 warnings
        kickAfterWarnings:
          parseInt(process.env.MODERATION_KICK_AFTER_WARNINGS, 10) || 5, // Auto-kick after 5 warnings
        timeoutDuration: process.env.MODERATION_AUTO_TIMEOUT_DURATION || "1h", // Duration for auto-timeout
      },

      // Core system settings with advanced features
      coreSystem: {
        minimumPayment: 1, // Reduced minimum to $1 for testing and accessibility
        priorityProcessing: true, // Core members get priority (planned feature)

        // BMAC fee multiplier — BMAC charges ~5-8% + processing fees
        // 0.85 = users get 85% of standard cores (15% fee absorbed)
        bmacFeeMultiplier: parseFloat(process.env.BMAC_FEE_MULTIPLIER) || 0.85,

        // Advanced pricing features
        dynamicPricing: {
          enabled: true,
          peakHours: [18, 19, 20, 21, 22], // 6-10 PM peak hours
          peakMultiplier: parseFloat(process.env.PRICE_PEAK_MULTIPLIER) || 1.2,
          offPeakDiscount:
            parseFloat(process.env.PRICE_OFFPEAK_DISCOUNT) || 0.9,
        },

        // All usage requires Cores (no free tier)
        freeTier: {
          enabled: false, // Disabled - all usage requires credits
          message:
            "Purchase Cores to start using AI features! Packages start at just $1.",
        },

        // Trial system - limited to encourage purchases
        trialSystem: {
          enabled: true,
          newUserBonus: 3, // Only 3 Cores ($0.20 value) for verified new users
          oneTimeOnly: true, // Only once per user
          requiresVerification: true, // Require phone/email verification
          maxUsage: {
            chat: 1, // Only 1 trial chat
            images: 0, // NO trial images (too expensive)
          },
        },

        // Referral system
        referralSystem: {
          enabled: true,
          referrerBonus: 0.15, // 15% bonus Cores for referrer
          refereeBonus: 0.1, // 10% bonus Cores for new user
          minimumPurchase: 10, // Minimum $10 purchase to trigger referral
        },

        // Seasonal promotions
        promotions: {
          enabled: true,
          types: [
            {
              name: "First Purchase Bonus",
              type: "first_purchase",
              bonus: 0.25, // 25% bonus on first purchase
              maxBonus: 50, // Maximum 50 bonus Cores
            },
            {
              name: "Weekend Special",
              type: "weekend",
              bonus: 0.15, // 15% bonus on weekends
              days: [6, 0], // Saturday and Sunday
            },
          ],
        },
      },

      // Feature credits and avatar filter from standardized AI config
      // These reference the centralized AI pricing configuration
      // AI Core value: 2.0¢ each (50x conversion rate)
      featureCosts: getAIFeatureCosts(),
      avatarContentFilter: getAvatarContentFilter(),
    };
  }

  /**
   * Get AI performance and behavior settings
   * @returns {Object} AI settings object
   */
  get aiSettings() {
    return {
      maxConcurrent: parseInt(process.env.AI_MAX_CONCURRENT || "100", 10),
      timeout: parseInt(process.env.AI_REQUEST_TIMEOUT || "300000", 10), // 5 minutes
      useLongTermMemory: process.env.AI_USE_LONG_TERM_MEMORY === "true",
      historyLength: parseInt(
        process.env.AI_CONVERSATION_HISTORY_LENGTH || "20",
        10,
      ),
      conversationTimeout: parseInt(
        process.env.AI_CONVERSATION_TIMEOUT || "604800000",
        10,
      ), // 7 days
    };
  }

  /**
   * Get feature flags
   * @returns {Object} Feature flags object
   */
  get features() {
    return {
      crypto: this.payments.plisio.enabled,
      serveStatic: process.env.SERVE_STATIC === "true",
    };
  }

  /**
   * Get Web3 receiver wallet address
   * @returns {string} Web3 receiver address
   */
  get web3ReceiverAddress() {
    return (
      process.env.WEB3_RECEIVER_ADDRESS ||
      "0xC850f03295Bb614d52038FB83f78f72ed8f7c65d"
    );
  }

  /**
   * Get payment configurations
   * @returns {Object} Payments config object
   */
  get payments() {
    return {
      web3ReceiverAddress: this.web3ReceiverAddress,
      plisio: {
        secretKey: process.env.PLISIO_SECRET_KEY,
        enabled: !!process.env.PLISIO_SECRET_KEY,
      },
      buymeacoffeeUrl:
        process.env.BUYMEACOFFEE_PAGE_URL ||
        "https://buymeacoffee.com/rolereactor",
      buymeacoffeeWebhookSecret:
        process.env.BUYMEACOFFEE_WEBHOOK_SECRET || null,
      buymeacoffeeApiToken: process.env.BUYMEACOFFEE_API_TOKEN || null,
    };
  }

  /**
   * Get bot identity information
   * @returns {Object} Bot info object
   */
  get botInfo() {
    return {
      name: this.externalLinks.name,
      apiUrl: API_URL,
      website: this.externalLinks.website,
    };
  }

  /**
   * Calculate Cores for a given USD amount based on configured packages
   * @param {number} amount - USD amount paid
   * @returns {number} Calculated Cores
   */
  calculateCores(amount) {
    const packages = this.corePricing?.packages || {};
    const packageList = Object.entries(packages)
      .map(([key, pkg]) => ({
        price: parseFloat(key.replace("$", "")),
        rate: pkg.rate || pkg.totalCores / parseFloat(key.replace("$", "")),
      }))
      .sort((a, b) => b.price - a.price);

    // Find the highest package the user qualifies for
    const applicablePackage = packageList.find(p => amount >= p.price);

    // If no package found (amount below $1), use the lowest available rate
    const rate = applicablePackage
      ? applicablePackage.rate
      : packageList[packageList.length - 1]?.rate || 15.0;

    return Math.floor(amount * rate);
  }

  /**
   * Get all configuration as a single object
   * @returns {Object} Complete configuration object
   */
  getAll() {
    return {
      discord: this.discord,
      database: this.database,
      logging: this.logging,
      cacheLimits: this.cacheLimits,
      rateLimits: this.rateLimits,
      corePricing: this.corePricing,
      aiSettings: this.aiSettings,
      features: this.features,
      payments: this.payments,
      botInfo: this.botInfo,
      twitch: this.twitch,
    };
  }

  /**
   * Validate configuration
   * @returns {boolean} True if configuration is valid
   */
  validate() {
    try {
      this.validateRequiredEnvVars();
      return true;
    } catch (_error) {
      return false;
    }
  }
}

// Export singleton instance
export const config = new Config();
export default config;
