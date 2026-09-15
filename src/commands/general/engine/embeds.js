import { EmbedBuilder } from "discord.js";
import { THEME, UI_COMPONENTS, EMOJIS } from "../../../config/theme.js";
import { emojiConfig } from "../../../config/emojis.js";
import { WEBSITE_URL } from "../../../config/domains.js";
import { PremiumFeatures } from "../../../features/premium/config.js";

/**
 * Creates Pro Engine status embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {boolean} params.isPro
 * @param {Object} params.sub
 * @param {Object} params.vaultData
 * @param {import("discord.js").Client} params.client
 * @param {boolean} [params.isSparkPro]
 * @param {Object} [params.sparkProSub]
 */
export function createStatusEmbed({
  guild,
  isPro,
  sub,
  vaultData,
  client,
  isSparkPro,
  sparkProSub,
}) {
  const coreEmoji = emojiConfig.core;
  const sparkEmoji = emojiConfig.spark;

  const embed = new EmbedBuilder()
    .setAuthor(
      UI_COMPONENTS.createAuthor(
        `${guild.name} • Pro Engine Status`,
        guild.iconURL() || client?.user?.displayAvatarURL(),
      ),
    );

  // Determine which source is active
  const coreProActive = isPro && sub?.active;
  const sparkProActive = isSparkPro && sparkProSub?.active;
  const bothActive = coreProActive && sparkProActive;
  const coreOnly = coreProActive && !sparkProActive;
  const sparkOnly = sparkProActive && !coreProActive;

  if (coreOnly || sparkOnly || bothActive) {
    // ── Determine color and title based on active source ──
    if (sparkOnly) {
      // Spark Pro only — blue/teal
      embed.setColor(THEME.INFO);
    } else if (bothActive) {
      // Both active — purple (blend of gold + teal)
      embed.setColor(THEME.PRIMARY);
    } else {
      // Core Pro only — gold
      embed.setColor(THEME.PRO);
    }

    // ── Title ──
    if (sparkOnly) {
      embed.setTitle(`${sparkEmoji} Pro Engine is ACTIVE (Spark Pro)`);
    } else if (bothActive) {
      embed.setTitle(`${EMOJIS.ENGINE.ACTIVE} Pro Engine is ACTIVE (Core + Spark)`);
    } else {
      embed.setTitle(`${EMOJIS.ENGINE.ACTIVE} Pro Engine is ACTIVE`);
    }

    // ── Description ──
    if (sparkOnly) {
      embed.setDescription(
        "This server has **temporary Pro access** purchased via the Spark Shop.\n" +
          "⚠️ Spark Pro does **not auto-renew** — it will expire without Cores.",
      );
    } else if (bothActive) {
      embed.setDescription(
        "This server has **Core Pro** (subscription) with additional time from **Spark Pro**.",
      );
    } else {
      embed.setDescription(
        "This server is fueled with **Pro Engine**, unlocking max capacity for all members!",
      );
    }

    // ── Subscription Tier ──
    let subscriptionInfo = "";
    if (coreOnly || bothActive) {
      const isTrial = !!sub?.isTrial;
      subscriptionInfo = isTrial
        ? "🎁 **Free Trial** (7 Days)"
        : `${coreEmoji} **Core Pro** (${PremiumFeatures.PRO.cost} Cores/${PremiumFeatures.PRO.period})`;
    } else if (sparkOnly) {
      subscriptionInfo = `${sparkEmoji} **Spark Pro** (Purchased with Sparks)`;
    }

    // ── Expiry / Renewal ──
    let expiryText = "";
    if (sparkOnly && sparkProSub?.expiresAt) {
      const expires = new Date(sparkProSub.expiresAt);
      const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
      expiryText = `📅 **${expires.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}** (${daysLeft} day${daysLeft !== 1 ? "s" : ""} left)`;
    } else if ((coreOnly || bothActive) && sub?.nextDeductionDate) {
      const nextDate = new Date(sub.nextDeductionDate);
      expiryText = sub?.cancelledAt
        ? `${EMOJIS.STATUS.ERROR} Cancelled (Active until ${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`
        : `📅 **${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}**`;
    }

    // ── Vault ──
    const vaultBalance = vaultData?.balance || 0;
    const weeksFunded = Math.floor((vaultBalance / 20) * 100) / 100;

    // ── Build fields ──
    embed.addFields(
      {
        name: "💳 Active Source",
        value: subscriptionInfo,
        inline: true,
      },
      {
        name: "⏰ Renewal / Expiry",
        value: expiryText || "Active",
        inline: true,
      },
      {
        name: `${EMOJIS.ENGINE.VAULT} Guild Vault Reserve`,
        value: `${coreEmoji} **${vaultBalance.toFixed(2)} Cores** *(≈ ${weeksFunded} weeks prepaid)*`,
        inline: false,
      },
    );

    // ── Show Spark Pro details if both active ──
    if (bothActive && sparkProSub?.expiresAt) {
      const sparkExpiry = new Date(sparkProSub.expiresAt);
      const sparkDaysLeft = Math.ceil(
        (sparkExpiry - new Date()) / (1000 * 60 * 60 * 24),
      );
      embed.addFields({
        name: `${sparkEmoji} Spark Pro (Bonus Time)`,
        value: `Expires: **${sparkExpiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}** (${sparkDaysLeft} day${sparkDaysLeft !== 1 ? "s" : ""} left)\n_This is separate from your Core Pro subscription._`,
        inline: false,
      });
    }
  } else {
    // ── Free Tier ──
    const vaultBalance = vaultData?.balance || 0;
    const needsMore = (20 - vaultBalance).toFixed(2);

    embed
      .setColor(THEME.SECONDARY)
      .setTitle(`${EMOJIS.ENGINE.FREE} Free Tier (Standard Limits)`)
      .setDescription(
        "This server is currently running on the **Free Tier**.\n\n" +
          `Upgrade to **Pro Engine** (${PremiumFeatures.PRO.cost} Cores/${PremiumFeatures.PRO.period}) to unlock higher giveaway limits, HTML ticket transcripts, and 100 scheduled roles!`,
      )
      .addFields(
        {
          name: `${EMOJIS.ENGINE.VAULT} Guild Vault Reserve`,
          value: `${coreEmoji} **${vaultBalance.toFixed(2)} Cores** ${
            vaultBalance >= 20
              ? "*(Enough to activate Pro Engine!)*"
              : `*(Need ${needsMore} more Cores)*`
          }`,
          inline: false,
        },
        {
          name: `${EMOJIS.ENGINE.SUCCESS} How to Activate Pro Engine`,
          value:
            "1. **Fuel the Guild Vault:** Use `/engine fuel <cores>` to deposit Cores.\n" +
            `2. **Activate via Web:** Visit **[Role Reactor Dashboard](${WEBSITE_URL})** to enable Pro Engine!`,
          inline: false,
        },
        {
          name: `${sparkEmoji} Quick Pro via Spark Shop`,
          value:
            "Don't have Cores? Use `/shop` to purchase temporary Pro access with your earned Sparks!",
          inline: false,
        },
      );
  }

  return embed;
}

