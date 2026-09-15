import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const SECRET = "test-bmac-secret";

const mockStorageManager = {
  getUserByDiscordId: vi.fn().mockResolvedValue(null),
  completePayment: vi.fn().mockResolvedValue(true),
};

const pendingCodes = {
  findOne: vi.fn(),
  updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
};

const unclaimedPayments = {
  insertOne: vi.fn().mockResolvedValue({ insertedId: "mock-id" }),
};

const mockDb = {
  collection: vi.fn(name =>
    name === "pending_codes" ? pendingCodes : unclaimedPayments,
  ),
};

const mockDbManager = {
  connectionManager: { db: mockDb },
  coreCredits: {
    collection: {
      findOneAndUpdate: vi.fn().mockResolvedValue({ credits: 150 }),
    },
  },
  referrals: {
    processPurchaseBonus: vi.fn().mockResolvedValue({ processed: true }),
  },
  notifications: {
    create: vi.fn().mockResolvedValue({}),
  },
};

const mockConfig = {
  payments: { buymeacoffeeWebhookSecret: SECRET },
  calculateCores: amount => Math.floor(amount * 15),
  corePricing: {
    coreSystem: { conversionRate: 15, bmacFeeMultiplier: 0.85 },
  },
};

vi.mock("../../../src/utils/storage/storageManager.js", () => ({
  getStorageManager: vi.fn().mockResolvedValue(mockStorageManager),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../../../src/config/emojis.js", () => ({
  emojiConfig: {
    customEmojis: { core: "💎" },
  },
}));

vi.mock("../../../src/utils/ai/aiCreditManager.js", () => ({
  formatCoreCredits: val => val,
  withCreditLock: (_userId, fn) => fn(),
}));

vi.mock("../../../src/utils/storage/databaseManager.js", () => ({
  getDatabaseManager: vi.fn().mockResolvedValue(mockDbManager),
}));

vi.mock("../../../src/config/config.js", () => ({
  config: mockConfig,
}));

vi.mock("../../../src/features/premium/PremiumManager.js", () => ({
  getPremiumManager: () => null,
}));

// ─── Import AFTER mocks ─────────────────────────────────────────────────────

