import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";
import { handleDashboard } from "./handlers.js";
import { validateDashboardPermissions } from "./permissions.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

/**
 * Command metadata for centralized registry
 * This allows the command to be automatically discovered and integrated
 * into help system, command suggestions, and other features
 * This is the single source of truth for command information
 */
export const metadata = {
  name: "dashboard",
  category: "admin",
  description: "Open the server dashboard",
  keywords: ["dashboard", "panel", "config", "settings", "web"],
  emoji: "🌐",
  premium: false,
  helpFields: [
    {
      name: "How to Use",
      value: "`/dashboard` — Opens the server dashboard in your browser",
      inline: false,
    },
    {
      name: "What You'll See",
      value:
        "Access your server's dashboard to configure all bot features including role reactions, tickets, welcome/goodbye messages, Pro Engine settings, and server analytics.",
      inline: false,
    },
    {
      name: "Permissions",
      value: "• **Manage Server** permission required",
      inline: false,
    },
  ],
};

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

export const data = new SlashCommandBuilder()
  .setName(metadata.name)
  .setDescription(metadata.description)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

export async function execute(interaction) {
  const logger = getLogger();

  logger.debug("Dashboard command executing", {
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });

  // Check if interaction has already been acknowledged
  if (interaction.replied || interaction.deferred) {
    logger.warn("Interaction already acknowledged, skipping command");
    return;
  }

  try {
    // Validate permissions
    const permissionCheck = validateDashboardPermissions(interaction);
    if (!permissionCheck.success) {
      return interaction.reply(permissionCheck.errorResponse);
    }

    // Handle the dashboard command
    await handleDashboard(interaction);

    logger.debug("Dashboard command completed successfully");
  } catch (error) {
    logger.error("Error in dashboard command handler", {
      error: error.message,
      stack: error.stack,
    });

    // Check for specific error types
    if (error.message.includes("Unknown interaction")) {
      logger.warn("Interaction expired before response could be sent");
      return;
    }

    // Only try to respond if the interaction hasn't been acknowledged yet
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply(
          errorEmbed({
            title: "Error",
            description: "Failed to open the dashboard.",
            solution: "Please try again or contact support.",
          }),
        );
      } catch (replyError) {
        logger.error("Failed to send error reply", {
          error: replyError.message,
        });
      }
    }
  }
}
