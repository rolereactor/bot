/**
 * Ticketing System Configuration
 * Free tier limits and Pro Engine features
 */

// Free tier limits - features available without Pro Engine
export const FREE_TIER = {
  MAX_TICKETS_PER_MONTH: 25, // Monthly ticket limit
  MAX_PANELS: 2, // Maximum ticket panels
  MAX_CATEGORIES: 3, // Maximum categories per panel
  TRANSCRIPT_RETENTION_DAYS: 30, // Days before transcript deletion
  EXPORT_FORMATS: ["md"], // Available export formats
  CUSTOM_COLORS: true, // Custom colors are available for everyone
  MAX_MESSAGES_PER_TRANSCRIPT: 1000, // Message limit
};

// Pro Engine features - unlocked with subscription
export const PRO_ENGINE = {
  MAX_TICKETS_PER_MONTH: 500, // 20x free tier
  MAX_PANELS: 5, // Multiple panels
  MAX_CATEGORIES: 10, // More categories
  TRANSCRIPT_RETENTION_DAYS: -1, // Unlimited (-1 = no expiry)
  EXPORT_FORMATS: ["html", "json", "md"], // All formats
  CUSTOM_COLORS: true, // Custom embed colors
  MAX_MESSAGES_PER_TRANSCRIPT: 5000, // Higher message limit
  // Planned Pro features (not yet enforced at runtime):
  // ANALYTICS: "advanced",
  // AUTOMATION: true,
  // STAFF_PERFORMANCE_TRACKING: true,
  // PRIORITY_NOTIFICATIONS: true,
  // TEMPLATES: true,
  // MULTI_SERVER_STATS: true,
  // MAX_ACTIVE_TICKETS: 50,
  // DAILY_TICKET_LIMIT: 50,
};

// Ticket status constants
export const TICKET_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  ARCHIVED: "archived",
};

// Ticket priority levels
export const TICKET_PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
};

// Export formats
export const EXPORT_FORMATS = {
  HTML: "html",
  PDF: "pdf",
  JSON: "json",
  MD: "md",
};

// Default ticket category
export const DEFAULT_CATEGORY = {
  id: "default",
  label: "Support",
  emoji: "📧",
  description: "General support ticket",
  color: 0x5865f2, // Discord blurple
};

// Panel button styles
export const BUTTON_STYLES = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
};

// Auto-close settings
export const AUTO_CLOSE = {
  WARNING_HOURS: 24, // Warn before auto-close
  INACTIVE_DAYS_FREE: 7, // Auto-close after (free tier)
  INACTIVE_DAYS_PRO: 30, // Auto-close after (pro tier)
};

// Staff notification settings
export const STAFF_NOTIFICATIONS = {
  CHANNEL: "staff-pings", // Default staff ping channel
  ROLE_MENTION: true, // Mention staff role
  DM_ON_CLAIM: false, // DM staff when they claim
};

// Transcript settings
export const TRANSCRIPT_SETTINGS = {
  MAX_MESSAGES: 1000, // Max messages per transcript
  INCLUDE_ATTACHMENTS: true, // Include attachment links
  EMBED_AUTHOR: true, // Show author in transcript
};
