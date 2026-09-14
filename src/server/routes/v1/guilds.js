import express from "express";
import {
  apiGetGuildSettings,
  apiUpdateGuildSettings,
  apiGetGuildChannels,
  apiGetGuildRoles,
  apiGetGuildEmojis,
  apiCheckGuilds,
  apiListGuilds,
  apiTestWelcome,
  apiTestGoodbye,
} from "../../controllers/GuildController.js";
import {
  apiActivatePremiumFeature,
  apiCancelPremiumFeature,
  apiGetPremiumStatus,
  apiActivateTrial,
  apiResetPremium,
} from "../../controllers/GuildPremiumController.js";
import {
  apiGuildLeaderboard,
  apiGetPublicLeaderboards,
} from "../../controllers/GuildLeaderboardController.js";
import {
  apiGetGuildRoleMappings,
  apiDeleteGuildRoleMapping,
  apiDeployRoleReactions,
  apiUpdateRoleReactions,
} from "../../controllers/GuildRoleMappingController.js";
import { apiGetGuildAnalytics } from "../../controllers/GuildAnalyticsController.js";
import {
  apiListEventTriggers,
  apiCreateEventTrigger,
  apiUpdateEventTrigger,
  apiDeleteEventTrigger,
} from "../../controllers/GuildCustomEventTriggerController.js";
import {
  apiListVariables,
  apiCreateVariable,
  apiUpdateVariable,
  apiDeleteVariable,
} from "../../controllers/GuildCustomVariableController.js";
import {
  apiGetGuildRoleBundles,
  apiCreateRoleBundle,
  apiDeleteRoleBundle,
} from "../../controllers/GuildRoleBundleController.js";

import { internalAuth } from "../../middleware/internalAuth.js";
import { requireAuth } from "../../middleware/authentication.js";
import { requireAdmin } from "../../middleware/userAuthorization.js";
import {
  requireGuildPermission,
  requireGuildMembership,
} from "../../middleware/guildAuthorization.js";
import {
  roleManagementLimiter,
  guildSettingsLimiter,
  premiumActivationLimiter,
} from "../../middleware/roleManagementLimiter.js";

const router = express.Router();

// Bulk check (internal only)
router.post("/check", internalAuth, apiCheckGuilds);

// List all guilds (internal only - for admin dashboard)
router.get("/", internalAuth, requireAuth, requireAdmin, apiListGuilds);

