import { EmbedBuilder, PermissionsBitField, MessageFlags } from "discord.js";
import { THEME, UI_COMPONENTS } from "../../../config/theme.js";
import roleBundleManager from "../../../features/rolebundles/RoleBundleManager.js";

import { getMentionableCommand } from "../../../utils/commandUtils.js";
import { getLogger } from "../../../utils/logger.js";
import { getPremiumManager } from "../../../features/premium/PremiumManager.js";
import {
  PremiumFeatures,
  FREE_TIER,
  PRO_TIER,
} from "../../../features/premium/config.js";
import { upgradeLimitEmbed } from "../../../utils/discord/premiumHelp.js";
import {
  createErrorEmbed,
  createSuccessEmbed,
  createInfoEmbed,
} from "./embeds.js";

const logger = getLogger();

/**
 * Handle /role-bundle create command
 * @param {Object} interaction - Discord interaction
 */
export async function handleCreate(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.options.getString("name");
    const rolesString = interaction.options.getString("roles");

    // Check permissions
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Permission Denied",
            "You need **Manage Server** permission to create role bundles.",
          ),
        ],
      });
    }

    // Check premium status
    const premiumManager = getPremiumManager();
    const isPro = await premiumManager.isFeatureActive(
      interaction.guild.id,
      PremiumFeatures.PRO.id,
    );

    // Validate bundle name
    const validation = roleBundleManager.validateName(name);
    if (!validation.valid) {
      return interaction.editReply({
        embeds: [createErrorEmbed("Invalid Name", validation.error)],
      });
    }

    // Check if bundle already exists
    const exists = await roleBundleManager.exists(interaction.guild.id, name);
    if (exists) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Bundle Exists",
            `A bundle named **${name}** already exists. Please use a different name or delete the existing bundle first.`,
          ),
        ],
      });
    }

    // Check bundle limit
    const currentBundles = await roleBundleManager.count(interaction.guild.id);
    const maxBundles = isPro
      ? PRO_TIER.ROLE_BUNDLE_MAX_ACTIVE
      : FREE_TIER.ROLE_BUNDLE_MAX_ACTIVE;

    if (currentBundles >= maxBundles) {
      if (!isPro) {
        return interaction.editReply(
          upgradeLimitEmbed({
            feature: "Role Bundles",
            freeText: `${FREE_TIER.ROLE_BUNDLE_MAX_ACTIVE} bundles`,
            proText: `${PRO_TIER.ROLE_BUNDLE_MAX_ACTIVE} bundles`,
            client: interaction.client,
          }),
        );
      }
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Maximum Bundles Reached",
            `You have reached the maximum limit of **${maxBundles}** role bundles. Please delete an existing bundle first.`,
          ),
        ],
      });
    }

    // Parse roles from string
    const roles = parseRoles(rolesString, interaction.guild);

    if (roles.length === 0) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "No Valid Roles",
            "No valid roles were found. Please mention roles using @RoleName format.",
          ),
        ],
      });
    }

    const maxRoles = isPro
      ? PRO_TIER.ROLE_BUNDLE_MAX_ROLES
      : FREE_TIER.ROLE_BUNDLE_MAX_ROLES;

    if (roles.length > maxRoles) {
      if (!isPro) {
        return interaction.editReply(
          upgradeLimitEmbed({
            feature: "Role Bundle Size",
            freeText: `${FREE_TIER.ROLE_BUNDLE_MAX_ROLES} roles per bundle`,
            proText: `${PRO_TIER.ROLE_BUNDLE_MAX_ROLES} roles per bundle`,
            client: interaction.client,
          }),
        );
      }
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Too Many Roles",
            `A bundle can contain a maximum of **${maxRoles}** roles. You provided **${roles.length}**.`,
          ),
        ],
      });
    }

    // Create bundle
    await roleBundleManager.create({
      _id: undefined, // Let MongoDB generate
      guildId: interaction.guild.id,
      name: name.trim(),
      roles: roles,
    });

    logger.info(`📦 Role bundle created by ${interaction.user.tag}: ${name}`);

    return interaction.editReply({
      embeds: [
        createSuccessEmbed(
          "Bundle Created!",
          `Role bundle **${name}** has been created with **${roles.length}** role(s):\n\n${roles.map(r => `• <@&${r.roleId}>`).join("\n")}`,
        ),
      ],
    });
  } catch (error) {
    logger.error("❌ Error creating role bundle:", error);

    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Error",
          "Failed to create role bundle. Please try again.",
        ),
      ],
    });
  }
}

/**
 * Handle /role-bundle delete command
 * @param {Object} interaction - Discord interaction
 */