/**
 * Creates Guild Core Vault embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {Object} params.vaultData
 * @param {import("discord.js").Client} params.client
 */
export function createVaultEmbed({ guild, vaultData, client }) {
  const balance = vaultData?.balance || 0;
  const weeksFunded = (balance / 20).toFixed(1);
  const history = vaultData?.history || [];
  const coreEmoji = emojiConfig.core;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle(`${EMOJIS.ENGINE.VAULT} Guild Core Reserve`)
    .setAuthor(
      UI_COMPONENTS.createAuthor(
        `${guild.name} • Guild Vault`,
        guild.iconURL() || client?.user?.displayAvatarURL(),
      ),
    )
    .setDescription(
      `The **Guild Core Vault** lets anyone in the community pool Cores ${coreEmoji} to keep Pro Engine active for **${guild.name}**!`,
    )
    .addFields(
      {
        name: `${coreEmoji} Vault Balance`,
        value: `**${balance.toFixed(2)} Cores**`,
        inline: true,
      },
      {
        name: "⏱️ Funded Coverage",
        value: `≈ **${weeksFunded} weeks**`,
        inline: true,
      },
    );

  if (history.length > 0) {
    const contributorTotals = {};
    for (const entry of history) {
      const name = entry.username || "Anonymous";
      contributorTotals[name] =
        (contributorTotals[name] || 0) + (entry.amount || 0);
    }

    const sortedSponsors = Object.entries(contributorTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const sponsorList = sortedSponsors
      .map(([name, amount], index) => {
        const medal =
          index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
        return `${medal} **${name}**: ${amount.toFixed(2)} Cores`;
      })
      .join("\n");

    embed.addFields({
      name: "🏆 Top Community Sponsors",
      value: sponsorList,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🏆 Top Community Sponsors",
      value:
        "No contributions yet. Be the first to fuel this server with `/engine fuel`!",
      inline: false,
    });
  }

  return embed;
}

/**
 * Creates Fuel Confirmation embed with clean inline fields
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {import("discord.js").User} params.user
 * @param {number} params.amount
 * @param {number} [params.userBalance]
 * @param {import("discord.js").Client} _client
 */
export function createFuelConfirmationEmbed({
  guild,
  user,
  amount,
  userBalance,
  _client,
}) {
  const coreEmoji = emojiConfig.core;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle(`${EMOJIS.ENGINE.CONFIRM} Confirm Guild Vault Fueling`)
    .setAuthor(
      UI_COMPONENTS.createAuthor(user.username, user.displayAvatarURL()),
    )
    .setDescription(
      `Deposit **${amount.toFixed(2)} Cores ${coreEmoji}** into the **${guild.name}** Guild Vault?`,
    )
    .addFields(
      {
        name: "Deposit Amount",
        value: `${coreEmoji} **${amount.toFixed(2)} Cores**`,
        inline: true,
      },
      {
        name: "Target Server",
        value: `${EMOJIS.ENGINE.VAULT} **${guild.name}**`,
        inline: true,
      },
    );

  if (typeof userBalance === "number") {
    const remaining = userBalance - amount;
    embed.addFields({
      name: "Core Balance",
      value: `💳 **${userBalance.toFixed(2)}** ➔ **${remaining >= 0 ? remaining.toFixed(2) : "0.00"} Cores**`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Creates Fuel Cancelled embed
 * @param {import("discord.js").User} user
 * @param {import("discord.js").Client} _client
 */
export function createFuelCancelledEmbed(user, _client) {
  return new EmbedBuilder()
    .setColor(THEME.SECONDARY)
    .setTitle(`${EMOJIS.STATUS.ERROR} Fueling Cancelled`)
    .setAuthor(
      UI_COMPONENTS.createAuthor(user.username, user.displayAvatarURL()),
    )
    .setDescription("No Cores were deducted from your personal balance.");
}

/**
 * Creates Fuel Success embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {import("discord.js").User} params.user
 * @param {number} params.amount
 * @param {number} params.newVaultBalance
 * @param {import("discord.js").Client} _client
 */
export function createFuelSuccessEmbed({
  guild,
  user,
  amount,
  newVaultBalance,
  _client,
}) {
  const weeksFunded = (newVaultBalance / 20).toFixed(1);
  const coreEmoji = emojiConfig.core;

  return new EmbedBuilder()
    .setColor(THEME.SUCCESS)
    .setTitle(`${EMOJIS.ENGINE.SUCCESS} Guild Vault Fueled!`)
    .setAuthor(
      UI_COMPONENTS.createAuthor(user.username, user.displayAvatarURL()),
    )
    .setDescription(
      `**${user.username}** deposited **${amount.toFixed(2)} Cores ${coreEmoji}** into the Guild Core Reserve for **${guild.name}**!`,
    )
    .addFields(
      {
        name: `${EMOJIS.ENGINE.VAULT} New Vault Balance`,
        value: `**${newVaultBalance.toFixed(2)} Cores**`,
        inline: true,
      },
      {
        name: "⏱️ Funded Coverage",
        value: `≈ **${weeksFunded} weeks** of Pro Engine`,
        inline: true,
      },
    );
}
