/**
 * Unit tests for TicketManager
 * Tests core ticket operations and business logic
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTicketManager } from "../../src/features/ticketing/TicketManager.js";
import { FREE_TIER, PRO_ENGINE } from "../../src/features/ticketing/config.js";

// Mock dependencies
vi.mock("../../src/utils/storage/storageManager.js", () => ({
  getStorageManager: vi.fn(() => ({
    countMonthlyTickets: vi.fn().mockResolvedValue(0),
    getTicketPanelsByGuild: vi.fn().mockResolvedValue([]),
    getTicketsByUser: vi.fn().mockResolvedValue([]),
    getTicketStats: vi
      .fn()
      .mockResolvedValue({ total: 0, open: 0, closed: 0, archived: 0 }),
    tickets: {
      getExpiredTickets: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    },
  })),
}));

vi.mock("../../src/features/premium/PremiumManager.js", () => ({
  getPremiumManager: vi.fn(() => ({
    isFeatureActive: vi.fn().mockResolvedValue(false),
  })),
}));

describe("TicketManager", () => {
  let ticketManager;

  beforeEach(async () => {
    ticketManager = getTicketManager();
    await ticketManager.initialize();
    vi.clearAllMocks();
  });

  describe("Configuration", () => {
    it("should initialize with correct free tier limits", () => {
      expect(FREE_TIER.MAX_TICKETS_PER_MONTH).toBe(50);
      expect(FREE_TIER.MAX_PANELS).toBe(3);
      expect(FREE_TIER.MAX_CATEGORIES).toBe(3);
      expect(FREE_TIER.TRANSCRIPT_RETENTION_DAYS).toBe(30);
    });

    it("should initialize with correct pro engine limits", () => {
      expect(PRO_ENGINE.MAX_TICKETS_PER_MONTH).toBe(250);
      expect(PRO_ENGINE.MAX_PANELS).toBe(10);
      expect(PRO_ENGINE.MAX_CATEGORIES).toBe(10);
      expect(PRO_ENGINE.TRANSCRIPT_RETENTION_DAYS).toBe(-1);
    });

    it("should have 5x multiplier from free to pro (tickets)", () => {
      expect(
        PRO_ENGINE.MAX_TICKETS_PER_MONTH / FREE_TIER.MAX_TICKETS_PER_MONTH,
      ).toBe(5);
    });
  });

  describe("Ticket Limit Check", () => {
    it("should return correct limit structure", async () => {
      const limit = await ticketManager.checkTicketLimit("test-guild-id");

      expect(limit).toHaveProperty("hasReachedLimit");
      expect(limit).toHaveProperty("current");
      expect(limit).toHaveProperty("max");
      expect(limit).toHaveProperty("isPro");
    });

    it("should default to free tier when no subscription", async () => {
      const limit = await ticketManager.checkTicketLimit("test-guild-id");

      expect(limit.max).toBe(FREE_TIER.MAX_TICKETS_PER_MONTH);
      expect(limit.isPro).toBe(false);
    });
  });


  describe("Category Limit Check", () => {
    it("should validate category count", async () => {
      const categories = [
        { id: "1", label: "Support" },
        { id: "2", label: "Billing" },
        { id: "3", label: "Technical" },
      ];

      const result = await ticketManager.checkCategoryLimit(
        categories,
        "test-guild-id",
      );

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("max");
      expect(result).toHaveProperty("isPro");

      // 3 categories should be valid for free tier
      expect(result.valid).toBe(true);
      expect(result.max).toBe(FREE_TIER.MAX_CATEGORIES);
    });

    it("should reject too many categories for free tier", async () => {
      const categories = Array(5).fill({ id: "1", label: "Support" });

      const result = await ticketManager.checkCategoryLimit(
        categories,
        "test-guild-id",
      );

      expect(result.valid).toBe(false);
      expect(result.max).toBe(FREE_TIER.MAX_CATEGORIES);
    });
  });

  describe("Ticket Creation", () => {
    it("should handle missing guild gracefully", async () => {
      const ticket = await ticketManager.createTicket({
        guildId: null,
        channelId: "test-channel",
        userId: "test-user",
        userDisplayName: "Test User",
      });

      expect(ticket).toBeNull();
    });

    it("should require valid user ID", async () => {
      const ticket = await ticketManager.createTicket({
        guildId: "test-guild",
        channelId: "test-channel",
        userId: null,
        userDisplayName: "Test User",
      });

      expect(ticket).toBeNull();
    });
  });

  describe("Ticket Closure", () => {
    it("should handle non-existent ticket", async () => {
      const success = await ticketManager.closeTicket(
        "TIX-nonexistent-00000",
        "test-user",
        "Test reason",
      );

      expect(success).toBe(false);
    });

    it("should require valid ticket ID", async () => {
      const success = await ticketManager.closeTicket(
        null,
        "test-user",
        "Test reason",
      );

      expect(success).toBe(false);
    });
  });

  describe("Ticket Claiming", () => {
    it("should handle non-existent ticket", async () => {
      const success = await ticketManager.claimTicket(
        "TIX-nonexistent-00000",
        "test-staff",
      );

      expect(success).toBe(false);
    });

    it("should require valid staff ID", async () => {
      const success = await ticketManager.claimTicket("TIX-test-00000", null);

      expect(success).toBe(false);
    });
  });

  describe("User Ticket Lookup", () => {
    it("should return array for user tickets", async () => {
      const tickets = await ticketManager.getUserTickets(
        "test-user",
        "test-guild",
        "open",
      );

      expect(Array.isArray(tickets)).toBe(true);
    });

    it("should handle empty result", async () => {
      const tickets = await ticketManager.getUserTickets(
        "nonexistent-user",
        "test-guild",
        "open",
      );

      expect(tickets.length).toBe(0);
    });

    it("should accept status filter", async () => {
      const statuses = ["open", "closed", "all"];

      for (const status of statuses) {
        const tickets = await ticketManager.getUserTickets(
          "test-user",
          "test-guild",
          status,
        );

        expect(Array.isArray(tickets)).toBe(true);
      }
    });
  });

  describe("Guild Statistics", () => {
    it("should return stats object", async () => {
      const stats = await ticketManager.getGuildStats("test-guild");

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("open");
      expect(stats).toHaveProperty("closed");
      expect(stats).toHaveProperty("archived");
      expect(stats).toHaveProperty("limit");
      expect(stats).toHaveProperty("current");
      expect(stats).toHaveProperty("isPro");
    });

    it("should default to zero for empty guild", async () => {
      const stats = await ticketManager.getGuildStats("nonexistent-guild");

      expect(stats.total).toBe(0);
      expect(stats.open).toBe(0);
      expect(stats.closed).toBe(0);
    });
  });

  describe("Ticket Participants", () => {
    it("should handle adding user to non-existent ticket", async () => {
      const success = await ticketManager.addUserToTicket(
        "TIX-nonexistent-00000",
        "test-user",
      );
      expect(success).toBe(false);
    });

    it("should require valid user ID to add", async () => {
      const success = await ticketManager.addUserToTicket(
        "TIX-test-00000",
        null,
      );
      expect(success).toBe(false);
    });

    it("should handle removing user from non-existent ticket", async () => {
      const success = await ticketManager.removeUserFromTicket(
        "TIX-nonexistent-00000",
        "test-user",
      );
      expect(success).toBe(false);
    });

    it("should require valid user ID to remove", async () => {
      const success = await ticketManager.removeUserFromTicket(
        "TIX-test-00000",
        null,
      );
      expect(success).toBe(false);
    });
  });

  describe("Ticket Deletion", () => {
    it("should handle non-existent ticket", async () => {
      const success = await ticketManager.deleteTicket("TIX-nonexistent-00000");

      expect(success).toBe(false);
    });
  });

  describe("Expired Tickets", () => {
    it("should return array of expired tickets", async () => {
      const expired = await ticketManager.getExpiredTickets("test-guild", 7);

      expect(Array.isArray(expired)).toBe(true);
    });

    it("should accept positive days", async () => {
      const expired = await ticketManager.getExpiredTickets("test-guild", 7);

      expect(Array.isArray(expired)).toBe(true);
    });

    it("should handle zero days", async () => {
      const expired = await ticketManager.getExpiredTickets("test-guild", 0);

      expect(Array.isArray(expired)).toBe(true);
    });
  });
});
