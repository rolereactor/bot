import { getTicketTranscript } from "../../features/ticketing/TicketTranscript.js";
import { getTicketManager } from "../../features/ticketing/TicketManager.js";
import { createTicketClosedEmbed } from "../../features/ticketing/embeds.js";
import { formatDuration } from "../../features/ticketing/helpers.js";
import { getLogger } from "../../utils/logger.js";

const logger = getLogger();
let cleanupInterval = null;

/**
 * Auto-cleanup cron job for expired transcripts and tickets
 * Runs every 6 hours
 * @param {import('discord.js').Client} client - Discord client instance
 */
export function startTicketCleanup(client) {
  logger.info("🎫 Starting ticket cleanup cron job...");

  // Run every 6 hours
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;

  cleanupInterval = setInterval(async () => {
    try {
      await runCleanup(client);
    } catch (error) {
      logger.error("Ticket cleanup error:", error);
    }
  }, CLEANUP_INTERVAL).unref();

  // Run on startup
  setTimeout(() => {
    runCleanup(client).catch(error => {
      logger.error("Initial ticket cleanup error:", error);
    });
  }, 60000); // 1 minute after startup

  logger.info("✅ Ticket cleanup cron job started (runs every 6 hours)");
}

/**
 * Run cleanup for all guilds
 * @param {import('discord.js').Client} client - Discord client instance
 */
async function runCleanup(client) {
  try {
    if (!client) {
      logger.warn("Discord client not available, skipping ticket cleanup");
      return;
    }

    const storage = await import("../../utils/storage/storageManager.js");
    const storageManager = await storage.getStorageManager();

    if (!storageManager.dbManager) {
      logger.warn("Database not available, skipping ticket cleanup");
      return;
    }

    // Get all guilds with tickets using aggregation
    const result = await storageManager.dbManager.tickets.collection
      .aggregate([
        { $match: { status: "open" } },
        { $group: { _id: "$guildId" } },
      ])
      .toArray();

    const guildIds = result.map(r => r._id);

    let totalDeleted = 0;
    let totalTranscriptsDeleted = 0;

    for (const guildId of guildIds) {
      try {
        const cleanupResult = await cleanupGuild(
          guildId,
          storageManager,
          client,
        );
        totalDeleted += cleanupResult.ticketsDeleted;
        totalTranscriptsDeleted += cleanupResult.transcriptsDeleted;
      } catch (error) {
        logger.error(`Cleanup error for guild ${guildId}:`, error.message);
      }
    }

    if (totalDeleted > 0 || totalTranscriptsDeleted > 0) {
      logger.info(
        `🎫 Ticket cleanup complete: ` +
          `${totalDeleted} tickets, ${totalTranscriptsDeleted} transcripts deleted`,
      );
    } else {
      logger.debug("🎫 Ticket cleanup: No expired tickets found");
    }
  } catch (error) {
    logger.error("Ticket cleanup run error:", error);
  }
}

/**
 * Cleanup expired tickets and transcripts for a guild
 * @param {string} guildId - Guild ID
 * @param {Object} storageManager - Storage manager instance
 * @param {import('discord.js').Client} client - Discord client instance
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupGuild(guildId, storageManager, client) {
  const ticketManager = getTicketManager();
  const ticketTranscript = getTicketTranscript();

  await ticketManager.initialize();
  await ticketTranscript.initialize();

  // Get expired tickets (7+ days inactive for free, 30+ for pro)
  const expiredTickets = await ticketManager.getExpiredTickets(guildId);

  let ticketsDeleted = 0;
  let transcriptsDeleted = 0;

  for (const ticket of expiredTickets) {
    try {
      // Check if channel still exists
      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        // Guild no longer exists, delete ticket
        await ticketManager.deleteTicket(ticket.ticketId);
        ticketsDeleted++;
        continue;
      }

      const channel = await guild.channels
        .fetch(ticket.channelId)
        .catch(() => null);

      if (!channel) {
        // Channel deleted, clean up database
        await ticketManager.deleteTicket(ticket.ticketId);
        ticketsDeleted++;
        logger.info(
          `🎫 Deleted ticket ${ticket.ticketId} (channel no longer exists)`,
        );
        continue;
      }

      // Get settings to determine tier limits and auto-close days
      const isPro = await ticketManager.premiumManager.isFeatureActive(
        guildId,
        "pro_engine",
      );
      const settings = await ticketManager.storage.dbManager.guildSettings.getByGuild(guildId);
      const autoCloseDays = settings?.ticketSettings?.autoCloseDays ?? (isPro ? 30 : 7);
      const inactiveDays = autoCloseDays || (isPro ? 30 : 7);
      const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;

      // Check last message activity
      const messages = await channel.messages
        .fetch({ limit: 1 })
        .catch(() => null);
      let lastActivity = new Date(ticket.updatedAt).getTime();

      if (messages && messages.size > 0) {
        lastActivity = messages.first().createdAt.getTime();
      }

      const timeSinceActivity = Date.now() - lastActivity;

      if (timeSinceActivity > inactiveMs) {
        // Generate transcript before closing
        await ticketTranscript.generateFromChannel({
          ticketId: ticket.ticketId,
          guildId,
          channel,
          ticket,
          format: "html",
        });

        // Send a final notification embed
        const duration = formatDuration(new Date(ticket.openedAt), new Date());
        const closeEmbed = createTicketClosedEmbed({
          ticketNumber: ticket.ticketId.split("-").pop(),
          closedBy: "System",
          reason: `Auto-closed: inactive for ${inactiveDays}+ days`,
          duration,
          client: guild.client,
        });

        try {
          await channel.send({ embeds: [closeEmbed] });
        } catch (_e) {
          logger.warn(`Could not send auto-close message in ${channel.id}`);
        }

        // Close and delete
        await ticketManager.closeTicket(
          ticket.ticketId,
          "system",
          `Auto-closed: inactive for ${inactiveDays}+ days`,
        );

        // Delete channel or thread after a short delay so the message is visible for a moment
        setTimeout(async () => {
          try {
            await channel.delete(
              `Auto-closed: inactive for ${inactiveDays}+ days`,
            );
          } catch (error) {
            logger.error(
              "Failed to delete ticket channel during cleanup:",
              error,
            );
          }
        }, 2000);

        ticketsDeleted++;
        logger.info(
          `🎫 Auto-closed ticket ${ticket.ticketId} (inactive for ${inactiveDays}+ days)`,
        );
      }
    } catch (error) {
      logger.error(
        `Cleanup error for ticket ${ticket.ticketId}:`,
        error.message,
      );
    }
  }

  // Cleanup expired transcripts
  transcriptsDeleted = await ticketTranscript.cleanupExpired(guildId);

  return { ticketsDeleted, transcriptsDeleted };
}

/**
 * Stop the cleanup cron job
 */
export function stopTicketCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  logger.info("🎫 Ticket cleanup cron job stopped.");
}
