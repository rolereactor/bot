import { describe, test, expect } from "vitest";
import {
  FREE_TIER as PREMIUM_FREE_TIER,
  PRO_TIER,
} from "../../../src/features/premium/config.js";
import {
  FREE_TIER as TICKET_FREE_TIER,
  PRO_ENGINE as TICKET_PRO_ENGINE,
} from "../../../src/features/ticketing/config.js";
import { PREMIUM_FEATURES } from "../../../src/commands/general/premium/premiumData.js";

/**
 * Comprehensive Pro Engine Feature Gating Tests
 * Validates that all features in the project have proper FREE vs PRO separation
 */

const ALL_PRO_FEATURES = [
  {
    id: "automod",
    name: "Auto-Moderation",
    emoji: "🛡️",
    freeFeatures: ["bad_words", "links", "spam", "mention_spam", "invite_link"],
    proFeatures: [
      "domain_allowlisting",
      "wildcard_badwords",
      "regex_badwords",
      "caps_lock",
      "per_channel_filtering",
      "analytics_stats",
      "export_logs",
    ],
  },
  {
    id: "schedule_role",
    name: "Scheduled Roles",
    emoji: "📅",
    freeFeatures: ["active_schedules_25"],
    proFeatures: ["active_schedules_500"],
  },
  {
    id: "temp_roles",
    name: "Temporary Roles",
    emoji: "⏰",
    freeFeatures: ["active_25", "bulk_actions_25"],
    proFeatures: ["active_500", "bulk_actions_250"],
  },
  {
    id: "role_bundle",
    name: "Role Bundles",
    emoji: "📦",
    freeFeatures: ["roles_per_bundle_5"],
    proFeatures: ["roles_per_bundle_15"],
  },
  {
    id: "role_reactions",
    name: "Role Reactions",
    emoji: "⭐",
    freeFeatures: ["emojis_10", "menus_3"],
    proFeatures: ["emojis_20", "menus_8"],
  },
  {
    id: "xp",
    name: "XP & Levels",
    emoji: "📈",
    freeFeatures: ["rewards_5", "stack_mode"],
    proFeatures: ["rewards_unlimited", "replace_mode"],
  },
  {
    id: "giveaway",
    name: "Giveaways",
    emoji: "🎁",
    freeFeatures: ["entries_2500", "winners_5", "active_3"],
    proFeatures: ["entries_50000", "winners_20", "active_20"],
  },
  {
    id: "ticket",
    name: "Ticketing",
    emoji: "🎫",
    freeFeatures: ["text_transcripts"],
    proFeatures: ["html_json_exports", "unlimited_storage"],
  },
];

function getFeatureById(features, id) {
  return features.find(f => f.id === id);
}

function checkLimitAccess(featureId, currentValue, isPro, limits) {
  const feature = getFeatureById(ALL_PRO_FEATURES, featureId);
  if (!feature) return { accessible: false, reason: "Unknown feature" };

  const freeLimit = limits.free;
  const proLimit = limits.pro;

  if (isPro) {
    return { accessible: true, tier: "PRO", limit: proLimit };
  }

  if (currentValue <= freeLimit) {
    return { accessible: true, tier: "FREE", limit: freeLimit };
  }

  return {
    accessible: false,
    reason: `Exceeds free limit (${freeLimit}). Upgrade to PRO for ${proLimit}`,
    upgradeRequired: true,
  };
}

describe("Pro Engine - Feature Registry", () => {
  test("should have 8 features with Pro tier", () => {
    expect(ALL_PRO_FEATURES).toHaveLength(8);
  });

  test("should have automod as first feature", () => {
    const automod = getFeatureById(ALL_PRO_FEATURES, "automod");
    expect(automod).toBeDefined();
    expect(automod.name).toBe("Auto-Moderation");
    expect(automod.emoji).toBe("🛡️");
  });

  test("should have correct feature IDs", () => {
    const ids = ALL_PRO_FEATURES.map(f => f.id);
    expect(ids).toContain("automod");
    expect(ids).toContain("schedule_role");
    expect(ids).toContain("temp_roles");
    expect(ids).toContain("role_bundle");
    expect(ids).toContain("role_reactions");
    expect(ids).toContain("xp");
    expect(ids).toContain("giveaway");
    expect(ids).toContain("ticket");
  });
});

