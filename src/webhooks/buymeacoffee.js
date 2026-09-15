import crypto from "crypto";
import { getLogger } from "../utils/logger.js";
import { config } from "../config/config.js";
import { emojiConfig } from "../config/emojis.js";

const logger = getLogger();

/**
 * Verify BMAC webhook signature using HMAC-SHA256
 * @param {string} rawBody - Raw request body string
 * @param {string} signature - Signature from x-signature-sha256 header
 * @param {string} secret - Webhook signing secret
 * @returns {boolean} True if signature is valid
 */
function verifyBMACSignature(rawBody, signature, secret) {
  if (!signature) {
    logger.warn("⚠️ BMAC webhook: Missing x-signature-sha256 header");
    return false;
  }
  if (!secret) {
    logger.warn("⚠️ BMAC webhook: No BUYMEACOFFEE_WEBHOOK_SECRET configured");
    return false;
  }
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const sigBuffer = Buffer.from(signature, "utf8");
    const expBuffer = Buffer.from(expected, "utf8");
    if (sigBuffer.length !== expBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expBuffer);
  } catch (error) {
    logger.error("❌ BMAC webhook: Signature verification error:", error);
    return false;
  }
}

/**
 * Handle Buy Me a Coffee Payment Webhook
 *
 * BMAC sends an event envelope per the OpenAPI spec:
 *   { event_id, type, live_mode, created, attempt, data: { ... } }
 *
 * For donation events, data contains:
 *   - `supporter_name` → donor's name
 *   - `support_note`   → "Say something nice..." field (contains our RR-XXXXXX code)
 *   - `amount`         → total payment amount
 *   - `currency`       → currency code
 *   - `transaction_id` → Stripe PaymentIntent ID
 *   - `id`             → BMAC payment ID
 *
 * We extract the unique code from `support_note`, look up the Discord user,
 * and credit cores based on the amount paid.
 */
