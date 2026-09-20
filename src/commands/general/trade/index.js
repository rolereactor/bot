import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { execute } from "./handlers.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

export const metadata = {
  name: "trade",
  category: "general",
  description: "[Beta] Trade items with another user",
  keywords: ["trade", "transfer", "item", "power cell", "engine module"],
  emoji: "🔄",
  helpFields: [
    {
      name: "How to Use",
      value: [
        "```/trade @user item:<id>``` — Trade an item to another user",
      ].join("\n"),
      inline: false,
    },
    {
      name: "What You'll See",
      value: "Trade confirmation with item details. No tax on trades!",
      inline: false,
    },
    {
      name: "Permissions",
      value: "• None required",
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
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("The user to trade with")
      .setRequired(true),
  )
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("The item to trade")
      .setRequired(true)
      .addChoices(
        { name: "AAA Power Cell", value: "power-cell-aaa" },
        { name: "AA Power Cell", value: "power-cell-aa" },
        { name: "C Power Cell", value: "power-cell-c" },
        { name: "D Power Cell", value: "power-cell-d" },
        { name: "Piston", value: "piston" },
        { name: "Turbocharger", value: "turbocharger" },
        { name: "Supercharger", value: "supercharger" },
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export { execute };