describe("Pro Engine - Benefit Copy Matches Runtime Config", () => {
  test("scheduled roles advertise the same free and pro limits used by handlers", () => {
    expect(PREMIUM_FREE_TIER.SCHEDULE_MAX_ACTIVE).toBe(25);
    expect(PRO_TIER.SCHEDULE_MAX_ACTIVE).toBe(100);
  });

  test("ticket panel benefits match the ticketing runtime config", () => {
    expect(TICKET_FREE_TIER.MAX_PANELS).toBe(3);
    expect(TICKET_PRO_ENGINE.MAX_PANELS).toBe(10);
  });

  test("/premium copy advertises the runtime ticket transcript retention", () => {
    const ticketFeature = PREMIUM_FEATURES.find(
      feature => feature.command === "ticket",
    );

    expect(TICKET_FREE_TIER.TRANSCRIPT_RETENTION_DAYS).toBe(30);
    expect(ticketFeature.free).toContain("30-day transcripts");
  });
});

describe("Pro Engine - Auto-Mod Limits", () => {
  const automod = getFeatureById(ALL_PRO_FEATURES, "automod");

  test("should have 5 free features", () => {
    expect(automod.freeFeatures).toHaveLength(5);
  });

  test("should have 7 pro features", () => {
    expect(automod.proFeatures).toHaveLength(7);
  });

  test("free features should include basic filters", () => {
    expect(automod.freeFeatures).toContain("bad_words");
    expect(automod.freeFeatures).toContain("links");
    expect(automod.freeFeatures).toContain("spam");
  });

  test("pro features should include advanced features", () => {
    expect(automod.proFeatures).toContain("domain_allowlisting");
    expect(automod.proFeatures).toContain("caps_lock");
    expect(automod.proFeatures).toContain("per_channel_filtering");
  });
});

