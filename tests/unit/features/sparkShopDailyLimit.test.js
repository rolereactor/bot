import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/utils/storage/storageManager.js", () => ({
  getStorageManager: () => mocks.storageManager,
}));

const mocks = vi.hoisted(() => ({
  storageManager: {
    dbManager: {
      coreCredits: {
        getByUserId: vi.fn(),
        deductCredits: vi.fn(),
        deductSparks: vi.fn(),
        updateSparks: vi.fn().mockResolvedValue({ success: true }),
        collection: { updateOne: vi.fn().mockResolvedValue({}) },
      },
      guildSettings: {
        getByGuild: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      },
      flashSales: undefined,
      payments: { create: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

import { getSparkShopManager } from "../../../src/features/spark-shop/SparkShopManager.js";

const shop = getSparkShopManager();

function purchasesToday(countsByItem) {
  const now = new Date().toISOString();
  return Object.entries(countsByItem).flatMap(([itemId, count]) =>
    Array.from({ length: count }, () => ({ itemId, purchasedAt: now })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageManager.dbManager.guildSettings.getByGuild.mockResolvedValue(
    null,
  );
});

describe("daily purchase limit is per category", () => {
  it("power cell purchases today do not block engine module purchase", async () => {
    // 4 cells bought today (cell limit is 5), 0 modules (module limit is 2)
    mocks.storageManager.dbManager.coreCredits.getByUserId.mockResolvedValue({
      credits: 1000,
      sparks: 100,
      sparkProPurchases: purchasesToday({
        "power-cell-aaa": 4,
      }),
    });
    mocks.storageManager.dbManager.coreCredits.deductSparks.mockResolvedValue(
      { success: true },
    );

    const result = await shop.purchase("user1", "guild1", "piston");

    expect(result.success).toBe(true);
    expect(
      mocks.storageManager.dbManager.coreCredits.deductSparks,
    ).toHaveBeenCalledWith("user1", 75);
  });

  it("engine module purchases today do not block power cell purchase", async () => {
    // 2 modules bought today (limit reached for that category), 0 cells
    mocks.storageManager.dbManager.coreCredits.getByUserId.mockResolvedValue({
      credits: 1000,
      sparks: 100,
      sparkProPurchases: purchasesToday({
        piston: 2,
      }),
    });
    mocks.storageManager.dbManager.coreCredits.deductCredits.mockResolvedValue(
      { success: true },
    );

    const result = await shop.purchase("user1", "guild1", "power-cell-aaa");

    expect(result.success).toBe(true);
    expect(
      mocks.storageManager.dbManager.coreCredits.deductCredits,
    ).toHaveBeenCalledWith("user1", 28);
  });

  it("still blocks when same-category limit is reached", async () => {
    // 2 modules bought today = at module limit
    mocks.storageManager.dbManager.coreCredits.getByUserId.mockResolvedValue({
      credits: 1000,
      sparks: 100,
      sparkProPurchases: purchasesToday({
        piston: 1,
        turbocharger: 1,
      }),
    });

    const result = await shop.purchase("user1", "guild1", "supercharger");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Daily purchase limit/);
    expect(
      mocks.storageManager.dbManager.coreCredits.deductSparks,
    ).not.toHaveBeenCalled();
  });
});
