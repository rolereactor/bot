// This file uses Express.js middleware that adds custom properties to req
// Type checking is disabled to avoid excessive type casting

/** @typedef {import('express').Request & { rawBody?: Buffer | string, requestId?: string }} ExtendedRequest */

import express from "express";
import { handleCryptoWebhook } from "../webhooks/crypto.js";
import { handleTopggVote } from "../webhooks/topgg.js";
import { handleBMACWebhook } from "../webhooks/buymeacoffee.js";
import { getLogger } from "../utils/logger.js";

// Import middleware
import { corsMiddleware } from "./middleware/cors.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  webhookRateLimiter,
  apiRateLimiter,
} from "./middleware/rateLimiter.js";
import { internalAuth } from "./middleware/internalAuth.js";

// Import route handlers
import { healthCheck, dockerHealthCheck } from "./routes/health.js";

import { setDiscordClient } from "./utils/apiShared.js";
import authRoutes from "./routes/auth.js";

// Import V1 Routers
import rootRouter from "./routes/v1/root.js";
import botStatusRouter from "./routes/v1/botStatus.js";
import guildsRouter from "./routes/v1/guilds.js";
import { apiGetPublicLeaderboards } from "./controllers/GuildLeaderboardController.js";
import paymentsRouter from "./routes/v1/payments.js";
import userRouter from "./routes/v1/user.js";
import commandsRouter from "./routes/v1/commands.js";
import servicesRouter from "./routes/v1/services.js";
import docsRouter from "./routes/v1/docs.js";
import statsRouter from "./routes/v1/stats.js";
import premiumBenefitsRouter from "./routes/v1/premiumBenefits.js";
import logsRouter from "./routes/v1/logs.js";
import configRouter from "./routes/v1/config.js";
import healthRouter from "./routes/v1/health.js";
import transcriptsRouter from "./routes/v1/transcripts.js";
import ticketsRouter from "./routes/v1/tickets.js";
import imageToolsRouter from "./routes/v1/imageTools.js";
import streamRouter from "./routes/v1/streamOAuth.js";
import streamApiRouter from "./routes/v1/streamManagement.js";
import eventsSseRouter from "./routes/v1/eventsSse.js";
import overlaysRouter from "./routes/v1/overlays.js";

// Import services
import { SupportersService } from "./services/supporters/SupportersService.js";

// Import service registry
import { serviceRegistry } from "./services/ServiceRegistry.js";

// Import configuration
import {
  serverConfig,
  validateConfig,
  getStartupInfo,
  checkPortAvailability,
  findAvailablePort,
} from "./config/serverConfig.js";

const logger = getLogger();
const app = express();
const API_PREFIX = serverConfig.metadata.apiPrefix;

/**
 * Initialize server middleware
 */
