import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { execute } from "./handlers.js";

// ============================================================================
// COMMAND METADATA
// ============================================================================

export const metadata = {
  name: "shop",
  category: "general",
  description: "Buy Power Cells and Engine Modules with Cores or Sparks",
  keywords: ["shop", "buy", "purchase", "power cell", "engine module", "cores", "sparks"],
  emoji: "🛒",
  helpFields: [
    {
      name: "How to Use",
      value: [
        "```/shop``` — Browse all available items",
        "```/shop buy item:<id>``` — Purchase an item",
      ].join("\n"),
      inline: false,
    },
    {
      name: "Items Available",
      value: [
        "🔋 **Power Cells** — Store Cores for trading",
        "⚙️ **Engine Modules** — Temporary Pro access",
      ].join("\n"),
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
      .setName("browse")
      .setDescription("Browse all available items in the shop"),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("buy")
      .setDescription("Purchase an item")
      .addStringOption(option =>
        option
          .setName("item")
          .setDescription("The item to purchase")
          .setRequired(true)
          .addChoices(
            { name: "AAA Power Cell (28 Cores)", value: "power-cell-aaa" },
            { name: "AA Power Cell (83 Cores)", value: "power-cell-aa" },
            { name: "C Power Cell (220 Cores)", value: "power-cell-c" },
            { name: "D Power Cell (550 Cores)", value: "power-cell-d" },
            { name: "Piston (75 Sparks)", value: "piston" },
            { name: "Turbocharger (175 Sparks)", value: "turbocharger" },
            { name: "Supercharger (350 Sparks)", value: "supercharger" },
          ),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export { execute };
