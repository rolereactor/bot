import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import config from "../../../../config/config.js";
import { getTicketManager } from "../../../../features/ticketing/TicketManager.js";
import { getTicketTranscript } from "../../../../features/ticketing/TicketTranscript.js";
import {
  createSuccessEmbed,
  createErrorEmbed,
  createTranscriptLogEmbed,
} from "../../../../features/ticketing/embeds.js";
import { checkStaffRole, formatDuration } from "../utils.js";
import { promptCsatOnClose } from "../../../../features/ticketing/csat.js";
import { getLogger } from "../../../../utils/logger.js";
import { InputSanitizer } from "../../../../utils/validation/inputValidation.js";

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// /ticket close
// ─────────────────────────────────────────────────────────────────────────────

export async function handleClose(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const reason = InputSanitizer.sanitize(
    interaction.options.getString("reason") || "No reason provided",
  );
  const ticketManager = getTicketManager();
  const ticketTranscript = getTicketTranscript();
  await ticketManager.initialize();
  await ticketTranscript.initialize();

  const ticket = await ticketManager.getTicketByChannel(interaction.channelId);

  if (!ticket) {
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "This is not a ticket channel.",
          "Invalid Context",
          interaction.client,
        ),
      ],
    });
  }

  const isOwner = ticket.userId === interaction.user.id;
  const isStaff = await checkStaffRole(interaction);
  const isAdmin = interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild,
  );

  if (!isOwner && !isStaff && !isAdmin) {
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "You must be the ticket owner, a staff member, or an administrator to close this ticket.",
          "Permission Denied",
          interaction.client,
        ),
      ],
    });
  }

  if (ticket.status === "closed") {
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "This ticket is already closed.",
          "Ticket Already Closed",
          interaction.client,
        ),
      ],
    });
  }

  // Check bot permissions
  const botMember = await interaction.guild.members.me;
  const isThread = interaction.channel.isThread();
  const requiredPerms = isThread
    ? PermissionFlagsBits.ManageThreads
    : PermissionFlagsBits.ManageChannels;

  if (!botMember.permissions.has(requiredPerms)) {
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          `I don't have the **${isThread ? "Manage Threads" : "Manage Channels"}** permission in this server.\n\n` +
            `I need this permission to delete the ticket channel/thread when closing.`,
          "Missing Permissions",
          interaction.client,
        ),
      ],
    });
  }

  await ticketTranscript.initialize();
  const transcriptResult = await ticketTranscript.generateFromChannel({
    ticketId: ticket.ticketId,
    guildId: ticket.guildId,
    channel: interaction.channel,
    ticket,
    format: "html",
  });

  const success = await ticketManager.closeTicket(
    ticket.ticketId,
    interaction.user.id,
    reason,
  );

  if (!success) {
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Failed to close ticket.",
          "Close Failed",
          interaction.client,
        ),
      ],
    });
  }

  // Ask the opener to rate the support experience (DM, best-effort)
  await promptCsatOnClose({
    client: interaction.client,
    guildId: ticket.guildId,
    ticket,
  });

  const duration = formatDuration(new Date(ticket.openedAt), new Date());

  const closeEmbed = createSuccessEmbed(
    `Closed by ${interaction.user}.\n**Duration:** ${duration}`,
    "Ticket Closed",
    interaction.client,
  );

  if (reason) {
    closeEmbed.addFields({ name: "Reason", value: reason, inline: false });
  }

  // Send close notification publicly so everyone sees it
  await interaction.channel.send({ embeds: [closeEmbed] });
  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        "This ticket has been closed. It will be deleted shortly.",
        "Ticket Closed",
        interaction.client,
      ),
    ],
  });

  // Handle log channel
  if (transcriptResult.success) {
    try {
      const settings =
        await ticketManager.storage.dbManager.guildSettings.getByGuild(
          interaction.guildId,
        );
      const logChannelId = settings?.ticketSettings?.transcriptChannelId;

      if (logChannelId) {
        const logChannel = await interaction.guild.channels
          .fetch(logChannelId)
          .catch(() => null);
        if (logChannel) {
          const botMember = await interaction.guild.members.me;
          const perms = logChannel.permissionsFor(botMember);

          if (
            !perms.has(PermissionFlagsBits.SendMessages) ||
            !perms.has(PermissionFlagsBits.ViewChannel)
          ) {
            logger.warn(
              `Cannot send transcript to log channel ${logChannelId} due to missing Send/View permissions.`,
            );
            await interaction.channel.send(
              "⚠️ **Warning:** Could not send the ticket transcript to the configured log channel because the bot is missing `Send Messages` or `View Channel` permissions there.",
            );
          } else {
            const payload = {};

            const logEmbed = createTranscriptLogEmbed({
              ticketId: ticket.ticketId,
              userName: ticket.userDisplayName || "Unknown",
              userId: ticket.userId,
              closedBy: interaction.user.tag,
              reason: reason || "No reason provided",
              duration: duration,
              messages: transcriptResult.transcript.messages,
              client: interaction.client,
            });

            const logRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel("View in Browser")
                .setStyle(ButtonStyle.Link)
                .setURL(
                  `${config.botInfo.apiUrl}/t/${transcriptResult.transcript.transcriptId}`,
                ),
            );

            payload.components = [logRow];

            if (perms.has(PermissionFlagsBits.EmbedLinks)) {
              payload.embeds = [logEmbed];
            } else {
              payload.content = `**Ticket Log • #${ticket.ticketId.split("-").pop()}**\nTicket Owner: <@${ticket.userId}>\nClosed By: ${interaction.user.tag}\nDuration: ${duration || "Unknown"}\nMessages: ${transcriptResult.transcript.messages?.length || "0"}`;
            }

            if (perms.has(PermissionFlagsBits.AttachFiles)) {
              const attachment = new AttachmentBuilder(
                Buffer.from(transcriptResult.content),
                {
                  name: `transcript-${ticket.ticketId.split("-").pop()}.html`,
                },
              );
              payload.files = [attachment];
            }

            await logChannel.send(payload);
          }
        }
      }
    } catch (err) {
      logger.debug(`Failed to send transcript to log channel: ${err.message}`);
    }
  }

  setTimeout(async () => {
    try {
      await interaction.channel.delete("Ticket closed");
    } catch (error) {
      logger.error("Failed to delete ticket channel/thread:", error);
    }
  }, 2000);
}
