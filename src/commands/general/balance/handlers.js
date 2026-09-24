import { MessageFlags } from "discord.js";
import { getLogger } from "../../../utils/logger.js";
import { createBalanceEmbed, createErrorEmbed } from "./embeds.js";
import {
  getUserData,
  handleCoreError,
  logOperationDuration,
  createPerformanceContext,
} from "./utils.js";
import {
  validateInteractionState,
  validateCommandPermissions,
} from "./validation.js";

const logger = getLogger();

/**
 * Main execution function for the /balance command
 * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object
 * @param {import("discord.js").Client} _client - The Discord client (unused)
 */
export async function execute(interaction, _client) {
  const perfContext = createPerformanceContext(
    "core command",
    interaction.user.username,
    interaction.user.id,
  );

  try {
    // Validate interaction state
    const stateValidation = validateInteractionState(interaction);
    if (!stateValidation.valid) {
      logger.warn(`Interaction validation failed: ${stateValidation.error}`);
      return;
    }

    // Validate command permissions
    const permissionValidation = validateCommandPermissions(interaction);
    if (!permissionValidation.valid) {
      logger.warn(
        `Permission validation failed: ${permissionValidation.error}`,
      );
      return;
    }

    // Defer the interaction immediately to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    logger.debug(
      `Balance command executed by ${perfContext.username} (${perfContext.userId})`,
    );

    await handleBalance(interaction);

    logOperationDuration(perfContext);
  } catch (error) {
    handleCoreError(error, interaction, perfContext);
  }
}

/**
 * Handles the balance check subcommand
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleBalance(interaction) {
  const startTime = Date.now();

  try {
    const userData = await getUserData(interaction.user.id);

    if (!userData) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Balance Not Found",
            "Could not retrieve your balance. Please try again later.",
            interaction.client.user.displayAvatarURL(),
          ),
        ],
      });
      return;
    }

    const result = createBalanceEmbed(
      userData,
      interaction.user.username,
      interaction.user.displayAvatarURL(),
      { client: interaction.client, guildId: interaction.guildId },
    );

    await interaction.editReply(result);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    collector.on("collect", async i => {
      if (i.customId === "balance_shop") {
        await i.reply({
          content: "Use `/shop` to buy items!",
          ephemeral: true,
        });
      } else if (i.customId === "balance_inventory") {
        await i.reply({
          content: "Use `/inventory` to view your items!",
          ephemeral: true,
        });
      }
    });

    logOperationDuration(startTime, "balance check");
  } catch (error) {
    logger.error("Error in balance check:", error);
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Error",
          "An error occurred while checking your balance.",
          interaction.client.user.displayAvatarURL(),
        ),
      ],
    });
  }
}
