import { getStorageManager } from "../utils/storage/storageManager.js";
import { getLogger } from "../utils/logger.js";
import { plisioPay } from "../utils/payments/plisio.js";
import { emojiConfig } from "../config/emojis.js";

const logger = getLogger();

/**
 * Handle Crypto Payment Webhook (Plisio)
 *
 * Plisio sends two amount fields:
 *   - `amount`        → crypto amount (e.g. 0.00001511 BTC)
 *   - `source_amount` → fiat amount   (e.g. 1.00 USD)
 *
 * We use `source_amount` (fiat) for Core calculations, and store
 * both values in every payment record for full audit trail.
 */
export async function handleCryptoWebhook(req, res) {
  const {
    order_number: paymentId,
    status,
    amount: cryptoAmount,
    source_amount: sourceAmount,
    currency,
    source_currency: sourceCurrency,
    email,
    metadata,
  } = req.body;

  // 1. Verify Webhook Signature (SECURITY CRITICAL)
  if (!plisioPay.verifyWebhook(req.body)) {
    logger.warn(`❌ Invalid Plisio webhook signature for payment ${paymentId}`);
    return res
      .status(401)
      .json({ status: "error", message: "Invalid signature" });
  }

  // 3. Extract user ID early for logging
  let userId = metadata?.discordId;

  // Fallback: Extract Discord ID from order_number if metadata is missing
  // (Format: USERID_TIMESTAMP)
  if (
    !userId &&
    paymentId &&
    typeof paymentId === "string" &&
    paymentId.includes("_")
  ) {
    userId = paymentId.split("_")[0];
    logger.debug(
      `🔍 Extracted user ID ${userId} from Plisio payment ID ${paymentId}`,
    );
  }

  // 4. Always store the raw payment record for auditing — even for
  //    non-completed statuses and tiny amounts
  try {
    await storePaymentRecord(req.body, userId);
  } catch (storeErr) {
    logger.error(`❌ Failed to store payment record ${paymentId}:`, storeErr);
  }

  // 5. Filter for successful payment statuses
  if (status !== "completed" && status !== "mismatch") {
    return res.status(200).json({ status: "ignored" });
  }

  if (!userId) {
    logger.warn(`⚠️ Crypto payment without Discord ID: ${paymentId}`);
    return res.status(200).json({ status: "no_user_linked" });
  }

  // Fast-path: Check for duplicate before processing
  try {
    const storage = await getStorageManager();
    const existingData = await storage.getCoreCredits(userId);
    if (existingData?.cryptoPayments?.some(p => p.chargeId === paymentId)) {
      logger.info(
        `🔄 Duplicate payment detected early: ${paymentId} for user ${userId}`,
      );
      return res
        .status(200)
        .json({ success: true, message: "Already processed" });
    }
  } catch (checkError) {
    logger.warn(
      `Duplicate check failed, will retry in lock: ${checkError.message}`,
    );
  }

  try {
    const result = await processCryptoPayment(
      userId,
      paymentId,
      cryptoAmount,
      sourceAmount,
      currency,
      sourceCurrency,
      email,
      metadata,
      "plisio",
    );
    return res.status(200).json(result);
  } catch (error) {
    logger.error(`❌ Failed to process crypto payment ${paymentId}:`, error);
    return res.status(500).json({ status: "error", error: error.message });
  }
}

/**
 * Store every incoming Plisio webhook payload for audit trail.
 * Non-critical — errors are logged but never block the main flow.
 */
async function storePaymentRecord(body, discordId = null) {
  const storage = await getStorageManager();
  const metadata = body.metadata || {};

  const record = {
    paymentId: body.order_number,
    discordId: discordId || metadata.discordId,
    provider: "plisio",
    status: body.status,
    cryptoAmount: parseFloat(body.amount) || 0,
    cryptoCurrency: body.currency,
    amount: parseFloat(body.source_amount) || 0,
    currency: body.source_currency || "USD",
    email: body.email || metadata.email,
    txnId: body.txn_id,
    rawPayload: body,
    receivedAt: new Date().toISOString(),
  };

  // Try to store in payments collection (best-effort)
  try {
    const { getDatabaseManager } = await import(
      "../utils/storage/databaseManager.js"
    );
    const dbManager = await getDatabaseManager();
    if (dbManager?.payments) {
      await dbManager.payments.complete(record);
      logger.debug(`📝 Raw payment record stored: ${record.paymentId}`);
    }
  } catch (_e) {
    // Fallback: store via storage manager
    await storage.createPayment(record);
    logger.debug(
      `📝 Raw payment record stored (fallback): ${record.paymentId}`,
    );
  }
}

/**
 * Atomic processing of Crypto payment
 *
 * @param {string} userId        Discord user ID
 * @param {string} paymentId      Plisio order_number or Web3 txHash
 * @param {string} cryptoAmount   Amount in cryptocurrency (e.g. "0.00001511")
 * @param {string} sourceAmount   Amount in fiat currency  (e.g. "1.00")
 * @param {string} currency       Crypto currency code     (e.g. "BTC")
 * @param {string} sourceCurrency Fiat currency code       (e.g. "USD")
 * @param {string} _email
 * @param {Object} _metadata
 * @param {string} _provider      Payment provider (e.g. "plisio", "web3")
 */
