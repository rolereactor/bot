import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/responseHelpers.js";
import { logRequest } from "../utils/apiShared.js";
import { config } from "../../config/config.js";

const logger = getLogger();

/**
 * Core pricing endpoint - Returns package pricing for website integration
 */
export async function apiPricing(req, res) {
  logRequest("Pricing info", req);

  try {
    const corePricing = config.corePricing;

    if (!corePricing || !corePricing.packages) {
      const { statusCode, response } = createErrorResponse(
        "Pricing configuration not available",
        500,
      );
      return res.status(statusCode).json(response);
    }

    const requestedUserId = req.query.user_id || req.query.discord_id || null;
    const isDev = config.isDeveloper(requestedUserId);

    const packages = Object.entries(corePricing.packages)
      .filter(([_, pkg]) => !pkg.hidden || isDev)
      .map(([key, pkg]) => ({
        id: key,
        name: pkg.name,
        price: parseFloat(key.replace("$", "")),
        currency: "USD",
        baseCores: pkg.baseCores,
        bonusCores: pkg.bonusCores,
        totalCores: pkg.totalCores,
        rate: pkg.rate,
        valuePerDollar: `${pkg.rate.toFixed(1)} Cores/$1`,
        description: pkg.description,
        estimatedUsage: pkg.estimatedUsage,
        popular: pkg.popular || false,
        features: pkg.features || [],
      }));

    packages.sort((a, b) => a.price - b.price);

    const activePromotions = [];
    const promotions = corePricing.coreSystem?.promotions;

    if (promotions?.enabled && promotions?.types) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      for (const promo of promotions.types) {
        if (promo.type === "first_purchase") {
          activePromotions.push({
            name: promo.name,
            type: promo.type,
            bonus: `${promo.bonus * 100}%`,
            maxBonus: promo.maxBonus,
            description: `Get ${promo.bonus * 100}% bonus Cores on your first purchase (up to ${promo.maxBonus} bonus Cores)`,
          });
        } else if (
          promo.type === "weekend" &&
          promo.days?.includes(dayOfWeek)
        ) {
          activePromotions.push({
            name: promo.name,
            type: promo.type,
            bonus: `${promo.bonus * 100}%`,
            description: `Weekend special: ${promo.bonus * 100}% bonus Cores on all purchases!`,
            active: true,
          });
        }
      }
    }

    let userEligibility = null;
    if (requestedUserId) {
      try {
        const { getStorageManager } = await import(
          "../../utils/storage/storageManager.js"
        );
        const { getDatabaseManager } = await import(
          "../../utils/storage/databaseManager.js"
        );
        const storage = await getStorageManager();
        const dbManager = await getDatabaseManager();
        const userData = await storage.getCoreCredits(requestedUserId);

        // cryptoPayments was migrated to PaymentRepository — query it directly
        let hasPayments = false;
        if (dbManager?.payments) {
          const stats = await dbManager.payments.getUserStats(requestedUserId);
          hasPayments = stats.totalPayments > 0;
        }

        // Check if user has active Pro on any guild
        let hasActivePro = false;
        if (dbManager?.guildSettings) {
          const guildsWithPro = await dbManager.guildSettings.collection
            .find({
              "premiumFeatures.pro_engine.payerUserId": requestedUserId,
              "premiumFeatures.pro_engine.active": true,
            })
            .limit(1)
            .toArray();
          hasActivePro = guildsWithPro.length > 0;
        }

        userEligibility = {
          requestedUserId,
          isFirstPurchase: !hasPayments,
          currentCredits: Math.round((userData?.credits || 0) * 100) / 100,
          sparks: Math.round((userData?.sparks || 0) * 100) / 100,
          eligibleForFirstPurchaseBonus: !hasPayments,
          hasActivePro,
        };
      } catch (error) {
        logger.warn("Failed to check user eligibility:", error.message);
      }
    }

    const minPayment = corePricing.coreSystem?.minimumPayment || 3;

    const response = {
      packages,
      minimumPayment: minPayment,
      currency: "USD",
      paymentMethods: {
        crypto: config.payments.plisio.enabled,
      },
      promotions: activePromotions,
      referralSystem: corePricing.coreSystem?.referralSystem?.enabled
        ? {
            enabled: true,
            referrerBonus: `${(corePricing.coreSystem.referralSystem.referrerBonus || 0) * 100}%`,
            refereeBonus: `${(corePricing.coreSystem.referralSystem.refereeBonus || 0) * 100}%`,
            minimumPurchase:
              corePricing.coreSystem.referralSystem.minimumPurchase || 10,
          }
        : { enabled: false },
    };

    if (userEligibility) response.user = userEligibility;
    res.json(createSuccessResponse(response));
  } catch (error) {
    logger.error("❌ Error getting pricing info:", error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve pricing information",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * User Core balance endpoint
 */
export async function apiUserBalance(req, res) {
  logRequest("User balance", req);
  const requestedUserId =
    req.params.userId || req.query.user_id || req.query.discord_id;
  const sessionUserId = req.user?.id;

  if (!requestedUserId) {
    const { statusCode, response } = createErrorResponse(
      "User ID is required",
      400,
      "Provide user_id as a URL parameter or query parameter",
    );
    return res.status(statusCode).json(response);
  }

  // Enforce ownership - user can only access their own balance (checked by middleware, but verify here too)
  if (
    sessionUserId &&
    requestedUserId !== sessionUserId &&
    req.user?.role !== "admin" &&
    req.user?.role !== "superadmin"
  ) {
    const { statusCode, response } = createErrorResponse(
      "Insufficient permissions",
      403,
      "You can only access your own balance",
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();
    const userData = await storage.getCoreCredits(requestedUserId);

    if (!userData) {
      return res.json(
        createSuccessResponse({
          requestedUserId: requestedUserId,
          credits: 0,
          sparks: 0,
          hasAccount: false,
          paymentHistory: { crypto: 0 },
        }),
      );
    }

    // cryptoPayments was migrated to PaymentRepository — query it for the count
    let cryptoPaymentCount = 0;
    try {
      const { getDatabaseManager } = await import(
        "../../utils/storage/databaseManager.js"
      );
      const dbManager = await getDatabaseManager();
      if (dbManager?.payments) {
        const stats = await dbManager.payments.getUserStats(requestedUserId);
        cryptoPaymentCount = stats.byProvider?.crypto?.count || stats.totalPayments || 0;
      }
    } catch {
      // Non-critical — paymentHistory is informational only
    }

    res.json(
      createSuccessResponse({
        requestedUserId: requestedUserId,
        credits: Math.round((userData.credits || 0) * 100) / 100,
        sparks: Math.round((userData.sparks || 0) * 100) / 100,
        hasAccount: true,
        lastUpdated: userData.lastUpdated || null,
        paymentHistory: {
          crypto: cryptoPaymentCount,
        },
      }),
    );
  } catch (error) {
    logger.error("❌ Error getting user balance:", error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve user balance",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}

/**
 * User payment history endpoint
 */
export async function apiUserPayments(req, res) {
  logRequest("User payments", req);
  const requestedUserId =
    req.params.userId || req.query.user_id || req.query.discord_id;
  const sessionUserId = req.user?.id;

  if (!requestedUserId) {
    const { statusCode, response } = createErrorResponse(
      "User ID is required",
      400,
      "Provide user_id as a URL parameter or query parameter",
    );
    return res.status(statusCode).json(response);
  }

  // Enforce ownership - user can only access their own payments
  if (
    sessionUserId &&
    requestedUserId !== sessionUserId &&
    req.user?.role !== "admin" &&
    req.user?.role !== "superadmin"
  ) {
    const { statusCode, response } = createErrorResponse(
      "Insufficient permissions",
      403,
      "You can only access your own payment history",
    );
    return res.status(statusCode).json(response);
  }

  try {
    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();

    if (!dbManager?.payments) {
      // cryptoPayments was migrated away from core_credits — no legacy fallback data available
      return res.json(
        createSuccessResponse({
          requestedUserId,
          payments: [],
          total: 0,
          source: "legacy",
        }),
      );
    }

    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const provider = req.query.provider || null;
    const payments = await dbManager.payments.findByDiscordId(requestedUserId, {
      limit,
      skip,
      status: "completed",
      provider,
    });
    const stats = await dbManager.payments.getUserStats(requestedUserId);

    res.json(
      createSuccessResponse({
        requestedUserId,
        payments: payments.map(p => ({
          paymentId: p.paymentId,
          provider: p.provider,
          amount: p.amount,
          currency: p.currency,
          coresGranted: p.coresGranted,
          sparksGranted: p.sparksGranted || 0,
          tier: p.tier,
          status: p.status,
          createdAt: p.createdAt,
          metadata: p.metadata || null,
        })),
        total: stats.totalPayments,
        stats: {
          totalAmount: stats.totalAmount,
          totalCores: stats.totalCores,
          byProvider: stats.byProvider,
        },
        pagination: { limit, skip, hasMore: payments.length === limit },
      }),
    );
  } catch (error) {
    logger.error("❌ Error getting user payments:", error);
    const { statusCode, response } = createErrorResponse(
      "Failed to retrieve payment history",
      500,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}
