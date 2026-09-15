import { CORE_STATUS, PremiumFeatures } from "../../features/premium/config.js";
import { errorEmbed } from "./responseMessages.js";
import { getMentionableCommand } from "../commandUtils.js";
import { WEBSITE_URL } from "../../config/domains.js";
import { PREMIUM_FEATURES } from "../../commands/general/premium/premiumData.js";

export { PREMIUM_FEATURES };

/**
 * Creates a consistent Free vs Pro help field
 * @param {string} freeLimit - Description of free tier limit
 * @param {string} proLimit - Description of Pro Engine limit
 * @returns {object} Help field object
 */
export function createFreeVsProField(freeLimit, proLimit) {
  return {
    name: `⚡ ${CORE_STATUS.PRO.name} vs Free`,
    value: [
      `**Free:** ${freeLimit}`,
      `**${CORE_STATUS.PRO.name}:** ${proLimit}`,
      `Upgrade on **[${WEBSITE_URL}](${WEBSITE_URL})**`,
    ].join("\n"),
    inline: false,
  };
}

const { cost, period } = PremiumFeatures.PRO;
const PRO_COST_LINE = `**${cost} Cores/${period}**`;

/**
 * Creates a consistent upgrade embed when a user hits a free tier limit.
 * Returns the same {embeds, flags} format as errorEmbed() for direct use in interaction.reply/editReply.
 * @param {object} options
 * @param {string} options.feature - Display name of the feature (e.g. "Role Reaction Menus")
 * @param {string} options.freeText - Free tier limit description (e.g. "3 menus")
 * @param {string} options.proText - Pro tier limit description (e.g. "20 menus")
 * @param {import('discord.js').Client} [options.client] - Discord client for mentionable /vote command
 * @returns {{embeds: import('discord.js').EmbedBuilder[], flags: number}}
 */
export function upgradeLimitEmbed({ feature, freeText, proText, client }) {
  const voteCmd = client ? getMentionableCommand(client, "vote") : "`/vote`";
  return errorEmbed({
    title: "Free Tier Limit Reached",
    description: `You've reached the **${feature}** limit for the free plan.`,
    fields: [
      { name: "Free Plan", value: freeText, inline: true },
      { name: `⚡ ${CORE_STATUS.PRO.name}`, value: proText, inline: true },
      { name: "Cost", value: PRO_COST_LINE, inline: false },
    ],
    solution: `Purchase Cores at **[${WEBSITE_URL}](${WEBSITE_URL})** · Earn free Cores with ${voteCmd}`,
    isPremium: true,
  });
}