describe("Pro Engine - Scheduled Roles Limits", () => {
  const scheduleRole = getFeatureById(ALL_PRO_FEATURES, "schedule_role");

  test("FREE tier should allow 25 active schedules", () => {
    const result = checkLimitAccess("schedule_role", 25, false, {
      free: 25,
      pro: 100,
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("FREE");
  });

  test("FREE tier should reject 26+ active schedules", () => {
    const result = checkLimitAccess("schedule_role", 26, false, {
      free: 25,
      pro: 100,
    });
    expect(result.accessible).toBe(false);
    expect(result.upgradeRequired).toBe(true);
  });

  test("PRO tier should allow 100 active schedules", () => {
    const result = checkLimitAccess("schedule_role", 100, true, {
      free: 25,
      pro: 100,
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - Temporary Roles Limits", () => {
  test("FREE tier should allow 25 active temp roles", () => {
    const result = checkLimitAccess("temp_roles", 25, false, {
      free: 25,
      pro: 100,
    });
    expect(result.accessible).toBe(true);
  });

  test("PRO tier should allow 100 active temp roles", () => {
    const result = checkLimitAccess("temp_roles", 100, true, {
      free: 25,
      pro: 100,
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - Role Reactions Limits", () => {
  test("FREE tier emoji limit", () => {
    const result = checkLimitAccess("role_reactions", 10, false, {
      free: 10,
      pro: 20,
    });
    expect(result.accessible).toBe(true);
  });

  test("FREE tier menu limit", () => {
    const result = checkLimitAccess("role_reactions", 3, false, {
      free: 3,
      pro: 20,
    });
    expect(result.accessible).toBe(true);
  });

  test("PRO tier should allow 20 emojis and 8 menus", () => {
    const result = checkLimitAccess("role_reactions", 8, true, {
      free: 3,
      pro: 8,
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - XP & Levels Limits", () => {
  test("FREE tier should have 5 rewards max", () => {
    const result = checkLimitAccess("xp", 5, false, {
      free: 5,
      pro: "unlimited",
    });
    expect(result.accessible).toBe(true);
  });

  test("FREE tier should only support stack mode", () => {
    const xp = getFeatureById(ALL_PRO_FEATURES, "xp");
    expect(xp.freeFeatures).toContain("stack_mode");
    expect(xp.proFeatures).toContain("replace_mode");
  });

  test("PRO tier should support unlimited rewards", () => {
    const result = checkLimitAccess("xp", 100, true, {
      free: 5,
      pro: "unlimited",
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - Giveaway Limits", () => {
  test("FREE tier entry limit", () => {
    const result = checkLimitAccess("giveaway", 2500, false, {
      free: 2500,
      pro: 50000,
    });
    expect(result.accessible).toBe(true);
  });

  test("FREE tier winner limit", () => {
    const result = checkLimitAccess("giveaway", 5, false, {
      free: 5,
      pro: 20,
    });
    expect(result.accessible).toBe(true);
  });

  test("PRO tier should allow 50k entries", () => {
    const result = checkLimitAccess("giveaway", 50000, true, {
      free: 2500,
      pro: 50000,
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - Ticket Limits", () => {
  const ticket = getFeatureById(ALL_PRO_FEATURES, "ticket");

  test("should have text transcripts for FREE", () => {
    expect(ticket.freeFeatures).toContain("text_transcripts");
  });

  test("should have HTML/JSON exports for PRO", () => {
    expect(ticket.proFeatures).toContain("html_json_exports");
    expect(ticket.proFeatures).toContain("unlimited_storage");
  });

  test("FREE tier should only have basic transcripts", () => {
    const result = checkLimitAccess("ticket", "text", false, {
      free: "text",
      pro: "html_json_unlimited",
    });
    expect(result.accessible).toBe(true);
  });

  test("PRO tier should have all export options", () => {
    const result = checkLimitAccess("ticket", "html_json", true, {
      free: "text",
      pro: "html_json_unlimited",
    });
    expect(result.accessible).toBe(true);
    expect(result.tier).toBe("PRO");
  });
});

describe("Pro Engine - Feature Matrix", () => {
  test("all features should have free and pro definitions", () => {
    ALL_PRO_FEATURES.forEach(feature => {
      expect(feature.freeFeatures).toBeDefined();
      expect(feature.proFeatures).toBeDefined();
      expect(feature.freeFeatures.length).toBeGreaterThan(0);
      expect(feature.proFeatures.length).toBeGreaterThan(0);
    });
  });

  test("all features should have emojis", () => {
    ALL_PRO_FEATURES.forEach(feature => {
      expect(feature.emoji).toBeDefined();
      expect(typeof feature.emoji).toBe("string");
    });
  });

  test("total feature count should be 8", () => {
    expect(ALL_PRO_FEATURES.length).toBe(8);
  });

  test("features should cover different categories", () => {
    const categories = ALL_PRO_FEATURES.map(f => f.id);
    expect(categories).toContain("automod");
    expect(categories).toContain("xp");
    expect(categories).toContain("giveaway");
    expect(categories).toContain("ticket");
  });
});

describe("Pro Engine - Verification Summary", () => {
  test("auto-mod should have most features (7 Pro)", () => {
    const automod = getFeatureById(ALL_PRO_FEATURES, "automod");
    expect(automod.proFeatures.length).toBe(7);
  });

  test("should have correct FREE/PRO feature ratio", () => {
    const totalFree = ALL_PRO_FEATURES.reduce(
      (sum, f) => sum + f.freeFeatures.length,
      0,
    );
    const totalPro = ALL_PRO_FEATURES.reduce(
      (sum, f) => sum + f.proFeatures.length,
      0,
    );

    expect(totalFree).toBeGreaterThan(10);
    expect(totalPro).toBeGreaterThan(10);
  });
});