async function initializeMiddleware({ withSession = true } = {}) {
  // Configure Express to trust proxy headers (required for ngrok, reverse proxies, etc.)
  // Trust only the first proxy hop (most secure - prevents IP spoofing while allowing reverse proxies)
  // This allows express-rate-limit to correctly identify client IPs from X-Forwarded-For header
  // Use 'trust proxy: 1' instead of 'true' to only trust the first proxy (more secure)
  app.set("trust proxy", 1);

  // Basic Express middleware
  /**
   * @type {import('express').RequestHandler}
   */
  const jsonMiddleware = express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      /**
       * @type {ExtendedRequest}
       */
      const extendedReq = /** @type {ExtendedRequest} */ (req);
      extendedReq.rawBody = buf.toString();
    },
  });
  app.use(jsonMiddleware);
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Session middleware (for Discord OAuth) with MongoDB store
  const SESSION_TIMEOUT_MS =
    parseInt(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000;
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    const errorMessage =
      "SESSION_SECRET environment variable is required in production";
    logger.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }

  if (withSession && process.env.SESSION_SECRET) {
    try {
      const session = (await import("express-session")).default;
      const MongoStore = (await import("connect-mongo")).default;

      const sessionConfig = {
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          maxAge: SESSION_TIMEOUT_MS,
          sameSite: "lax",
        },
      };

      // Use MongoDB session store for persistence across restarts
      if (process.env.MONGODB_URI) {
        // Reuse the application's shared MongoClient to avoid a second connection pool
        const { getStorageManager } = await import(
          "../utils/storage/databaseManager.js"
        ).catch(() => ({}));
        const storageManager = await getStorageManager?.().catch(() => null);
        const sharedClient = storageManager?.connectionManager?.client;

        sessionConfig.store = sharedClient
          ? new MongoStore({
              client: sharedClient,
              collectionName: "sessions",
              ttl: SESSION_TIMEOUT_MS / 1000,
              autoRemove: "native",
              touchAfter: 24 * 3600,
            })
          : new MongoStore({
              mongoUrl: process.env.MONGODB_URI,
              collectionName: "sessions",
              ttl: SESSION_TIMEOUT_MS / 1000,
              autoRemove: "native",
              touchAfter: 24 * 3600,
            });
        logger.info(
          `✅ Session middleware enabled with MongoDB store (timeout: ${SESSION_TIMEOUT_MS / 1000 / 60} min)`,
        );
      } else {
        logger.info(
          `✅ Session middleware enabled with in-memory store (timeout: ${SESSION_TIMEOUT_MS / 1000 / 60} min)`,
        );
      }

      // Skip session loading for internal API calls (website → bot).
      // These use INTERNAL_API_KEY + X-User-Id instead of sessions,
      // so touching MongoDB for sessions is unnecessary overhead.
      app.use((req, _res, next) => {
        const authHeader = req.headers["authorization"] || "";
        const apiKey = req.headers["x-api-key"];
        const internalKey = process.env.INTERNAL_API_KEY;
        const hasInternalAuth =
          internalKey &&
          ((authHeader.startsWith("Bearer ") && authHeader.slice(7) === internalKey) ||
            apiKey === internalKey);
        if (hasInternalAuth) {
          req._skipSession = true;
        }
        next();
      });

      const sessionMiddleware = session(sessionConfig);
      app.use((req, res, next) => {
        if (req._skipSession) return next();
        sessionMiddleware(req, res, next);
      });
    } catch (_error) {
      logger.warn(
        `⚠️ Session setup error: ${_error.message}. Install with: npm install express-session connect-mongo`,
      );
    }
  } else {
    logger.debug(
      "Session middleware disabled (SESSION_SECRET not set). Discord OAuth will not be available.",
    );
  }

  // Serve static files (for website)
  if (process.env.SERVE_STATIC === "true") {
    const { default: path } = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const publicPath = path.join(__dirname, "../../public");
    app.use(express.static(publicPath));
    logger.info(`📁 Serving static files from: ${publicPath}`);
  }

  // Custom middleware
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);

  // Request timeout middleware (120 seconds for long tasks like image AI processing)
  /**
   * @param {ExtendedRequest} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  app.use((req, res, next) => {
    req.setTimeout(120000, () => {
      if (!res.headersSent) {
        res.status(408).json({
          status: "error",
          message: "Request timeout",
          // @ts-ignore - requestId added by requestIdMiddleware
          requestId: req.requestId || "unknown",
          timestamp: new Date().toISOString(),
        });
      }
    });
    next();
  });

  if (serverConfig.logging.enabled) {
    app.use(requestLogger);
  }
}

/**
 * Initialize server routes
 */
