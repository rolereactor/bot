import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { execute } from "./handlers.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

export const metadata = {
  name: "gift",
  category: "general",
  description: "Gift items to another user",
  keywords: ["gift", "give", "send", "transfer", "item", "power cell", "engine module"],
  emoji: "🎁",
  helpFields: [
    {
      name: "How to Use",
      value: [
        "```/gift @user item:<id>``` — Gift an item to another user",
      ].join("\n"),
      inline: false,
    },
    {
      name: "What You'll See",
      value: "Gift confirmation with item details. No tax on gifts!",
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
      .setDescription("The user to gift to")
      .setRequired(true),
  )
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("The item to gift")
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