const { handleBMACWebhook } = await import(
  "../../../src/webhooks/buymeacoffee.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockRes() {
  return {
    statusCode: null,
    body: null,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function createBMACBody(overrides = {}) {
  const base = {
    event_id: "evt_test_1",
    type: "donation.created",
    live_mode: false,
    created: Math.floor(Date.now() / 1000),
    attempt: 1,
    data: {
      supporter_name: "TestUser",
      support_note: "RR-ABC123",
      amount: 10,
      currency: "USD",
      transaction_id: "txn_123",
      id: "bmac_123",
    },
  };
  const body = { ...base, ...overrides };
  if (overrides.data) {
    body.data = { ...base.data, ...overrides.data };
  }
  return body;
}

function signBody(rawBody, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function makeReq(body, { signature } = {}) {
  const rawBody = JSON.stringify(body);
  return {
    headers: {
      "x-signature-sha256":
        signature !== undefined ? signature : signBody(rawBody),
    },
    rawBody,
    body,
  };
}

function validCodeRecord(overrides = {}) {
  return {
    code: "RR-ABC123",
    discordId: "123456",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    used: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("handleBMACWebhook", () => {
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    res = createMockRes();
    mockConfig.payments.buymeacoffeeWebhookSecret = SECRET;
    mockStorageManager.getUserByDiscordId.mockResolvedValue(null);
    mockStorageManager.completePayment.mockResolvedValue(true);
    mockDbManager.coreCredits.collection.findOneAndUpdate.mockResolvedValue({
      credits: 150,
    });
    pendingCodes.findOne.mockResolvedValue(validCodeRecord());
    pendingCodes.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Signature Verification
  // ─────────────────────────────────────────────────────────────────────────

  describe("signature verification", () => {
    it("rejects with 500 when webhook secret is not configured", async () => {
      mockConfig.payments.buymeacoffeeWebhookSecret = null;

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error" }),
      );
    });

    it("rejects with 401 when signature header is missing", async () => {
      const req = makeReq(createBMACBody());
      delete req.headers["x-signature-sha256"];

      await handleBMACWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("rejects with 401 when signature is invalid", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody(), { signature: "deadbeef" }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error" }),
      );
    });

    it("rejects with 401 when signature was signed with wrong secret", async () => {
      const rawBody = JSON.stringify(createBMACBody());
      const wrongSecretSig = signBody(rawBody, "wrong-secret");
      const req = {
        headers: { "x-signature-sha256": wrongSecretSig },
        rawBody,
        body: createBMACBody(),
      };

      await handleBMACWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Event Filtering & Amount Validation
  // ─────────────────────────────────────────────────────────────────────────

  describe("event filtering", () => {
    it("ignores non-donation event types with 200", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody({ type: "membership.created" })),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ignored" }),
      );
      expect(pendingCodes.findOne).not.toHaveBeenCalled();
    });
  });

  describe("amount validation", () => {
    it("rejects invalid amounts with 400", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody({ data: { amount: "abc" } })),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid amount" }),
      );
    });

    it("rejects zero amounts with 400", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody({ data: { amount: 0 } })),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("rejects unreasonably high amounts with 400", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody({ data: { amount: 50000 } })),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Amount too high" }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Code Extraction
  // ─────────────────────────────────────────────────────────────────────────

  describe("code extraction", () => {
    it("saves payments without a code to unclaimed_payments", async () => {
      await handleBMACWebhook(
        makeReq(
          createBMACBody({
            data: { support_note: "great bot!", supporter_name: "NoCodeUser" },
          }),
        ),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ignored_but_saved" }),
      );
      expect(unclaimedPayments.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "buymeacoffee",
          amount: 10,
          status: "unclaimed",
        }),
      );
    });

    it("extracts the code from supporter_name when note is empty", async () => {
      await handleBMACWebhook(
        makeReq(
          createBMACBody({
            data: { support_note: "", supporter_name: "rr-abc123" },
          }),
        ),
        res,
      );

      expect(pendingCodes.findOne).toHaveBeenCalledWith({
        code: "RR-ABC123",
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Code Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  describe("code lifecycle", () => {
    it("returns not_found for unknown codes", async () => {
      pendingCodes.findOne.mockResolvedValue(null);

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "not_found" }),
      );
      expect(mockDbManager.coreCredits.collection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("returns expired for past-expiry codes", async () => {
      pendingCodes.findOne.mockResolvedValue(
        validCodeRecord({
          expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      );

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "expired" }),
      );
      expect(mockDbManager.coreCredits.collection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("returns already_processed for used codes without double-crediting", async () => {
      pendingCodes.findOne.mockResolvedValue(validCodeRecord({ used: true }));

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "already_processed" }),
      );
      expect(mockDbManager.coreCredits.collection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("rejects concurrent deliveries when the compare-and-swap claim loses", async () => {
      // First check passes (code appears unused), but the atomic claim
      // matches nothing — another request claimed it in between.
      pendingCodes.updateOne.mockResolvedValue({ matchedCount: 0 });

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "already_processed" }),
      );
      expect(mockDbManager.coreCredits.collection.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockStorageManager.completePayment).not.toHaveBeenCalled();
    });

    it("releases the code claim when crediting fails so a retry can process", async () => {
      mockDbManager.coreCredits.collection.findOneAndUpdate.mockRejectedValue(
        new Error("db write failed"),
      );

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(500);
      // Claim released (second updateOne rolls used back to false)
      expect(pendingCodes.updateOne).toHaveBeenLastCalledWith(
        { code: "RR-ABC123", used: true },
        { $set: { used: false }, $unset: { usedAt: "", paymentData: "" } },
      );
      expect(mockStorageManager.completePayment).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Successful Payment Processing
  // ─────────────────────────────────────────────────────────────────────────

  describe("successful payment processing", () => {
    it("credits cores, marks the code used, and audits the payment", async () => {
      await handleBMACWebhook(makeReq(createBMACBody()), res);

      // Cores granted: $10 × 15 conversion rate × 0.85 BMAC fee = 127 (atomic $inc)
      expect(
        mockDbManager.coreCredits.collection.findOneAndUpdate,
      ).toHaveBeenCalledWith(
        { userId: "123456" },
        expect.objectContaining({
          $inc: expect.objectContaining({ credits: 127, totalGenerated: 127 }),
        }),
        expect.objectContaining({ upsert: true, returnDocument: "after" }),
      );

      // Code atomically claimed (compare-and-swap) before crediting
      expect(pendingCodes.updateOne).toHaveBeenCalledWith(
        { code: "RR-ABC123", used: { $ne: true } },
        expect.objectContaining({
          $set: expect.objectContaining({ used: true }),
        }),
      );

      // Audit trail in payments collection
      expect(mockStorageManager.completePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          discordId: "123456",
          provider: "buymeacoffee",
          status: "completed",
          amount: 10,
          coresGranted: 127,
        }),
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("adds to an existing balance instead of resetting it", async () => {
      mockDbManager.coreCredits.collection.findOneAndUpdate.mockResolvedValue({
        credits: 200,
      });

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(
        mockDbManager.coreCredits.collection.findOneAndUpdate,
      ).toHaveBeenCalledWith(
        { userId: "123456" },
        expect.objectContaining({
          $inc: expect.objectContaining({ credits: 127, totalGenerated: 127 }),
        }),
        expect.objectContaining({ upsert: true, returnDocument: "after" }),
      );
    });

    it("wires the referral bonus with the granted cores", async () => {
      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(mockDbManager.referrals.processPurchaseBonus).toHaveBeenCalledWith(
        expect.objectContaining({
          refereeId: "123456",
          paymentId: "bmac_123",
          purchaseAmount: 10,
          coresGranted: 127,
        }),
      );
    });

    it("still credits small purchases below the referral threshold", async () => {
      await handleBMACWebhook(
        makeReq(createBMACBody({ data: { amount: 5 } })),
        res,
      );

      expect(
        mockDbManager.coreCredits.collection.findOneAndUpdate,
      ).toHaveBeenCalledWith(
        { userId: "123456" },
        expect.objectContaining({
          $inc: expect.objectContaining({ credits: 63 }),
        }),
        expect.objectContaining({ upsert: true, returnDocument: "after" }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("does not block payment when username does not match", async () => {
      mockStorageManager.getUserByDiscordId.mockResolvedValue({
        username: "CompletelyDifferent",
      });

      await handleBMACWebhook(makeReq(createBMACBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });
});
