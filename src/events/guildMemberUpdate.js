import { Events, PermissionFlagsBits } from "discord.js";
import { getLogger } from "../utils/logger.js";
import { getStorageManager } from "../utils/storage/storageManager.js";
import { getDatabaseManager } from "../utils/storage/databaseManager.js";
import { fireEventTriggers } from "../utils/core/CustomEventExecutor.js";
import { userMutex } from "../utils/discord/roleManager.js";

/**
 * Handle guild member updates (including role changes)
 * @param {import("discord.js").GuildMember} oldMember - Previous member state
 * @param {import("discord.js").GuildMember} newMember - New member state
 * @param {import("discord.js").Client} _client - Discord client (passed by event handler, unused)
 */
export async function execute(oldMember, newMember, _client) {
  const logger = getLogger();

  try {
    // Skip if not in a guild
    if (!newMember.guild) return;

    // Release mutex lock when roles change (confirms Discord applied the changes)
    // This unblocks reaction handlers waiting on userMutex.lock()
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());

    if (oldRoleIds.size !== newRoleIds.size ||
        [...oldRoleIds].some(id => !newRoleIds.has(id)) ||
        [...newRoleIds].some(id => !oldRoleIds.has(id))) {
      userMutex.unlock(newMember.id);
    }

    // Find newly added roles
    const addedRoles = Array.from(newRoleIds).filter(
      roleId => !oldRoleIds.has(roleId),
    );

    // Find removed roles
    const removedRoles = Array.from(oldRoleIds).filter(
      roleId => !newRoleIds.has(roleId),
    );

    // Phase 6: Event Triggers for roles
    const dbManager = await getDatabaseManager();
    const eventContext = {
      guild: newMember.guild,
      member: newMember,
      user: newMember.user,
      client: _client,
      dbManager,
    };

    if (addedRoles.length > 0) {
      try {
        await fireEventTriggers(newMember.guild.id, "role_add", eventContext);
      } catch (triggerError) {
        logger.error(`Error firing role_add triggers:`, triggerError);
      }
    }

    if (removedRoles.length > 0) {
      try {
        await fireEventTriggers(
          newMember.guild.id,
          "role_remove",
          eventContext,
        );
      } catch (triggerError) {
        logger.error(`Error firing role_remove triggers:`, triggerError);
      }
    }

    if (addedRoles.length === 0) return;

    // Get voice control roles for this guild
    const storageManager = await getStorageManager();
    const settings = await storageManager.getVoiceControlRoles(
      newMember.guild.id,
    );

    if (
      (!settings.disconnectRoleIds ||
        settings.disconnectRoleIds.length === 0) &&
      (!settings.muteRoleIds || settings.muteRoleIds.length === 0) &&
      (!settings.deafenRoleIds || settings.deafenRoleIds.length === 0) &&
      (!settings.moveRoleMappings ||
        Object.keys(settings.moveRoleMappings).length === 0)
    ) {
      return;
    }

    const botMember = newMember.guild.members.me;

    // Check for disconnect roles
    const hasDisconnectRole = addedRoles.some(roleId =>
      settings.disconnectRoleIds?.includes(roleId),
    );

    if (hasDisconnectRole && newMember.voice?.channel) {
      if (botMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        try {
          await newMember.voice.disconnect(
            "Automatically disconnected due to role assignment",
          );
          logger.info(
            `🔌 Disconnected ${newMember.user.tag} from voice channel due to disconnect role assignment`,
          );
        } catch (error) {
          logger.error(
            `Failed to disconnect ${newMember.user.tag} from voice channel:`,
            error.message,
          );
        }
      } else {
        logger.warn(
          `Cannot disconnect ${newMember.user.tag} - bot missing MoveMembers permission in ${newMember.guild.name}`,
        );
      }
    }

    // Check for mute roles
    const hasMuteRole = addedRoles.some(roleId =>
      settings.muteRoleIds?.includes(roleId),
    );

    if (hasMuteRole && newMember.voice?.channel) {
      if (botMember?.permissions.has(PermissionFlagsBits.MuteMembers)) {
        try {
          // Only mute if not already muted
          if (!newMember.voice.mute) {
            await newMember.voice.setMute(
              true,
              "Automatically muted due to role assignment",
            );
            logger.info(
              `🔇 Muted ${newMember.user.tag} in voice channel due to mute role assignment`,
            );
          } else {
            logger.debug(
              `User ${newMember.user.tag} already muted, skipping mute action`,
            );
          }
        } catch (error) {
          logger.error(
            `Failed to mute ${newMember.user.tag} in voice channel:`,
            error.message,
          );
        }
      } else {
        logger.warn(
          `Cannot mute ${newMember.user.tag} - bot missing MuteMembers permission in ${newMember.guild.name}`,
        );
      }
    }

    // Check for deafen roles
    const hasDeafenRole = addedRoles.some(roleId =>
      settings.deafenRoleIds?.includes(roleId),
    );

    if (hasDeafenRole && newMember.voice?.channel) {
      if (botMember?.permissions.has(PermissionFlagsBits.DeafenMembers)) {
        try {
          // Only deafen if not already deafened
          if (!newMember.voice.deaf) {
            await newMember.voice.setDeaf(
              true,
              "Automatically deafened due to role assignment",
            );
            logger.info(
              `🔊 Deafened ${newMember.user.tag} in voice channel due to deafen role assignment`,
            );
          } else {
            logger.debug(
              `User ${newMember.user.tag} already deafened, skipping deafen action`,
            );
          }
        } catch (error) {
          logger.error(
            `Failed to deafen ${newMember.user.tag} in voice channel:`,
            error.message,
          );
        }
      } else {
        logger.warn(
          `Cannot deafen ${newMember.user.tag} - bot missing DeafenMembers permission in ${newMember.guild.name}`,
        );
      }
    }

    // Check for move roles
    const moveRole = addedRoles.find(
      roleId => settings.moveRoleMappings?.[roleId],
    );

    if (moveRole) {
      const targetChannelId = settings.moveRoleMappings[moveRole];
      const targetChannel = newMember.guild.channels.cache.get(targetChannelId);

      if (!targetChannel) {
        logger.warn(
          `Cannot move ${newMember.user.tag} - target channel ${targetChannelId} not found (may have been deleted)`,
        );
        return;
      }

      if (!targetChannel.isVoiceBased()) {
        logger.warn(
          `Cannot move ${newMember.user.tag} - target channel ${targetChannel.name} is not a voice channel`,
        );
        return;
      }

      // Check if user is already in the target channel
      if (newMember.voice?.channelId === targetChannelId) {
        logger.debug(
          `User ${newMember.user.tag} already in target channel ${targetChannel.name}, skipping move`,
        );
        return;
      }

      if (botMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        // Check bot permissions for the target channel
        const botPermissions = targetChannel.permissionsFor(botMember);
        if (
          !botPermissions?.has("Connect") ||
          !botPermissions?.has("MoveMembers")
        ) {
          logger.warn(
            `Cannot move ${newMember.user.tag} to ${targetChannel.name} - bot missing permissions in target channel`,
          );
          return;
        }

        try {
          await newMember.voice.setChannel(
            targetChannel,
            "Automatically moved due to role assignment",
          );
          logger.info(
            `🚚 Moved ${newMember.user.tag} to ${targetChannel.name} due to move role assignment`,
          );
        } catch (error) {
          logger.error(
            `Failed to move ${newMember.user.tag} to voice channel:`,
            error.message,
          );
        }
      } else {
        logger.warn(
          `Cannot move ${newMember.user.tag} - bot missing MoveMembers permission in ${newMember.guild.name}`,
        );
      }
    }
  } catch (error) {
    logger.error("Error in guildMemberUpdate handler:", error);
  }
}

export const name = Events.GuildMemberUpdate;
export const once = false;
