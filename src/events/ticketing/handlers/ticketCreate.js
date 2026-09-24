import {
  ChannelType,
  ThreadAutoArchiveDuration,
  MessageFlags,
} from "discord.js";
import { getTicketManager } from "../../../features/ticketing/TicketManager.js";
import { getTicketPanel } from "../../../features/ticketing/TicketPanel.js";
import { getLogger } from "../../../utils/logger.js";
import {
  getStaffRoles,
  getStaffNotificationChannel,
} from "../../../features/ticketing/helpers.js";
import {
  createTicketWelcomeEmbed,
  createTicketActionButtons,
  createStaffAlertEmbed,
  createStaffAlertButtons,
  createErrorEmbed,
  createSuccessEmbed,
} from "../../../features/ticketing/embeds.js";

const logger = getLogger();

/**
 * Handle ticket creation from panel button
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} customId
 */
export async function handleTicketCreate(interaction, customId) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const categoryId = customId.replace("ticket_create_", "");
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const guild = interaction.guild;

    // Initialize managers
    const ticketManager = getTicketManager();
    const ticketPanel = getTicketPanel();
    await ticketManager.initialize();
    await ticketPanel.initialize();

    // Verify required settings are configured
    const guildSettings =
      await ticketManager.storage.dbManager.guildSettings.getByGuild(guildId);
    const ts = guildSettings?.ticketSettings;

    if (
      !ts?.staffRoleId ||
      !ts?.transcriptChannelId ||
      !ts?.notificationChannelId
    ) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "The ticketing system is not fully configured yet. An administrator needs to set up the **Staff Role**, **Log Channel**, and **Notify Channel** in `/ticket settings` before tickets can be created.",
            "Setup Incomplete",
            interaction.client,
          ),
        ],
      });
    }

    // Check ticket limit
    const limitCheck = await ticketManager.checkTicketLimit(guildId);
    if (limitCheck.hasReachedLimit) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Please wait before creating another ticket or close existing ones.`,
            "Ticket Limit Reached",
            interaction.client,
          ),
        ],
      });
    }

    // Check if user already has open tickets
    let openTickets = await ticketManager.getUserTickets(
      userId,
      guildId,
      "open",
    );

    // Clean up ghost tickets (DB says open, but channel is gone)
    if (openTickets.length > 0) {
      const activeTickets = [];
      for (const t of openTickets) {
        const exists = await guild.channels
          .fetch(t.channelId)
          .catch(() => null);
        if (!exists) {
          logger.info(
            `Cleaning up ghost ticket: ${t.ticketId} (Channel missing)`,
          );
          await ticketManager.storage.closeTicket(t.ticketId, {
            closedBy: "SYSTEM",
            reason: "Thread missing/deleted",
          });
        } else {
          activeTickets.push(t);
        }
      }
      openTickets = activeTickets;
    }

    // Get max tickets per user from settings (default: 1)
    const settings =
      await ticketManager.storage.dbManager.guildSettings.getByGuild(guildId);
    const maxTicketsPerUser = settings?.ticketSettings?.maxTicketsPerUser ?? 1;

    if (openTickets.length >= maxTicketsPerUser) {
      const existingTicket = openTickets[0];
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            maxTicketsPerUser === 1
              ? `You already have an open ticket!\n\n` +
                  `Ticket: \`#${existingTicket.ticketId.split("-").pop()}\`\n` +
                  `Channel: <#${existingTicket.channelId}>\n\n` +
                  `Please close your existing ticket before creating a new one.`
              : `You have reached the maximum of **${maxTicketsPerUser}** open tickets.\n\n` +
                  `Oldest: \`#${existingTicket.ticketId.split("-").pop()}\` — <#${existingTicket.channelId}>\n\n` +
                  `Please close an existing ticket before creating a new one.`,
            "Ticket Limit Reached",
            interaction.client,
          ),
        ],
      });
    }

    // Get panel info
    const panel = await ticketPanel.getPanelByMessage(interaction.message.id);
    if (!panel) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This ticket panel is no longer valid. Please contact an administrator.",
            "Panel Not Found",
            interaction.client,
          ),
        ],
      });
    }

    if (panel.settings?.enabled === false) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This ticket panel is currently disabled. Please try again later or contact an administrator.",
            "Panel Disabled",
            interaction.client,
          ),
        ],
      });
    }

    // Get next ticket number from atomic counter (peek only, actual increment happens in TicketManager.createTicket)
    const ticketNumber = (settings?.counters?.ticket || 0) + 1;
    const channelName = `ticket-${ticketNumber.toString().padStart(4, "0")}`;

    // Check bot permissions before creating thread
    const botMember = await guild.members.fetchMe();
    const panelChannelPermissions =
      interaction.channel.permissionsFor(botMember);

    if (
      !panelChannelPermissions?.has("CreatePrivateThreads") ||
      !panelChannelPermissions?.has("SendMessagesInThreads")
    ) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "I don't have permission to create private threads here.\n\n" +
              "Please make sure I have the **Create Private Threads** and **Send Messages in Threads** permissions enabled.",
            "Missing Permissions",
            interaction.client,
          ),
        ],
      });
    }

    let channel;
    let ticket;
    let staffRoles = [];

    try {
      staffRoles = await getStaffRoles(guild);

      if (!("threads" in interaction.channel)) {
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              "Tickets cannot be created here. This channel type does not support threads.",
              "Unsupported Channel",
              interaction.client,
            ),
          ],
        });
      }

      // Create strictly private thread
      channel = await interaction.channel.threads.create({
        name: channelName,
        // @ts-ignore
        type: ChannelType.GuildPrivateThread,
        // @ts-ignore
        invitable: false,
        // @ts-ignore
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Support ticket created by ${interaction.user.tag}`,
      });

      // Verify thread type was created correctly
      if (channel && channel.type !== ChannelType.GuildPrivateThread) {
        logger.warn(
          `CRITICAL: Thread created as public or incorrect type (${channel.type}) instead of Private (12). Ticket ID: ${ticketNumber}`,
        );
      } else {
        logger.debug(
          `Private thread created: ${channelName} (ID: ${channel.id})`,
        );
      }

      // Add user to the thread explicitly
      await channel.members.add(userId);

      // Create ticket in database
      ticket = await ticketManager.createTicket({
        guildId,
        channelId: channel.id,
        userId,
        userDisplayName: interaction.user.displayName,
        categoryId: categoryId === "default" ? "default" : categoryId,
      });

      if (!ticket) {
        await channel.delete("Failed to create ticket in database");
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              "Failed to create ticket. Please try again.",
              "Ticket Creation Failed",
              interaction.client,
            ),
          ],
        });
      }
    } catch (error) {
      logger.error("Ticket create error:", error);

      let errorMessage = "Please try again or contact an administrator.";
      let errorTitle = "Failed to Create Ticket";

      if (error.code === 50013) {
        errorMessage =
          "I don't have enough permissions to create the ticket thread.\n\n" +
          "Please verify that I have the **Create Private Threads** permission in this channel.";
        errorTitle = "Missing Permissions";
      }

      return interaction.editReply({
        embeds: [
          createErrorEmbed(errorMessage, errorTitle, interaction.client),
        ],
      });
    }

    // Get category settings from panel structure
    const panelCategories = panel.categories || [];
    let selectedCategory = panelCategories.find(c => c.id === categoryId);

    // Provide safe defaults if the category was deleted or is the default
    if (!selectedCategory) {
      selectedCategory = {
        name: "General Support",
        description: "A staff member will arrive shortly to assist you.",
        emoji: "🎫",
        color: 0x5865f2,
        id: "default",
      };
    }

    // Send welcome message using specific category data
    const welcomeEmbed = createTicketWelcomeEmbed({
      ticketId: ticket.ticketId,
      ticketNumber: ticketNumber.toString().padStart(4, "0"),
      userName: `<@${userId}>`,
      category: selectedCategory,
      client: interaction.client,
    });

    const actionButtons = createTicketActionButtons({
      canClaim: false,
      canClose: true,
      canAddUser: false,
      isClaimed: false,
    });

    await channel.send({
      embeds: [welcomeEmbed],
      // @ts-ignore
      components: actionButtons,
    });

    // Notify user
    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          `Your ticket has been created: ${channel}\n\n` +
            `Please describe your issue and our team will help you shortly.`,
          "Ticket Created",
          interaction.client,
        ),
      ],
    });

    // 🚀 Quiet Claim: Notify staff channel with a Claim button
    const staffChannel = await getStaffNotificationChannel(guild);
    if (staffChannel) {
      const staffAlertEmbed = createStaffAlertEmbed({
        ticketId: ticket.ticketId,
        ticketNumber: ticketNumber.toString().padStart(4, "0"),
        userName: interaction.user.tag,
        userId: interaction.user.id,
        channelId: channel.id,
        channelName: channel.name,
        guildId: interaction.guildId,
        category: selectedCategory,
        client: interaction.client,
      });

      const staffAlertButtons = createStaffAlertButtons({
        ticketId: ticket.ticketId,
      });

      await staffChannel.send({
        embeds: [staffAlertEmbed],
        components: staffAlertButtons,
        allowedMentions: { roles: staffRoles.map(r => r.id) },
      });
    }
  } catch (error) {
    logger.error("Ticket create error:", error);
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          `Failed to create ticket: ${error.message}`,
          "Request Failed",
          interaction.client,
        ),
      ],
    });
  }
}
