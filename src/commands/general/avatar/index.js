import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";
import { handleAvatarGeneration } from "./handlers.js";

export const disabled = true;

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
  name: "avatar",
  category: "general",
  description: "Generate a unique anime-style avatar using AI",
  keywords: [
    "avatar",
    "profile picture",
    "pfp",
    "picture",
    "anime",
    "generate",
  ],
  emoji: "🎨",
  // Detailed help fields for /help command
  helpFields: [
    {
      name: `How to Use`,
      value:
        "```/avatar prompt:cyberpunk hacker with neon hair art_style:modern```",
      inline: false,
    },
    {
      name: `What You Need`,
      value:
        "**prompt** *(required)* - Describe the avatar you want to generate (e.g., 'cyberpunk hacker with neon hair', 'cute girl with pastel colors', 'serious mysterious character')\n**art_style** *(optional)* - Choose the artistic style (manga, modern, retro, realistic, chibi, lofi)",
      inline: false,
    },
    {
      name: `Permissions`,
      value: "• None required",
      inline: false,
    },
    {
      name: `What You'll See`,
      value:
        "A unique AI-generated anime-style avatar based on your description, with download options and generation details. Uses advanced AI to create custom avatars tailored to your specifications!",
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
  .addStringOption(option =>
    option
      .setName("prompt")
      .setDescription(
        "Describe the avatar (e.g., 'cyberpunk hacker with neon hair', 'kawaii girl with pink cat ears')",
      )
      .setRequired(true)
      .setMaxLength(500),
  )
  .addStringOption(option =>
    option
      .setName("art_style")
      .setDescription("Choose the artistic style for the avatar")
      .setRequired(false)
      .addChoices(
        { name: "Manga - Traditional Japanese comics", value: "manga" },
        { name: "Modern - Contemporary anime style", value: "modern" },
        { name: "Retro - 80s/90s vintage anime", value: "retro" },
        { name: "Realistic - Semi-realistic anime", value: "realistic" },
        { name: "Chibi - Super cute and deformed", value: "chibi" },
        { name: "Lo-fi - Chill and nostalgic aesthetic", value: "lofi" },
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

// ============================================================================
// MAIN EXECUTION
// ============================================================================

export async function execute(interaction, client) {
  const logger = getLogger();

  try {
    if (!interaction.isRepliable()) {
      logger.warn("Interaction is no longer repliable, skipping execution");
      return;
    }

    const deferred = await deferInteraction(interaction);
    await handleAvatarGeneration(interaction, client, deferred);
  } catch (error) {
    logger.error("Error in avatar command:", error);
    await handleCommandError(interaction, error);
  }
}

// ============================================================================
// INTERACTION MANAGEMENT
// ============================================================================

async function deferInteraction(interaction) {
  try {
    await interaction.deferReply();
    return true; // Successfully deferred
  } catch (deferError) {
    if (
      deferError.message !== "Interaction has already been acknowledged." &&
      deferError.message !== "Unknown interaction"
    ) {
      const logger = getLogger();
      logger.error("Failed to defer reply:", deferError);
    }
    return false; // Failed to defer
  }
}

async function handleCommandError(interaction, _error) {
  try {
    const errorResponse = errorEmbed({
      title: "Unexpected Error",
      description: "An unexpected error occurred while generating your avatar.",
    });

    if (interaction.deferred) {
      await interaction.editReply(errorResponse);
    } else {
      await interaction.reply(errorResponse);
    }
  } catch (replyError) {
    const logger = getLogger();
    logger.error("Failed to send error response:", replyError);
  }
}
