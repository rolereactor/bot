import { MessageFlags } from "discord.js";
import { getLogger } from "../../logger.js";

/**
 * Message component interaction router
 * Routes button and select menu interactions to appropriate handlers based on customId patterns
 */

/**
 * Route message component interaction to appropriate handler
 * @param {import('discord.js').MessageComponentInteraction} interaction - The message component interaction
 * @param {import('discord.js').Client} _client - The Discord client (unused but kept for consistency)
 */
export async function routeButtonInteraction(interaction, _client) {
  const logger = getLogger();
  const { customId } = interaction;

  // Ignore temporary interactions handled by local collectors (e.g. settings menu)
  if (customId.startsWith("t_")) return;

  try {
    logger.debug(
      `Routing interaction: ${customId}, type: ${interaction.type}, isButton: ${interaction.isButton()}`,
    );

    // Ensure it's a button interaction
    if (!interaction.isButton()) {
      // Non-button interactions are handled by other routers
      // This should not happen as the interaction manager routes them separately
      logger.warn(
        `Non-button interaction ${customId} routed to button handler - this should not happen`,
      );
      return;
    }

    // Handle button interactions
    // Route based on customId patterns

    // Handle Imagine regenerate and upscale buttons
    if (
      customId.startsWith("imagine_regenerate_") ||
      customId.startsWith("imagine_upscale_")
    ) {
      const { handleImagineButton } = await import(
        "../../../commands/general/imagine/buttonHandler.js"
      );
      await handleImagineButton(interaction);
      return;
    }

    if (customId.startsWith("poll_")) {
      // Handle poll creation buttons
      if (
        customId === "poll_continue_to_modal" ||
        customId === "poll_cancel_creation"
      ) {
        const { handlePollCreationButton } = await import(
          "../../../commands/general/poll/handlers.js"
        );
        await handlePollCreationButton(interaction, _client);
        return;
      }

      // Handle poll list pagination buttons
      if (
        customId.startsWith("poll_list_page_") ||
        customId === "poll_list_current"
      ) {
        const { handlePollListButton } = await import(
          "../../../commands/general/poll/handlers.js"
        );
        await handlePollListButton(interaction, _client);
        return;
      }

      // Other poll buttons disabled - using native Discord polls only
      if (
        customId.startsWith("poll_create_quick") ||
        customId.startsWith("poll_refresh_list")
      ) {
        logger.warn(
          `Custom poll button interaction received but disabled: ${customId}`,
        );
        return;
      }

      // Unknown poll button
      logger.warn(`Unknown poll button interaction: ${customId}`);
      return;
    }

    if (customId.startsWith("rps_choice-")) {
      const { handleRPSButton } = await import(
        "../../../commands/general/rps/handlers.js"
      );
      await handleRPSButton(interaction);
      return;
    }

    // Handle WYR (Would You Rather) buttons
    if (customId.startsWith("wyr_vote_") || customId === "wyr_new_question") {
      const { handleWYRButton } = await import(
        "../../../commands/general/wyr/handlers.js"
      );
      await handleWYRButton(interaction, _client);
      return;
    }

    // Handle giveaway buttons
    if (customId.startsWith("giveaway_")) {
      const { handleGiveawayInteraction } = await import(
        "../../../events/giveaway.js"
      );
      await handleGiveawayInteraction(interaction, _client);
      return;
    }

    // Handle ticket buttons
    if (
      customId.startsWith("ticket_create_") ||
      customId.startsWith("ticket_claim_external_") ||
      customId.startsWith("ticket_csat") ||
      customId === "ticket_claim" ||
      customId === "ticket_close" ||
      customId === "ticket_add_user" ||
      customId === "ticket_transfer"
    ) {
      const { handleTicketButtons } = await import(
        "../../../events/ticketing/buttonHandler.js"
      );
      await handleTicketButtons(interaction);
      return;
    }

    // AI feedback buttons removed - ignore any legacy feedback button clicks
    if (customId.startsWith("ai_feedback_")) {
      logger.debug(
        `Legacy AI feedback button clicked (system removed): ${customId}`,
      );
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Feedback system has been removed.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      return;
    }

    // Cancel buttons removed - users can cancel by deleting the status message
    // (Handler kept for backward compatibility but won't be called)

    if (customId.startsWith("leaderboard_")) {
      const { handleLeaderboardButton } = await import(
        "../handlers/leaderboardHandlers.js"
      );
      await handleLeaderboardButton(interaction);
      return;
    }

    // Role-reactions pagination buttons
    if (customId.startsWith("rolelist_")) {
      const { handlePagination } = await import(
        "../../../commands/admin/role-reactions/handlers.js"
      );
      await handlePagination(interaction, _client);
      return;
    }

    // Moderation history pagination buttons
    if (customId.startsWith("mod_history_")) {
      const { handleHistoryPagination } = await import(
        "../../../commands/admin/moderation/handlers.js"
      );
      await handleHistoryPagination(interaction, _client);
      return;
    }

    // Route specific button types
    switch (customId) {
      // Welcome system buttons
      case "welcome_configure":
      case "welcome_edit": {
        const { handleWelcomeConfigure } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeConfigure(interaction);
        break;
      }
      case "welcome_configure_message": {
        const { handleWelcomeConfigureMessage } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeConfigureMessage(interaction);
        break;
      }
      case "welcome_select_channel": {
        const { handleWelcomeSelectChannel } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeSelectChannel(interaction);
        break;
      }
      case "welcome_test": {
        const { handleWelcomeTest } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeTest(interaction);
        break;
      }
      case "welcome_toggle": {
        const { handleWelcomeToggle } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeToggle(interaction);
        break;
      }
      case "welcome_reset": {
        const { handleWelcomeReset } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeReset(interaction);
        break;
      }
      case "welcome_format": {
        const { handleWelcomeFormat } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeFormat(interaction);
        break;
      }
      case "welcome_configure_role": {
        const { handleWelcomeConfigureRole } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeConfigureRole(interaction);
        break;
      }
      case "welcome_clear_role": {
        const { handleWelcomeClearRole } = await import(
          "../handlers/welcomeHandlers.js"
        );
        await handleWelcomeClearRole(interaction);
        break;
      }

      // Auto-mod system buttons
      case "automod_configure": {
        const { handleAutomodConfigure } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodConfigure(interaction);
        break;
      }
      case "automod_back": {
        const { handleAutomodBack } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodBack(interaction);
        break;
      }
      case "automod_quick_setup": {
        const { handleAutomodQuickSetup } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodQuickSetup(interaction);
        break;
      }
      case "automod_enable_all": {
        const { handleAutomodToggleAll } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodToggleAll(interaction);
        break;
      }
      case "automod_disable_all": {
        const { handleAutomodToggleAllOff } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodToggleAllOff(interaction);
        break;
      }
      case "automod_badwords_toggle": {
        const { handleAutomodBadwordsToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodBadwordsToggle(interaction);
        break;
      }
      case "automod_links_toggle": {
        const { handleAutomodLinksToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodLinksToggle(interaction);
        break;
      }
      case "automod_spam_toggle": {
        const { handleAutomodSpamToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodSpamToggle(interaction);
        break;
      }
      case "automod_mention_spam_toggle": {
        const { handleAutomodMentionSpamToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodMentionSpamToggle(interaction);
        break;
      }
      case "automod_invite_toggle": {
        const { handleAutomodInviteToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodInviteToggle(interaction);
        break;
      }
      case "automod_capslock_toggle": {
        const { handleAutomodCapslockToggle } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handleAutomodCapslockToggle(interaction);
        break;
      }

      // XP system buttons
      case "xp_toggle_system": {
        const { handleXPToggleSystem } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleSystem(interaction);
        break;
      }
      case "xp_toggle_all": {
        const { handleXPToggleAll } = await import("../handlers/xpHandlers.js");
        await handleXPToggleAll(interaction);
        break;
      }
      case "xp_toggle_message": {
        const { handleXPToggleMessage } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleMessage(interaction);
        break;
      }
      case "xp_toggle_command": {
        const { handleXPToggleCommand } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleCommand(interaction);
        break;
      }
      case "xp_toggle_role": {
        const { handleXPToggleRole } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleRole(interaction);
        break;
      }
      case "xp_toggle_voice": {
        const { handleXPToggleVoice } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleVoice(interaction);
        break;
      }

      // XP configuration buttons
      case "xp_configure": {
        const { handleXpGeneralConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpGeneralConfig(interaction);
        break;
      }
      case "xp_configure_basic": {
        const { handleXpBasicConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpBasicConfig(interaction);
        break;
      }
      case "xp_configure_advanced": {
        const { handleXpAdvancedConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpAdvancedConfig(interaction);
        break;
      }
      case "xp_configure_sources": {
        const { handleXpSourceConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpSourceConfig(interaction);
        break;
      }
      case "xp_configure_levelup": {
        const { handleLevelUpConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleLevelUpConfig(interaction);
        break;
      }
      case "xp_toggle": {
        const { handleXPToggleSystem } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleSystem(interaction);
        break;
      }
      case "xp_test": {
        const { handleXpTest } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpTest(interaction);
        break;
      }
      case "xp_toggle_levelup": {
        const { handleXPToggleLevelUp } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPToggleLevelUp(interaction);
        break;
      }
      case "xp_configure_channel": {
        const { handleXpChannelConfig } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpChannelConfig(interaction);
        break;
      }
      case "xp_test_levelup": {
        const { handleXpTestLevelUp } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpTestLevelUp(interaction);
        break;
      }
      case "welcome_back_to_settings": {
        const { handleSettings } = await import(
          "../../../commands/admin/welcome/handlers.js"
        );
        await handleSettings(interaction, interaction.client);
        break;
      }
      case "back_to_settings": {
        const { handleXpCommand } = await import(
          "../../../commands/admin/xp/handlers.js"
        );
        await handleXpCommand(interaction, interaction.client);
        break;
      }

      // XP configuration buttons
      case "xp_config_message": {
        const { handleXPConfigMessage } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPConfigMessage(interaction);
        break;
      }
      case "xp_config_command": {
        const { handleXPConfigCommand } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPConfigCommand(interaction);
        break;
      }
      case "xp_config_role": {
        const { handleXPConfigRole } = await import(
          "../handlers/xpHandlers.js"
        );
        await handleXPConfigRole(interaction);
        break;
      }

      // Help command buttons and interactions
      case "help_back_main":
      case "help_view_overview":
      case "help_view_all": {
        const { handleHelpInteraction } = await import(
          "../handlers/helpHandlers.js"
        );
        await handleHelpInteraction(interaction);
        break;
      }

      // Goodbye system buttons
      case "goodbye_configure":
      case "goodbye_edit": {
        const { handleGoodbyeConfigure } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeConfigure(interaction);
        break;
      }
      case "goodbye_configure_message": {
        const { handleGoodbyeConfigureMessage } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeConfigureMessage(interaction);
        break;
      }
      case "goodbye_select_channel": {
        const { handleGoodbyeSelectChannel } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeSelectChannel(interaction);
        break;
      }
      case "goodbye_toggle": {
        const { handleGoodbyeToggle } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeToggle(interaction);
        break;
      }
      case "goodbye_reset": {
        const { handleGoodbyeReset } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeReset(interaction);
        break;
      }
      case "goodbye_format": {
        const { handleGoodbyeFormat } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeFormat(interaction);
        break;
      }
      case "goodbye_test": {
        const { handleGoodbyeTest } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeTest(interaction);
        break;
      }
      case "goodbye_back_to_settings": {
        const { handleSettings } = await import(
          "../../../commands/admin/goodbye/handlers.js"
        );
        await handleSettings(interaction, interaction.client);
        break;
      }
      case "goodbye_settings": {
        const { handleGoodbyeEdit } = await import(
          "../handlers/goodbyeHandlers.js"
        );
        await handleGoodbyeEdit(interaction);
        break;
      }

      default: {
        // Check if it's a help interaction that wasn't caught above
        if (customId.startsWith("help_cmd_")) {
          const { handleHelpInteraction } = await import(
            "../handlers/helpHandlers.js"
          );
          await handleHelpInteraction(interaction);
        } else if (customId.startsWith("automod_configure_")) {
          const { handleAutomodConfigureButton } = await import(
            "../../../commands/admin/automod/buttonHandlers.js"
          );
          await handleAutomodConfigureButton(interaction);
        } else {
          logger.debug(`Unknown button interaction: ${customId}`);
        }
        break;
      }
    }
  } catch (error) {
    logger.error(`Error routing button interaction ${customId}`, error);
    throw error; // Re-throw to be handled by the main interaction manager
  }
}