export async function handleDelete(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.options.getString("name");

    // Check permissions
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Permission Denied",
            "You need **Manage Server** permission to delete role bundles.",
          ),
        ],
      });
    }

    // Check if bundle exists
    const exists = await roleBundleManager.exists(interaction.guild.id, name);
    if (!exists) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed("Not Found", `Bundle **${name}** not found.`),
        ],
      });
    }

    // Delete bundle
    const result = await roleBundleManager.deleteByName(
      interaction.guild.id,
      name,
    );

    if (!result.success) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed("Error", result.error || "Failed to delete bundle."),
        ],
      });
    }

    logger.info(`🗑️ Role bundle deleted by ${interaction.user.tag}: ${name}`);

    return interaction.editReply({
      embeds: [
        createSuccessEmbed(
          "Bundle Deleted!",
          `Role bundle **${name}** has been deleted.`,
        ),
      ],
    });
  } catch (error) {
    logger.error("❌ Error deleting role bundle:", error);

    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Error",
          "Failed to delete role bundle. Please try again.",
        ),
      ],
    });
  }
}

/**
 * Handle /role-bundle list command
 * @param {Object} interaction - Discord interaction
 */
export async function handleList(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const bundles = await roleBundleManager.getAllForGuild(
      interaction.guild.id,
    );

    if (bundles.length === 0) {
      return interaction.editReply({
        embeds: [
          createInfoEmbed(
            "No Bundles",
            `There are no role bundles in this server yet.\n\nUse ${getMentionableCommand(interaction.client, "role-bundle create")} to create one!`,
          ),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📦 Role Bundles")
      .setColor(THEME.PRIMARY)
      .setDescription(
        `There are **${bundles.length}** role bundle(s) in this server.`,
      );

    bundles.forEach((bundle, index) => {
      const roleCount = bundle.roles?.length || 0;
      embed.addFields({
        name: `${index + 1}. ${bundle.name}`,
        value: `${roleCount} role(s) • Created <t:${Math.floor(bundle.createdAt.getTime() / 1000)}:R>`,
        inline: true,
      });
    });

    embed.setFooter(
      UI_COMPONENTS.createFooter(
        "Use /role-bundle view name:<bundle> to see all roles in a bundle",
      ),
    );

    embed.setTimestamp();

    return interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    logger.error("❌ Error listing role bundles:", error);

    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Error",
          "Failed to list role bundles. Please try again.",
        ),
      ],
    });
  }
}

/**
 * Handle /role-bundle view command
 * @param {Object} interaction - Discord interaction
 */
export async function handleView(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.options.getString("name");

    const bundle = await roleBundleManager.getByName(
      interaction.guild.id,
      name,
    );

    if (!bundle) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed("Not Found", `Bundle **${name}** not found.`),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📦 Role Bundle: ${bundle.name}`)
      .setColor(THEME.PRIMARY)
      .setDescription(
        `This bundle contains **${bundle.roles?.length || 0}** role(s):`,
      )
      .addFields({
        name: "Roles",
        value:
          bundle.roles?.length > 0
            ? bundle.roles.map(r => `• <@&${r.roleId}>`).join("\n")
            : "No roles in this bundle.",
      })
      .setFooter(
        UI_COMPONENTS.createFooter(
          `Use /role-bundle delete name:${bundle.name} to delete this bundle`,
        ),
      )
      .setTimestamp(bundle.createdAt);

    return interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    logger.error("❌ Error viewing role bundle:", error);

    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Error",
          "Failed to view role bundle. Please try again.",
        ),
      ],
    });
  }
}

/**
 * Parse roles from string
 * @param {string} rolesString - Roles string
 * @param {Object} guild - Discord guild
 * @returns {Array} Array of { roleId, roleName }
 */
function parseRoles(rolesString, guild) {
  const roles = [];

  // Match role mentions: <@&123456789> or @RoleName
  const mentionRegex = /<@&(\d+)>|@(&?)([\w\s\-_]+)/g;
  let match;

  while ((match = mentionRegex.exec(rolesString)) !== null) {
    if (match[1]) {
      // Role mention with ID: <@&123456789>
      const role = guild.roles.cache.get(match[1]);
      if (role) {
        roles.push({ roleId: role.id, roleName: role.name });
      }
    } else {
      // Role name: @RoleName
      const roleName = match[3].trim();
      const role = guild.roles.cache.find(
        r => r.name.toLowerCase() === roleName.toLowerCase(),
      );
      if (role) {
        roles.push({ roleId: role.id, roleName: role.name });
      }
    }
  }

  return roles;
}
