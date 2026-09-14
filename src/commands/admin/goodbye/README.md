# Goodbye Command

## Overview

The Goodbye command lets administrators configure and manage the goodbye message system for members leaving the server.

## File Structure

```
goodbye/
├── index.js              # Command definition, subcommands, entry point
├── handlers.js           # Main command handlers (setup/settings)
├── embeds.js             # Discord embed creation for settings and configuration
├── components.js         # Interactive components (buttons, select menus)
├── modals.js             # Modal forms for configuration
├── utils.js              # Core utilities and validation
└── README.md             # This documentation
```

## Architecture

Following the modular pattern established by other admin commands:

- **`index.js`**: Command definition, permission validation, and main execution flow
- **`handlers.js`**: Core business logic, database operations, and interaction processing
- **`embeds.js`**: Discord embed creation and formatting
- **`components.js`**: Interactive UI components (buttons, select menus)
- **`modals.js`**: Modal forms for configuration input
- **`utils.js`**: Helper functions, validation, and logging utilities

## Subcommands

- **`/goodbye setup`**: Initial configuration of the goodbye system
  - Options: `channel` (required), `message` (optional), `enabled` (optional), `embed` (optional)
- **`/goodbye settings`**: View and manage current goodbye system settings

## Usage Examples

```
/goodbye setup channel:#general message:"Thanks for being part of {server}! 👋"
/goodbye settings
```

## Permissions Required

- `ManageGuild` permission
- Admin role or equivalent

## Key Features

- Interactive channel selection dropdown
- Custom message configuration with placeholders
- Toggle between embed and text formats
- Real-time settings display
- Permission-based access control
- Test goodbye functionality

## Message Placeholders

- `{user}` - Mentions the user who left
- `{user.name}` - Username of the user who left
- `{user.tag}` - Username#Discriminator of the user who left
- `{user.id}` - User ID of the user who left
- `{server}` - Server name
- `{server.id}` - Server ID
- `{memberCount}` - Current member count
- `{memberCount.ordinal}` - Ordinal member count (e.g., 100th)

## Dependencies

- Discord.js
- Database manager for guild settings
- Theme configuration for colors and emojis
- Permission validation utilities
