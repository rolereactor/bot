import express from "express";
import { FREE_TIER, PRO_TIER, PremiumFeatures } from "../../../features/premium/config.js";
import config from "../../../config/config.js";

const router = express.Router();

/**
 * Benefit definitions — single source of truth.
 * Display metadata lives here; numeric values come from premium/config.js.
 */
const BENEFITS = [
  // Role Reactions
  {
    name: "Reaction Panels",
    freeKey: "ROLE_REACTION_MAX_MESSAGES",
    proKey: "ROLE_REACTION_MAX_MESSAGES",
    tooltip: "Number of role-assignment panels you can set up in your server",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Emojis per Panel",
    freeKey: "ROLE_REACTION_MAX_EMOJIS",
    proKey: "ROLE_REACTION_MAX_EMOJIS",
    tooltip: "How many emojis (role options) you can add to a single panel",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Roles per Emoji",
    freeKey: "ROLE_REACTION_MAX_ROLES_PER_EMOJI",
    proKey: "ROLE_REACTION_MAX_ROLES_PER_EMOJI",
    tooltip: "How many roles a single emoji can assign at once",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Roles per Bundle",
    freeKey: "ROLE_BUNDLE_MAX_ROLES",
    proKey: "ROLE_BUNDLE_MAX_ROLES",
    tooltip: "How many roles can be saved in a single bundle",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Bundle Slots",
    freeKey: "ROLE_BUNDLE_MAX_ACTIVE",
    proKey: "ROLE_BUNDLE_MAX_ACTIVE",
    tooltip: "How many role bundles you can create per server",
    type: "limit",
    category: "Role Reactions",
  },

  // Giveaways
  {
    name: "Active Giveaways",
    freeKey: "GIVEAWAY_MAX_ACTIVE",
    proKey: "GIVEAWAY_MAX_ACTIVE",
    tooltip: "How many giveaways can run at the same time",
    type: "limit",
    category: "Giveaways",
  },
  {
    name: "Max Entries",
    freeKey: "GIVEAWAY_MAX_ENTRIES",
    proKey: "GIVEAWAY_MAX_ENTRIES",
    tooltip: "How many people can enter a single giveaway",
    type: "limit",
    category: "Giveaways",
    format: "number",
  },
  {
    name: "Max Winners",
    freeKey: "GIVEAWAY_MAX_WINNERS",
    proKey: "GIVEAWAY_MAX_WINNERS",
    tooltip: "How many winners can be picked per giveaway",
    type: "limit",
    category: "Giveaways",
  },

  // Leveling
  {
    name: "Level Rewards",
    freeKey: "LEVEL_REWARDS_MAX",
    proValue: "Unlimited",
    tooltip: "Number of role rewards users can earn as they level up",
    type: "limit",
    category: "Leveling",
  },
  {
    name: "Replace Role Mode",
    free: false,
    pro: true,
    tooltip: "Swap out lower roles when a higher one is earned, instead of stacking all of them",
    type: "feature",
    category: "Leveling",
  },

  // Automation
  {
    name: "Scheduled Roles",
    freeKey: "SCHEDULE_MAX_ACTIVE",
    proKey: "SCHEDULE_MAX_ACTIVE",
    tooltip: "Automatically assign or remove roles on a timer",
    type: "limit",
    category: "Automation",
  },
  {
    name: "Bulk Actions",
    freeKey: "BULK_ACTION_MAX_MEMBERS",
    proKey: "BULK_ACTION_MAX_MEMBERS",
    tooltip: "Add or remove roles from many members in one command",
    type: "limit",
    category: "Automation",
  },

  // Ticketing
  {
    name: "Tickets per Month",
    freeKey: "TICKET_MAX_TICKETS_PER_MONTH",
    proKey: "TICKET_MAX_TICKETS_PER_MONTH",
    tooltip: "How many support tickets can be opened each month",
    type: "limit",
    category: "Ticketing",
  },
  {
    name: "Categories per Panel",
    freeKey: "TICKET_MAX_PANELS",
    proKey: "TICKET_MAX_PANELS",
    tooltip: "Separate topic channels within a ticket panel (e.g. Billing, Tech Support)",
    type: "limit",
    category: "Ticketing",
  },
  {
    name: "Transcript Retention",
    freeKey: "TICKET_TRANSCRIPT_DAYS",
    proKey: "TICKET_TRANSCRIPT_DAYS",
    tooltip: "How long closed ticket logs are kept before auto-deletion",
    type: "limit",
    category: "Ticketing",
    freeSuffix: " days",
    proValue: "Unlimited",
  },
  {
    name: "Export Formats",
    freeValue: "MD",
    proValue: "HTML, JSON",
    tooltip: "Download ticket transcripts as formatted files",
    type: "feature",
    category: "Ticketing",
  },
  {
    name: "Staff Analytics",
    free: false,
    pro: true,
    tooltip: "See how quickly your support team responds to tickets",
    type: "feature",
    category: "Ticketing",
  },
  {
    name: "Ticket Automation",
    free: false,
    pro: true,
    tooltip: "Auto-close inactive tickets and send reminder alerts",
    type: "feature",
    category: "Ticketing",
  },

  // Auto-Moderation
  {
    name: "Domain Allowlisting",
    free: false,
    pro: true,
    tooltip: "Allow specific websites while blocking all other links",
    type: "feature",
    category: "Auto-Moderation",
  },
  {
    name: "Wildcard Filters",
    free: false,
    pro: true,
    tooltip: "Block words using patterns like *spam* to catch variations",
    type: "feature",
    category: "Auto-Moderation",
  },
  {
    name: "Regex Filters",
    free: false,
    pro: true,
    tooltip: "Use regular expressions for advanced content filtering",
    type: "feature",
    category: "Auto-Moderation",
  },
];

