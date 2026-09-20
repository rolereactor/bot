/**
 * Utility functions for Discord commands
 * @module utils/commandUtils
 */

/**
 * Gets the clickable command format </name:id> if registered,
 * or falls back to plain text `/name` if not found.
 *
 * @param {Object} client - Discord client instance
 * @param {string} fullCommandName - Name of the application command
 * @returns {string} Clickable command tag or plain string
 */
/**
 * Gets the clickable command format </name:id> if registered,
 * or falls back to plain text `/name` if not found.
 *
 * @param {Object} client - Discord client instance
 * @param {string} fullCommandName - Name of the application command
 * @param {string} [guildId=null] - Optional guild ID to prioritize searching in
 * @returns {string} Clickable command tag or plain string
 */
export function getMentionableCommand(client, fullCommandName, guildId = null) {
  if (!client || !client.application || !client.application.commands) {
    console.log(`[DEBUG getMentionableCommand] No client/application/commands for ${fullCommandName}`);
    return `\`/${fullCommandName}\``;
  }

  // Split out the base command from any subcommands (e.g., "giveaway create" -> "giveaway", "create")
  const parts = fullCommandName.trim().split(" ");
  const baseCommandName = parts[0];

  let cmd = null;

  // 1. Try Global Cache
  cmd = client.application.commands.cache.find(c => c.name === baseCommandName);
  console.log(`[DEBUG getMentionableCommand] Global cache search for "${baseCommandName}": ${cmd ? "FOUND" : "NOT FOUND"}`);

  // 2. Try Specific Guild if provided
  if (!cmd && guildId) {
    const targetGuild = client.guilds.cache.get(guildId);
    if (targetGuild) {
      cmd = targetGuild.commands.cache.find(c => c.name === baseCommandName);
      console.log(`[DEBUG getMentionableCommand] Guild ${guildId} cache search for "${baseCommandName}": ${cmd ? "FOUND" : "NOT FOUND"}`);
    }
  }

  // 3. Fallback: Search ALL guilds (useful in Dev where commands are guild-scoped but guildId might not be passed)
  if (!cmd) {
    for (const guild of client.guilds.cache.values()) {
      cmd = guild.commands.cache.find(c => c.name === baseCommandName);
      if (cmd) {
        console.log(`[DEBUG getMentionableCommand] Fallback guild ${guild.id} cache search for "${baseCommandName}": FOUND`);
        break;
      }
    }
  }

  if (cmd) {
    // If there are subcommands, append them inside the mention
    const result = `</${fullCommandName}:${cmd.id}>`;
    console.log(`[DEBUG getMentionableCommand] Generated mention: ${result}`);
    return result;
  }

  console.log(`[DEBUG getMentionableCommand] Fallback to plain text for ${fullCommandName}`);
  return `\`/${fullCommandName}\``;
}
