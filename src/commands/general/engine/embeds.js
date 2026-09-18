import { EmbedBuilder } from "discord.js";
import { THEME, UI_COMPONENTS, EMOJIS } from "../../../config/theme.js";
import { emojiConfig } from "../../../config/emojis.js";
import { WEBSITE_URL } from "../../../config/domains.js";
import { PremiumFeatures } from "../../../features/premium/config.js";
import { getMentionableCommand } from "../../../utils/commandUtils.js";

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

  const fuelCmd = getMentionableCommand(client, "engine fuel", guild?.id);
  const shopCmd = getMentionableCommand(client, "shop", guild?.id);

  // Determine which source is active
  const coreProActive = isPro && sub?.active;
  const sparkProActive = isSparkPro && sparkProSub?.active;
  const bothActive = coreProActive && sparkProActive;
  const coreOnly = coreProActive && !sparkProActive;
  const sparkOnly = sparkProActive && !coreProActive;

  const vaultBalance = Number(vaultData?.balance) || 0;
  const weeksFunded = Math.floor((vaultBalance / 20) * 100) / 100;

  const embed = new EmbedBuilder()
    .setAuthor(
      UI_COMPONENTS.createAuthor(
        `${guild.name} • Engine Status`,
        guild.iconURL() || client?.user?.displayAvatarURL(),
      ),
    );

  if (coreOnly || sparkOnly || bothActive) {
    // ── Pro Active ──
    if (sparkOnly) {
      embed.setColor(THEME.INFO);
    } else if (bothActive) {
      embed.setColor(THEME.PRIMARY);
    } else {
      embed.setColor(THEME.PRO);
    }

    // ── Title ──
    if (sparkOnly) {
      embed.setTitle(`${sparkEmoji} Pro Engine Active`);
    } else if (bothActive) {
      embed.setTitle(`${EMOJIS.ENGINE.ACTIVE} Pro Engine Active`);
    } else {
      embed.setTitle(`${EMOJIS.ENGINE.ACTIVE} Pro Engine Active`);
    }

    // ── Source & Expiry ──
    let sourceText = "";
    let expiryText = "";

    if (coreOnly || bothActive) {
      const isTrial = !!sub?.isTrial;
      sourceText = isTrial
        ? "🎁 **Free Trial**"
        : `${coreEmoji} **Pro Engine** (${PremiumFeatures.PRO.cost} ${coreEmoji}/${PremiumFeatures.PRO.period})`;

      if (sub?.nextDeductionDate) {
        const nextDate = new Date(sub.nextDeductionDate);
        expiryText = sub?.cancelledAt
          ? `❌ Cancelled — active until ${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : `📅 Renews ${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
    } else if (sparkOnly) {
      sourceText = `${sparkEmoji} **Spark Pro**`;
      if (sparkProSub?.expiresAt) {
        const expires = new Date(sparkProSub.expiresAt);
        const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
        expiryText = `📅 Expires ${expires.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${daysLeft}d left)`;
      }
    }

    embed.addFields(
      {
        name: "Source",
        value: sourceText,
        inline: true,
      },
      {
        name: "Renewal",
        value: expiryText || "Active",
        inline: true,
      },
      {
        name: "\u200B",
        value: "\u200B",
        inline: true,
      },
      {
        name: "Guild Vault",
        value: `${coreEmoji} **${vaultBalance.toFixed(2)}** *(≈ ${weeksFunded} weeks)*`,
        inline: false,
      },
    );

    // ── Spark Pro bonus time ──
    if (bothActive && sparkProSub?.expiresAt) {
      const sparkExpiry = new Date(sparkProSub.expiresAt);
      const sparkDaysLeft = Math.ceil(
        (sparkExpiry - new Date()) / (1000 * 60 * 60 * 24),
      );
      embed.addFields({
        name: `${sparkEmoji} Spark Pro Bonus`,
        value: `Expires ${sparkExpiry.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${sparkDaysLeft}d left)`,
        inline: false,
      });
    }
  } else {
    // ── Free Tier ──
    const needsMore = (20 - vaultBalance).toFixed(2);

    embed
      .setColor(THEME.SECONDARY)
      .setTitle(`${EMOJIS.ENGINE.FREE} Free Tier`)
      .setDescription(
        `Upgrade to **Pro Engine** (${PremiumFeatures.PRO.cost} ${coreEmoji}/${PremiumFeatures.PRO.period}) for higher limits and HTML transcripts.`,
      )
      .addFields(
        {
          name: "Guild Vault",
          value: `${coreEmoji} **${vaultBalance.toFixed(2)}** ${
            vaultBalance >= 20
              ? "*(Ready to activate!)*"
              : `*(Need ${needsMore} more)*`
          }`,
          inline: false,
        },
        {
          name: "How to Activate",
          value:
            `1. Fuel the vault with ${fuelCmd}\n` +
            `2. Enable on the **[Dashboard](${WEBSITE_URL})**`,
          inline: false,
        },
        {
          name: "No Cores?",
          value: `Use ${shopCmd} to get temporary Pro with Sparks`,
          inline: false,
        },
      );
  }

  return embed;
}

/**
 * Creates Guild Vault embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {Object} params.vaultData
 * @param {import("discord.js").Client} params.client
 */
export function createVaultEmbed({ guild, vaultData, client }) {
  const balance = Number(vaultData?.balance) || 0;
  const weeksFunded = (balance / 20).toFixed(1);
  const history = vaultData?.history || [];
  const coreEmoji = emojiConfig.core;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setAuthor(
      UI_COMPONENTS.createAuthor(
        `${guild.name} • Guild Vault`,
        guild.iconURL() || client?.user?.displayAvatarURL(),
      ),
    )
    .setDescription(
      `The **Guild Vault** lets anyone in the community pool Cores to keep Pro Engine active for **${guild.name}**!`,
    )
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        client?.user?.displayAvatarURL(),
      ),
    )
    .addFields(
      {
        name: "Vault Balance",
        value: `${coreEmoji} **${balance.toFixed(2)}**`,
        inline: true,
      },
      {
        name: "⏱️ Funded Coverage",
        value: `≈ **${weeksFunded} weeks**`,
        inline: true,
      },
    );

  return embed;
}

