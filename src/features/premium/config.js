// Global core status constants
const isProduction = process.env.NODE_ENV === "production";

export const CORE_STATUS = {
  REGULAR: {
    id: 0,
    label: "Regular",
    emoji: null,
  },
  PRO: {
    id: 1,
    label: "Pro Engine",
    emoji: isProduction
      ? "<:pro_engine:1485227111558938704>"
      : "<:pro_engine:1484831093818527804>",
  },
};

export const PremiumFeatures = {
  PRO: {
    id: "pro_engine",
    name: "Pro Engine",
    description:
      "Unlock all premium features, automated tools, and advanced customization",
    cost: 20, // Cores (weekly cycle)
    period: "week",
    periodDays: 7,
    includes: [
      "5x Ticket Capacity (250/month, 10 panels)",
      "Advanced Ticket Automation & HTML Transcripts",
      "Unlimited Transcript Storage (Free: 30 days)",
      "Unlimited Level-Up Rewards & 'Replace Role' Mode",
      "High-Capacity Giveaways (Up to 10,000 entries & 10 winners)",
      "4x Scheduled Role Capacity (100 active slots)",
      "4x Bulk Action Capacity (100 users per action)",
      "Advanced Auto-Mod (domain allowlist, caps lock, wildcard/regex, per-channel, analytics, export)",
      "Role Reactions (20 emojis, 15 panels)",
      "Role Bundles (10 roles per bundle)",
    ],
  },
};

// Free trial configuration for Pro Engine
export const ProTrialConfig = {
  enabled: true,
  durationDays: 7, // Trial lasts 7 days
  autoActivate: false, // User-triggered via dashboard, not automatic
  oneTimeOnly: true, // Each guild gets only one trial
};

/**
 * Free tier limits — features available without Pro Engine
 */
export const FREE_TIER = {
  LEVEL_REWARDS_MAX: 5,
  REWARD_MODE: "stack", // Only stack is free; replace requires Pro
  GIVEAWAY_MAX_ACTIVE: 3,
  GIVEAWAY_MAX_ENTRIES: 2500,
  GIVEAWAY_MAX_WINNERS: 5,
  SCHEDULE_MAX_ACTIVE: 25,
  BULK_ACTION_MAX_MEMBERS: 25,
  ROLE_BUNDLE_MAX_ROLES: 3,
  ROLE_BUNDLE_MAX_ACTIVE: 5,
  ROLE_REACTION_MAX_EMOJIS: 5,
  ROLE_REACTION_MAX_ROLES: 5, // Total roles across all emojis per panel
  ROLE_REACTION_MAX_ROLES_PER_EMOJI: 3,
  ROLE_REACTION_MAX_MESSAGES: 3,
  // Custom Variables & Event Triggers
  CUSTOM_VARIABLES_MAX: 10,
  CUSTOM_EVENT_TRIGGERS_MAX: 5,
  CUSTOM_EVENT_TYPES: ["member_join", "member_leave"],
  // Ticketing
  TICKET_MAX_PANELS: 3,
  TICKET_MAX_TICKETS_PER_MONTH: 50,
  TICKET_TRANSCRIPT_DAYS: 30,
};

export const PRO_TIER = {
  LEVEL_REWARDS_MAX: -1, // Unlimited
  GIVEAWAY_MAX_ACTIVE: 20, // 6x free tier
  GIVEAWAY_MAX_ENTRIES: 10000, // Balanced for RAM safety & smooth shuffles (Reduced from 50k)
  GIVEAWAY_MAX_WINNERS: 10, // Prevents Discord DM rate-limiting (Reduced from 20)
  SCHEDULE_MAX_ACTIVE: 100, // Keeps timer loop lightweight on VPS (Reduced from 500)
  BULK_ACTION_MAX_MEMBERS: 100, // Prevents Discord API rate-limit 429 errors (Reduced from 250)
  ROLE_BUNDLE_MAX_ROLES: 10,
  ROLE_BUNDLE_MAX_ACTIVE: 20, // 4x free tier
  ROLE_REACTION_MAX_EMOJIS: 20, // Discord's hard limit
  ROLE_REACTION_MAX_ROLES: 20, // Total roles across all emojis per panel
  ROLE_REACTION_MAX_ROLES_PER_EMOJI: 10,
  ROLE_REACTION_MAX_MESSAGES: 15, // 3x free tier
  // Custom Variables & Event Triggers
  CUSTOM_VARIABLES_MAX: 100,
  CUSTOM_EVENT_TRIGGERS_MAX: 50,
  CUSTOM_EVENT_TYPES: ["all"],
  // Ticketing
  TICKET_MAX_PANELS: 10,
  TICKET_MAX_TICKETS_PER_MONTH: 250, // Balanced database quota (Reduced from 500)
  TICKET_TRANSCRIPT_DAYS: -1, // Unlimited
};
