import { Events } from "discord.js";
import {
  getRoleMapping,
  incrementRoleUsage,
  getRoleUsageCount,
} from "../utils/discord/roleMappingManager.js";
import { getLogger } from "../utils/logger.js";
import { getCachedMember, fetchFreshMember, enqueueForUser, userMutex } from "../utils/discord/roleManager.js";
import { StarboardManager } from "../features/starboard/StarboardManager.js";
import { markBotRemoval } from "../utils/discord/botReactionTracker.js";

export const name = Events.MessageReactionAdd;

export async function execute(reaction, user, client) {
  const logger = getLogger();

  if (!reaction) throw new Error("Missing reaction");
  if (!user) throw new Error("Missing user");
  if (!client) throw new Error("Missing client");

  try {
    // Check if reaction has emoji
    if (!reaction.emoji) {
      return;
    }

    // Get guild
    const guild = reaction.message?.guild;
    if (!guild) {
      return;
    }

    // Ignore bot reactions
    if (user.bot) {
      return;
    }

    // Process starboard reactions (fire and forget)
    StarboardManager.handleReaction(reaction, user).catch(err => {
      logger.error("Error in StarboardManager.handleReaction:", err);
    });

    // Get member using cached method to reduce API calls
    const member = await getCachedMember(guild, user.id);
    if (!member) {
      return;
    }

    // Note: Poll reactions are now handled by Discord's native poll system
    // This event handler only processes role assignment reactions

    // Get role mapping for this message
    const roleMapping = await getRoleMapping(reaction.message.id);
    if (!roleMapping) {
      return;
    }

    let rolesObj = roleMapping.roles ? roleMapping.roles : roleMapping;

    // Capture selectionMode before unwrapping (it lives alongside roles)
    const selectionMode =
      roleMapping.selectionMode || rolesObj.selectionMode || "standard";

    // Handle double-nested roles (cache stores { roles: {emoji_map}, hideList })
    if (
      rolesObj.roles &&
      typeof rolesObj.roles === "object" &&
      !Array.isArray(rolesObj.roles)
    ) {
      rolesObj = rolesObj.roles;
    }

    // Handle both custom emojis and Unicode emojis
    let emoji;
    if (reaction.emoji.id) {
      // Custom emoji: use the full format <:name:id>
      emoji = `<:${reaction.emoji.name}:${reaction.emoji.id}>`;
    } else {
      // Unicode emoji: use the name property
      emoji = reaction.emoji.name;
    }

    const roleConfig = rolesObj[emoji];
    if (!roleConfig) {
      return;
    }

    // Check max usage limit BEFORE assigning role
    if (roleConfig.limit && roleConfig.limit > 0) {
      const currentUsage = await getRoleUsageCount(reaction.message.id, emoji);
      if (currentUsage >= roleConfig.limit) {
        logger.info(
          `⛔ Max usage reached for ${emoji}: ${currentUsage}/${roleConfig.limit}`,
        );
        // Remove the user's reaction since they can't get the role
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }
    }

    // Handle multiple roles per emoji (Phase 1 implementation)
    let roleIds = [];

    // Check if this is a multi-role configuration
    if (roleConfig.roleIds && Array.isArray(roleConfig.roleIds)) {
      // Multiple roles stored as roleIds array
      roleIds = roleConfig.roleIds;
    } else if (roleConfig.roleId) {
      // Single role (legacy format)
      roleIds = [roleConfig.roleId];
    } else if (typeof roleConfig === "string") {
      // Simple string format (legacy)
      roleIds = [roleConfig];
    } else {
      // Fallback to finding by name
      const roleName =
        roleConfig.roleName || roleConfig.role || roleConfig.name;
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role) {
        roleIds = [role.id];
      }
    }

    if (roleIds.length === 0) {
      return;
    }

    // Handle Unique mode: remove other roles from this menu concurrently
    if (selectionMode === "unique") {
      // Serialize per-user to prevent race conditions when events overlap
      await enqueueForUser(guild.id, user.id, async () => {
        // Acquire mutex lock — waits for Discord to confirm any previous role changes
        // via GUILD_MEMBER_UPDATE before proceeding. This ensures member.roles.cache is fresh.
        await userMutex.lock(user.id);

        // Re-fetch member to avoid stale roles.cache (getCachedMember may return outdated data)
        // Uses fetchFreshMember which deduplicates concurrent requests for the same user
        const freshMember = await fetchFreshMember(guild, user.id);
        if (!freshMember) {
          userMutex.unlock(user.id);
          return;
        }

        // Fetch the message to access all reactions
        const message = reaction.message.partial
          ? await reaction.message.fetch()
          : reaction.message;

        logger.info(
          `[DEBUG-ADD] Unique mode: freshMember.roles.cache size=${freshMember.roles.cache.size}, ids=[${[...freshMember.roles.cache.keys()].join(",")}]`,
        );

        // Collect all remove operations to run in parallel
        const removeOps = [];

        // Build a set of the NEW emoji's role IDs to avoid removing shared roles
        const newEmojiRoleIds = new Set(roleIds);

        for (const [emojiKey, config] of Object.entries(rolesObj)) {
          // Skip non-role keys
          if (
            emojiKey === "hideList" ||
            emojiKey === "selectionMode" ||
            emojiKey === "roles"
          )
            continue;
          if (
            typeof config === "boolean" ||
            config === null ||
            config === undefined
          )
            continue;
          // Skip the current emoji (the one they just reacted to)
          if (emojiKey === emoji) continue;

          // Resolve role IDs for this emoji (support multiple roles)
          let otherRoleIds = [];
          if (config.roleIds && Array.isArray(config.roleIds)) {
            otherRoleIds = config.roleIds;
          } else if (config.roleId) {
            otherRoleIds = [config.roleId];
          } else if (typeof config === "string") {
            otherRoleIds = [config];
          }

          // Only remove roles that are NOT in the new emoji's role list (preserves shared roles)
          const rolesToRemoveFromMember = [];

          for (const otherRoleId of otherRoleIds) {
            const inCache = freshMember.roles.cache.has(otherRoleId);
            const inNewEmoji = newEmojiRoleIds.has(otherRoleId);
            if (otherRoleId && inCache && !inNewEmoji) {
              rolesToRemoveFromMember.push(otherRoleId);
            } else if (otherRoleId && !inCache && !inNewEmoji) {
              logger.info(
                `[DEBUG-ADD] Skipping removal of ${otherRoleId} from ${emojiKey} — not in freshMember cache`,
              );
            }
          }

          if (rolesToRemoveFromMember.length > 0) {
            logger.info(
              `[DEBUG-ADD] Will remove ${rolesToRemoveFromMember.length} role(s) from ${emojiKey}: [${rolesToRemoveFromMember.join(",")}]`,
            );
            removeOps.push(
              freshMember.roles
                .remove(rolesToRemoveFromMember)
                .catch(() => null)
                .then(() => {
                  for (const removedRole of rolesToRemoveFromMember) {
                    logger.info(
                      `🔄 Unique mode: removed role ${removedRole} from ${user.tag}`,
                    );
                  }
                }),
            );
          }

          // Queue reaction removal for the other emoji
          const otherReaction = message.reactions.cache.find(r => {
            if (r.emoji.id) {
              return `<:${r.emoji.name}:${r.emoji.id}>` === emojiKey;
            }
            return r.emoji.name === emojiKey;
          });

          if (otherReaction) {
            // Mark as bot-initiated so remove handler skips role cleanup
            markBotRemoval(reaction.message.id, emojiKey, user.id);
            removeOps.push(otherReaction.users.remove(user.id).catch(() => null));
          }
        }

        // Find which new roles the member doesn't have yet
        const rolesToAdd = roleIds.filter(id => !freshMember.roles.cache.has(id));

        logger.info(
          `[DEBUG-ADD] rolesToAdd=${rolesToAdd.length} [${rolesToAdd.join(",")}], removeOps=${removeOps.length}`,
        );

        if (rolesToAdd.length === 0 && removeOps.length === 0) {
          return;
        }

        const operations = [...removeOps];
        if (rolesToAdd.length > 0) {
          operations.push(
            freshMember.roles.add(rolesToAdd).then(() => {
              for (const newRole of rolesToAdd) {
                logger.info(`✅ Role assigned: ${newRole} to ${user.tag}`);
              }
            }),
          );
        }

        // Run all removals AND the new role grants simultaneously
        await Promise.all(operations);

        // Increment usage counter
        if (roleConfig.limit && roleConfig.limit > 0) {
          await incrementRoleUsage(reaction.message.id, emoji);
        }

        logger.info(
          `✅ Assigned ${roleIds.length} role(s) to ${user.tag} for emoji ${emoji}`,
        );

        // Record daily role reaction (fire-and-forget)
        import("../features/analytics/AnalyticsManager.js")
          .then(({ getAnalyticsManager }) => getAnalyticsManager())
          .then(am => am.recordRoleReaction(reaction.message.guild.id))
          .catch(() => {});
      });

      return;
    }

    // Standard toggle mode
    // Find missing roles
    const rolesToAdd = roleIds.filter(id => !member.roles.cache.has(id));

    if (rolesToAdd.length === 0) {
      return;
    }

    // Assign all roles in a single API call
    await member.roles.add(rolesToAdd);

    // Increment usage counter
    if (roleConfig.limit && roleConfig.limit > 0) {
      await incrementRoleUsage(reaction.message.id, emoji);
    }

    for (const newRole of rolesToAdd) {
      logger.info(`✅ Role assigned: ${newRole} to ${user.tag}`);
    }

    logger.info(
      `✅ Assigned ${roleIds.length} role(s) to ${user.tag} for emoji ${emoji}`,
    );

    // Record daily role reaction (fire-and-forget)
    import("../features/analytics/AnalyticsManager.js")
      .then(({ getAnalyticsManager }) => getAnalyticsManager())
      .then(am => am.recordRoleReaction(reaction.message.guild.id))
      .catch(() => {});
  } catch (error) {
    logger.error("Error processing reaction", error);
  }
}
