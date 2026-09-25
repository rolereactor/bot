import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import config from "../../../config/config.js";
import { getTicketManager } from "../../../features/ticketing/TicketManager.js";
import { getTicketTranscript } from "../../../features/ticketing/TicketTranscript.js";
import { getLogger } from "../../../utils/logger.js";
import {
  checkStaffRole,
  formatDuration,
  getStaffNotificationChannel,
} from "../../../features/ticketing/helpers.js";
import {
  createTicketClosedEmbed,
  createErrorEmbed,
  createSuccessEmbed,
  createTranscriptLogEmbed,
} from "../../../features/ticketing/embeds.js";
import { promptCsatOnClose } from "../../../features/ticketing/csat.js";

const logger = getLogger();

/**
 * Handle ticket close button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleTicketClose(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    // Initialize managers
    const ticketManager = getTicketManager();
    const ticketTranscript = getTicketTranscript();
    await ticketManager.initialize();
    await ticketTranscript.initialize();

    // Get ticket
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

    // Check authorization
    const isOwner = ticket.userId === userId;
    const isStaff = await checkStaffRole(interaction);

    if (!isOwner && !isStaff) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "You can only close your own tickets.",
            "Permission Denied",
            interaction.client,
          ),
        ],
      });
    }

    // Check bot permissions
    const botMember = await interaction.guild.members.fetchMe();
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

    // Generate transcript
    const transcriptResult = await ticketTranscript.generateFromChannel({
      ticketId: ticket.ticketId,
      guildId: ticket.guildId,
      channel: interaction.channel,
      ticket,
      format: "html",
    });

    // Close ticket
    const success = await ticketManager.closeTicket(
      ticket.ticketId,
      userId,
      "Closed via button",
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

    // Calculate duration
    const duration = formatDuration(new Date(ticket.openedAt), new Date());

    // Send close message
    const closeEmbed = createTicketClosedEmbed({
      ticketNumber: ticket.ticketId.split("-").pop(),
      closedBy: `<@${interaction.user.id}>`,
      reason: "Closed via button",
      duration,
      client: interaction.client,
    });

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
                reason: "Closed via button",
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
        logger.debug(
          `Failed to send transcript to log channel: ${err.message}`,
        );
      }
    }

    // 5. Update staff alert message if it exists
    try {
      const staffChannel = await getStaffNotificationChannel(interaction.guild);
      if (staffChannel) {
        const ticketNum = ticket.ticketId.split("-").pop();
        const messages = await staffChannel.messages.fetch({ limit: 50 });
        const alertMsg = messages.find(
          m =>
            m.author.id === interaction.client.user.id &&
            m.embeds.length > 0 &&
            (m.embeds[0].title?.includes(`#${ticketNum}`) ||
              m.embeds[0].description?.includes(`#${ticketNum}`)),
        );

        if (alertMsg) {
          const oldEmbed = alertMsg.embeds[0];
          const newEmbed = EmbedBuilder.from(oldEmbed)
            .setColor(0xe74c3c) // Red for closed
            .setTitle(`🔒 Ticket Closed: #${ticketNum}`)
            .setDescription(
              oldEmbed.description.replace(
                /\*\*Thread:\*\* <#\d+>/,
                `**Thread:** \`ticket-${ticketNum}\` (Closed)`,
              ),
            )
            .setFields(
              ...oldEmbed.fields
                .filter(f => f.name !== "Status")
                .concat({
                  name: "Status",
                  value: `✅ Closed by <@${userId}>`,
                  inline: false,
                }),
            );

          await alertMsg.edit({
            embeds: [newEmbed],
            components: [], // Remove the claim button
          });
        }
      }
    } catch (err) {
      logger.debug(`Failed to update staff alert on close: ${err.message}`);
    }

    // Delete channel or thread after delay
    setTimeout(async () => {
      try {
        await interaction.channel.delete("Ticket closed");
      } catch (error) {
        logger.error("Failed to delete ticket channel/thread:", error);
      }
    }, 2000);
  } catch (error) {
    logger.error("Ticket close error:", error);
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          `Failed to close ticket: ${error.message}`,
          "Close Failed",
          interaction.client,
        ),
      ],
    });
  }
}
