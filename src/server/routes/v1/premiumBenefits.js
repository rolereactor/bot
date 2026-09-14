import express from "express";
import { FREE_TIER, PRO_TIER } from "../../../features/premium/config.js";

const router = express.Router();

/**
 * Benefit definitions — single source of truth.
 * Display metadata lives here; numeric values come from premium/config.js.
 */
const BENEFITS = [
  // Role Reactions
  {
    name: "Reaction Messages",
    freeKey: "ROLE_REACTION_MAX_MESSAGES",
    proKey: "ROLE_REACTION_MAX_MESSAGES",
    tooltip: "Maximum role reaction menus you can create per server",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Emojis per Message",
    freeKey: "ROLE_REACTION_MAX_EMOJIS",
    proKey: "ROLE_REACTION_MAX_EMOJIS",
    tooltip: "Maximum emojis/roles per reaction message",
    type: "limit",
    category: "Role Reactions",
  },
  {
    name: "Max Usage Limits",
    free: true,
    pro: true,
    tooltip: "Set maximum number of users who can claim a reaction role",
    type: "feature",
    category: "Role Reactions",
  },

  // Giveaways
  {
    name: "Active Giveaways",
    freeKey: "GIVEAWAY_MAX_ACTIVE",
    proKey: "GIVEAWAY_MAX_ACTIVE",
    tooltip: "Maximum concurrent giveaways running at once",
    type: "limit",
    category: "Giveaways",
  },
  {
    name: "Max Entries",
    freeKey: "GIVEAWAY_MAX_ENTRIES",
    proKey: "GIVEAWAY_MAX_ENTRIES",
    tooltip: "Maximum participants per giveaway",
    type: "limit",
    category: "Giveaways",
    format: "number",
  },
  {
    name: "Max Winners",
    freeKey: "GIVEAWAY_MAX_WINNERS",
    proKey: "GIVEAWAY_MAX_WINNERS",
    tooltip: "Maximum winners per giveaway",
    type: "limit",
    category: "Giveaways",
  },

  // Leveling
  {
    name: "Level Rewards",
    freeKey: "LEVEL_REWARDS_MAX",
    proValue: "Unlimited",
    tooltip: "Maximum role rewards for level-ups",
    type: "limit",
    category: "Leveling",
  },
  {
    name: "Replace Role Mode",
    free: false,
    pro: true,
    tooltip: "Replace lower roles instead of stacking them",
    type: "feature",
    category: "Leveling",
  },

  // Automation
  {
    name: "Scheduled Roles",
    freeKey: "SCHEDULE_MAX_ACTIVE",
    proKey: "SCHEDULE_MAX_ACTIVE",
    tooltip: "Maximum scheduled role assignments",
    type: "limit",
    category: "Automation",
  },
  {
    name: "Role Bundles",
    freeKey: "ROLE_BUNDLE_MAX_ROLES",
    proKey: "ROLE_BUNDLE_MAX_ROLES",
    tooltip: "Reusable groups of roles for quick setup",
    type: "limit",
    category: "Automation",
  },
  {
    name: "Bulk Actions",
    freeKey: "BULK_ACTION_MAX_MEMBERS",
    proKey: "BULK_ACTION_MAX_MEMBERS",
    tooltip: "Maximum users per bulk moderation action",
    type: "limit",
    category: "Automation",
  },

  // Ticketing
  {
    name: "Tickets per Month",
    freeKey: "TICKET_MAX_TICKETS_PER_MONTH",
    proKey: "TICKET_MAX_TICKETS_PER_MONTH",
    tooltip: "Monthly ticket creation limit",
    type: "limit",
    category: "Ticketing",
  },
  {
    name: "Categories per Panel",
    freeKey: "TICKET_MAX_PANELS",
    proKey: "TICKET_MAX_PANELS",
    tooltip: "Maximum ticket categories per panel",
    type: "limit",
    category: "Ticketing",
  },
  {
    name: "Transcript Retention",
    freeKey: "TICKET_TRANSCRIPT_DAYS",
    proKey: "TICKET_TRANSCRIPT_DAYS",
    tooltip: "How long closed ticket transcripts are stored",
    type: "limit",
    category: "Ticketing",
    freeSuffix: " days",
    proValue: "Unlimited",
  },
  {
    name: "Export Formats",
    freeValue: "MD",
    proValue: "HTML, JSON",
    tooltip: "Transcript export format options",
    type: "feature",
    category: "Ticketing",
  },
  {
    name: "Staff Analytics",
    free: false,
    pro: true,
    tooltip: "Track staff ticket handling performance",
    type: "feature",
    category: "Ticketing",
  },
  {
    name: "Ticket Automation",
    free: false,
    pro: true,
    tooltip: "Auto-close, reminders, and escalation rules",
    type: "feature",
    category: "Ticketing",
  },

  // Auto-Moderation
  {
    name: "Domain Allowlisting",
    free: false,
    pro: true,
    tooltip: "Whitelist trusted domains while blocking all other links",
    type: "feature",
    category: "Auto-Moderation",
  },
  {
    name: "Wildcard Filters",
    free: false,
    pro: true,
    tooltip: "Use wildcard patterns (e.g. *spam*) for flexible word filtering",
    type: "feature",
    category: "Auto-Moderation",
  },
  {
    name: "Regex Filters",
    free: false,
    pro: true,
    tooltip: "Advanced regex patterns for precise content moderation",
    type: "feature",
    category: "Auto-Moderation",
  },
];

function resolveValue(def, tier, key) {
  if (key in def) return def[key];
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
router.get("/", (_req, res) => {
  const benefits = BENEFITS.map((def) => ({
    name: def.name,
    category: def.category,
    tooltip: def.tooltip,
    type: def.type,
    free: formatLimit(resolveValue(def, FREE_TIER, "free"), def, "free"),
    pro: formatLimit(resolveValue(def, PRO_TIER, "pro"), def, "pro"),
  }));

  res.json({ success: true, benefits });
});

export default router;
