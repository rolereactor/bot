import express from "express";
import {
  apiPaymentStats,
  apiPendingPayments,
  apiGetAdminActionLogs,
} from "../../controllers/PaymentAdminController.js";
import {
  apiCreatePayment,
  apiVerifyWeb3Payment,
  apiGetTransactionHistory,
  apiGetUserBalance,
} from "../../controllers/PaymentProcessingController.js";
import {
  apiGenerateBMACCode,
  apiCheckBMACCodeStatus,
} from "../../controllers/BMACController.js";

import { internalAuth } from "../../middleware/internalAuth.js";
import { requireAuth } from "../../middleware/authentication.js";
import { requireAdmin } from "../../middleware/userAuthorization.js";

const router = express.Router();

// Admin endpoints - require internal auth + user authentication
router.get("/stats", internalAuth, requireAuth, requireAdmin, apiPaymentStats);
router.get(
  "/pending",
  internalAuth,
  requireAuth,
  requireAdmin,
  apiPendingPayments,
);
router.get(
  "/logs/admin",
  internalAuth,
  requireAuth,
  requireAdmin,
  apiGetAdminActionLogs,
);

// Payment creation - requires internal auth (website verifies user session)
router.post("/create", internalAuth, apiCreatePayment);

// Web3 Verification - requires internal auth
router.get("/history", internalAuth, requireAuth, apiGetTransactionHistory);
router.post("/web3/verify", internalAuth, apiVerifyWeb3Payment);
router.get("/balance", internalAuth, requireAuth, apiGetUserBalance);

// Buy Me a Coffee code generation - requires internal auth
router.post("/buymeacoffee/generate-code", internalAuth, apiGenerateBMACCode);

// Buy Me a Coffee code status check - requires internal auth
router.get("/buymeacoffee/code-status", internalAuth, apiCheckBMACCodeStatus);

export default router;
