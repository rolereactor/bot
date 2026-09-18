import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
  logRequest,
} from "../utils/responseHelpers.js";

const logger = getLogger();

/**
 * GET /api/user/referral
 * Get current user's referral code, share URL, stats, and referral history
 */
export async function apiGetUserReferral(req, res) {
  logRequest(logger, "Get user referral info", req);

  try {
    const sessionUser = req.session?.discordUser;
    const userId = req.user?.id || sessionUser?.id || req.headers["x-user-id"];

    if (!userId) {
      const { statusCode, response } = createErrorResponse(
        "Authentication required",
        401,
        "User ID missing",
      );
      return res.status(statusCode).json(response);
    }

    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();

    if (!dbManager || !dbManager.referrals) {
      const { statusCode, response } = createErrorResponse(
        "Database error",
        500,
        "Referral repository unavailable",
      );
      return res.status(statusCode).json(response);
    }

    const doc = await dbManager.referrals.getOrCreateCode(userId);

    const totalInvites = doc.referrals ? doc.referrals.length : 0;
    const qualifiedInvites = doc.referrals
      ? doc.referrals.filter(r => r.status === "qualified").length
      : 0;

    const referralsList = (doc.referrals || []).map(ref => ({
      refereeIdMasked: ref.refereeId
        ? `${ref.refereeId.slice(0, 4)}...${ref.refereeId.slice(-4)}`
        : "Unknown",
      status: ref.status,
      totalPurchased: ref.totalPurchased || 0,
      referrerBonusEarned: ref.referrerBonusEarned || 0,
      createdAt: ref.createdAt,
      qualifiedAt: ref.qualifiedAt || null,
    }));

    const myReferrer = await dbManager.referrals.findByRefereeId(userId);
    const hasClaimedCode = !!myReferrer;

    const responseData = {
      referralCode: doc.referralCode,
      shareUrl: `https://rolereactor.xyz?ref=${doc.referralCode}`,
      totalEarnedCores: doc.totalEarnedCores || 0,
      hasClaimedCode,
      stats: {
        totalInvites,
        qualifiedInvites,
        pendingInvites: totalInvites - qualifiedInvites,
      },
      referrals: referralsList,
    };

    return res.json(createSuccessResponse(responseData));
  } catch (error) {
    logger.error("❌ Error getting user referral info:", error);
    const { statusCode, response } = createErrorResponse(
      "Failed to get referral information",
      500,
      error.message,
    );
    return res.status(statusCode).json(response);
  }
}

/**
 * POST /api/user/referral/claim
 * Claim/bind a referral code for a new user
 */
export async function apiClaimReferralCode(req, res) {
  logRequest(logger, "Claim referral code", req);

  try {
    const sessionUser = req.session?.discordUser;
    const userId = req.user?.id || sessionUser?.id || req.headers["x-user-id"];
    const { code } = req.body;

    if (!userId) {
      const { statusCode, response } = createErrorResponse(
        "Authentication required",
        401,
        "User ID missing",
      );
      return res.status(statusCode).json(response);
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      const { statusCode, response } = createErrorResponse(
        "Invalid referral code",
        400,
        "Code is required",
      );
      return res.status(statusCode).json(response);
    }

    const { getDatabaseManager } = await import(
      "../../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();

    if (!dbManager || !dbManager.referrals) {
      const { statusCode, response } = createErrorResponse(
        "Database error",
        500,
        "Referral repository unavailable",
      );
      return res.status(statusCode).json(response);
    }

    const result = await dbManager.referrals.claimCode(
      userId,
      code.trim(),
      dbManager.coreCredits,
    );

    if (!result.success) {
      const { statusCode, response } = createErrorResponse(
        result.error || "Failed to claim referral code",
        400,
        result.error,
      );
      return res.status(statusCode).json(response);
    }

    return res.json(
      createSuccessResponse({
        message: result.message,
        referrerUserId: result.referrerUserId,
      }),
    );
  } catch (error) {
    logger.error("❌ Error claiming referral code:", error);
    const { statusCode, response } = createErrorResponse(
      "Failed to claim referral code",
      500,
      error.message,
    );
    return res.status(statusCode).json(response);
  }
}
