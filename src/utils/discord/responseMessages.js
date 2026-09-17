// src/utils/responseMessages.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { THEME, EMOJIS } from "../../config/theme.js";

/**
 * A factory for creating standardized embeds.
 */
class EmbedFactory {
  constructor(theme, emojis) {
    this.theme = theme;
    this.emojis = emojis;
  }

  /**
   * Creates a base embed with a specified type.
   * @param {('SUCCESS'|'ERROR'|'WARNING'|'INFO'|'PRIMARY')} type - The type of embed.
   * @param {object} options - The options for the embed.
   * @param {string} options.title - The title of the embed.
   * @param {string} options.description - The description of the embed.
   * @param {Array<object>} [options.fields=[]] - The fields to add to the embed.
   * @param {string} [options.footer=null] - The footer text.
   * @param {string} [options.emoji=null] - Custom emoji to use instead of default status emoji.
   * @param {boolean} [options.isPremium=false] - Use premium/gold color for the embed.
   * @returns {EmbedBuilder}
   */
  create(
    type,
    {
      title,
      description,
      fields = [],
      footer = null,
      emoji = null,
      isPremium = false,
    },
  ) {
    const embed = new EmbedBuilder().setTimestamp();
    const statusEmoji = emoji || this.emojis.STATUS[type] || "";

    // Use premium color if isPremium is true
    if (isPremium) {
      embed.setColor(this.theme.PRO);
    } else {
      switch (type) {
        case "SUCCESS":
          embed.setColor(this.theme.SUCCESS);
          break;
        case "ERROR":
          embed.setColor(this.theme.ERROR);
          break;
        case "WARNING":
          embed.setColor(this.theme.WARNING);
          break;
        case "INFO":
          embed.setColor(this.theme.INFO);
          break;
        default:
          embed.setColor(this.theme.PRIMARY);
          break;
      }
    }

    embed.setTitle(`${statusEmoji} ${title}`.trim());
    // Discord requires description if title is present - always set it
    const safeDescription =
      description &&
      typeof description === "string" &&
      description.trim().length > 0
        ? description.trim()
        : "An error occurred. Please try again.";
    embed.setDescription(safeDescription);

    if (fields.length > 0) {
      embed.addFields(fields);
    }

    if (footer) {
      embed.setFooter({ text: footer });
    }

    return embed;
  }
}

const embedFactory = new EmbedFactory(THEME, EMOJIS);

// --- Role Setup Responses ---

/**
 * Return shape of the response helpers below: a ready-to-send message
 * options object (embed + Ephemeral flag). Pass these DIRECTLY to
 * reply()/editReply()/followUp() — do NOT wrap them again in
 * { embeds: [ helper(...) ] }, which would double-nest the payload.
 * @typedef {import("discord.js").BaseMessageOptions & { flags: number }} MessagePayloadOptions
 * @returns {MessagePayloadOptions}
 */
