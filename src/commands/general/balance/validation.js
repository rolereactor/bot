// ============================================================================
// INPUT VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates interaction state
 * @param {Object} interaction - Discord interaction object
 * @returns {Object} Validation result
 */
export function validateInteractionState(interaction) {
  if (!interaction) {
    return { valid: false, error: "Interaction is required" };
  }

  if (!interaction.isRepliable()) {
    return { valid: false, error: "Interaction is no longer repliable" };
  }

  if (!interaction.isChatInputCommand()) {
    return { valid: false, error: "Interaction must be a chat input command" };
  }

  return { valid: true };
}

/**
 * Validates command permissions
 * @param {Object} interaction - Discord interaction object
 * @returns {Object} Validation result
 */
export function validateCommandPermissions(interaction) {
  if (!interaction) {
    return { valid: false, error: "Interaction is required" };
  }

  if (!interaction.user) {
    return { valid: false, error: "User is required" };
  }

  if (interaction.user.bot) {
    return { valid: false, error: "Bots cannot use this command" };
  }

  return { valid: true };
}