export async function handleBMACWebhook(req, res) {
  // Verify webhook signature — reject if secret not configured
  const signature = req.headers["x-signature-sha256"];
  const secret = config.payments.buymeacoffeeWebhookSecret;
  if (!secret) {
    logger.error(
      "⚠️ BMAC webhook: BUYMEACOFFEE_WEBHOOK_SECRET not configured — rejecting request",
    );
    return res
      .status(500)
      .json({ status: "error", message: "Webhook not configured" });
  }
  if (!verifyBMACSignature(req.rawBody || "", signature, secret)) {
    logger.warn("⚠️ BMAC webhook: Invalid signature - rejecting request");
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const body = req.body || {};
  const eventType = body.type || "unknown";
  const eventId = body.event_id;
  const data = body.data || {};

  // Only process donation events (one-time payments)
  if (eventType !== "donation.created") {
    logger.debug(
      `BMAC webhook: ignoring event type "${eventType}" (event_id: ${eventId})`,
    );
    return res.status(200).json({
      status: "ignored",
      message: `Event type "${eventType}" not handled`,
    });
  }

  const amount = data.amount;
  const supporterName = data.supporter_name || "";
  const currency = data.currency || "USD";
  const supportNote = data.support_note || "";
  const transactionId = data.transaction_id || null;
  const bmacPaymentId = data.id || null;

  // 1. Validate amount
  const paymentAmount = parseFloat(amount);
  if (!paymentAmount || paymentAmount <= 0 || isNaN(paymentAmount)) {
    logger.warn(`⚠️ BMAC webhook: invalid amount "${amount}"`);
    return res.status(400).json({ status: "error", message: "Invalid amount" });
  }

  // Reasonable max to prevent abuse
  if (paymentAmount > 10000) {
    logger.warn(`⚠️ BMAC webhook: amount too high "$${paymentAmount}"`);
    return res
      .status(400)
      .json({ status: "error", message: "Amount too high" });
  }

  // 2. Extract and validate code from support_note, then supporter_name
  const textToSearch = `${supportNote} ${supporterName}`.toUpperCase();
  const codeMatch = textToSearch.match(/RR-[A-Z0-9]{6}/);
  const code = codeMatch ? codeMatch[0] : "";

  if (!code) {
    logger.debug(
      `BMAC webhook: no valid code found (event_id: ${eventId}, supporter: "${supporterName}")`,
    );

    // Save to unclaimed payments database
    try {
      const { getDatabaseManager } = await import(
        "../utils/storage/databaseManager.js"
      );
      const dbManager = await getDatabaseManager();
      if (dbManager?.connectionManager?.db) {
        const db = dbManager.connectionManager.db;
        await db.collection("unclaimed_payments").insertOne({
          provider: "buymeacoffee",
          bmacPaymentId,
          transactionId,
          amount: paymentAmount,
          currency,
          supporterName: supporterName || "Anonymous",
          supportNote,
          eventId,
          timestamp: new Date(),
          payload: body,
          status: "unclaimed",
        });
        logger.info(
          `💾 Saved unclaimed BMAC payment of $${paymentAmount} from ${supporterName || "Anonymous"} (event_id: ${eventId})`,
        );
      }
    } catch (e) {
      logger.error("Failed to save unclaimed payment:", e);
    }

    return res.status(200).json({
      status: "ignored_but_saved",
      message: "No valid code, saved to unclaimed_payments",
    });
  }

  // 3. Look up code in pending_codes collection
  const { getDatabaseManager } = await import(
    "../utils/storage/databaseManager.js"
  );
  const { getStorageManager } = await import(
    "../utils/storage/storageManager.js"
  );
  const dbManager = await getDatabaseManager();
  const storage = await getStorageManager();
  if (!dbManager?.connectionManager?.db) {
    logger.error("❌ BMAC webhook: database not available");
    return res
      .status(500)
      .json({ status: "error", message: "Database not available" });
  }
  const db = dbManager.connectionManager.db;
  const pendingCodes = db.collection("pending_codes");

  let codeRecord;
  try {
    codeRecord = await pendingCodes.findOne({ code });
  } catch (dbError) {
    logger.error(
      `❌ BMAC webhook: database error looking up code "${code}":`,
      dbError,
    );
    return res.status(500).json({ status: "error", message: "Database error" });
  }

  if (!codeRecord) {
    logger.warn(`⚠️ BMAC webhook: code not found "${code}"`);
    return res.status(200).json({ status: "not_found" });
  }

  // 4. Check expiration
  if (new Date(codeRecord.expiresAt) < new Date()) {
    logger.warn(
      `⚠️ BMAC webhook: code expired "${code}" (expired at ${codeRecord.expiresAt})`,
    );
    return res.status(200).json({ status: "expired" });
  }

  // 5. Check if already used
  if (codeRecord.used) {
    logger.info(
      `🔄 BMAC webhook: code already used "${code}" for user ${codeRecord.discordId}`,
    );
    return res.status(200).json({ status: "already_processed" });
  }

  const userId = codeRecord.discordId;

  // 6. Verify username matches (secondary check - log only, don't block)
  try {
    const user = await storage.getUserByDiscordId(userId);
    if (user?.username && supporterName) {
      const normalize = s => (s || "").trim().toLowerCase();
      if (normalize(supporterName) !== normalize(user.username)) {
        logger.warn(
          `⚠️ BMAC username mismatch: expected "${user.username}", got "${supporterName}" for code ${code}`,
        );
      }
    }
  } catch (_e) {
    // Non-critical - username check is informational only
  }

  // 7. Process payment with credit lock (atomic operation)
  try {
    const { withCreditLock } = await import("../utils/ai/aiCreditManager.js");

    const result = await withCreditLock(userId, async () => {
      // 7a. Atomically claim the code BEFORE crediting (compare-and-swap).
      // A concurrent delivery of the same code fails the match and is rejected,
      // guaranteeing cores are credited exactly once.
      const claim = await pendingCodes.updateOne(
        { code, used: { $ne: true } },
        {
          $set: {
            used: true,
            usedAt: new Date(),
            paymentData: {
              amount: paymentAmount,
              currency,
              supporterName,
              transactionId,
              bmacPaymentId,
            },
          },
        },
      );
      if (claim.matchedCount !== 1) {
        return { alreadyProcessed: true };
      }

      try {
        // Calculate cores based on fiat amount, adjusted for BMAC fees
        const baseCores =
          typeof config.calculateCores === "function"
            ? config.calculateCores(paymentAmount)
            : Math.floor(
                paymentAmount *
                  (config.corePricing?.coreSystem?.conversionRate || 15),
              );
        const bmacMultiplier = config.corePricing?.coreSystem?.bmacFeeMultiplier || 0.85;
        const coresToAdd = Math.floor(baseCores * bmacMultiplier);

        // Atomic credit — $inc + $push in one op; no stale-read, no
        // whole-doc replaceOne that could overwrite concurrent writers.
        const updated =
          await dbManager.coreCredits.collection.findOneAndUpdate(
            { userId },
            {
              $inc: { credits: coresToAdd, totalGenerated: coresToAdd },
              $push: {
                bmacPayments: {
                  code,
                  type: "payment",
                  fiatAmount: paymentAmount,
                  currency,
                  cores: coresToAdd,
                  provider: "buymeacoffee",
                  supporterName,
                  transactionId,
                  bmacPaymentId,
                  timestamp: new Date().toISOString(),
                  processed: true,
                },
              },
              $set: { lastUpdated: new Date().toISOString() },
            },
            { upsert: true, returnDocument: "after" },
          );

        return { coresToAdd, newBalance: updated?.credits ?? coresToAdd };
      } catch (creditError) {
        // Release the claim so a retry can process the payment
        try {
          await pendingCodes.updateOne(
            { code, used: true },
            {
              $set: { used: false },
              $unset: { usedAt: "", paymentData: "" },
            },
          );
        } catch (rollbackError) {
          logger.error(
            `❌ BMAC webhook: failed to release code claim "${code}" — manual review needed:`,
            rollbackError,
          );
        }
        throw creditError;
      }
    });

    if (result.alreadyProcessed) {
      logger.info(
        `🔄 BMAC webhook: code "${code}" already claimed by a concurrent delivery for user ${userId}`,
      );
      return res.status(200).json({ status: "already_processed" });
    }

    // 9. Store payment record in payments collection (audit trail)
    try {
      const paymentId = `bmac_${code}_${Date.now()}`;
      await storage.completePayment({
        paymentId,
        discordId: userId,
        provider: "buymeacoffee",
        type: "one_time",
        status: "completed",
        amount: paymentAmount,
        currency,
        coresGranted: result.coresToAdd,
        supporterName,
        metadata: {
          code,
          supporterName,
          transactionId,
          bmacPaymentId,
          raw_amount: amount,
        },
      });
      logger.debug(
        `📝 BMAC payment ${paymentId} logged to payments collection`,
      );
    } catch (logError) {
      logger.error(
        `Failed to log BMAC payment to payments collection:`,
        logError,
      );
    }

    // 9.5. Process ongoing referral bonus if eligible ($10+ minimum)
    try {
      const { getDatabaseManager } = await import(
        "../utils/storage/databaseManager.js"
      );
      const dbManager = await getDatabaseManager();
      if (dbManager?.referrals) {
        await dbManager.referrals.processPurchaseBonus({
          refereeId: userId,
          paymentId: bmacPaymentId || transactionId || `bmac_${code}`,
          purchaseAmount: paymentAmount,
          coresGranted: result.coresToAdd,
          coreCreditsRepo: dbManager.coreCredits,
          paymentRepo: dbManager.payments,
        });
      }
    } catch (refError) {
      logger.error(
        `Failed to process referral bonus for ${userId} (BMAC):`,
        refError,
      );
    }

    // 10. Create in-app notification
    try {
      const { getDatabaseManager } = await import(
        "../utils/storage/databaseManager.js"
      );
      const dbManager = await getDatabaseManager();
      if (dbManager?.notifications) {
        await dbManager.notifications.create({
          userId,
          type: "balance_added",
          title: "Balance Replenished!",
          message: `+${result.coresToAdd} Cores from your $${paymentAmount} Buy Me a Coffee donation`,
          icon: "core",
          metadata: {
            coresGranted: result.coresToAdd,
            fiatAmount: paymentAmount,
            provider: "buymeacoffee",
          },
        });
      }
    } catch (_e) {
      /* non-critical */
    }

    // 11. Send Discord DM notification
    try {
      const { getPremiumManager } = await import(
        "../features/premium/PremiumManager.js"
      );
      const premiumManager = getPremiumManager();
      if (premiumManager?.client) {
        const user = await premiumManager.client.users
          .fetch(userId)
          .catch(() => null);
        if (user) {
          await user
            .send({
              embeds: [
                {
                  title: `${emojiConfig.customEmojis.core} Cores Added!`,
                  description: `You received **${result.coresToAdd} Cores** from your **$${paymentAmount} Buy Me a Coffee** donation.`,
                  color: 0x00d26a,
                  fields: [
                    {
                      name: "Donated by",
                      value: supporterName || "Anonymous",
                      inline: true,
                    },
                    {
                      name: "New Balance",
                      value: `${result.newBalance} ${emojiConfig.customEmojis.core}`,
                      inline: true,
                    },
                  ],
                  timestamp: new Date().toISOString(),
                },
              ],
            })
            .catch(() => null);
          logger.info(`📬 Sent DM notification to ${userId} for BMAC payment`);
        }
      }
    } catch (_e) {
      /* non-critical — DM may fail if user has DMs disabled */
    }

    logger.info(
      `✅ BMAC payment processed: ${code} → user ${userId}, +${result.coresToAdd} cores ($${paymentAmount} ${currency || "USD"})`,
    );
    return res.status(200).json({ success: true, message: "Credited" });
  } catch (error) {
    logger.error(`❌ BMAC webhook failed for code ${code}:`, error);
    return res.status(500).json({ status: "error", error: error.message });
  }
}