/**
 * Creates Guild Fuelers embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {Object} params.vaultData
 * @param {import("discord.js").Client} params.client
 */
export function createFuelersEmbed({ guild, vaultData, client }) {
  const history = vaultData?.history || [];
  const coreEmoji = emojiConfig.core;

  const fuelCmd = getMentionableCommand(client, "engine fuel", guild?.id);

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setAuthor(
      UI_COMPONENTS.createAuthor(
        `${guild.name} • Guild Fuelers`,
        guild.iconURL() || client?.user?.displayAvatarURL(),
      ),
    )
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        client?.user?.displayAvatarURL(),
      ),
    );

  if (history.length > 0) {
    const contributorTotals = {};
    for (const entry of history) {
      const name = entry.username || "Anonymous";
      contributorTotals[name] =
        (Number(contributorTotals[name]) || 0) + (Number(entry.amount) || 0);
    }

    const sortedSponsors = Object.entries(contributorTotals)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10);

    const sponsorList = sortedSponsors
      .map(([name, amount], index) => {
        const medal =
          index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
        return `${medal} **${name}**: ${coreEmoji} ${amount.toFixed(2)}`;
      })
      .join("\n");

    embed.setDescription(`Fuel this server with ${fuelCmd}`);

    embed.addFields({
      name: "Top Contributors",
      value: sponsorList,
      inline: false,
    });
  } else {
    embed.setDescription(
      `No contributions yet.\n\nFuel this server with ${fuelCmd}`,
    );
  }

  return embed;
}

/**
 * Creates personal contribution summary embed
 * @param {Object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {import("discord.js").User} params.user
 * @param {Object} params.vaultData
 * @param {import("discord.js").Client} params.client
 */
export function createMeEmbed({ guild, user, vaultData, client }) {
  const history = vaultData?.history || [];
  const coreEmoji = emojiConfig.core;

  const userHistory = history.filter(entry => entry.userId === user.id);
  const totalContributed = userHistory.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const contributionCount = userHistory.length;

  const embed = new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setAuthor(
      UI_COMPONENTS.createAuthor(user.username, user.displayAvatarURL()),
    )
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        client?.user?.displayAvatarURL(),
      ),
    );

  if (contributionCount > 0) {
    embed.addFields(
      {
        name: "Total Contributed",
        value: `${coreEmoji} **${totalContributed.toFixed(2)}**`,
        inline: true,
      },
      {
        name: "Times Fueled",
        value: `**${contributionCount}**`,
        inline: true,
      },
      {
        name: "\u200B",
        value: "\u200B",
        inline: true,
      },
    );

    // Show last 5 contributions
    const recent = userHistory.slice(-5).reverse();
    const recentList = recent
      .map(entry => {
        const date = new Date(entry.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `• ${date}: ${coreEmoji} ${Number(entry.amount).toFixed(2)}`;
      })
      .join("\n");

    embed.addFields({
      name: "Recent Contributions",
      value: recentList,
      inline: false,
    });
  } else {
    embed.setDescription(
      `You haven't contributed to this vault yet.\nUse ${getMentionableCommand(client, "engine fuel", guild?.id)} to get started!`,
    );
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
    .setTitle("⛽ Confirm Fueling")
    .setAuthor(
      UI_COMPONENTS.createAuthor(user.username, user.displayAvatarURL()),
    )
    .setDescription(
      `Deposit **${coreEmoji} ${amount.toFixed(2)}** into **${guild.name}**?`,
    )
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        _client?.user?.displayAvatarURL(),
      ),
    );

  if (typeof userBalance === "number") {
    const remaining = userBalance - amount;
    embed.addFields({
      name: "Balance",
      value: `${coreEmoji} **${userBalance.toFixed(2)}** → **${remaining >= 0 ? remaining.toFixed(2) : "0.00"}**`,
      inline: false,
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
    .setDescription("No cores were deducted from your personal balance.")
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        _client?.user?.displayAvatarURL(),
      ),
    );
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
      `**${user.username}** deposited **${coreEmoji} ${amount.toFixed(2)}** into the Guild Vault for **${guild.name}**!`,
    )
    .addFields(
      {
        name: `${EMOJIS.ENGINE.VAULT} New Vault Balance`,
        value: `${coreEmoji} **${newVaultBalance.toFixed(2)}**`,
        inline: true,
      },
      {
        name: "⏱️ Funded Coverage",
        value: `≈ **${weeksFunded} weeks** of Pro Engine`,
        inline: true,
      },
    )
    .setTimestamp()
    .setFooter(
      UI_COMPONENTS.createFooter(
        "Engine",
        _client?.user?.displayAvatarURL(),
      ),
    );
}
