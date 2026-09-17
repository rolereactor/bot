import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { hasAdminPermissions } from "../../../utils/discord/permissions.js";
import { getLogger } from "../../../utils/logger.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";
import {
  handleSetup,
  handleList,
  handleDelete,
  handleUpdate,
  handlePagination,
} from "./handlers.js";
import { getColorChoices } from "./utils.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

/**
 * Command metadata for centralized registry
 * This allows the command to be automatically discovered and integrated
 * into help system, command suggestions, and other features
 * This is the single source of truth for command information
 */
export const metadata = {
  name: "role-reactions",
  category: "admin",
  description: "Manage role reaction panels",
  keywords: [
    "role-reactions",
    "role reactions",
    "reactions",
    "self-assign",
    "roles",
    "reaction roles",
  ],
  emoji: "⭐",
  premium: false, // Has free tier + premium features
  helpFields: [
    {
      name: `How to Use`,
      value: [
        "```/role-reactions setup title:Choose Your Roles description:React to get roles! roles:🎮:@Gamer, 🎨:@Artist```",
        "```/role-reactions setup title:Game Roles description:Pick your role! roles:🎮:Gamer, 🎨:Artist```",
        "```/role-reactions list```",
        "```/role-reactions update message_id:1234567890 title:Updated Title```",
        "```/role-reactions delete message_id:1234567890```",
      ].join("\n"),
      inline: false,
    },
    {
      name: `Subcommands`,
      value: [
        "**setup** - Create a new role-reaction panel",
        "**list** - List all role-reaction panels",
        "**update** - Update an existing role-reaction panel",
        "**delete** - Delete a role-reaction panel",
      ].join("\n"),
      inline: false,
    },
    {
      name: `Permissions`,
      value: "• **Manage Roles** permission required",
      inline: false,
    },
    {
      name: `What You'll See`,
      value:
        "Interactive role assignment via emoji reactions with customizable embeds, automatic reaction addition, and comprehensive management tools!",
      inline: false,
    },
    {
      name: `Role Format Tips`,
      value: [
        "• **@RoleName** - Use standard mentions (e.g., `🎮:@Gamer`)",
        '• **"Role Name"** - Use quotes for spaced names (e.g., `💬:"My Role"`)',
        "• **[@Role1, @Role2]** - Create inline arrays (e.g., `💡:[@Mod, @Admin]`)",
        "• **[BundleName]** - Drop in Database Bundles (e.g., `🚀:[StarterPack]`)",
      ].join("\n"),
      inline: false,
    },
    {
      name: `Tier Limitations`,
      value: [
        "• **Active Panels:** 3 Panels (Free) | 15 Panels (Pro Engine)",
        "• **Emojis per Panel:** 5 Emojis (Free) | 20 Emojis (Pro Engine)",
        "• **Total Roles per Panel:** 5 Roles (Free) | 20 Roles (Pro Engine)",
      ].join("\n"),
      inline: false,
    },
  ],
};

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

