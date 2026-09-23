import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { conversationManager } from "../../../utils/ai/conversationManager.js";
import { errorEmbed } from "../../../utils/discord/responseMessages.js";
import { THEME, UI_COMPONENTS } from "../../../config/theme.js";

const logger = getLogger();

export const disabled = true;

// ============================================================================
// COMMAND METADATA
// ============================================================================

export const metadata = {
  name: "chat-reset",
  category: "general",
  description: "Clear the AI conversation history for this channel",
  keywords: ["chat", "reset", "clear", "ai", "history", "conversation"],
  emoji: "🗑️",
  helpFields: [
    {
      name: "How to Use",
      value: "```/chat-reset```",
      inline: false,
    },
    {
      name: "What it does",
      value:
        "Wipes the shared AI conversation history for this channel. The next @-mention of the bot starts a fresh session. Has no effect in DMs (DM sessions are already per-user).",
      inline: false,
    },
    {
      name: "Permissions",
      value: "• **Manage Messages** required",
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
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

// ============================================================================
// HANDLER
// ============================================================================

export async function execute(interaction) {
  // Build the session key — must match what chatService uses
  const sessionId = interaction.guild
    ? `ch_${interaction.channelId}`
    : interaction.user.id;

  try {
    await conversationManager.clearHistory(sessionId, null);

    logger.info(
      `[chat-reset] Channel ${interaction.channelId} history cleared by ${interaction.user.id}`,
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.SUCCESS)
          .setTitle("🗑️ Conversation Reset")
          .setDescription(
            "The AI conversation history for this channel has been cleared.\nThe next @-mention of me will start a fresh session.",
          )
          .setFooter(
            UI_COMPONENTS.createFooter(
              `Reset by ${interaction.user.displayName}`,
            ),
          )
          .setTimestamp(),
      ],
      ephemeral: false,
    });
  } catch (err) {
    logger.error("[chat-reset] Failed to clear conversation:", err);
    await interaction.reply(
      errorEmbed({
        title: "Error",
        description: "Failed to reset the conversation. Please try again.",
      }),
    );
  }
}
