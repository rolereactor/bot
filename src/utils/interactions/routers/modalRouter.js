import { getLogger } from "../../logger.js";

/**
 * Modal interaction router
 * Routes modal interactions to appropriate handlers based on customId patterns
 */

/**
 * Route modal interaction to appropriate handler
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal interaction
 * @param {import('discord.js').Client} _client - The Discord client (unused but kept for consistency)
 */
export async function routeModalInteraction(interaction, _client) {
  const logger = getLogger();
  const { customId } = interaction;

  try {
    // Route based on customId patterns
    if (customId === "xp_config_modal") {
      const { handleXpConfigModalSubmit } = await import(
        "../../../commands/admin/xp/handlers.js"
      );
      await handleXpConfigModalSubmit(interaction);
      return;
    }

    if (customId === "xp_advanced_config_modal") {
      const { handleXpAdvancedConfigModalSubmit } = await import(
        "../../../commands/admin/xp/handlers.js"
      );
      await handleXpAdvancedConfigModalSubmit(interaction);
      return;
    }

    if (customId === "goodbye_config_modal") {
      const { handleGoodbyeConfigModal } = await import(
        "../handlers/goodbyeModalHandler.js"
      );
      await handleGoodbyeConfigModal(interaction);
      return;
    }

    if (customId === "welcome_config_modal") {
      const { handleWelcomeConfigModal } = await import(
        "../handlers/welcomeModalHandler.js"
      );
      await handleWelcomeConfigModal(interaction);
      return;
    }

    if (customId === "poll_creation_modal") {
      const { handlePollModalSubmit } = await import(
        "../../../commands/general/poll/modalHandler.js"
      );
      await handlePollModalSubmit(interaction, _client);
      return;
    }

    // Handle ticket modals
    if (
      customId === "ticket_add_user_modal" ||
      customId === "ticket_transfer_modal" ||
      customId.startsWith("ticket_csat_modal:")
    ) {
      const { handleTicketModals } = await import(
        "../../../events/ticketing/modalHandler.js"
      );
      await handleTicketModals(interaction);
      return;
    }

    // Handle automod modals
    if (customId.startsWith("automod_") && customId.endsWith("_modal")) {
      const filter = customId.replace("automod_", "").replace("_modal", "");
      const handlers = {
        badwords: "handleAutomodBadwordsModal",
        links: "handleAutomodLinksModal",
        spam: "handleAutomodSpamModal",
        mentions: "handleAutomodMentionsModal",
        invites: "handleAutomodInvitesModal",
      };
      const handlerName = handlers[filter];
      if (handlerName) {
        const { [handlerName]: handler } = await import(
          "../../../commands/admin/automod/buttonHandlers.js"
        );
        await handler(interaction);
        return;
      }
    }

    // Add more modal routing patterns here as needed
    logger.debug(`Unknown modal interaction: ${customId}`);
  } catch (error) {
    logger.error(`Error routing modal interaction ${customId}`, error);
    throw error; // Re-throw to be handled by the main interaction manager
  }
}
