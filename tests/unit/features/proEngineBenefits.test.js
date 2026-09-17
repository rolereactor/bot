import { describe, it, expect } from "vitest";
import {
  FREE_TIER,
  PRO_TIER,
  PremiumFeatures,
  ProTrialConfig,
} from "../../../src/features/premium/config.js";
import { PREMIUM_FEATURES } from "../../../src/commands/general/premium/premiumData.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const coreEnergyMd = readFileSync(
  resolve(import.meta.dirname, "../../../docs/CORE_ENERGY.md"),
  "utf-8",
);

// Extract the benefits table from CORE_ENERGY.md
function parseBenefitsTable() {
  const lines = coreEnergyMd.split("\n");
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("| **") && !line.startsWith("| Feature")) {
      const cells = line
        .split("|")
        .map(c => c.trim())
        .filter(Boolean);
      if (cells.length >= 3) {
        rows.push({
          feature: cells[0].replace(/\*\*/g, ""),
          free: cells[1],
          pro: cells[2].replace(/\*\*/g, ""),
        });
      }
    }
  }
  return rows;
}

describe("Pro Engine Benefits", () => {
  describe("Config limits — free tier is always less than pro tier", () => {
    const limitPairs = [
      ["GIVEAWAY_MAX_ACTIVE", "Giveaway active count"],
      ["GIVEAWAY_MAX_ENTRIES", "Giveaway entries"],
      ["GIVEAWAY_MAX_WINNERS", "Giveaway winners"],
      ["SCHEDULE_MAX_ACTIVE", "Scheduled roles"],
      ["BULK_ACTION_MAX_MEMBERS", "Bulk action members"],
      ["ROLE_BUNDLE_MAX_ROLES", "Role bundle roles"],
      ["ROLE_REACTION_MAX_EMOJIS", "Role reaction emojis"],
      ["ROLE_REACTION_MAX_MESSAGES", "Role reaction menus"],
      ["TICKET_MAX_PANELS", "Ticket panels"],
      ["TICKET_MAX_TICKETS_PER_MONTH", "Ticket monthly limit"],
    ];

    for (const [key, label] of limitPairs) {
      it(`${label}: free (${FREE_TIER[key]}) < pro (${PRO_TIER[key]})`, () => {
        expect(FREE_TIER[key]).toBeLessThan(PRO_TIER[key]);
      });
    }

    it("Level Rewards: free (5) < pro (unlimited = -1)", () => {
      expect(FREE_TIER.LEVEL_REWARDS_MAX).toBe(5);
      expect(PRO_TIER.LEVEL_REWARDS_MAX).toBe(-1);
    });
  });



  describe("Transcript retention — pro is unlimited (-1)", () => {
    it("free has 30-day retention", () => {
      expect(FREE_TIER.TICKET_TRANSCRIPT_DAYS).toBe(30);
    });

    it("pro has unlimited retention (-1)", () => {
      expect(PRO_TIER.TICKET_TRANSCRIPT_DAYS).toBe(-1);
    });
  });

  describe("Level rewards — pro is unlimited (-1) with replace mode", () => {
    it("free has 5 reward max", () => {
      expect(FREE_TIER.LEVEL_REWARDS_MAX).toBe(5);
    });

    it("pro has unlimited rewards (-1)", () => {
      expect(PRO_TIER.LEVEL_REWARDS_MAX).toBe(-1);
    });

    it("free reward mode is stack only", () => {
      expect(FREE_TIER.REWARD_MODE).toBe("stack");
    });
  });

  describe("Premium feature config", () => {
    it("costs 20 Cores per week", () => {
      expect(PremiumFeatures.PRO.cost).toBe(20);
    });

    it("has 7-day billing cycle", () => {
      expect(PremiumFeatures.PRO.periodDays).toBe(7);
    });

    it("trial is enabled", () => {
      expect(ProTrialConfig.enabled).toBe(true);
    });

    it("trial lasts 7 days", () => {
      expect(ProTrialConfig.durationDays).toBe(7);
    });

    it("trial is one-time only", () => {
      expect(ProTrialConfig.oneTimeOnly).toBe(true);
    });
  });

  describe("No missing or extra keys in config", () => {
    const expectedFreeKeys = [
      "LEVEL_REWARDS_MAX",
      "REWARD_MODE",
      "GIVEAWAY_MAX_ACTIVE",
      "GIVEAWAY_MAX_ENTRIES",
      "GIVEAWAY_MAX_WINNERS",
      "SCHEDULE_MAX_ACTIVE",
      "BULK_ACTION_MAX_MEMBERS",
      "ROLE_BUNDLE_MAX_ROLES",
      "ROLE_BUNDLE_MAX_ACTIVE",
      "ROLE_REACTION_MAX_EMOJIS",
      "ROLE_REACTION_MAX_ROLES",
      "ROLE_REACTION_MAX_ROLES_PER_EMOJI",
      "ROLE_REACTION_MAX_MESSAGES",
      "CUSTOM_VARIABLES_MAX",
      "CUSTOM_EVENT_TRIGGERS_MAX",
      "CUSTOM_EVENT_TYPES",
      "TICKET_MAX_PANELS",
      "TICKET_MAX_TICKETS_PER_MONTH",
      "TICKET_TRANSCRIPT_DAYS",
    ];
    const expectedProKeys = [
      "LEVEL_REWARDS_MAX",
      "GIVEAWAY_MAX_ACTIVE",
      "GIVEAWAY_MAX_ENTRIES",
      "GIVEAWAY_MAX_WINNERS",
      "SCHEDULE_MAX_ACTIVE",
      "BULK_ACTION_MAX_MEMBERS",
      "ROLE_BUNDLE_MAX_ROLES",
      "ROLE_BUNDLE_MAX_ACTIVE",
      "ROLE_REACTION_MAX_EMOJIS",
      "ROLE_REACTION_MAX_ROLES",
      "ROLE_REACTION_MAX_ROLES_PER_EMOJI",
      "ROLE_REACTION_MAX_MESSAGES",
      "CUSTOM_VARIABLES_MAX",
      "CUSTOM_EVENT_TRIGGERS_MAX",
      "CUSTOM_EVENT_TYPES",
      "TICKET_MAX_PANELS",
      "TICKET_MAX_TICKETS_PER_MONTH",
      "TICKET_TRANSCRIPT_DAYS",
    ];

    it("FREE_TIER has exactly the expected keys", () => {
      const actual = Object.keys(FREE_TIER).sort();
      expect(actual).toEqual([...expectedFreeKeys].sort());
    });

    it("PRO_TIER has exactly the expected keys", () => {
      const actual = Object.keys(PRO_TIER).sort();
      expect(actual).toEqual([...expectedProKeys].sort());
    });
  });

  describe("All features have display data in premiumData.js", () => {
    const expectedCommands = [
      "automod",
      "schedule-role",
      "temp-roles",
      "role-bundle",
      "role-reactions",
      "xp",
      "giveaway",
      "ticket",
    ];

    it("PREMIUM_FEATURES contains all expected commands", () => {
      const actual = PREMIUM_FEATURES.map(f => f.command);
      for (const cmd of expectedCommands) {
        expect(actual).toContain(cmd);
      }
    });

    it("PREMIUM_FEATURES has no unexpected commands", () => {
      const actual = PREMIUM_FEATURES.map(f => f.command);
      for (const cmd of actual) {
        expect(expectedCommands).toContain(cmd);
      }
    });

    it("every feature has name, emoji, free, and pro fields", () => {
      for (const f of PREMIUM_FEATURES) {
        expect(f.name).toBeTruthy();
        expect(f.emoji).toBeTruthy();
        expect(f.free).toBeTruthy();
        expect(f.pro).toBeTruthy();
      }
    });
  });

  describe("CORE_ENERGY.md table matches config", () => {
    const table = parseBenefitsTable();

    it("has rows for all key features", () => {
      const featureNames = table.map(r => r.feature);
      expect(featureNames).toContain("Giveaway Entries");
      expect(featureNames).toContain("Giveaway Winners");
      expect(featureNames).toContain("Scheduled Roles");
      expect(featureNames).toContain("Ticket Panels");
      expect(featureNames).toContain("Ticket Capacity");
      expect(featureNames).toContain("Bulk Actions");
      expect(featureNames).toContain("Level Rewards");
      expect(featureNames).toContain("Role Reaction Panels");
      expect(featureNames).toContain("Role Reaction Emojis");
    });

    it("Giveaway Entries matches config", () => {
      const row = table.find(r => r.feature === "Giveaway Entries");
      expect(row.free.replace(/,/g, "")).toBe(String(FREE_TIER.GIVEAWAY_MAX_ENTRIES));
      expect(row.pro.replace(/,/g, "")).toBe(String(PRO_TIER.GIVEAWAY_MAX_ENTRIES));
    });

    it("Giveaway Winners matches config", () => {
      const row = table.find(r => r.feature === "Giveaway Winners");
      expect(row.free).toBe(String(FREE_TIER.GIVEAWAY_MAX_WINNERS));
      expect(row.pro).toBe(String(PRO_TIER.GIVEAWAY_MAX_WINNERS));
    });

    it("Scheduled Roles matches config", () => {
      const row = table.find(r => r.feature === "Scheduled Roles");
      expect(row.free).toContain(String(FREE_TIER.SCHEDULE_MAX_ACTIVE));
      expect(row.pro).toContain(String(PRO_TIER.SCHEDULE_MAX_ACTIVE));
    });

    it("Ticket Panels matches config", () => {
      const row = table.find(r => r.feature === "Ticket Panels");
      expect(row.free).toContain(String(FREE_TIER.TICKET_MAX_PANELS));
      expect(row.pro).toContain(String(PRO_TIER.TICKET_MAX_PANELS));
    });

    it("Ticket Capacity matches config", () => {
      const row = table.find(r => r.feature === "Ticket Capacity");
      expect(row.free).toContain(String(FREE_TIER.TICKET_MAX_TICKETS_PER_MONTH));
      expect(row.pro).toContain(String(PRO_TIER.TICKET_MAX_TICKETS_PER_MONTH));
    });

    it("Transcript Storage matches config", () => {
      const row = table.find(r => r.feature === "Transcript Storage");
      expect(row.free).toContain(String(FREE_TIER.TICKET_TRANSCRIPT_DAYS));
      expect(row.pro).toContain("Unlimited");
    });

    it("Bulk Actions matches config", () => {
      const row = table.find(r => r.feature === "Bulk Actions");
      expect(row.free).toContain(String(FREE_TIER.BULK_ACTION_MAX_MEMBERS));
      expect(row.pro).toContain(String(PRO_TIER.BULK_ACTION_MAX_MEMBERS));
    });

    it("Level Rewards matches config", () => {
      const row = table.find(r => r.feature === "Level Rewards");
      expect(row.free).toContain(String(FREE_TIER.LEVEL_REWARDS_MAX));
      expect(row.pro).toContain("Unlimited");
    });

    it("Role Reaction Panels matches config", () => {
      const row = table.find(r => r.feature === "Role Reaction Panels");
      expect(row.free).toBe(String(FREE_TIER.ROLE_REACTION_MAX_MESSAGES));
      expect(row.pro).toBe(String(PRO_TIER.ROLE_REACTION_MAX_MESSAGES));
    });

    it("Role Reaction Emojis matches config", () => {
      const row = table.find(r => r.feature === "Role Reaction Emojis");
      expect(row.free).toBe(String(FREE_TIER.ROLE_REACTION_MAX_EMOJIS));
      expect(row.pro).toBe(String(PRO_TIER.ROLE_REACTION_MAX_EMOJIS));
    });
  });

  describe("Display data matches config values", () => {
    function findFeature(name) {
      return PREMIUM_FEATURES.find(f => f.command === name);
    }

    function extractNumber(text, pattern) {
      const match = text.match(pattern);
      return match ? Number(match[1].replace(/,/g, "")) : null;
    }

    it("role-reactions display matches config", () => {
      const f = findFeature("role-reactions");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) panels/)).toBe(
        FREE_TIER.ROLE_REACTION_MAX_MESSAGES,
      );
      expect(extractNumber(f.free, /(\d+) emojis/)).toBe(
        FREE_TIER.ROLE_REACTION_MAX_EMOJIS,
      );
      expect(extractNumber(f.pro, /(\d+) panels/)).toBe(
        PRO_TIER.ROLE_REACTION_MAX_MESSAGES,
      );
      expect(extractNumber(f.pro, /(\d+) emojis/)).toBe(
        PRO_TIER.ROLE_REACTION_MAX_EMOJIS,
      );
    });

    it("role-bundle display matches config", () => {
      const f = findFeature("role-bundle");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) roles/)).toBe(
        FREE_TIER.ROLE_BUNDLE_MAX_ROLES,
      );
      expect(extractNumber(f.pro, /(\d+) roles/)).toBe(
        PRO_TIER.ROLE_BUNDLE_MAX_ROLES,
      );
    });

    it("giveaway display matches config", () => {
      const f = findFeature("giveaway");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /([\d,]+) entries/)).toBe(
        FREE_TIER.GIVEAWAY_MAX_ENTRIES,
      );
      expect(extractNumber(f.free, /(\d+) winners/)).toBe(
        FREE_TIER.GIVEAWAY_MAX_WINNERS,
      );
      expect(extractNumber(f.free, /(\d+) active/)).toBe(
        FREE_TIER.GIVEAWAY_MAX_ACTIVE,
      );
      expect(extractNumber(f.pro, /([\d,]+) entries/)).toBe(
        PRO_TIER.GIVEAWAY_MAX_ENTRIES,
      );
      expect(extractNumber(f.pro, /(\d+) winners/)).toBe(
        PRO_TIER.GIVEAWAY_MAX_WINNERS,
      );
      expect(extractNumber(f.pro, /(\d+) active/)).toBe(
        PRO_TIER.GIVEAWAY_MAX_ACTIVE,
      );
    });

    it("schedule-role display matches config", () => {
      const f = findFeature("schedule-role");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) active/)).toBe(
        FREE_TIER.SCHEDULE_MAX_ACTIVE,
      );
      expect(extractNumber(f.pro, /(\d+) active/)).toBe(
        PRO_TIER.SCHEDULE_MAX_ACTIVE,
      );
    });

    it("temp-roles display matches config", () => {
      const f = findFeature("temp-roles");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) active/)).toBe(
        FREE_TIER.SCHEDULE_MAX_ACTIVE,
      );
      expect(extractNumber(f.free, /(\d+) bulk/)).toBe(
        FREE_TIER.BULK_ACTION_MAX_MEMBERS,
      );
      expect(extractNumber(f.pro, /(\d+) active/)).toBe(
        PRO_TIER.SCHEDULE_MAX_ACTIVE,
      );
      expect(extractNumber(f.pro, /(\d+) bulk/)).toBe(
        PRO_TIER.BULK_ACTION_MAX_MEMBERS,
      );
    });

    it("ticket display matches config", () => {
      const f = findFeature("ticket");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) panels/)).toBe(
        FREE_TIER.TICKET_MAX_PANELS,
      );
      expect(extractNumber(f.free, /(\d+) tickets/)).toBe(
        FREE_TIER.TICKET_MAX_TICKETS_PER_MONTH,
      );
      expect(extractNumber(f.pro, /(\d+) panels/)).toBe(
        PRO_TIER.TICKET_MAX_PANELS,
      );
      expect(extractNumber(f.pro, /(\d+) tickets/)).toBe(
        PRO_TIER.TICKET_MAX_TICKETS_PER_MONTH,
      );
    });

    it("xp display matches config", () => {
      const f = findFeature("xp");
      expect(f).toBeDefined();
      expect(extractNumber(f.free, /(\d+) rewards/)).toBe(
        FREE_TIER.LEVEL_REWARDS_MAX,
      );
      expect(f.free).toContain("Stack");
      expect(f.pro).toContain("Unlimited");
      expect(f.pro).toContain("Replace");
    });
  });

  describe("PremiumFeatures.PRO.includes mentions all features", () => {
    const includes = PremiumFeatures.PRO.includes.join("\n").toLowerCase();

    it("mentions Role Reactions with correct limits", () => {
      expect(includes).toContain("role reactions");
      expect(includes).toContain(`${PRO_TIER.ROLE_REACTION_MAX_EMOJIS} emojis`);
      expect(includes).toContain(`${PRO_TIER.ROLE_REACTION_MAX_MESSAGES} panels`);
    });

    it("mentions Role Bundles with correct limit", () => {
      expect(includes).toContain("role bundles");
      expect(includes).toContain(
        `${PRO_TIER.ROLE_BUNDLE_MAX_ROLES} roles per bundle`,
      );
    });

    it("mentions Ticket capacity", () => {
      expect(includes).toContain(`${PRO_TIER.TICKET_MAX_TICKETS_PER_MONTH}/month`);
      expect(includes).toContain(`${PRO_TIER.TICKET_MAX_PANELS} panels`);
    });

    it("mentions Scheduled Roles", () => {
      expect(includes).toContain(`${PRO_TIER.SCHEDULE_MAX_ACTIVE} active`);
    });

    it("mentions Bulk Actions", () => {
      expect(includes).toContain(`${PRO_TIER.BULK_ACTION_MAX_MEMBERS} users`);
    });

    it("mentions Giveaways", () => {
      expect(includes).toContain(`${PRO_TIER.GIVEAWAY_MAX_ENTRIES.toLocaleString()} entries`);
      expect(includes).toContain(`${PRO_TIER.GIVEAWAY_MAX_WINNERS} winners`);
    });
  });
});
