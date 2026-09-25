/**
 * Ticket Button Router
 *
 * Thin dispatcher that routes ticket button interactions
 * to their dedicated handler modules:
 *   - ticketCreate  → Handles new ticket creation from panels
 *   - ticketClaim   → Handles claim (in-thread and external Quiet Claim)
 *   - ticketClose   → Handles close, transcript, and archival
 *   - ticketActions  → Handles add-user and transfer modals
 */

import { handleTicketCreate } from "./handlers/ticketCreate.js";
import { handleTicketClaim } from "./handlers/ticketClaim.js";
import { handleTicketClose } from "./handlers/ticketClose.js";
import {
  handleTicketAddUser,
  handleTicketTransfer,
} from "./handlers/ticketActions.js";
import {
  handleCsatRating,
  handleCsatCommentButton,
} from "./handlers/ticketCsat.js";

/**
 * Handle ticket button interactions
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleTicketButtons(interaction) {
  const customId = interaction.customId;

  // Ticket creation buttons: ticket_create_*
  if (customId.startsWith("ticket_create_")) {
    return await handleTicketCreate(interaction, customId);
  }

  // CSAT star rating: ticket_csat:<ticketId>:<1-5>
  if (customId.startsWith("ticket_csat:")) {
    return await handleCsatRating(interaction);
  }

  // CSAT comment button: ticket_csat_comment:<ticketId>
  if (customId.startsWith("ticket_csat_comment:")) {
    return await handleCsatCommentButton(interaction);
  }

  // Claim button (inside ticket thread): ticket_claim
  if (customId === "ticket_claim") {
    return await handleTicketClaim(interaction);
  }

  // Close button: ticket_close
  if (customId === "ticket_close") {
    return await handleTicketClose(interaction);
  }

  // Add user button: ticket_add_user
  if (customId === "ticket_add_user") {
    return await handleTicketAddUser(interaction);
  }

  // Transfer button: ticket_transfer
  if (customId === "ticket_transfer") {
    return await handleTicketTransfer(interaction);
  }

  // External claim button (from staff alert): ticket_claim_external_*
  if (customId.startsWith("ticket_claim_external_")) {
    const ticketId = customId.replace("ticket_claim_external_", "");
    return await handleTicketClaim(interaction, ticketId);
  }
}
