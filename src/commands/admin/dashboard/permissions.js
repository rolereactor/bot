import { getLogger } from "../../../utils/logger.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";

/**
 * Validates that the user has permission to access the dashboard
 * @param {Object} interaction - Discord interaction object
 * @returns {Object} Validation result with success boolean and error response
 */
export function validateDashboardPermissions(interaction) {
  const logger = getLogger();

  const botMember = interaction.guild.members.me;
  if (!botMember) {
    logger.warn("Bot member not found for dashboard permission check");
    return {
      success: false,
      errorResponse: errorEmbed({
        title: "Permission Error",
        description: "Unable to verify bot permissions.",
        solution: "Please try again or contact support.",
      }),
    };
  }

  // Dashboard requires ManageGuild permission (set in command definition)
  // This is already enforced by Discord's defaultMemberPermissions
  // Additional checks can be added here if needed

  logger.debug("Dashboard permission check passed", {
    userId: interaction.user.id,
    guildId: interaction.guild.id,
  });

  return { success: true };
}