// Guild history (internal only - for admin dashboard)
router.get(
  "/history",
  internalAuth,
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { getStorageManager } = await import(
        "../../../utils/storage/storageManager.js"
      );
      const storage = await getStorageManager();
      if (!storage?.dbManager?.guildHistory) {
        return res
          .status(503)
          .json({ success: false, error: "Guild history not available" });
      }
      const guilds = await storage.dbManager.guildHistory.getAll();
      res.json({ success: true, data: guilds });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// Guild details for admin (bypasses membership check)
router.get(
  "/:guildId/details",
  internalAuth,
  requireAuth,
  requireAdmin,
  apiGetGuildSettings,
);

// Settings - requires guild permission (internal auth verifies website request)
router.get(
  "/:guildId/settings",
  internalAuth,
  requireGuildMembership,
  apiGetGuildSettings,
);
router.patch(
  "/:guildId/settings",
  internalAuth,
  requireGuildPermission,
  guildSettingsLimiter,
  apiUpdateGuildSettings,
);

// Channels - requires guild membership
router.get(
  "/:guildId/channels",
  internalAuth,
  requireGuildMembership,
  apiGetGuildChannels,
);

// Roles - requires guild membership
router.get(
  "/:guildId/roles",
  internalAuth,
  requireAuth,
  requireGuildMembership,
  apiGetGuildRoles,
);

// Emojis - requires guild membership
router.get(
  "/:guildId/emojis",
  internalAuth,
  requireAuth,
  requireGuildMembership,
  apiGetGuildEmojis,
);

// Premium - requires guild permission
router.post(
  "/:guildId/premium/activate",
  internalAuth,
  requireGuildPermission,
  premiumActivationLimiter,
  apiActivatePremiumFeature,
);
router.post(
  "/:guildId/premium/activate-trial",
  internalAuth,
  requireGuildPermission,
  premiumActivationLimiter,
  apiActivateTrial,
);
router.post(
  "/:guildId/premium/cancel",
  internalAuth,
  requireGuildPermission,
  premiumActivationLimiter,
  apiCancelPremiumFeature,
);
router.get(
  "/:guildId/premium/status",
  internalAuth,
  requireGuildMembership,
  apiGetPremiumStatus,
);
router.post(
  "/:guildId/premium/reset",
  internalAuth,
  requireGuildPermission,
  apiResetPremium,
);

// Analytics - requires guild permission
router.get(
  "/:guildId/analytics",
  internalAuth,
  requireGuildPermission,
  apiGetGuildAnalytics,
);

// Role Reactions - CRITICAL: All role reaction endpoints require guild permission
router.get(
  "/:guildId/role-reactions",
  internalAuth,
  requireGuildPermission,
  apiGetGuildRoleMappings,
);
router.delete(
  "/:guildId/role-reactions/:messageId",
  internalAuth,
  requireGuildPermission,
  roleManagementLimiter,
  apiDeleteGuildRoleMapping,
);
router.post(
  "/:guildId/roles/deploy",
  internalAuth,
  requireGuildPermission,
  roleManagementLimiter,
  apiDeployRoleReactions,
);
router.patch(
  "/:guildId/role-reactions/:messageId",
  internalAuth,
  requireGuildPermission,
  roleManagementLimiter,
  apiUpdateRoleReactions,
);

// Role Bundles - requires guild permission
router.get(
  "/:guildId/role-bundles",
  internalAuth,
  requireGuildPermission,
  apiGetGuildRoleBundles,
);
router.post(
  "/:guildId/role-bundles",
  internalAuth,
  requireGuildPermission,
  roleManagementLimiter,
  apiCreateRoleBundle,
);
router.delete(
  "/:guildId/role-bundles/:bundleName",
  internalAuth,
  requireGuildPermission,
  roleManagementLimiter,
  apiDeleteRoleBundle,
);

// Leaderboard - public access
router.get("/public-leaderboards", apiGetPublicLeaderboards);
router.get("/:guildId/leaderboard", apiGuildLeaderboard);

// Custom Variables - requires guild permission
router.get(
  "/:guildId/variables",
  internalAuth,
  requireGuildPermission,
  apiListVariables,
);
router.post(
  "/:guildId/variables",
  internalAuth,
  requireGuildPermission,
  apiCreateVariable,
);
router.patch(
  "/:guildId/variables/:variableId",
  internalAuth,
  requireGuildPermission,
  apiUpdateVariable,
);
router.delete(
  "/:guildId/variables/:variableId",
  internalAuth,
  requireGuildPermission,
  apiDeleteVariable,
);

// Event Triggers - requires guild permission
router.get(
  "/:guildId/event-triggers",
  internalAuth,
  requireGuildPermission,
  apiListEventTriggers,
);
router.post(
  "/:guildId/event-triggers",
  internalAuth,
  requireGuildPermission,
  apiCreateEventTrigger,
);
router.patch(
  "/:guildId/event-triggers/:triggerId",
  internalAuth,
  requireGuildPermission,
  apiUpdateEventTrigger,
);
router.delete(
  "/:guildId/event-triggers/:triggerId",
  internalAuth,
  requireGuildPermission,
  apiDeleteEventTrigger,
);

// Welcome System - Test endpoint
router.post(
  "/:guildId/welcome/test",
  internalAuth,
  requireAuth,
  requireGuildPermission,
  apiTestWelcome,
);

// Goodbye System - Test endpoint
router.post(
  "/:guildId/goodbye/test",
  internalAuth,
  requireAuth,
  requireGuildPermission,
  apiTestGoodbye,
);

export default router;
