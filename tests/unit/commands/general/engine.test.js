import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockInteraction,
  createMockClient,
  setupCommonMocks,
} from "../../../utils/testHelpers.js";

setupCommonMocks();

import { PremiumManager } from "../../../../src/features/premium/PremiumManager.js";
import * as storageManagerModule from "../../../../src/utils/storage/storageManager.js";
import { metadata, data, execute } from "../../../../src/commands/general/engine/index.js";
import {
  createStatusEmbed,
  createVaultEmbed,
  createFuelConfirmationEmbed,
  createFuelCancelledEmbed,
  createFuelSuccessEmbed,
} from "../../../../src/commands/general/engine/embeds.js";

describe("/engine Command", () => {
  let mockInteraction;
  let mockClient;
  let mockGetVaultData;
  let mockGetCoreCredits;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetVaultData = vi.fn().mockResolvedValue({ balance: 0, history: [] });
    mockGetCoreCredits = vi.fn().mockResolvedValue({ credits: 100 });

    const mockResponse = {
      awaitMessageComponent: vi.fn().mockRejectedValue(new Error("Timeout")),
    };

    vi.spyOn(storageManagerModule, "getStorageManager").mockResolvedValue({
      getCoreCredits: mockGetCoreCredits,
      dbManager: {
        coreCredits: {
          getByUserId: mockGetCoreCredits,
        },
        guildSettings: {
          getVaultData: mockGetVaultData,
          getAutoDeductFromOwner: vi.fn().mockResolvedValue(false),
        },
      },
    });

    mockInteraction = createMockInteraction({
      guildId: "guild123",
      user: {
        id: "user123",
        username: "testuser",
        displayAvatarURL: vi.fn().mockReturnValue("https://example.com/avatar.png"),
      },
      guild: {
        name: "Test Guild",
        iconURL: vi.fn().mockReturnValue("https://example.com/icon.png"),
      },
      options: {
        getSubcommand: vi.fn().mockReturnValue("status"),
        getNumber: vi.fn().mockReturnValue(10),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(mockResponse),
      reply: vi.fn().mockResolvedValue(undefined),
    });

    mockClient = createMockClient();
  });

  describe("Metadata & Slash Command Data", () => {
    it("should have correct metadata properties", () => {
      expect(metadata.name).toBe("engine");
      expect(metadata.category).toBe("general");
      expect(metadata.emoji).toBe("⚡");
      expect(metadata.helpFields).toBeDefined();
    });

    it("should build slash command data with status, vault, me, fuelers, and fuel subcommands", () => {
      const json = data.toJSON();
      expect(json.name).toBe("engine");
      expect(json.options).toHaveLength(5);

      const subNames = json.options.map(opt => opt.name);
      expect(subNames).toContain("status");
      expect(subNames).toContain("vault");
      expect(subNames).toContain("me");
      expect(subNames).toContain("fuelers");
      expect(subNames).toContain("fuel");
    });
  });

  describe("Subcommand: /engine status", () => {
    it("should display Pro Engine status embed when Pro is active", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("status");
      vi.spyOn(PremiumManager.prototype, "isFeatureActive").mockResolvedValue(true);
      vi.spyOn(PremiumManager.prototype, "getSubscriptionStatus").mockResolvedValue({
        nextDeductionDate: "2026-12-31T00:00:00Z",
        isTrial: false,
        active: true,
      });
      mockGetVaultData.mockResolvedValue({ balance: 40, history: [] });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editCall.embeds).toBeDefined();
      expect(editCall.embeds[0].data.title).toContain("Pro Engine Active");
    });

    it("should display Free Tier embed when Pro is inactive", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("status");
      vi.spyOn(PremiumManager.prototype, "isFeatureActive").mockResolvedValue(false);
      vi.spyOn(PremiumManager.prototype, "getSubscriptionStatus").mockResolvedValue(null);
      mockGetVaultData.mockResolvedValue({ balance: 5, history: [] });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editCall.embeds[0].data.title).toContain("Free Tier");
    });
  });

  describe("Subcommand: /engine vault", () => {
    it("should display Guild Vault reserve and leaderboard", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("vault");
      mockGetVaultData.mockResolvedValue({
        balance: 100,
        history: [
          { username: "Alice", amount: 60 },
          { username: "Bob", amount: 40 },
        ],
      });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editCall.embeds[0].data.description).toContain("Guild Vault");
    });
  });

  describe("Subcommand: /engine fuel", () => {
    it("should reject deposit amounts less than 1 Core", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("fuel");
      mockInteraction.options.getNumber.mockReturnValue(0);

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "❌ You must deposit at least **1 Core**.",
      });
    });

    it("should reject deposit when user has insufficient balance", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("fuel");
      mockInteraction.options.getNumber.mockReturnValue(50);
      mockGetCoreCredits.mockResolvedValue({ credits: 5 });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "❌ Insufficient Cores. You have **5.00 Cores**, but tried to deposit **50.00 Cores**.",
      });
    });

    it("should display confirmation embed with buttons and handle user confirmation", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("fuel");
      mockInteraction.options.getNumber.mockReturnValue(10);
      mockGetCoreCredits.mockResolvedValue({ credits: 100 });

      const mockConfirmation = {
        customId: "confirm_fuel_interaction123",
        deferUpdate: vi.fn().mockResolvedValue(undefined),
      };

      const mockResponse = {
        awaitMessageComponent: vi.fn().mockResolvedValue(mockConfirmation),
      };
      mockInteraction.editReply.mockResolvedValue(mockResponse);

      vi.spyOn(PremiumManager.prototype, "depositToGuildVault").mockResolvedValue({
        success: true,
        newVaultBalance: 50,
      });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining("Confirm Fueling"),
              }),
            }),
          ]),
          components: expect.any(Array),
        })
      );

      expect(PremiumManager.prototype.depositToGuildVault).toHaveBeenCalledWith(
        "guild123",
        "user123",
        10,
        "testuser"
      );
    });

    it("should handle user cancellation", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("fuel");
      mockInteraction.options.getNumber.mockReturnValue(10);
      mockGetCoreCredits.mockResolvedValue({ credits: 100 });

      const mockCancellation = {
        customId: "cancel_fuel_interaction123",
        deferUpdate: vi.fn().mockResolvedValue(undefined),
      };

      const mockResponse = {
        awaitMessageComponent: vi.fn().mockResolvedValue(mockCancellation),
      };
      mockInteraction.editReply.mockResolvedValue(mockResponse);

      const depositSpy = vi.spyOn(PremiumManager.prototype, "depositToGuildVault");

      await execute(mockInteraction, mockClient);

      expect(depositSpy).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining("Fueling Cancelled"),
              }),
            }),
          ]),
          components: [],
        })
      );
    });
  });

  describe("DM / Edge Cases", () => {
    it("should reject usage outside of a guild", async () => {
      mockInteraction.guildId = null;

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "❌ The `/engine` command can only be used inside a Discord server.",
        flags: 64,
      });
    });

    it("should handle unexpected execution errors gracefully", async () => {
      mockInteraction.options.getSubcommand.mockImplementation(() => {
        throw new Error("Simulated unexpected crash");
      });

      await execute(mockInteraction, mockClient);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "❌ An unexpected error occurred while processing `/engine`.",
        flags: 64,
      });
    });
  });

  describe("Embed Builders", () => {
    it("createStatusEmbed generates valid embed structure", () => {
      const embed = createStatusEmbed({
        guild: mockInteraction.guild,
        isPro: true,
        sub: { nextDeductionDate: "2026-10-01", active: true },
        vaultData: { balance: 20 },
        client: mockClient,
      });
      expect(embed.data.title).toContain("Pro Engine Active");
    });

    it("createVaultEmbed generates valid embed structure with fallback sponsor text", () => {
      const embed = createVaultEmbed({
        guild: mockInteraction.guild,
        vaultData: { balance: 0, history: [] },
        client: mockClient,
      });
      expect(embed.data.description).toContain("Guild Vault");
    });

    it("createFuelConfirmationEmbed generates valid confirmation embed", () => {
      const embed = createFuelConfirmationEmbed({
        guild: mockInteraction.guild,
        user: mockInteraction.user,
        amount: 10,
        userBalance: 50,
        client: mockClient,
      });
      expect(embed.data.title).toContain("Confirm Fueling");
    });

    it("createFuelCancelledEmbed generates valid cancellation embed", () => {
      const embed = createFuelCancelledEmbed(mockInteraction.user, mockClient);
      expect(embed.data.title).toContain("Fueling Cancelled");
    });

    it("createFuelSuccessEmbed generates valid success embed structure", () => {
      const embed = createFuelSuccessEmbed({
        guild: mockInteraction.guild,
        user: mockInteraction.user,
        amount: 5,
        newVaultBalance: 25,
        client: mockClient,
      });
      expect(embed.data.title).toContain("Guild Vault Fueled!");
    });
  });
});
