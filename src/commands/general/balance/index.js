import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { execute } from "./handlers.js";

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
  name: "balance",
  category: "general",
  description: "Check your Cores & Sparks balance",
  keywords: ["balance", "core", "sparks", "credits", "wallet", "currency"],
  emoji: "🔮",
  helpFields: [
    {
      name: `How to Use`,
      value: "```/balance```",
      inline: false,
    },
    {
      name: `What You Need`,
      value: "No parameters required",
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
        "Your Cores & Sparks balance. Use Power Cells to transfer Cores to other users!",
      inline: false,
    },
  ],
};

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

/**
 * Core command definition
 * Allows users to check their Core & Spark balance
 */
export const data = new SlashCommandBuilder()
  .setName(metadata.name)
  .setDescription(metadata.description)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export { execute };