export const data = new SlashCommandBuilder()
  .setName(metadata.name)
  .setDescription(metadata.description)
  .addSubcommand(sub =>
    sub
      .setName("setup")
      .setDescription(
        "Create a role-reaction panel for self-assignable roles",
      )
      .addStringOption(opt =>
        opt
          .setName("title")
          .setDescription("Title of the role panel")
          .setRequired(true),
      )
      .addStringOption(opt =>
        opt
          .setName("description")
          .setDescription("Description of the role panel")
          .setRequired(true),
      )
      .addStringOption(opt =>
        opt
          .setName("roles")
          .setDescription(
            "Ex: 🎮:@Gamer, 💡:[@Role1, @Role2], 🚀:[MyBundle] (10-20 Max)",
          )
          .setRequired(true),
      )
      .addStringOption(opt =>
        opt
          .setName("color")
          .setDescription("Choose a color for the embed")
          .setRequired(false)
          .addChoices(...getColorChoices()),
      )
      .addBooleanOption(opt =>
        opt
          .setName("hide_list")
          .setDescription(
            "Hide the automatic list of available roles at the bottom of the embed",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand(sub =>
    sub.setName("list").setDescription("List all role-reaction panels"),
  )
  .addSubcommand(sub =>
    sub
      .setName("delete")
      .setDescription("Delete a role-reaction panel")
      .addStringOption(opt =>
        opt
          .setName("message_id")
          .setDescription("The ID of the message to delete")
          .setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName("update")
      .setDescription("Update an existing role-reaction panel")
      .addStringOption(opt =>
        opt
          .setName("message_id")
          .setDescription("The ID of the message to update")
          .setRequired(true),
      )
      .addStringOption(opt =>
        opt.setName("title").setDescription("New title").setRequired(false),
      )
      .addStringOption(opt =>
        opt
          .setName("description")
          .setDescription("New description")
          .setRequired(false),
      )
      .addStringOption(opt =>
        opt
          .setName("roles")
          .setDescription(
            "Ex: 🎮:@Gamer, 💡:[@Role1, @Role2], 🚀:[MyBundle] (10-20 Max)",
          )
          .setRequired(false),
      )
      .addStringOption(opt =>
        opt
          .setName("color")
          .setDescription("Choose a color for the embed")
          .setRequired(false)
          .addChoices(...getColorChoices()),
      )
      .addBooleanOption(opt =>
        opt
          .setName("hide_list")
          .setDescription(
            "Hide the automatic list of available roles at the bottom of the embed",
          )
          .setRequired(false),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction, client) {
  const logger = getLogger();

  logger.debug("Main command handler executing for role-reactions", {
    interactionAge: Date.now() - interaction.createdTimestamp,
  });

  // Check if interaction has already been acknowledged
  if (interaction.replied || interaction.deferred) {
    logger.warn("Interaction already acknowledged, skipping command");
    return;
  }

  try {
    if (!hasAdminPermissions(interaction.member)) {
      logger.warn("User lacks admin permissions, blocking command");
      return interaction.reply(
        errorEmbed({
          title: "Permission Denied",
          description:
            "You need Administrator permissions to manage role reaction panels.",
          solution: "Contact a server administrator for assistance.",
        }),
      );
    }

    const sub = interaction.options.getSubcommand();
    logger.debug("Executing subcommand", { subcommand: sub });

    switch (sub) {
      case "setup":
        logger.debug("Calling handleSetup");
        await handleSetup(interaction, client);
        logger.debug("handleSetup completed");
        break;
      case "list":
        logger.debug("Calling handleList", {
          interactionAge: Date.now() - interaction.createdTimestamp,
        });
        await handleList(interaction, client, 1, false);
        logger.debug("handleList completed");
        break;
      case "delete":
        await handleDelete(interaction);
        break;
      case "update":
        await handleUpdate(interaction);
        break;
      default: {
        await interaction.reply(
          errorEmbed({
            title: "Unknown Subcommand",
            description: `Subcommand \`${sub}\` is not supported.`,
          }),
        );
      }
    }
  } catch (error) {
    logger.error("Error in main command handler", { error: error.message });
    logger.error("role-reactions command error", error);

    // Check for specific error types
    if (error.message.includes("Unknown interaction")) {
      logger.warn("Interaction expired before response could be sent");
      return; // Don't try to respond to expired interactions
    }

    // Only try to respond if the interaction hasn't been acknowledged yet
    if (!interaction.replied && !interaction.deferred) {
      logger.debug("Attempting to send error reply (not replied/deferred)");
      try {
        await interaction.reply(
          errorEmbed({
            title: "Error",
            description: "Failed to process role-reactions command.",
          }),
        );
        logger.debug("Error reply sent successfully");
      } catch (replyError) {
        logger.error("Failed to send error reply", {
          error: replyError.message,
        });
        logger.error("Failed to send error reply", replyError);
      }
    } else if (interaction.deferred && !interaction.replied) {
      logger.debug("Attempting to send error edit (deferred but not replied)");
      try {
        await interaction.editReply(
          errorEmbed({
            title: "Error",
            description: "Failed to process role-reactions command.",
          }),
        );
        logger.debug("Error edit sent successfully");
      } catch (editError) {
        logger.error("Failed to send error edit", { error: editError.message });
        logger.error("Failed to send error edit", editError);
      }
    } else {
      logger.debug("Interaction already handled, skipping error response");
    }
  }
}

// Handle button interactions for pagination
export async function handleButtonInteraction(interaction, client) {
  const customId = interaction.customId;

  // Check if this is a pagination button
  if (customId.startsWith("role_list_")) {
    await handlePagination(interaction, client);
  }
}
