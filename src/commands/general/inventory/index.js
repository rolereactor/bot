import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { execute } from "./handlers.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

export const metadata = {
  name: "inventory",
  category: "general",
  description: "View and use your purchased items",
  keywords: ["inventory", "items", "power cell", "engine module", "shop"],
  emoji: "🎒",
  helpFields: [
    {
      name: "How to Use",
      value: [
        "```/inventory``` — View your purchased items",
        "```/inventory use item:<id>``` — Activate an item from your inventory",
      ].join("\n"),
      inline: false,
    },
    {
      name: "What You'll See",
      value: "A list of items you've purchased from the Shop that are ready to use.",
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
  .addSubcommand(subcommand =>
    subcommand
      .setName("view")
      .setDescription("View your inventory of purchased items"),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("use")
      .setDescription("Activate an item from your inventory")
      .addStringOption(option =>
        option
          .setName("item")
          .setDescription("The item to activate")
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
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export { execute };
