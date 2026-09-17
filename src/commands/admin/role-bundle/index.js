/**
 * Role Bundle Commands - Manage reusable role bundles
 * @module commands/admin/role-bundle/index
 */
const logger = getLogger();

import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import {
  handleCreate,
  handleDelete,
  handleList,
  handleView,
} from "./handlers.js";

export const metadata = {
  name: "role-bundle",
  category: "admin",
  description: "Manage reusable database role bundles",
  keywords: ["role-bundle", "bundles", "packs", "role pack", "groups"],
  emoji: "📦",
  premium: false, // Has free tier (5) + premium (15)
  helpFields: [
    {
      name: `How to Use`,
      value: [
        "```/role-bundle create name:StarterPack roles:@Role1 @Role2```",
        "```/role-bundle list```",
        "```/role-bundle view name:StarterPack```",
        "```/role-bundle delete name:StarterPack```",
      ].join("\n"),
      inline: false,
    },
    {
      name: `Integrating Bundles into Panels`,
      value:
        "Once a bundle is created, simply drop it into a `/role-reactions` panel natively by wrapping it in brackets: `💡:[StarterPack]`",
      inline: false,
    },
    {
      name: `Formatting Restrictions`,
      value:
        'All roles in a bundle must be separated by standard spaces. Role mentions, pure role names, and Role IDs are fully supported! If a Role Name has multiple words, wrap it in double quotes (e.g. `"My Role"`)',
      inline: false,
    },
    {
      name: `Tier Limitations`,
      value:
        "Free Tier is capped at bundling **5 Roles** securely. Upgrade to Pro Engine to immediately bundle massive **15 Role Arrays** at once!",
      inline: false,
    },
  ],
};

/**
 * Role bundle command definition
 */
export const command = {
  name: "role-bundle",
  description: "Manage reusable role bundles",
  data: new SlashCommandBuilder()
    .setName("role-bundle")
    .setDescription("Manage reusable role bundles")

    .addSubcommand(subcommand =>
      subcommand
        .setName("create")
        .setDescription("Create a new role bundle")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription(
              "Bundle name (letters, numbers, spaces, hyphens, underscores)",
            )
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(50),
        )
        .addStringOption(option =>
          option
            .setName("roles")
            .setDescription(
              'Ex: @Role1 @Role2 "Role Name" (Space separated. Max 5-15)',
            )
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("delete")
        .setDescription("Delete a role bundle")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription("Bundle name to delete")
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List all role bundles in this server"),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View roles in a specific role bundle")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription("Bundle name to view")
            .setRequired(true),
        ),
    ),

  /**
   * Execute the role-bundle command
   * @param {Object} interaction - Discord interaction
   * @param {Object} _client - Discord client (unused)
   */
  async execute(interaction, _client) {
    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "create":
          await handleCreate(interaction);
          break;
        case "delete":
          await handleDelete(interaction);
          break;
        case "list":
          await handleList(interaction);
          break;
        case "view":
          await handleView(interaction);
          break;
        default:
          await interaction.reply({
            content: "Unknown subcommand",
            flags: [MessageFlags.Ephemeral],
          });
      }
    } catch (error) {
      logger.error("Role bundle command error:", error);

      const errorContent = "An error occurred while processing this command.";
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorContent });
        } else {
          await interaction.reply({
            content: errorContent,
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch {
        /* interaction may have expired */
      }
    }
  },
};

// Export data and execute for command loader compatibility
export const { data } = command;
export const { execute } = command;
