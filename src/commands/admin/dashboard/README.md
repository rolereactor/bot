# Dashboard Command

## Overview

The Dashboard command provides server administrators with quick access to the web dashboard for configuring all bot features.

## File Structure

```
dashboard/
├── index.js          # Command definition, metadata, and entry point
├── handlers.js       # Main command handler logic
├── embeds.js         # Discord embed creation
├── permissions.js    # Permission validation
└── README.md         # This documentation
```

## Architecture

Following the modular pattern established by other admin commands:

- **`index.js`**: Command definition, metadata, and main execution flow
- **`handlers.js`**: Core business logic and interaction processing
- **`embeds.js`**: Discord embed creation and formatting
- **`permissions.js`**: Permission validation and error responses

## Usage

```
/dashboard
```

## Permissions Required

- `ManageGuild` permission (Server Settings permission)

## What the Dashboard Provides

The web dashboard allows server administrators to:

- **Role Reactions**: Create and manage role-reaction panels
- **Tickets**: Configure support ticket systems
- **Welcome/Goodbye**: Set up automated welcome and goodbye messages
- **Pro Engine**: Manage premium features and billing
- **Analytics**: View server activity and member statistics
- **Settings**: Configure all bot settings from a web interface

## Features

- Ephemeral response (only visible to the command user)
- Quick-access button to open the dashboard
- Overview of available dashboard features
- Secure link generation with guild-specific URL

## Dependencies

- Discord.js
- Theme configuration for colors
- Response message utilities for error handling
