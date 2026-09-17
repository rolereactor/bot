import { Events } from "discord.js";
import {
  getRoleMapping,
  decrementRoleUsage,
} from "../utils/discord/roleMappingManager.js";
import { getLogger } from "../utils/logger.js";
import { getCachedMember, fetchFreshMember, enqueueForUser, userMutex } from "../utils/discord/roleManager.js";
import { StarboardManager } from "../features/starboard/StarboardManager.js";
import { isBotRemoval } from "../utils/discord/botReactionTracker.js";

export const name = Events.MessageReactionRemove;

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

    // Note: Poll reactions are now handled by Discord's native poll system
    // This event handler only processes role assignment reactions

    // Get role mapping for this message
    const roleMapping = await getRoleMapping(reaction.message.id);
    if (!roleMapping) {
      return;
    }

    let rolesObj = roleMapping.roles ? roleMapping.roles : roleMapping;

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

    // Skip role removal if this was a bot-initiated reaction removal (unique mode)
    // The add handler already handled role cleanup when unique mode removed this reaction
    if (isBotRemoval(reaction.message.id, emoji, user.id)) {
      // Still decrement usage counter since the reaction was removed
      if (roleConfig.limit && roleConfig.limit > 0) {
        await decrementRoleUsage(reaction.message.id, emoji);
      }
      return;
    }

    // Handle multiple roles per emoji
    let roleIds = [];

    // Check if this is a multi-role configuration
    if (roleConfig.roleIds && Array.isArray(roleConfig.roleIds)) {
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

    // Get member using cached method to reduce API calls
    const member = await getCachedMember(guild, user.id);
    if (!member) {
      return;
    }

    // Check selection mode — in unique mode, shared roles should not be removed
    // because they may be assigned by another emoji the user has reacted to
    const selectionMode =
      roleMapping.selectionMode || rolesObj.selectionMode || "standard";

    let roleIdsToRemove = roleIds;
    let freshMember = null;

    if (selectionMode === "unique") {
      // Serialize per-user to prevent race conditions when events overlap
      await enqueueForUser(guild.id, user.id, async () => {
        // Acquire mutex lock — waits for Discord to confirm any previous role changes
        // via GUILD_MEMBER_UPDATE before proceeding. This ensures member.roles.cache is fresh.
        await userMutex.lock(user.id);

        // Re-fetch member to avoid stale roles.cache
        // Uses fetchFreshMember which deduplicates concurrent requests for the same user
        freshMember = await fetchFreshMember(guild, user.id);
        if (freshMember) {
          logger.info(
            `[DEBUG-REMOVE] Unique mode: freshMember.roles.cache size=${freshMember.roles.cache.size}, ids=[${[...freshMember.roles.cache.keys()].join(",")}]`,
          );
        }

        // Find all other emojis in this menu that the user has reacted to
        const message = reaction.message.partial
          ? await reaction.message.fetch()
          : reaction.message;

        const otherEmojisRoles = [];

        for (const [emojiKey, config] of Object.entries(rolesObj)) {
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
          // Skip the current emoji being removed
          if (emojiKey === emoji) continue;

          // Check if user has reacted with this other emoji
          const otherReaction = message.reactions.cache.find(r => {
            if (r.emoji.id) {
              return `<:${r.emoji.name}:${r.emoji.id}>` === emojiKey;
            }
            return r.emoji.name === emojiKey;
          });

          if (otherReaction) {
            // Fetch users to populate cache (cache is empty when event fires)
            const reactionUsers = await otherReaction.users.fetch().catch(() => null);
            if (reactionUsers && reactionUsers.has(user.id)) {
              // Collect role IDs from this other emoji
              if (config.roleIds && Array.isArray(config.roleIds)) {
                otherEmojisRoles.push(...config.roleIds);
              } else if (config.roleId) {
                otherEmojisRoles.push(config.roleId);
              } else if (typeof config === "string") {
                otherEmojisRoles.push(config);
              }
            }
          }
        }

        // Only remove roles that are NOT assigned by any other active emoji
        roleIdsToRemove = roleIds.filter(id => !otherEmojisRoles.includes(id));

        // Use fresh member cache for role check
        const memberForCheck = freshMember || member;

        // Determine which roles actually need to be removed
        const rolesToRemove = roleIdsToRemove.filter(id => memberForCheck.roles.cache.has(id));

        if (rolesToRemove.length === 0) {
          return;
        }

        // Remove roles via a single API call to prevent rate limits
        await member.roles.remove(rolesToRemove);

        // Decrement usage counter
        if (roleConfig.limit && roleConfig.limit > 0) {
          await decrementRoleUsage(reaction.message.id, emoji);
        }

        for (const id of rolesToRemove) {
          logger.info(`✅ Role removed: ${id} from ${user.tag}`);
        }
      });

      return;
    }

    // Standard mode — no serialization needed, roles are independent per emoji
    // Determine which roles actually need to be removed
    const rolesToRemove = roleIdsToRemove.filter(id => member.roles.cache.has(id));

    if (rolesToRemove.length === 0) {
      return;
    }

    // Remove roles via a single API call to prevent rate limits
    await member.roles.remove(rolesToRemove);

    // Decrement usage counter
    if (roleConfig.limit && roleConfig.limit > 0) {
      await decrementRoleUsage(reaction.message.id, emoji);
    }

    for (const id of rolesToRemove) {
      logger.info(`✅ Role removed: ${id} from ${user.tag}`);
    }
  } catch (error) {
    logger.error("Error processing reaction removal", error);
  }
}