function resolveValue(def, tier, key) {
  if (key === "free") {
    if (def.free !== undefined) return def.free;
    if (def.freeKey) return tier[def.freeKey];
    if (def.freeValue !== undefined) return def.freeValue;
  }
  if (key === "pro") {
    if (def.pro !== undefined) return def.pro;
    if (def.proKey) return tier[def.proKey];
    if (def.proValue !== undefined) return def.proValue;
  }
  if (key === "freeSub" && def.freeSub) return tier[def.freeSub];
  if (key === "proSub" && def.proSub) return tier[def.proSub];
  return null;
}

function formatLimit(value, def, side) {
  if (typeof value === "boolean") return value;
  if (value === -1) return "Unlimited";
  if (typeof value === "number") {
    if (def.format === "number") return value.toLocaleString();
    const suffix = side === "free" ? (def.freeSuffix || "") : (def.proSuffix || "");
    return `${value}${suffix}`;
  }
  return String(value);
}

// GET /api/v1/premium/benefits — public, no auth required
router.get("/benefits", (_req, res) => {
  const benefits = BENEFITS.map((def) => {
    const free = formatLimit(resolveValue(def, FREE_TIER, "free"), def, "free");
    const pro = formatLimit(resolveValue(def, PRO_TIER, "pro"), def, "pro");

    // Handle merged limits (e.g., "3 bundles × 3 roles each")
    if (def.freeSub) {
      const freeSubVal = resolveValue(def, FREE_TIER, "freeSub") ?? resolveValue(def, FREE_TIER, "proSub");
      const proSubVal = resolveValue(def, PRO_TIER, "proSub") ?? resolveValue(def, PRO_TIER, "freeSub");
      return {
        name: def.name,
        category: def.category,
        tooltip: def.tooltip,
        type: def.type,
        free: freeSubVal ? `${free} bundles × ${freeSubVal} roles each` : free,
        pro: proSubVal ? `${pro} bundles × ${proSubVal} roles each` : pro,
      };
    }

    return {
      name: def.name,
      category: def.category,
      tooltip: def.tooltip,
      type: def.type,
      free,
      pro,
    };
  });

  const proFeature = PremiumFeatures.PRO;
  const packages = config.corePricing?.packages || {};
  const bmacMultiplier = config.corePricing?.coreSystem?.bmacFeeMultiplier || 0.85;

  const rateCard = Object.entries(packages)
    .filter(([, pkg]) => !pkg.hidden)
    .map(([, pkg]) => ({
      price: pkg.price,
      name: pkg.name,
      totalCores: pkg.totalCores,
      rate: pkg.rate,
    }))
    .sort((a, b) => a.price - b.price);

  const bmacRateCard = Object.entries(packages)
    .filter(([, pkg]) => !pkg.hidden)
    .map(([, pkg]) => ({
      price: pkg.price,
      name: pkg.name,
      totalCores: Math.floor(pkg.totalCores * bmacMultiplier),
      rate: parseFloat((pkg.rate * bmacMultiplier).toFixed(2)),
    }))
    .sort((a, b) => a.price - b.price);

  res.json({
    success: true,
    benefits,
    pricing: {
      pro: {
        cost: proFeature.cost,
        period: proFeature.period,
        periodDays: proFeature.periodDays,
      },
      rateCard,
      bmacRateCard,
    },
  });
});

export default router;
