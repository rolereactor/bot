import { MessageFlags } from "discord.js";
import { getTicketManager } from "../../features/ticketing/TicketManager.js";
import {
  createSuccessEmbed,
  createErrorEmbed,
} from "../../features/ticketing/embeds.js";
import {
  checkStaffRoleForMember,
  getStaffRoleId,
} from "../../features/ticketing/helpers.js";
import { getLogger } from "../../utils/logger.js";
import { INPUT_LIMITS } from "../../utils/validation/inputValidation.js";
import {
  validateModalInput,
  createFormValidationErrorEmbed,
} from "../../utils/validation/formValidation.js";

const logger = getLogger();

/**
 * Handle ticket modal submissions
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleTicketModals(interaction) {
  const customId = interaction.customId;

  // Add user modal: ticket_add_user_modal
  if (customId === "ticket_add_user_modal") {
    return await handleAddUserModal(interaction);
  }

  // Transfer modal: ticket_transfer_modal
  if (customId === "ticket_transfer_modal") {
    return await handleTransferModal(interaction);
  }

  // CSAT comment modal: ticket_csat_modal:<ticketId>
  if (customId.startsWith("ticket_csat_modal:")) {
    const { handleCsatCommentModal } = await import("./handlers/ticketCsat.js");
    return await handleCsatCommentModal(interaction);
  }
}

/**
 * Handle add user modal submission
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleAddUserModal(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const rawUserIdInput = interaction.fields.getTextInputValue("user_id");

    const userIdValidation = validateModalInput(rawUserIdInput, "User ID", {
      required: true,
      maxLength: INPUT_LIMITS.SHORT_TEXT,
      stripHtml: true,
      removeScripts: true,
    });

    if (!userIdValidation.valid) {
      return interaction.editReply({
        embeds: [userIdValidation.error],
      });
    }

    const sanitizedUserIdInput = userIdValidation.sanitized;
    const channelId = interaction.channelId;
    const guild = interaction.guild;

    // Initialize manager
    const ticketManager = getTicketManager();
    await ticketManager.initialize();

    // Get ticket from channel
    const ticket = await ticketManager.getTicketByChannel(channelId);
    if (!ticket) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This is not a ticket channel.",
            "Invalid Action",
            interaction.client,
          ),
        ],
      });
    }

    // Parse user ID from input (could be mention or raw ID)
    const userId = parseUserId(sanitizedUserIdInput);
    if (!userId) {
      return interaction.editReply({
        embeds: [
          createFormValidationErrorEmbed(
            "Invalid User ID",
            "Please enter a valid Discord user ID or @mention.",
            "Use format: @username or enter a 17-19 digit Discord ID.",
          ),
        ],
      });
    }

    // Check if user exists in guild
    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (_error) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Please make sure the user is a member of this server.",
            "User not found in this server",
            interaction.client,
          ),
        ],
      });
    }

    // Check if user is already in ticket
    if (ticket.participants?.includes(userId)) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            `${member} is already a participant in this ticket.`,
            "User Already Participant",
            interaction.client,
          ),
        ],
      });
    }

    // Add user to ticket in database
    const success = await ticketManager.addUserToTicket(
      ticket.ticketId,
      userId,
    );
    if (!success) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Failed to add user to the ticket.",
            "Error",
            interaction.client,
          ),
        ],
      });
    }

    // Add user to channel permissions or thread members
    try {
      if (interaction.channel.isThread()) {
        await interaction.channel.members.add(member.id);
      } else {
        await interaction.channel.permissionOverwrites.edit(member, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }
    } catch (error) {
      logger.error("Failed to add user to channel/thread:", error);
    }

    // Notify everyone in the ticket
    await interaction.channel.send({
      embeds: [
        createSuccessEmbed(
          `${member} has been added to this ticket by ${interaction.user}.`,
          "User Added",
          interaction.client,
        ),
      ],
    });

    // Ephemeral confirmation
    return interaction.editReply({
      embeds: [
        createSuccessEmbed(
          `${member} has been added to this ticket.`,
          "User Added",
          interaction.client,
        ),
      ],
    });
  } catch (_error) {
    logger.error("Add user modal error:", _error);
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          `Failed to add user: ${_error.message}`,
          "Request Failed",
          interaction.client,
        ),
      ],
    });
  }
}

/**
 * Handle transfer modal submission
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleTransferModal(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const rawStaffIdInput = interaction.fields.getTextInputValue("staff_id");

    const staffIdValidation = validateModalInput(rawStaffIdInput, "Staff ID", {
      required: true,
      maxLength: INPUT_LIMITS.SHORT_TEXT,
      stripHtml: true,
      removeScripts: true,
    });

    if (!staffIdValidation.valid) {
      return interaction.editReply({
        embeds: [staffIdValidation.error],
      });
    }

    const sanitizedStaffIdInput = staffIdValidation.sanitized;
    const channelId = interaction.channelId;
    const guild = interaction.guild;

    // Initialize manager
    const ticketManager = getTicketManager();
    await ticketManager.initialize();

    // Get ticket from channel
    const ticket = await ticketManager.getTicketByChannel(channelId);
    if (!ticket) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This is not a ticket channel.",
            "Invalid Action",
            interaction.client,
          ),
        ],
      });
    }

    // Parse user ID from input
    const staffId = parseUserId(sanitizedStaffIdInput);
    if (!staffId) {
      return interaction.editReply({
        embeds: [
          createFormValidationErrorEmbed(
            "Invalid Staff ID",
            "Please enter a valid Discord user ID or @mention.",
            "Use format: @username or enter a 17-19 digit Discord ID.",
          ),
        ],
      });
    }

    // Check if target user is staff
    let targetMember;
    try {
      targetMember = await guild.members.fetch(staffId);
    } catch (_error) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Staff member not found in this server.",
            "Error",
            interaction.client,
          ),
        ],
      });
    }

    const isTargetStaff = await checkStaffRoleForMember(targetMember, guild.id);
    if (!isTargetStaff) {
      const staffRoleId = await getStaffRoleId(guild.id);
      const roleText = staffRoleId
        ? `the <@&${staffRoleId}> role`
        : "a staff role";
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Please select a user with ${roleText}.`,
            `${targetMember.user.tag} is not a staff member`,
            interaction.client,
          ),
        ],
      });
    }

    // Transfer the ticket
    const success = await ticketManager.transferTicket(
      ticket.ticketId,
      staffId,
    );
    if (!success) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Failed to transfer the ticket.",
            "Error",
            interaction.client,
          ),
        ],
      });
    }

    // Add user to channel permissions or thread members
    try {
      if (interaction.channel.isThread()) {
        await interaction.channel.members.add(targetMember.id);
      } else {
        await interaction.channel.permissionOverwrites.edit(targetMember, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }
    } catch (error) {
      logger.error("Failed to add staff member to channel/thread:", error);
    }

    // Notify everyone in the ticket
    await interaction.channel.send({
      embeds: [
        createSuccessEmbed(
          `This ticket has been transferred to ${targetMember} by ${interaction.user}.`,
          "Ticket Transferred",
          interaction.client,
        ),
      ],
    });

    // Ephemeral confirmation
    return interaction.editReply({
      embeds: [
        createSuccessEmbed(
          `Transferred to ${targetMember}.`,
          "Ticket Transferred",
          interaction.client,
        ),
      ],
    });
  } catch (_error) {
    logger.error("Transfer modal error:", _error);
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          `Failed to transfer ticket: ${_error.message}`,
          "Request Failed",
          interaction.client,
        ),
      ],
    });
  }
}

/**
 * Parse user ID from input (mention or raw ID)
 * @param {string} input - User input
 * @returns {string|null} User ID or null
 */
function parseUserId(input) {
  if (!input) return null;

  // Trim whitespace
  input = input.trim();

  // Check for mention format: <@123456789> or <@!123456789>
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }

  // Check for raw ID (17-19 digits - Discord ID format)
  if (/^\d{17,19}$/.test(input)) {
    return input;
  }

  return null;
}
