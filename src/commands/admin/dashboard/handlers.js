import { getLogger } from "../../../utils/logger.js";
import { createDashboardEmbed } from "./embeds.js";

/**
 * Handles the dashboard command execution
 * @param {Object} interaction - Discord interaction
 * @returns {Promise<void>}
 */
export async function handleDashboard(interaction) {
  const logger = getLogger();

  try {
    const { embed, components } = createDashboardEmbed(
      interaction.guildId,
      interaction.client,
    );

    await interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });

    logger.info(`Dashboard link sent for guild ${interaction.guildId}`);
  } catch (error) {
    logger.error("Dashboard command error", error);
    await interaction.reply({
      content: "❌ An error occurred while generating the dashboard link.",
      ephemeral: true,
    });
  }
}
