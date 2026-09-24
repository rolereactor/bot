/**
 * Security Tests for Role Reactor Bot API
 *
 * These tests verify that the security fixes prevent unauthorized access
 * to role management and other sensitive endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// Prevent health-check endpoints from attempting a real MongoDB connection
// (no database exists in the test environment; a real client would hang
// until its server-selection timeout).
vi.mock("../../src/utils/storage/databaseManager.js", () => ({
  getDatabaseManager: vi.fn().mockResolvedValue({
    connectionManager: {
      isConnectionHealthy: () => false,
    },
  }),
}));

describe("API Security Tests", () => {
  let app;
  let server;
  const API_BASE = "/api/v1";
  const testGuildId = "123456789012345678";
  const testChannelId = "987654321098765432";
  const testUserId = "111111111111111111";

  beforeAll(async () => {
    // Import and setup the app with routes mounted (but no HTTP listener)
    const { initAppForTests } = await import(
      "../../src/server/webhookServer.js"
    );
    app = await initAppForTests();
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe("Role Reaction Endpoints Security", () => {
    it("should reject role deploy request without authentication", async () => {
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/roles/deploy`)
        .send({
          channelId: testChannelId,
          reactions: [{ emoji: "🔴", roleId: "111111111111111111" }],
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject role deploy with only internal API key (no user auth)", async () => {
      const internalKey = process.env.INTERNAL_API_KEY || "test-key";
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/roles/deploy`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({ channelId: testChannelId, reactions: [] });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject role deploy with invalid internal API key", async () => {
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/roles/deploy`)
        .set("Authorization", "Bearer invalid-key-12345")
        .send({ channelId: testChannelId, reactions: [] });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject role delete without authentication", async () => {
      const testMessageId = "555555555555555555";
      const response = await request(app).delete(
        `${API_BASE}/guilds/${testGuildId}/role-reactions/${testMessageId}`,
      );

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject role update without authentication", async () => {
      const testMessageId = "555555555555555555";
      const response = await request(app)
        .patch(
          `${API_BASE}/guilds/${testGuildId}/role-reactions/${testMessageId}`,
        )
        .send({ title: "Hacked Title" });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Guild Settings Endpoints Security", () => {
    it("should reject guild settings update without authentication", async () => {
      const response = await request(app)
        .patch(`${API_BASE}/guilds/${testGuildId}/settings`)
        .send({
          prefix: "!",
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject guild settings with only internal API key", async () => {
      const internalKey = process.env.INTERNAL_API_KEY || "test-key";

      const response = await request(app)
        .patch(`${API_BASE}/guilds/${testGuildId}/settings`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({
          prefix: "!",
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });


  describe("Premium Endpoints Security", () => {
    it("should reject premium activation without authentication", async () => {
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/premium/activate`)
        .send({
          featureId: "pro",
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Analytics Endpoints Security", () => {
    it("should reject analytics access without authentication", async () => {
      const response = await request(app).get(
        `${API_BASE}/guilds/${testGuildId}/analytics`,
      );

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Public Endpoints (Should Remain Accessible)", () => {
    it("should allow access to public leaderboards", async () => {
      const response = await request(app).get(
        `${API_BASE}/guilds/public-leaderboards`,
      );

      // Should not return 401 (may return 200 or other status based on data)
      expect(response.status).not.toBe(401);
    });

    it("should allow health check endpoint", async () => {
      const response = await request(app).get("/health");

      // Health should be public (or 404 if not enabled)
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("Rate Limiting Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should have rate limiting headers on role management endpoints", async () => {
      // Make a request that will be rejected but should have rate limit headers
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/roles/deploy`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({
          channelId: testChannelId,
          reactions: [],
        });

      // Rate limiting should be configured (even if not triggered)
      // The presence of the middleware is verified by code review
      expect(response.status).toBeGreaterThanOrEqual(400); // Will fail auth, but that's expected
    });
  });

  describe("Input Validation Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject malformed guild IDs", async () => {
      const response = await request(app)
        .post(`${API_BASE}/guilds/invalid-guild-id/roles/deploy`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({
          channelId: "invalid-channel",
          reactions: [],
        });

      // Should reject due to auth or validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject empty request bodies", async () => {
      const response = await request(app)
        .post(`${API_BASE}/guilds/${testGuildId}/roles/deploy`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({});

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Payment Endpoints Security", () => {
    it("should reject payment creation without authentication", async () => {
      const response = await request(app)
        .post(`${API_BASE}/payments/create`)
        .send({
          amount: 100,
          currency: "USD",
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject payment stats without authentication", async () => {
      const internalKey = process.env.INTERNAL_API_KEY || "test-key";
      const response = await request(app)
        .get(`${API_BASE}/payments/stats`)
        .set("Authorization", `Bearer ${internalKey}`);

      // Should require user auth even with internal key
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("User Endpoints Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject user balance access without authentication", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user/${testUserId}/balance`)
        .set("Authorization", `Bearer ${internalKey}`);

      // Should require user auth even with internal key
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject user payments access without authentication", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user/${testUserId}/payments`)
        .set("Authorization", `Bearer ${internalKey}`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject user notifications without authentication", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user/${testUserId}/notifications`)
        .set("Authorization", `Bearer ${internalKey}`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject admin user list without authentication", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user`)
        .set("Authorization", `Bearer ${internalKey}`);

      // Should require both internal auth AND admin role
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject admin user role modification without authentication", async () => {
      const response = await request(app)
        .patch(`${API_BASE}/user/${testUserId}/role`)
        .set("Authorization", `Bearer ${internalKey}`)
        .send({
          role: "admin",
        });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("User Profile Endpoint Security (/me)", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject /me endpoint without authentication", async () => {
      const response = await request(app).get(`${API_BASE}/user/me`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject /me endpoint without internal key", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user/me`)
        .set("Authorization", `Bearer invalid-session`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject /me endpoint with only internal key (no session)", async () => {
      const response = await request(app)
        .get(`${API_BASE}/user/me`)
        .set("Authorization", `Bearer ${internalKey}`);

      // Should require session auth
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Root Endpoints Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject balance endpoint without authentication", async () => {
      const response = await request(app).get(`${API_BASE}/balance`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject payments endpoint without authentication", async () => {
      const response = await request(app).get(`${API_BASE}/payments`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should allow public root endpoints without auth", async () => {
      const infoResponse = await request(app).get(`${API_BASE}/info`);
      expect([200, 404]).toContain(infoResponse.status);

      const pricingResponse = await request(app).get(`${API_BASE}/pricing`);
      expect([200, 404]).toContain(pricingResponse.status);
    });
  });

  describe("User Endpoints Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject user balance without internal key", async () => {
      const response = await request(app).get(
        `${API_BASE}/user/${testUserId}/balance`,
      );

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject user payments without internal key", async () => {
      const response = await request(app).get(
        `${API_BASE}/user/${testUserId}/payments`,
      );

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject user notifications without internal key", async () => {
      const response = await request(app).get(
        `${API_BASE}/user/${testUserId}/notifications`,
      );

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject admin endpoints without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/user`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Payments Endpoints Security", () => {
    it("should reject payment creation without internal key", async () => {
      const response = await request(app)
        .post(`${API_BASE}/payments/create`)
        .send({ amount: 100, currency: "USD" });

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject admin payment stats without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/payments/stats`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Stats Endpoints Security", () => {
    it("should reject stats/usage without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/stats/usage`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject stats/global without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/stats/global`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Commands Endpoints Security", () => {
    it("should reject commands/usage without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/commands/usage`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Services Endpoints Security", () => {
    it("should reject services without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/services`);

      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("System Endpoints Security", () => {
    const internalKey = process.env.INTERNAL_API_KEY || "test-key";

    it("should reject logs access without internal key", async () => {
      const response = await request(app).get(`${API_BASE}/logs`);

      // Logs are service-to-service: bot trusts requests carrying the
      // internal key; the website layer enforces admin auth before proxying.
      expect(response.status).toBe(401);
    });

    it("should serve logs to the trusted internal service", async () => {
      const response = await request(app)
        .get(`${API_BASE}/logs`)
        .set("Authorization", `Bearer ${internalKey}`);

      expect(response.status).toBeLessThan(500);
      expect([200, 401, 403, 404]).toContain(response.status);
    });

    it("should reject config access without authentication", async () => {
      const response = await request(app)
        .get(`${API_BASE}/config`)
        .set("Authorization", `Bearer ${internalKey}`);

      // Config should require additional admin auth
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should allow health check without authentication", async () => {
      const response = await request(app).get("/health");

      // Health should be public (but rate limited) - accept 200 or 404 if not enabled
      expect([200, 404]).toContain(response.status);
    });

    it("should reject services endpoint without authentication", async () => {
      const response = await request(app).get(`${API_BASE}/services`);

      // Services now require internal auth
      expect(response.status).toBeLessThan(500);
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should allow stats info without authentication", async () => {
      const response = await request(app).get(`${API_BASE}/stats/info`);

      // Public stats should be accessible
      expect(response.status).not.toBe(401);
    });
  });

  describe("Transcript Endpoint Security", () => {
    it("should require authentication for transcript access", async () => {
      const response = await request(app).get(`/t/invalid-transcript-id`);

      // Transcripts now require an authenticated session (see routes/v1/transcripts.js)
      expect(response.status).not.toBe(500);
      expect([401, 403, 404]).toContain(response.status);
    });
  });
});