export function roleCreatedEmbed({ messageUrl, roleCount, channelId }) {
  const embed = embedFactory.create("SUCCESS", {
    title: "Role Setup Complete",
    description: `Your role-reaction panel has been created successfully.`,
    fields: [
      {
        name: "Channel",
        value: `<#${channelId}>`,
        inline: true,
      },
      {
        name: "Roles Configured",
        value: `${roleCount} role${roleCount !== 1 ? "s" : ""} available`,
        inline: true,
      },
      {
        name: "Created",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
    ],
    footer: "Role Reactor • Role Reactions",
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("View Message")
      .setStyle(ButtonStyle.Link)
      .setURL(messageUrl),
  );

  return {
    embeds: [embed],
    components: [row],
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function roleUpdatedEmbed({
  updates,
  changeCount = 0,
  messageUrl = null,
  channelId = null,
}) {
  const updatesList = updates.split(", ");
  const formattedUpdates = updatesList.map(update => `• ${update}`).join("\n");

  const fields = [];

  if (channelId) {
    fields.push({
      name: "Channel",
      value: `<#${channelId}>`,
      inline: true,
    });
  }

  if (changeCount > 0) {
    fields.push({
      name: "Changes Applied",
      value: `${changeCount} modification${changeCount !== 1 ? "s" : ""}`,
      inline: true,
    });
  }

  fields.push({
    name: "Updated",
    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
    inline: true,
  });

  const embed = embedFactory.create("SUCCESS", {
    title: "Configuration Updated",
    description: `Your role-reaction panel has been updated with the latest changes.`,
    fields: [
      ...fields,
      {
        name: "What Changed",
        value: formattedUpdates,
        inline: false,
      },
    ],
    footer: "Role Reactor • Role Reactions",
  });

  const components = [];
  if (messageUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("View Message")
        .setStyle(ButtonStyle.Link)
        .setURL(messageUrl),
    );
    components.push(row);
  }

  return {
    embeds: [embed],
    components,
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function roleDeletedEmbed({ messageId, rolesRemoved = 0 }) {
  const fields = [
    {
      name: "Deleted Message",
      value: `ID: \`${messageId}\``,
      inline: true,
    },
    {
      name: "Removed",
      value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
      inline: true,
    },
  ];

  if (rolesRemoved > 0) {
    fields.push({
      name: "Roles Affected",
      value: `${rolesRemoved} role${rolesRemoved !== 1 ? "s" : ""} no longer self-assignable`,
      inline: false,
    });
  }

  const embed = embedFactory.create("SUCCESS", {
    // Changed from WARNING to SUCCESS
    title: "Role Configuration Removed", // Simplified title
    description: `The role-reaction panel has been successfully removed from the system.`,
    fields,
    footer: "Role Reactor • Role Reactions", // Updated footer to match other commands
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

// --- Error and Status Responses ---

/**
 * @returns {MessagePayloadOptions}
 */
export function errorEmbed({
  title,
  description = "An error occurred. Please try again.",
  fields = [],
  solution = null,
  emoji = null,
  isPremium = false,
}) {
  const allFields = [...fields];
  if (solution) {
    allFields.push({
      name: "Suggested Solution", // Removed emoji
      value: solution,
      inline: false,
    });
  }

  const embed = embedFactory.create("ERROR", {
    title,
    description,
    fields: allFields,
    footer: "Need help? Contact support or check the documentation",
    emoji,
    isPremium,
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function infoEmbed({
  title,
  description = "Information",
  fields = [],
  solution = null,
}) {
  const allFields = [...fields];
  if (solution) {
    allFields.push({
      name: "Suggested Solution",
      value: solution,
      inline: false,
    });
  }

  const embed = embedFactory.create("INFO", {
    title,
    description,
    fields: allFields,
    footer: "Need help? Contact support or check the documentation",
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function permissionErrorEmbed({
  requiredPermissions,
  userPermissions = [],
}) {
  const missingPerms = requiredPermissions.filter(
    perm => !userPermissions.includes(perm),
  );

  return errorEmbed({
    title: "Insufficient Permissions",
    description: `You don't have the required permissions to use this command.`,
    fields: [
      {
        name: "Missing Permissions",
        value: missingPerms.map(perm => `• \`${perm}\``).join("\n"),
        inline: false,
      },
    ],
    solution:
      "Ask a server administrator to grant you the necessary permissions.",
  });
}

/**
 * @returns {MessagePayloadOptions}
 */
export function processingEmbed({ action, estimatedTime = null }) {
  const fields = estimatedTime
    ? [
        {
          name: "Estimated Time",
          value: estimatedTime,
          inline: true,
        },
      ]
    : [];

  const embed = embedFactory.create("INFO", {
    title: `Processing ${action}`,
    description: `Please wait while I ${action.toLowerCase()}.`,
    fields,
    footer: "Role Reactor • Processing",
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function validationErrorEmbed({ errors, helpText = null }) {
  const errorList = errors
    .map((error, index) => `${index + 1}. ${error}`)
    .join("\n");

  const fields = helpText
    ? [
        {
          name: "How to Fix",
          value: helpText,
          inline: false,
        },
      ]
    : [];

  const embed = embedFactory.create("ERROR", {
    title: "Validation Failed",
    description: `Please fix the following issues:`,
    fields: [
      {
        name: "Issues Found",
        value: errorList,
        inline: false,
      },
      ...fields,
    ],
    footer: "Role Reactor • Validation",
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

// --- General Responses ---

/**
 * @returns {MessagePayloadOptions}
 */
export function roleAssignedEmbed({
  roleName,
  userName,
  isTemporary = false,
  duration = null,
}) {
  const fields =
    isTemporary && duration
      ? [
          {
            name: "Duration",
            value: `Expires in \`${duration}\``,
            inline: true,
          },
        ]
      : [];

  const embed = embedFactory.create("SUCCESS", {
    title: "Role Assigned",
    description:
      `**${userName}** has been assigned the **${roleName}** role.\n\n` +
      `Assignment Type: **${isTemporary ? "Temporary" : "Permanent"}**`,
    fields,
    footer: "Role Reactor • Role Reactions", // Updated footer to match other commands
  });

  return {
    embeds: [embed],
    flags: 64,
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function roleStatsEmbed({
  guildName,
  totalRoles,
  selfAssignable,
  mostUsed = [],
}) {
  const fields = [
    {
      name: "Total Roles",
      value: `${totalRoles}`,
      inline: true,
    },
    {
      name: "Self-Assignable",
      value: `${selfAssignable}`,
      inline: true,
    },
    {
      name: "Activity",
      value: `${Math.round((selfAssignable / totalRoles) * 100)}% usage rate`,
      inline: true,
    },
  ];

  if (mostUsed.length > 0) {
    const topRoles = mostUsed
      .slice(0, 5)
      .map(
        (role, index) =>
          `${index + 1}. **${role.name}** - ${role.count} members`,
      )
      .join("\n");

    fields.push({
      name: "Most Popular Roles",
      value: topRoles,
      inline: false,
    });
  }

  const embed = embedFactory.create("PRIMARY", {
    title: `Role Statistics for ${guildName}`,
    description: `Here's an overview of role usage in your server.`,
    fields,
    footer: "Role Reactor • Statistics",
  });

  return {
    embeds: [embed],
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function successEmbed({
  title,
  description = "Operation completed successfully.",
  solution = null,
  fields = [],
}) {
  const embedFields = [...fields];

  if (solution) {
    embedFields.push({
      name: "What's Next?",
      value: solution,
      inline: false,
    });
  }

  const embed = embedFactory.create("SUCCESS", {
    title,
    description,
    fields: embedFields,
    footer: "Role Reactor • Success",
  });

  return {
    embeds: [embed],
  };
}

/**
 * @returns {MessagePayloadOptions}
 */
export function helpEmbed({
  commandName,
  description,
  usage,
  examples = [],
  tips = [],
}) {
  const fields = [
    {
      name: "Usage",
      value: `\`\`\`${usage}\`\`\``,
      inline: false,
    },
  ];

  if (examples.length > 0) {
    fields.push({
      name: "Examples",
      value: examples.map(ex => `\`${ex}\``).join("\n"),
      inline: false,
    });
  }

  if (tips.length > 0) {
    fields.push({
      name: "Pro Tips",
      value: tips.map(tip => `• ${tip}`).join("\n"),
      inline: false,
    });
  }

  const embed = embedFactory.create("PRIMARY", {
    title: `Help: ${commandName}`,
    description,
    fields,
    footer: "Role Reactor • Help",
  });

  return {
    embeds: [embed],
  };
}
