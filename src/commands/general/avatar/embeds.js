import { EmbedBuilder } from "discord.js";
import { THEME, EMOJIS } from "../../../config/theme.js";
import { emojiConfig } from "../../../config/emojis.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

const CORE_EMOJI = emojiConfig.customEmojis.core;

function truncatePrompt(prompt) {
  if (!prompt) return "No prompt provided.";
  return prompt.length > 200 ? `${prompt.slice(0, 197)}...` : prompt;
}

/**
 * Create error embed for avatar generation failures
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createErrorEmbed(interaction, title, description) {
  const prompt = interaction.options?.getString("prompt") || "N/A";
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle(`${EMOJIS.STATUS.ERROR} ${title}`)
    .setDescription(
      `**Prompt**\n${truncatePrompt(prompt)}\n\n**Details**\n${description}`,
    );
}

/**
 * Create warning embed for avatar generation warnings
 * @param {import('discord.js').ChatInputCommandInteraction} _interaction
 * @param {string} title - Warning title
 * @param {string} description - Warning description
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createWarningEmbed(_interaction, title, description) {
  return new EmbedBuilder()
    .setColor(THEME.WARNING)
    .setTitle(`${EMOJIS.STATUS.WARNING} ${title}`)
    .setDescription(description);
}

/**
 * Format art style name for display
 * @param {string} artStyle - Art style value
 * @returns {string} Formatted art style name
 */
function formatArtStyleName(artStyle) {
  const styleNames = {
    manga: "Manga",
    modern: "Modern",
    retro: "Retro",
    realistic: "Realistic",
    chibi: "Chibi",
    lofi: "Lo-fi",
  };
  return styleNames[artStyle] || artStyle;
}

/**
 * Create loading embed for avatar generation
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction
 * @param {string} prompt - User's prompt
 * @param {string} [artStyle] - Selected art style (optional)
 * @param {string} [status] - Current status message (optional)
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createLoadingEmbed(
  interaction,
  prompt,
  artStyle = null,
  status = null,
) {
  const embed = new EmbedBuilder()
    .setColor(THEME.INFO)
    .setTitle(`${EMOJIS.UI.LOADING} Generating your avatar`)
    .setDescription(`**Prompt**\n${truncatePrompt(prompt)}`);

  // Add art style field if one was selected
  if (artStyle) {
    embed.addFields([
      {
        name: "Art Style",
        value: formatArtStyleName(artStyle),
        inline: true,
      },
    ]);
  }

  // Add status field if provided
  if (status) {
    embed.addFields([
      {
        name: "Status",
        value: status,
        inline: false,
      },
    ]);
  } else {
    embed.setDescription(
      `${embed.data.description}\n\nPlease hang tight while the model renders your avatar.`,
    );
  }

  return embed;
}

/**
 * Create success embed for avatar generation
 * @param {import('discord.js').ChatInputCommandInteraction} _interaction
 * @param {string} prompt - User's prompt
 * @param {string|null} artStyle - Selected art style
 * @param {Object|null} _deductionBreakdown - Credit deduction breakdown
 * @param {boolean} _isNSFW - Whether the content is NSFW (unused)
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createSuccessEmbed(
  _interaction,
  prompt,
  artStyle = null,
  _deductionBreakdown = null,
  _isNSFW = false,
) {
  const embed = new EmbedBuilder()
    .setColor(THEME.SUCCESS)
    .setTitle(`${EMOJIS.UI.IMAGE} Avatar ready`)
    .setDescription(`**Prompt**\n${truncatePrompt(prompt)}`);

  // Add art style field if one was selected
  if (artStyle) {
    embed.addFields([
      {
        name: "Art Style",
        value: formatArtStyleName(artStyle),
        inline: true,
      },
    ]);
  }

  return embed;
}

/**
 * Create Core insufficient embed
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Object} userData - User Core data
 * @param {number} creditsNeeded - Cores needed for generation
 * @param {string} prompt - User's prompt
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createCoreEmbed(interaction, userData, creditsNeeded, prompt) {
  // Simplified Core display
  const totalCredits = userData.credits || 0;

  const coreBreakdown = `**Your Balance**: ${totalCredits} ${CORE_EMOJI}`;
  const balanceCommand = getMentionableCommand(interaction.client, "balance", interaction.guildId);

  return new EmbedBuilder()
    .setColor(THEME.WARNING)
    .setTitle(`${EMOJIS.STATUS.WARNING} Insufficient Cores`)
    .setDescription(
      `**Prompt**\n${truncatePrompt(prompt)}\n\nYou need **${creditsNeeded} ${CORE_EMOJI}** to generate an AI avatar!\n\n${coreBreakdown}\n\n**Cost**: ${creditsNeeded} ${CORE_EMOJI} per generation`,
    )
    .addFields([
      {
        name: "Get Cores",
        value: `Buy Core packages with crypto • Use ${balanceCommand} check`,
        inline: false,
      },
    ]);
}

/**
 * Create help embed
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createHelpEmbed() {
  return new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setDescription(
      `Generate unique anime-style avatar profile pictures using AI! Use \`/avatar prompt: "your character description"\` to get started.`,
    )
    .addFields([
      {
        name: "Pro Tips",
        value: `Describe your avatar however you want! Include character details, colors, moods, backgrounds, or any creative elements.\n**Examples**: "cool boy with spiky hair", "cute girl in red dress with pastel colors", "anime girl in a forest", "cyberpunk hacker in neon city", "mysterious serious character with glasses", "beautiful sunset portrait with vibrant colors"\n**Note**: The AI automatically detects color styles and moods from your description. Single character focus works best for profile pictures.`,
        inline: false,
      },
      {
        name: "Art Style",
        value: `Optional: Choose an artistic style (manga, modern, retro, realistic, chibi, lofi)`,
        inline: false,
      },
    ]);
}

/**
 * Create validation embed for avatar command
 * @param {string} reason - Validation failure reason
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createAvatarValidationEmbed(reason) {
  return new EmbedBuilder()
    .setColor(THEME.WARNING)
    .setTitle(`${EMOJIS.STATUS.WARNING} Check your prompt`)
    .setDescription(reason);
}
