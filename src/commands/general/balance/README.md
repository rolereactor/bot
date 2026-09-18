# Balance Command

## Overview

The `/balance` command allows users to check their Cores & Sparks balance.

## File Structure

```
balance/
├── index.js          # Command definition and entry point
├── handlers.js       # Main command logic and interaction handling
├── embeds.js         # Discord embed creation and formatting
├── utils.js          # Helper functions, data management, and pricing calculations
├── validation.js     # Input validation and user data verification
└── README.md         # This documentation
```

## Architecture

Following the modular pattern established by other general commands:

- **`index.js`**: Command definition and metadata
- **`handlers.js`**: Core business logic, balance checking, and pricing display
- **`embeds.js`**: Discord embed creation and formatting
- **`utils.js`**: Helper functions, data management, and pricing calculations
- **`validation.js`**: Input validation and user data verification

## Usage Examples

```
/balance
```

## Permissions Required

- None (Slash Command interactions inherently grant the ability to reply with embeds)

## Key Features

- Real-time balance checking
- Cores & Sparks display with emoji indicators
- Pro status indicator
- Quick-action buttons for Shop and Vote
- Ephemeral responses for privacy

## Dependencies

- Discord.js
- Storage manager for data persistence
- Theme configuration for colors and styling
