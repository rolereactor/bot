import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { THEME, UI_COMPONENTS } from "../../../config/theme.js";
import { PREMIUM_FEATURES } from "./premiumData.js";
import { WEBSITE_URL } from "../../../config/domains.js";
import { PremiumManager } from "../../../features/premium/PremiumManager.js";
import { PremiumFeatures } from "../../../features/premium/config.js";

const PRO_NAME = "Pro Engine";

export const metadata = {
  name: "premium",
  category: "general",
  description: "View Pro Engine premium features, start a trial, or upgrade",
  keywords: ["premium", "pro", "upgrade", "cores", "subscription", "trial"],
  emoji: "⚡",
  createdAt: "2026-04-23",
  helpFields: [
    {
      name: `How to Use`,
      value: [
        "```/premium display``` — View all free vs Pro limits",
        "```/premium trial``` — Start a 7-day free trial",
      ].join("\n"),
      inline: false,
    },
    {
      name: `What You'll See`,
      value: "A list of all premium features available with Pro Engine",
      inline: false,
    },
  ],
};

export const data = new SlashCommandBuilder()
  .setName(metadata.name)
  .setDescription(metadata.description)
  .addSubcommand(subcommand =>
    subcommand
      .setName("display")
      .setDescription("View all free vs Pro Engine limits"),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("trial")
      .setDescription("Start a 7-day free Pro Engine trial for this server"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, _client) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "trial") {
    return handleTrial(interaction);
  }

  return handleDisplay(interaction);
}

async function handleDisplay(interaction) {
  const embed = new EmbedBuilder()
    .setTitle(`⚡ ${PRO_NAME} - Premium Features`)
    .setDescription(
      [
        `Upgrade to unlock **unlimited features** and **higher limits**!`,
        "",
        `**Cost:** ${PremiumFeatures.PRO.cost} Cores/${PremiumFeatures.PRO.period}`,
        `**How to upgrade:** Visit **[${WEBSITE_URL}](${WEBSITE_URL})** to purchase Cores and enable ${PRO_NAME}.`,
        "",
        `You can also earn **free Cores** by voting for Role Reactor on Top.gg!`,
      ].join("\n"),
    )
    .setColor(THEME.PRO)
    .setFooter(UI_COMPONENTS.createFooter("Premium"))
    .setTimestamp();

  for (const feature of PREMIUM_FEATURES) {
    embed.addFields({
      name: `${feature.emoji} ${feature.name}`,
      value: [
        `**Free:** ${feature.free}`,
        `**${PRO_NAME}:** ${feature.pro}`,
      ].join("\n"),
      inline: false,
    });
  }

  embed.addFields({
    name: "💡 Quick Tip",
    value:
      "Most commands work with free limits - upgrade only when you need more!",
    inline: false,
  });

  embed.addFields({
    name: "🎁 Free Trial",
    value:
      "New to Pro? Run `/premium trial` to start a **7-day free trial** — no Cores required, one trial per server.",
    inline: false,
  });

  embed.addFields({
    name: "⚡ Earn with Sparks",
    value:
      "Use your earned Sparks to get temporary Pro access! Run `/shop` to browse available items.",
    inline: false,
  });

  return interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

async function handleTrial(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const manager = new PremiumManager();
  const result = await manager.activateTrial(
    interaction.guildId,
    interaction.user.id,
  );

  const embed = new EmbedBuilder()
    .setColor(result.success ? THEME.SUCCESS : THEME.ERROR)
    .setFooter(UI_COMPONENTS.createFooter("Premium Trial"))
    .setTimestamp();

  if (result.success) {
    embed
      .setTitle("🎁 Pro Engine Trial Activated!")
      .setDescription(result.message)
      .addFields({
        name: "What's unlocked",
        value: PREMIUM_FEATURES.map(f => `${f.emoji} ${f.name}`).join("\n"),
        inline: false,
      })
      .addFields({
        name: "After the trial",
        value:
          "Your server reverts to Free Tier limits. Purchase Cores at the Web Dashboard to keep Pro active.",
        inline: false,
      });
  } else {
    embed
      .setTitle("Trial Unavailable")
      .setDescription(result.message)
      .addFields({
        name: "Need Pro now?",
        value: `Purchase Cores at **[${WEBSITE_URL}](${WEBSITE_URL})** or earn free Cores with \`/vote\`.`,
        inline: false,
      });
  }

  return interaction.editReply({ embeds: [embed] });
}
