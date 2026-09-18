import { EmbedBuilder } from "discord.js";
import { THEME, UI_COMPONENTS } from "../../../config/theme.js";

/**
 * Create error embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder}
 */
export function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle("❌ " + title)
    .setDescription(description)
    .setColor(THEME.ERROR)
    .setFooter(UI_COMPONENTS.createFooter("Role Bundles"))
    .setTimestamp();
}

/**
 * Create success embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder}
 */
export function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle("✅ " + title)
    .setDescription(description)
    .setColor(THEME.SUCCESS)
    .setFooter(UI_COMPONENTS.createFooter("Role Bundles"))
    .setTimestamp();
}

/**
 * Create info embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder}
 */
export function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle("ℹ️ " + title)
    .setDescription(description)
    .setColor(THEME.INFO)
    .setFooter(UI_COMPONENTS.createFooter("Role Bundles"))
    .setTimestamp();
}
