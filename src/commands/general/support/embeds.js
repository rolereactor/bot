import { EmbedBuilder } from "discord.js";
import { THEME } from "../../../config/theme.js";

export function createSupportEmbed(_user) {
  return new EmbedBuilder()
    .setColor(THEME.PRIMARY)
    .setTitle("Support")
    .setDescription("Need help with the bot? Here's how to get support!")
    .addFields(
      {
        name: "How to Get Help",
        value: [
          "• **Help Command** - Use `/help` for command information",
          "• **Specific Help** - Use `/help command:command_name` for detailed help",
          "• **Community** - Join our support server for assistance",
          "• **Documentation** - Check our comprehensive guides",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Report Issues",
        value: [
          "• **Bug Reports** - Report bugs with detailed information",
          "• **Feature Requests** - Suggest new features and improvements",
          "• **Performance Issues** - Report slow responses or errors",
          "• **Compatibility** - Report issues with different platforms",
        ].join("\n"),
        inline: false,
      },
    );
}

export function createErrorEmbed() {
  return new EmbedBuilder()
    .setColor(THEME.ERROR)
    .setTitle("Error")
    .setDescription("Sorry, an error occurred.");
}
