import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { THEME, EMOJIS, UI_COMPONENTS } from "../../../config/theme.js";
import { getLogger } from "../../../utils/logger.js";

// Setup Roles embed
export function createSetupRolesEmbed(
  title,
  description,
  color,
  validRoles,
  client,
  hideList = false,
) {
  const embed = new EmbedBuilder()
    .setTitle(title || "Role Reactions") // Simplified title
    .setDescription(description || "Click reactions to get roles") // Simplified description
    .setColor(color || THEME.PRIMARY) // Use THEME.PRIMARY
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Role Reactions",
        client.user.displayAvatarURL(),
      ),
    );

  const roleList = validRoles
    .map(role => {
      const limitText = role.limit ? ` (${role.limit} users max)` : "";
      // Check if role name already starts with the emoji
      const roleName = role.roleName || "";
      const emojiAlreadyInName = roleName.startsWith(role.emoji);
      const displayEmoji = emojiAlreadyInName ? "" : `${role.emoji} `;

      let roleMentions = "";
      if (role.roleIds && role.roleIds.length > 0) {
        roleMentions = role.roleIds.map(id => `<@&${id}>`).join(", ");
      } else {
        roleMentions = `<@&${role.roleId}>`;
      }

      return `${displayEmoji}${roleMentions}${limitText}`;
    })
    .join("\n");

  if (!hideList) {
    embed.addFields([
      {
        name: "Available Roles",
        value: roleList || "No roles available",
        inline: false,
      },
    ]);
  }

  return embed;
}

// List Roles embed with pagination
export function createListRolesEmbed(
  guildMappings,
  client,
  page = 1,
  itemsPerPage = 4,
  pagination = null,
) {
  // Use pagination data if provided, otherwise calculate it
  const totalPages = pagination
    ? pagination.totalPages
    : Math.ceil(guildMappings.length / itemsPerPage);
  const totalItems = pagination ? pagination.totalItems : guildMappings.length;

  const embed = new EmbedBuilder()
    .setTitle("Role Reaction Panels") // Simplified title
    .setDescription(
      `Found **${totalItems}** role-reaction panel${totalItems !== 1 ? "s" : ""} in this server.`,
    )
    .setColor(THEME.PRIMARY) // Use THEME.PRIMARY
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        `Role Reactions • Page ${page}/${totalPages}`,
        client.user.displayAvatarURL(),
      ),
    );

  if (guildMappings.length === 0) {
    embed.addFields([
      {
        name: "Panels",
        value: "No role-reaction panels found in this server.",
        inline: false,
      },
    ]);
    return { embed, totalPages, currentPage: page };
  }

  const fields = guildMappings.map(([messageId, mapping]) => {
    const rolesObj = mapping.roles || {};
    const rolesArr = Array.isArray(rolesObj)
      ? rolesObj
      : Object.values(rolesObj);

    const roleMentions = rolesArr
      .map(role =>
        role.roleId ? `<@&${role.roleId}>` : role.roleName || "Unknown",
      )
      .join(", ");

    const messageLink =
      mapping.channelId && mapping.guildId
        ? `https://discord.com/channels/${mapping.guildId}/${mapping.channelId}/${messageId}`
        : null;

    const channelInfo = messageLink
      ? `<#${mapping.channelId}> • [Jump to Message](${messageLink})`
      : mapping.channelId
        ? `<#${mapping.channelId}>`
        : "Unknown channel";

    return {
      name: `Message ID: ${messageId}`,
      value: `**Channel:** ${channelInfo}\n**Roles (${rolesArr.length}):** ${roleMentions}`,
      inline: false,
    };
  });

  embed.addFields(fields);

  return { embed, totalPages, currentPage: page };
}

// Create pagination buttons
export function createPaginationButtons(
  currentPage,
  totalPages,
  customIdPrefix = "rolelist",
) {
  const logger = getLogger();

  logger.debug("createPaginationButtons called", { customIdPrefix });
  const row = new ActionRowBuilder();

  // Previous button
  const prevCustomId = `${customIdPrefix}_prev_${Math.max(1, currentPage - 1)}`;
  logger.debug("Generated prevCustomId", { prevCustomId });
  const prevButton = new ButtonBuilder()
    .setCustomId(prevCustomId)
    .setLabel("Previous")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(EMOJIS.ACTIONS.BACK) // Use theme emoji
    .setDisabled(currentPage <= 1);

  // Next button
  const nextCustomId = `${customIdPrefix}_next_${Math.min(totalPages, currentPage + 1)}`;
  logger.debug("Generated nextCustomId", { nextCustomId });
  const nextButton = new ButtonBuilder()
    .setCustomId(nextCustomId)
    .setLabel("Next")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(EMOJIS.ACTIONS.FORWARD) // Use theme emoji
    .setDisabled(currentPage >= totalPages);

  // Page info button (disabled, just for display)
  const pageCustomId = `${customIdPrefix}_page_${currentPage}`;
  logger.debug("Generated pageCustomId", { pageCustomId });
  const pageButton = new ButtonBuilder()
    .setCustomId(pageCustomId)
    .setLabel(`Page ${currentPage}/${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  row.addComponents(prevButton, pageButton, nextButton);

  return [row];
}

// Update Roles embed
export function createUpdatedRolesEmbed(updatedMapping, roleMapping, client) {
  const embed = new EmbedBuilder()
    .setTitle(updatedMapping.title || "Role Reactions") // Simplified title
    .setDescription(updatedMapping.description || "React to get a role!") // Simplified description
    .setColor(updatedMapping.color || THEME.PRIMARY) // Use THEME.PRIMARY
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Role Reactions",
        client.user.displayAvatarURL(),
      ),
    );

  const rolesToShow = Object.values(roleMapping || {});
  const roleList = rolesToShow
    .map(pair => {
      const limitText = pair.limit ? ` (${pair.limit} users max)` : "";
      // Check if role name already starts with the emoji (to avoid duplication)
      const roleName = pair.roleName || "";
      const emojiAlreadyInName = roleName.startsWith(pair.emoji);
      const displayEmoji = emojiAlreadyInName ? "" : `${pair.emoji} `;

      let roleMentions = "";
      if (pair.roleIds && pair.roleIds.length > 0) {
        roleMentions = pair.roleIds.map(id => `<@&${id}>`).join(", ");
      } else {
        roleMentions = `<@&${pair.roleId}>`;
      }

      return `${displayEmoji}${roleMentions}${limitText}`;
    })
    .join("\n");

  if (!updatedMapping.hideList) {
    embed.addFields([
      {
        name: "Available Roles",
        value: roleList || "No roles available",
        inline: false,
      },
    ]);
  }

  return embed;
}
