import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getTicketManager } from "../../../features/ticketing/TicketManager.js";
import {
  createCsatCommentButton,
  sendCsatRelay,
} from "../../../features/ticketing/csat.js";
import {
  createErrorEmbed,
  createSuccessEmbed,
} from "../../../features/ticketing/embeds.js";
import { THEME, UI_COMPONENTS } from "../../../config/theme.js";
import { validateModalInput } from "../../../utils/validation/formValidation.js";
import { getLogger } from "../../../utils/logger.js";

const logger = getLogger();

/**
 * Create the "rated" state embed for the original DM prompt message
 * @param {string} ticketNumber
 * @param {number} rating
 * @param {boolean} hasComment
 * @param {import('discord.js').Client} client
 * @returns {EmbedBuilder}
 */
function createRatedEmbed(ticketNumber, rating, hasComment, client) {
  return new EmbedBuilder()
    .setTitle("Thanks for your feedback!")
    .setDescription(
      `You rated ticket **#${ticketNumber}** **${rating} ★**.\n\n` +
        `Tap another star to change your rating${hasComment ? "." : ", or add an optional comment below."}`,
    )
    .setColor(THEME.PRIMARY)
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Ticketing System",
        client?.user?.displayAvatarURL() ?? undefined,
      ),
    )
    .setTimestamp();
}

/**
 * Handle a CSAT star button press (customId: ticket_csat:<ticketId>:<1-5>)
 * Only the ticket opener may rate, only on closed tickets.
 * Re-rating replaces the previous rating and keeps any comment.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleCsatRating(interaction) {
  try {
    const parts = interaction.customId.split(":");
    const ticketId = parts[1];
    const rating = parseInt(parts[2], 10);

    if (!ticketId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return interaction.reply({
        embeds: [
          createErrorEmbed("Invalid rating.", "Error", interaction.client),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const ticketManager = getTicketManager();
    await ticketManager.initialize();

    const ticket = await ticketManager.getTicket(ticketId);
    if (!ticket) {
      return interaction.reply({
        embeds: [
          createErrorEmbed("Ticket not found.", "Error", interaction.client),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (ticket.userId !== interaction.user.id) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Only the ticket creator can rate this ticket.",
            "Permission Denied",
            interaction.client,
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (ticket.status !== "closed") {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "This ticket cannot be rated yet.",
            "Not Closed",
            interaction.client,
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const isFirstRating = ticket.metadata?.feedbackRating == null;
    const ratedStaffId =
      ticket.claimedBy ||
      (ticket.closedBy && ticket.closedBy !== "system"
        ? ticket.closedBy
        : null);

    const success = await ticketManager.storage.setTicketFeedback(ticketId, {
      rating,
      ratedStaffId,
    });

    if (!success) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Failed to save your rating.",
            "Error",
            interaction.client,
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const ticketNumber = ticketId.split("-").pop();
    const hasComment =
      ticket.metadata?.feedbackComment != null &&
      ticket.metadata?.feedbackComment !== "";

    await interaction.update({
      embeds: [
        createRatedEmbed(ticketNumber, rating, hasComment, interaction.client),
      ],
      components: [
        ...buildStarRow(ticketId, rating),
        ...(hasComment ? [] : [createCsatCommentButton(ticketId)]),
      ],
    });

    if (isFirstRating) {
      try {
        const settings =
          await ticketManager.storage.dbManager.guildSettings.getByGuild(
            ticket.guildId,
          );
        await sendCsatRelay({
          client: interaction.client,
          guildId: ticket.guildId,
          relayChannelId: settings?.ticketSettings?.csatRelayChannelId || null,
          ticket,
          rating,
          comment: ticket.metadata?.feedbackComment || null,
          ratedStaffId,
          raterTag: interaction.user.tag,
        });
      } catch (err) {
        logger.debug(`CSAT relay failed for ${ticketId}: ${err.message}`);
      }
    }
  } catch (error) {
    logger.error("CSAT rating handler error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            createErrorEmbed(
              "Failed to save your rating.",
              "Error",
              interaction.client,
            ),
          ],
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => {});
    }
  }
}

/**
 * Rebuild the star row with the user's current selection highlighted
 * @param {string} ticketId
 * @param {number} selected
 * @returns {ActionRowBuilder[]}
 */
function buildStarRow(ticketId, selected) {
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_csat:${ticketId}:${i}`)
        .setLabel(`${i} ★`)
        .setStyle(i === selected ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return [row];
}

/**
 * Handle the "Add a comment" button (customId: ticket_csat_comment:<ticketId>)
 * Opens a modal for an optional comment.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleCsatCommentButton(interaction) {
  const ticketId = interaction.customId.split(":")[1];
  if (!ticketId) return;

  try {
    const modal = new ModalBuilder()
      .setCustomId(`ticket_csat_modal:${ticketId}`)
      .setTitle("Add a comment");

    const commentInput = new TextInputBuilder()
      .setCustomId("comment")
      .setLabel("Your feedback")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("What went well? What could be better?")
      .setRequired(false)
      .setMaxLength(500);

    const actionRow = new ActionRowBuilder().addComponents(commentInput);
    // @ts-ignore
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error("CSAT comment modal error:", error);
  }
}

/**
 * Handle the CSAT comment modal submit (customId: ticket_csat_modal:<ticketId>)
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleCsatCommentModal(interaction) {
  try {
    const ticketId = interaction.customId.split(":")[1];
    if (!ticketId) return;

    const ticketManager = getTicketManager();
    await ticketManager.initialize();

    const ticket = await ticketManager.getTicket(ticketId);
    if (
      !ticket ||
      ticket.userId !== interaction.user.id ||
      ticket.status !== "closed"
    ) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Cannot add a comment to this ticket.",
            "Error",
            interaction.client,
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const rawComment =
      interaction.fields.getTextInputValue("comment")?.trim() || "";

    const check = validateModalInput(rawComment, "comment", {
      required: false,
      maxLength: 500,
    });
    if (!check.valid) {
      return interaction.reply({
        embeds: [check.error],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const comment = check.sanitized || null;

    const success = await ticketManager.storage.setTicketFeedback(ticketId, {
      comment,
    });

    if (!success) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Failed to save your comment.",
            "Error",
            interaction.client,
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    return interaction.reply({
      embeds: [
        createSuccessEmbed(
          "Your comment has been saved. Thank you!",
          "Comment Saved",
          interaction.client,
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    logger.error("CSAT comment modal error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            createErrorEmbed(
              "Failed to save your comment.",
              "Error",
              interaction.client,
            ),
          ],
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => {});
    }
  }
}