function initializeRoutes() {
  // Health check routes
  if (serverConfig.health.enabled) {
    app.get("/health", healthCheck);

    if (serverConfig.health.dockerCheck) {
      app.get("/health/docker", dockerHealthCheck);
    }
  }

  // Public transcript viewing route
  app.use("/t", transcriptsRouter);

  // Webhook routes with rate limiting
  app.post("/webhook/crypto", webhookRateLimiter, handleCryptoWebhook);
  app.post("/webhook/buymeacoffee", webhookRateLimiter, handleBMACWebhook);

  // top.gg webhook - body already parsed by global express.json() middleware
  app.post(
    "/webhook/topgg",
    webhookRateLimiter,
    /**
     * @param {ExtendedRequest} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    (req, res, next) => {
      // Body is already parsed, just continue
      next();
    },
    /**
     * @param {ExtendedRequest} req
     * @param {import('express').Response} res
     */
    (req, res) => {
      handleTopggVote(req, res, null);
    },
  );

  // Core API routes with rate limiting
  app.use(API_PREFIX, apiRateLimiter);
  app.use(API_PREFIX, rootRouter);
  app.use(`${API_PREFIX}/bot`, botStatusRouter);

  // Public guilds endpoints (no auth required)
  const publicGuildsRouter = express.Router();
  publicGuildsRouter.get("/public-leaderboards", apiGetPublicLeaderboards);
  publicGuildsRouter.get(
    "/public-leaderboards/search",
    apiGetPublicLeaderboards,
  );
  app.use(`${API_PREFIX}/guilds`, publicGuildsRouter);

  // Internal guilds endpoints (auth required)
  app.use(`${API_PREFIX}/guilds`, internalAuth, guildsRouter);
  app.use(`${API_PREFIX}/guilds`, internalAuth, ticketsRouter);
  app.use(`${API_PREFIX}/payments`, internalAuth, paymentsRouter);
  app.use(`${API_PREFIX}/user`, internalAuth, userRouter);
  app.use(`${API_PREFIX}/commands`, internalAuth, commandsRouter);
  app.use(`${API_PREFIX}/services`, internalAuth, servicesRouter);
  app.use(`${API_PREFIX}/docs`, internalAuth, docsRouter);
  // Stats router declares its own per-route auth (public: /info, /pricing)
  app.use(`${API_PREFIX}/stats`, statsRouter);
  // Premium benefits — public, no auth (static feature comparison data)
  app.use(`${API_PREFIX}/premium`, premiumBenefitsRouter);
  app.use(`${API_PREFIX}/logs`, internalAuth, logsRouter);
  app.use(`${API_PREFIX}/config`, internalAuth, configRouter);
  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/image-tools`, internalAuth, imageToolsRouter);

  // Register existing routes as services for discovery
  if (process.env.DISCORD_CLIENT_ID) {
    serviceRegistry.registerRouteGroup("auth", {
      path: "/auth",
      router: authRoutes,
      middleware: [apiRateLimiter],
    });
    app.use("/auth", apiRateLimiter, authRoutes);
    logger.info("✅ Discord OAuth routes enabled");
  }

  // Register streaming OAuth callback routes (public, no internal auth)
  app.use(`${API_PREFIX}/stream`, streamRouter);
  logger.info("✅ Streaming OAuth routes enabled");

  // Register streaming management API routes (internal auth + guild permission)
  app.use(`${API_PREFIX}/stream`, streamApiRouter);
  logger.info("✅ Streaming API routes enabled");

  // Register SSE events endpoint (real-time streaming events)
  app.use(`${API_PREFIX}`, eventsSseRouter);
  logger.info("✅ SSE events endpoint enabled");

  // Register OBS overlay token verification (no internal auth — uses signed tokens)
  app.use("/overlay", overlaysRouter);
  logger.info("✅ Overlay token verification enabled");

  // Register SupportersService (always available)
  const supportersService = new SupportersService();
  serviceRegistry.registerService(supportersService.getRegistrationInfo());

  // Register all services from registry (single registration point)
  const registeredServices = serviceRegistry.getAllServices();
  for (const service of registeredServices) {
    const { basePath, router, middleware } = service;
    app.use(basePath, ...middleware, router);
    const versionDisplay = service.version.startsWith("v")
      ? service.version
      : `v${service.version}`;
    logger.info(
      `✅ Registered service: ${service.name} ${versionDisplay} at ${basePath}`,
    );
  }
}

/**
 * Initialize error handling
 */
function initializeErrorHandling() {
  // Error handling middleware (must be last)
  app.use(errorHandler);
  app.use(notFoundHandler);
}

/**
 * Start the unified API server
 * @returns {Promise<import('http').Server>} The HTTP server instance
 * @throws {Error} If server fails to start
 */
export async function startWebhookServer() {
  try {
    // Validate configuration
    const configValidation = validateConfig();
    if (!configValidation.isValid) {
      const errorMessage = `Configuration validation failed: ${configValidation.errors.join(", ")}`;
      logger.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Check port availability before starting server
    logger.info(
      `🔍 Checking port availability for port ${serverConfig.port}...`,
    );
    const portCheck = await checkPortAvailability(Number(serverConfig.port));

    if (!portCheck.available) {
      logger.warn(portCheck.message);
      logger.info(portCheck.suggestion);

      // Try to find an available port
      logger.info(`🔍 Searching for an available port...`);
      const availablePort = await findAvailablePort(
        Number(serverConfig.port),
        10,
      );

      if (availablePort) {
        logger.info(`✅ Found available port: ${availablePort}`);
        logger.info(
          `💡 Starting server on port ${availablePort} instead of ${serverConfig.port}`,
        );
        serverConfig.port = String(availablePort);
      } else {
        const errorMessage = `❌ No available ports found. Please free up port ${serverConfig.port} or set a different port with API_PORT environment variable.`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    } else {
      logger.info(portCheck.message);
    }

    // Initialize server components
    await initializeMiddleware();
    initializeRoutes();
    initializeErrorHandling();

    // Start server - bind to 0.0.0.0 to allow external connections (required for webhooks)
    const server = app.listen(Number(serverConfig.port), "0.0.0.0", () => {
      const startupInfo = getStartupInfo();

      logger.info(`🚀 Unified API server started successfully`);
      logger.info(`📊 Server Information:`, startupInfo);
      logger.info(`🌐 Available endpoints:`);
      logger.info(`  Health: http://localhost:${serverConfig.port}/health`);

      if (serverConfig.health.dockerCheck) {
        logger.info(
          `  Health (Docker): http://localhost:${serverConfig.port}/health/docker`,
        );
      }

      logger.info(
        `  Top.gg: http://localhost:${serverConfig.port}/webhook/topgg`,
      );
      logger.info(
        `  Crypto: http://localhost:${serverConfig.port}/webhook/crypto`,
      );

      // Log registered services
      const services = serviceRegistry.getAllServices();
      if (services.length > 0) {
        logger.info(`  Registered Services (${services.length}):`);
        services.forEach(service => {
          const versionDisplay = service.version.startsWith("v")
            ? service.version
            : `v${service.version}`;
          logger.info(
            `    - ${service.name} ${versionDisplay}: ${service.basePath}`,
          );
        });
      }

      if (process.env.DISCORD_CLIENT_ID) {
        logger.info(
          `  Discord OAuth: http://localhost:${serverConfig.port}/auth/discord`,
        );
      }

      if (process.env.SERVE_STATIC === "true") {
        logger.info(`  Website: http://localhost:${serverConfig.port}/`);
      }
    });

    // Handle server errors
    server.on("error", error => {
      /** @type {NodeJS.ErrnoException} */
      const sysError = /** @type {NodeJS.ErrnoException} */ (error);
      if (sysError.code === "EADDRINUSE") {
        logger.error(
          `❌ Port ${serverConfig.port} is already in use. Server failed to start.`,
        );
        logger.error(
          `💡 Please check if another process is using port ${serverConfig.port} or set a different port with API_PORT environment variable.`,
        );
      } else {
        logger.error(`❌ Server error:`, error);
      }
    });

    // Server only closes itself; shutdown handlers are managed by index.js
    // to ensure BotContext.shutdown() runs (Discord client, schedulers, etc.)

    return server;
  } catch (error) {
    logger.error(`❌ Failed to start unified API server:`, error);
    throw error;
  }
}

/**
 * Get the Express app instance (for testing)
 * @returns {import('express').Application} The Express app instance
 */
export function getApp() {
  return app;
}

/**
 * Initialize the Express app (middleware + routes + error handling)
 * without starting the HTTP listener. Used by integration tests so the
 * app has real route wiring without needing a running server.
 * @returns {Promise<import('express').Application>} The initialized Express app instance
 */
let appInitialized = false;
export async function initAppForTests() {
  if (!appInitialized) {
    // Skip session middleware — it would try to connect to MongoDB.
    // Route/auth wiring is what these tests exercise.
    await initializeMiddleware({ withSession: false });
    initializeRoutes();
    initializeErrorHandling();
    appInitialized = true;
  }
  return app;
}

/**
 * Get server configuration
 * @returns {Object} Server configuration object
 */
export function getServerConfig() {
  return serverConfig;
}

/**
 * Set Discord client for API endpoints
 * @param {import('discord.js').Client} client - Discord.js client instance
 */
export function setClient(client) {
  setDiscordClient(client);
}

export default app;
