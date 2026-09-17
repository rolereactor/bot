/**
 * Tracks bot-initiated reaction removals to prevent the remove handler
 * from undoing role changes already handled by unique mode in the add handler.
 *
 * When unique mode removes a user's reaction, Discord fires messageReactionRemove.
 * Without tracking, the remove handler would try to remove roles that unique mode
 * already handled — causing a race condition that strips shared roles.
 */

const pendingBotRemovals = new Set();

/**
 * Mark a reaction as bot-initiated removal (called by unique mode in add handler).
 * @param {string} messageId - The message ID
 * @param {string} emoji - The emoji identifier
 * @param {string} userId - The user ID
 */
export function markBotRemoval(messageId, emoji, userId) {
  const key = `${messageId}:${emoji}:${userId}`;
  pendingBotRemovals.add(key);
  // Auto-cleanup after 5s to prevent memory leaks
  setTimeout(() => pendingBotRemovals.delete(key), 5000);
}

/**
 * Check if a reaction removal was bot-initiated.
 * @param {string} messageId - The message ID
 * @param {string} emoji - The emoji identifier
 * @param {string} userId - The user ID
 * @returns {boolean} True if this removal was initiated by the bot (unique mode)
 */
export function isBotRemoval(messageId, emoji, userId) {
  const key = `${messageId}:${emoji}:${userId}`;
  if (pendingBotRemovals.has(key)) {
    pendingBotRemovals.delete(key);
    return true;
  }
  return false;
}
