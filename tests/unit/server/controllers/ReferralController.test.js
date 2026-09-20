import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockReferralsRepo = {
  getOrCreateCode: vi.fn(),
  findByRefereeId: vi.fn(),
  claimCode: vi.fn(),
};

const mockDbManager = {
  referrals: mockReferralsRepo,
  coreCredits: { updateSparks: vi.fn(), updateCredits: vi.fn() },
};

vi.mock("../../../../src/utils/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../../../../src/utils/storage/databaseManager.js", () => ({
  getDatabaseManager: vi.fn().mockResolvedValue(mockDbManager),
}));

// ─── Import AFTER mocks ─────────────────────────────────────────────────────

const { apiGetUserReferral, apiClaimReferralCode } = await import(
  "../../../../src/server/controllers/ReferralController.js"
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

function makeReq({ user, session, headers = {}, body = {} } = {}) {
  return {
    user,
    session,
    headers,
    body,
    ip: "127.0.0.1",
    get: vi.fn(() => "vitest-agent"),
  };
}

function referralDoc(overrides = {}) {
  return {
    userId: "999",
    referralCode: "RR-XYZ789",
    totalEarnedCores: 15,
    referrals: [
      {
        refereeId: "1111222233334444",
        status: "qualified",
        totalPurchased: 20,
        referrerBonusEarned: 3,
        createdAt: "2026-08-01T00:00:00.000Z",
        qualifiedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        refereeId: "5555666677778888",
        status: "pending",
        totalPurchased: 0,
        referrerBonusEarned: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ReferralController", () => {
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    res = createMockRes();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/user/referral
  // ─────────────────────────────────────────────────────────────────────────

  describe("apiGetUserReferral", () => {
    it("returns 401 when no user identity is present", async () => {
      await apiGetUserReferral(makeReq(), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: "Authentication required",
        }),
      );
      expect(mockReferralsRepo.getOrCreateCode).not.toHaveBeenCalled();
    });

    it("returns 500 when the referral repository is unavailable", async () => {
      mockDbManager.referrals = null;

      await apiGetUserReferral(
        makeReq({ user: { id: "123" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: "Database error",
        }),
      );
      mockDbManager.referrals = mockReferralsRepo;
    });

    it("returns code, share URL, and invite stats", async () => {
      mockReferralsRepo.getOrCreateCode.mockResolvedValue(referralDoc());
      mockReferralsRepo.findByRefereeId.mockResolvedValue(null);

      await apiGetUserReferral(makeReq({ user: { id: "999" } }), res);

      expect(mockReferralsRepo.getOrCreateCode).toHaveBeenCalledWith("999");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          referralCode: "RR-XYZ789",
          shareUrl: "https://rolereactor.xyz?ref=RR-XYZ789",
          totalEarnedCores: 15,
          hasClaimedCode: false,
          stats: {
            totalInvites: 2,
            qualifiedInvites: 1,
            pendingInvites: 1,
          },
        }),
      );
    });

    it("masks referee IDs in the referral history", async () => {
      mockReferralsRepo.getOrCreateCode.mockResolvedValue(referralDoc());
      mockReferralsRepo.findByRefereeId.mockResolvedValue(null);

      await apiGetUserReferral(makeReq({ user: { id: "999" } }), res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.referrals).toHaveLength(2);
      expect(payload.referrals[0].refereeIdMasked).toBe("1111...4444");
      expect(payload.referrals[0].status).toBe("qualified");
      expect(payload.referrals[0].referrerBonusEarned).toBe(3);
    });

    it("reports hasClaimedCode when the user already used a code", async () => {
      mockReferralsRepo.getOrCreateCode.mockResolvedValue(referralDoc());
      mockReferralsRepo.findByRefereeId.mockResolvedValue({ userId: "777" });

      await apiGetUserReferral(makeReq({ user: { id: "999" } }), res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.hasClaimedCode).toBe(true);
    });

    it("falls back to session identity when req.user is absent", async () => {
      mockReferralsRepo.getOrCreateCode.mockResolvedValue(
        referralDoc({ referrals: [] }),
      );
      mockReferralsRepo.findByRefereeId.mockResolvedValue(null);

      await apiGetUserReferral(
        makeReq({ session: { discordUser: { id: "session-user" } } }),
        res,
      );

      expect(mockReferralsRepo.getOrCreateCode).toHaveBeenCalledWith(
        "session-user",
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/user/referral/claim
  // ─────────────────────────────────────────────────────────────────────────

  describe("apiClaimReferralCode", () => {
    it("returns 401 when no user identity is present", async () => {
      await apiClaimReferralCode(makeReq({ body: { code: "RR-XYZ789" } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockReferralsRepo.claimCode).not.toHaveBeenCalled();
    });

    it("returns 400 when code is missing", async () => {
      await apiClaimReferralCode(makeReq({ user: { id: "123" }, body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid referral code" }),
      );
    });

    it("returns 400 when code is an empty string", async () => {
      await apiClaimReferralCode(
        makeReq({ user: { id: "123" }, body: { code: "   " } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockReferralsRepo.claimCode).not.toHaveBeenCalled();
    });

    it("returns 400 with the repo error when the claim is rejected", async () => {
      mockReferralsRepo.claimCode.mockResolvedValue({
        success: false,
        error: "You cannot refer yourself.",
      });

      await apiClaimReferralCode(
        makeReq({ user: { id: "123" }, body: { code: "RR-XYZ789" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "You cannot refer yourself.",
          hint: "You cannot refer yourself.",
        }),
      );
    });

    it("claims with a trimmed code and the core credits repo", async () => {
      mockReferralsRepo.claimCode.mockResolvedValue({
        success: true,
        message: "Referral code applied!",
        referrerUserId: "777",
      });

      await apiClaimReferralCode(
        makeReq({ user: { id: "123" }, body: { code: "  RR-XYZ789  " } }),
        res,
      );

      expect(mockReferralsRepo.claimCode).toHaveBeenCalledWith(
        "123",
        "RR-XYZ789",
        mockDbManager.coreCredits,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Referral code applied!",
          referrerUserId: "777",
        }),
      );
    });

    it("returns 500 when the repository throws", async () => {
      mockReferralsRepo.claimCode.mockRejectedValue(new Error("db down"));

      await apiClaimReferralCode(
        makeReq({ user: { id: "123" }, body: { code: "RR-XYZ789" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error" }),
      );
    });
  });
});