export async function processCryptoPayment(
  userId,
  paymentId,
  cryptoAmount,
  sourceAmount,
  currency,
  sourceCurrency,
  _email,
  _metadata,
  _provider = "plisio",
) {
  const storage = await getStorageManager();
  const configModule = await import("../config/config.js").catch(() => null);
  const config =
    configModule?.config || configModule?.default || configModule || {};

  // Check for duplicate payment
  const existingData = await storage.getCoreCredits(userId);
  if (existingData?.cryptoPayments?.some(p => p.chargeId === paymentId)) {
    logger.info(
      `🔄 Duplicate payment attempt: ${paymentId} already credited to user ${userId}.`,
    );
    return { success: true, message: "Already processed" };
  }

  const fiatAmount = parseFloat(sourceAmount) || 0;
  const cryptoAmt = parseFloat(cryptoAmount) || 0;
  const paymentAmount = fiatAmount > 0 ? fiatAmount : cryptoAmt;

  const coresToAdd =
    typeof config.calculateCores === "function"
      ? config.calculateCores(paymentAmount)
      : Math.floor(
          paymentAmount *
            (config.corePricing?.coreSystem?.conversionRate || 50),
        );

  // Atomic credit + atomic dedupe in one op: the filter only matches
  // if this chargeId is NOT already in cryptoPayments, so concurrent
  // deliveries of the same payment can never double-credit.
  const { getDatabaseManager } = await import(
    "../utils/storage/databaseManager.js"
  );
  const dbManager = await getDatabaseManager();

  const updated = await dbManager.coreCredits.collection.findOneAndUpdate(
    { userId, "cryptoPayments.chargeId": { $ne: paymentId } },
    {
      $inc: { credits: coresToAdd, totalGenerated: coresToAdd },
      $push: {
        cryptoPayments: {
          chargeId: paymentId,
          type: "payment",
          fiatAmount: paymentAmount,
          cryptoAmount: cryptoAmt,
          currency,
          sourceCurrency: sourceCurrency || "USD",
          cores: coresToAdd,
          provider: "plisio",
          timestamp: new Date().toISOString(),
          processed: true,
        },
      },
      $set: { lastUpdated: new Date().toISOString() },
    },
    { upsert: true, returnDocument: "after" },
  );

  // CAS lost: another delivery credited this payment first
  if (!updated) {
    logger.info(
      `🔄 Duplicate payment attempt: ${paymentId} already credited to user ${userId}.`,
    );
    return { success: true, message: "Already processed" };
  }

  const newBalance = updated?.credits ?? coresToAdd;

  // Update separate payments ledger (Upsert/Complete)
  try {
    await storage.completePayment({
      paymentId: paymentId,
      discordId: userId,
      provider: _provider,
      type: "one_time",
      status: "completed",
      amount: paymentAmount,
      cryptoAmount: cryptoAmt,
      currency: currency,
      sourceCurrency: sourceCurrency || "USD",
      coresGranted: coresToAdd,
      email: _email,
      metadata: _metadata,
    });
    logger.debug(`📝 Payment ${paymentId} logged to payments collection`);
  } catch (logError) {
    logger.error(
      `Failed to log payment ${paymentId} to payments collection:`,
      logError,
    );
  }

  // Process ongoing referral bonus if eligible ($10+ minimum)
  try {
    if (dbManager?.referrals) {
      await dbManager.referrals.processPurchaseBonus({
        refereeId: userId,
        paymentId: paymentId,
        purchaseAmount: paymentAmount,
        coresGranted: coresToAdd,
        coreCreditsRepo: dbManager.coreCredits,
        paymentRepo: dbManager.payments,
      });
    }
  } catch (refError) {
    logger.error(`Failed to process referral bonus for ${userId}:`, refError);
  }

  logger.info(
    `✅ Added ${coresToAdd} Cores to user ${userId} via Crypto ($${paymentAmount} ${sourceCurrency || "USD"} / ${cryptoAmt} ${currency})`,
  );

  // Create in-app notification
  try {
    if (dbManager?.notifications) {
      await dbManager.notifications.create({
        userId,
        type: "balance_added",
        title: "Balance Replenished!",
        message: `+${coresToAdd} Cores from your $${paymentAmount} crypto purchase`,
        icon: "core",
        metadata: {
          coresGranted: coresToAdd,
          fiatAmount: paymentAmount,
          cryptoAmount: cryptoAmt,
          currency,
          provider: "plisio",
        },
      });
    }
  } catch (_e) {
    /* non-critical */
  }

  // Send Discord DM notification to user
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
                description: `You received **${coresToAdd} Cores** from your crypto payment of **$${paymentAmount} ${sourceCurrency || "USD"}**.`,
                color: 0x00d26a,
                fields: [
                  {
                    name: "Crypto Amount",
                    value: `${cryptoAmt} ${currency}`,
                    inline: true,
                  },
                  {
                    name: "New Balance",
                    value: `${newBalance} ${emojiConfig.customEmojis.core}`,
                    inline: true,
                  },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          })
          .catch(() => null);
        logger.info(`📬 Sent DM notification to ${userId} for crypto payment`);
      }
    }
  } catch (_e) {
    /* non-critical — DM may fail if user has DMs disabled */
  }

  return { success: true, message: "Credited", credits: coresToAdd };
}
