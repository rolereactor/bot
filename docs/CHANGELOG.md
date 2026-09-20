# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Vote Rewards**: Voting for the bot on top.gg now earns **Sparks** ⚡ — starting at 5 Sparks per vote and scaling with your voting streak up to 8 (12-hour cooldown).
- **Balance Command**: `/core` renamed to `/balance` — shows Cores & Sparks balance.

### Added

- **Live Reactor**: Connect your streaming channel to Discord with go-live alerts, real-time chat relay, customizable timers, stream commands, and quote system. Supports Twitch and YouTube.
- **Shop System (Beta)**: New `/shop` command to purchase tradable items with Cores or Sparks. Includes monthly guild stock limits and flash sales.
- **Inventory System (Beta)**: New `/inventory` command to view and use purchased items.
- **Trade System (Beta)**: New `/trade` command to gift items to other users.
- **Engine Command**: New `/engine` command to manage Pro Engine status, view Guild Core Reserve, and deposit Cores into server vault.
- **Dashboard Command**: New `/dashboard` admin command to open the web dashboard.
- **Referral System**: Claim a friend's referral code on the dashboard for +25 Sparks ⚡ and 10% bonus Cores on your first $10+ purchase. Referrers earn 15% bonus Cores on referred purchases of $10+.
- **Web Dashboard**: New panels for ticket management, goodbye system configuration, and role bundle management.

## [1.8.0] - 2026-07-23

### Added

- **Image Tools**: Introduced a suite of Image Tools to the web dashboard — **Resize**, **Compress**, **Convert**, and **Upscale**. Resize, Compress, and Convert include a free daily quota; additional usage and Upscale draw from your Core credits.
- **Timeout List**: New `/moderation timeouts` command to see all currently timed-out members in your server at a glance.
- **Starboard System**: New `/starboard` command to highlight the best messages in your server. Configure a dedicated channel, emoji, and reaction threshold. Starred messages are automatically posted with a dynamic heat-map embed color (gold → orange → red based on star count), reply context, image previews, and support for video, audio, and file attachments.

### Fixed

- **Schedule Role**: Fixed an issue where recurring schedules (`weekly`, `monthly`) failed to execute due to incorrect execution time comparisons, and corrected a display bug where they appeared as one-time "Pending" schedules showing `<t:NaN:F>`.

## [1.7.1] - 2026-04-01

### Security

- **API Security Hardening**: Improved protection against unauthorized access to the bot's API:
  - Added verification to ensure users can only access their own data
  - Added permission checks so only server managers can modify server settings
  - Added rate limits to prevent automated abuse
  - Improved secure communication between the website and bot

### Changed

- **Enhanced Security**: Protected all API endpoints from unauthorized access
- **Faster Monitoring**: Health check endpoint is now publicly accessible for monitoring tools

### Fixed

- Prevented unauthorized users from accessing sensitive API endpoints
- Secured payment creation to prevent fraudulent transactions
- Fixed potential data exposure in user account endpoints

## [1.7.0] - 2026-03-28

### Added

- **Giveaway System**: Complete `/giveaway` command with create, list, end, reroll, cancel, delete, and edit subcommands. Includes automatic timer-based ending, weighted random winner selection, bonus entries for roles/boosters, claim periods, account/server age requirements, and rate limiting.
- **Role Bundles**: Create reusable groups of roles with `/role-bundle create`, `/role-bundle delete`, and `/role-bundle list`. Use bundles directly in `/role-reactions setup` with the `bundle:` parameter and autocomplete support.
- **Web Dashboard Notifications**: Added a notification bell to the web dashboard for tracking Core balance changes, recent purchases, and Pro Engine status.
- **Voting Rewards**: Support the bot by voting on top.gg using the `/vote` command to earn 1 free Core Credit every 12 hours.
- **Ticketing System**: Complete support ticket system with `/ticket setup`, `/ticket info`, `/ticket claim`, `/ticket close`, `/ticket add`, and `/ticket remove` commands.
- **Ticket Panels**: Multiple custom panels with customizable titles, branding, and categorizations.
- **Scalable Transcripts**: High-performance transcript system supporting rich HTML layouts for Pro servers and Markdown for free servers, with user-accessible download logs.
- **Guild Data Purge**: Administrative tool to securely wipe all ticket history and reset the global counter from a simplified dashboard.
- **Multi-Role Reactions**: A single emoji can now grant multiple roles at once in role-reaction setups.
- **Interactive Help Menu**: All command names in the `/help` menu are now clickable slash command mentions, allowing you to directly trigger commands from the help guide.
- **High-Performance Leaderboards**: Complete refactor of the leaderboard system to use database-driven profile storage. Eliminates page load latency by removing sequential Discord API calls during rendering.
- **Bulk Member Enrichment**: Resolved issues where the bot would frequently hit Discord rate limits during leaderboard rendering, ensuring smoother and more consistent data displays.
- **Auto-Merging Mappings**: New backend system automatically identifies and merges duplicate role-emoji mappings for cleaner server configurations.

### Changed

- **Admin Command Styling**: Standardized the visual design and color schemes across all `/admin` command messages to provide a more cohesive and professional experience.

- **Pro Engine Benefits**: Unlock 10x monthly ticket capacity, HTML transcripts/exports, unlimited retention, and staff performance analytics.
- **Advanced Role Management**: 20x scheduled role capacity (500 active slots) and 10x bulk action targeting (250 members) for Pro servers.
- **Serverinfo Redesign**: `/serverinfo` command has been redesigned with a fresh look, including Pro Engine status display.
- **Goodbye System**: General performance improvements in goodbye message processing.
- **Core Balance Display**: `/core balance` now shows vote statistics, next vote countdown with Discord dynamic timestamps, server Pro Engine status, and quick-action buttons for "Vote & Earn" and "Upgrade Center."
- **Bulk Action Limits**: `/temp-roles` and `/schedule-role` now correctly support up to **250 users** per action on Pro Engine servers and **25 users** on Free servers (previously capped at 20 for all servers).
- **Faster Moderation**: `/moderation` bulk operations (timeout, warn, ban, kick) are now significantly faster and more responsive when processing user lists.

### Fixed

- **Bulk Action on Pro Servers**: Fixed an issue where `/temp-roles assign` and `/schedule-role create` would not process more than 20 users, even on Pro Engine servers entitled to 250 users.
- **Experience Calculations**: Fixed an error in the experience manager where leveling progress could occasionally fail to calculate correctly under specific conditions.
- **Leaderboard Search**: Improved the accuracy of leaderboard search filters, ensuring more reliable server discovery for the public index.

## [1.6.3] - 2026-03-04

### Added

- **Enhanced Rank Titles**: Server levels now come with evocative rank titles that reflect growing status and contribution to the community.
- **Role Reactions**: Added an optional `hide_list` toggle to `/role-reactions setup` and `update` commands, allowing administrators to hide the automated roles list and fully customize their own menus in the description field.

### Changed

- **Flexible Pro Subscription**: The Pro Engine has moved to a simpler weekly billing cycle (20 Cores per week), making it easier to manage premium features.
- **Modern Leaderboards**: Level and leaderboard messages have been redesigned with a fresh look and better readability.
- **Improved Dashboard Reliability**: Web settings and balance tracking are now faster and more accurate.
- **Enhanced Configuration Sync**: Bot settings now update more reliably across all server management commands.
- **Role-Reaction Descriptions**: Support added for literal newlines (`\n`) directly in role-reaction setups for deeper customization options.

### Fixed

- **Message Spying**: Prevented the bot from accidentally tracking `@everyone` and `@here` mentions in general chat logs.

## [1.6.2] - 2026-02-12

### Added

- **Server Growth Tracking**: New automated system to track member joins and leaves for improved community oversight.
- **Enhanced Server Statistics**: View detailed real-time information about server activity, 14-day growth trends, and top member leaderboards.

### Changed

- **Smart Troubleshooting**: Added clearer guidance for larger bots (100+ servers) encountering Discord verification limits, with direct steps on how to resolve them.
- **Improved Message Layouts**: Refined the appearance and spacing of instructions in role scheduling messages for better readability.
- **Schedule Role Efficiency**: Significantly improved the speed and reliability of role assignments and removals, especially for large servers.

## [1.6.1] - 2026-01-30

### Changed

- **Unified UI**: Role management now features a consistent "Success" theme, minimalist embeds, and quick "View Message" shortcuts.
- **Human-Only Counts**: Welcome and goodbye messages now strictly count human members, excluding bots.

### Fixed

- **Reaction Sync**: Updating role configurations now instantly syncs and orders emoji reactions.
- **Member Counting**: Fixed bots being incorrectly counted as humans in welcome/goodbye statistics.
- **Stability**: Resolved interaction failures and sluggishness in slash commands.

## [1.6.0] - 2026-01-17

### Added

- **Voice Roles Command**: New `/voice-roles` command to automatically manage users in voice channels based on roles.
- **Voice Roles Subcommands**: `/voice-roles disconnect`, `/voice-roles mute`, `/voice-roles deafen`, `/voice-roles move`, and `/voice-roles list` subcommands for complete voice management.
- **Voice Roles Auto-Apply**: Voice control actions automatically apply to users already in voice channels when roles are first configured.
- **Voice Roles List**: View all configured voice control roles with indicators for deleted roles or channels that need cleanup.
- **Would You Rather Command**: New `/wyr` command with interactive voting system for engaging server discussions.
- **WYR Interactive Voting**: Users can vote on questions with real-time vote counts and percentages displayed.
- **WYR Question Database**: 100+ curated questions organized into categories including Pop Culture and Technology.
- **Rock Paper Scissors Command**: New `/rps` command to play Rock Paper Scissors against the bot or challenge other users.
- **RPS Multiplayer Challenges**: Challenge other users to Rock Paper Scissors with interactive button responses.

### Changed

- **Help System**: Improved help documentation with more detailed information for all commands. Help content is now automatically kept up to date with command features.

### Removed

- **Voice Restrictions**: Removed automatic voice restriction enforcement feature. The bot no longer automatically disconnects or mutes users based on role permissions.
- **Sponsor Command**: Removed standalone `/sponsor` command. Sponsorships and credit purchases have been consolidated into the `/core` command.

### Fixed

- **Role Reactions**: Fixed issue where invalid emojis (like symbols ♡, ⚡) could be used, causing reaction failures. Added strict validation to reject non-Discord emojis upfront.
- **Role Reactions**: Fixed role name parsing to require explicit emojis for all roles, preventing ambiguity and ensuring correct reaction assignment.
- **Role Reactions**: Fixed issue where reaction messages were left behind if reaction addition failed. Messages are now automatically deleted to prevent confusion.
- **Error Handling**: Improved error messages for invalid emoji detection in role-reactions setup command.

## [1.5.0] - 2025-12-15

### Added

- **Moderation Commands**: Complete moderation system with `/moderation` command supporting timeout, warn, ban, kick, unban, purge, history, remove-warn, and list-bans subcommands.
- **Moderation Bulk Operations**: Support for moderating multiple users at once (up to 15 users) for timeout, warn, ban, kick, and unban actions.
- **Moderation History**: View moderation history for individual users or entire server with pagination support.
- **Moderation Auto-Escalation**: Automatic timeout or kick based on warning thresholds (configurable).
- **Moderation DM Notifications**: Users receive direct messages when warned, timed out, banned, kicked, or unbanned.
- **Moderation Bot Protection**: Moderation commands prevent moderating bots to avoid breaking bot functionality.
- **Warning System**: Track and manage user warnings with automatic escalation to timeout or kick.
- **Userinfo Command**: New `/userinfo` command to view detailed information about Discord users including account details, badges, roles, join date, timeout status, and current voice channel. Warning count now appears for users with moderation history.
- **Serverinfo Command**: Added `/serverinfo` command to view comprehensive server information including member statistics, channel counts, server description, and boost level.
- **Bot Statistics**: Public bot statistics including server count and user count are now available.
- **Payment Integration**: Added support for Buy Me a Coffee and cryptocurrency payments.

### Changed

- **Core Payment System**: Updated Core payment system to only accept one-time cryptocurrency payments. Subscriptions are no longer available, and all payments are processed as one-time purchases that never expire.
- **Minimum Payment Amount**: Increased minimum payment amount from $1 to $10 for Core credit purchases.

### Fixed

- **Avatar Credit Breakdown**: Restored credit deduction breakdown display in avatar generation success message.
- **Level-Up Notifications**: Improved error handling and diagnostics for level-up message posting. Bot now provides better error messages when it cannot post to the configured level-up channel.
- **Payment Validation**: Added minimum payment validation in crypto webhook to prevent credits from being granted for payments below $10.
- **Moderation Unban Operations**: Improved speed of bulk unban operations.
- **Bot Statistics**: Improved response times by caching statistics for 24 hours.

### Security

- **Webhook Security**: Enhanced webhook token verification to prevent security vulnerabilities.

## [1.4.0] - 2025-11-09

### Added

- **Schedule Role Command**: Restored `/schedule-role` command with full functionality including one-time and recurring schedules.
- **Voice Restrictions**: Automatic voice restriction enforcement when assigning/removing roles with Connect or Speak permissions disabled.
- **Voice Restrictions for Temp-Roles**: Users are automatically disconnected or muted when assigned restrictive temporary roles.
- **Voice Restrictions for Schedule-Role**: Automatic voice restriction enforcement for scheduled role assignments.
- **Voice Restrictions for Existing Members**: Voice restrictions now apply to members who already have restrictive roles when they join voice channels.
- **Temp-Roles Bulk Targeting**: Added support for targeting multiple users by role in `/temp-roles` command with Core member benefits.

### Changed

- **Voice Operations**: Significantly improved voice restriction enforcement speed and efficiency, especially for servers with many members.
- **Voice Operations Queue**: Optimized voice operation processing to handle high concurrency scenarios faster.
- **Voice Restrictions**: Reduced delays and improved response times when muting or disconnecting users with restrictive roles.

## [1.3.1] - 2025-11-02

### Fixed

- **Role Reactions**: Custom emojis (including animated) now correctly grant and remove roles. This fix ensures reactions using server emojis work the same as standard Unicode emojis, with no setup changes required.
- **Core Credits**: Fixed issue where credits were not properly saved after donations and subscriptions.
- **Ko-fi Payments**: Fixed payment processing issues that prevented payments from being processed correctly.

## [1.3.0] - 2025-10-28

### Added

- **Temp-Roles Removal Notifications**: Added `notify` option to `/temp-roles remove` command to send DM notifications to users when their roles are manually removed.
- **Temp-Roles Notification System**: Comprehensive notification system with removal details including who removed the role, reason, and timestamp.
- **Image Generation**: Improved image generation reliability with better error handling.

### Changed

- **XP Command Structure**: Converted `/xp` command to use `/xp settings` subcommand pattern for consistency with other admin commands.
- **Admin Command UI**: Standardized button layouts across goodbye/welcome/xp commands with consistent ordering and styling.
- **Button Design**: Removed emojis from configuration buttons and made back buttons icon-only across all admin commands.
- **Level-Up Messages Button**: Updated to show "Enable"/"Disable" with primary/secondary color styling.
- **Help Documentation**: Updated XP command examples to reflect new subcommand structure.
- **Welcome System Embeds**: Redesigned welcome embeds and resolved interaction errors for better user experience.
- **Goodbye System Embeds**: Redesigned goodbye embeds and resolved interaction errors for improved functionality.
- **General Command Embeds**: Simplified invite, poll, 8ball, avatar, core, support, sponsor, ping, level, and leaderboard command embeds for cleaner design.
- **Help System**: Simplified button layout and removed redundant buttons for better user experience.
- **Role-Reactions Color System**: Updated color options with cyberpunk-themed colors and improved consistency.
- **Temp-Roles Embeds**: Enhanced embeds and simplified DM messages for better user experience.

### Removed

- **Schedule Role System**: Removed `/schedule-role` command and all related functionality due to low usage and maintenance complexity.
- **Level-Up Messages Footer**: Removed footer from Level-Up Messages configuration page for cleaner design.

### Fixed

- **Channel Display Logic**: Fixed channel selection pages to properly show current channel status instead of always "Not Set".
- **XP Button Navigation**: Fixed "back_to_settings" button error that occurred after XP command simplification.
- **Temp-Roles**: Fixed issues that could prevent temporary roles from being saved correctly.
- **Interaction Stability**: Fixed bot stability issues and interaction timeouts.
- **Ko-fi Webhook Processing**: Resolved webhook processing limitations.
- **Member Permission Errors**: Fixed permission checking across commands.
- **Help Command Examples**: Fixed incorrect command examples in help system (removed quotes from parameters).
- **Role Parsing**: Resolved role parsing issue with emoji variation selectors.

### Security

- **Webhook Security**: Enhanced webhook verification for improved security.

## [1.2.0] - 2025-10-15

### Added

- **AI Avatar Generation**: Complete AI-powered avatar generation system with `/avatar` command.
- **Avatar Content Filter**: Advanced content filtering with 97.6% accuracy for inappropriate content detection.
- **Avatar Style Options**: Multiple style choices including color_style, mood, and art_style parameters.
- **Core Credit System**: New credit-based economy for avatar generation with Ko-fi integration.
- **Core Command**: New `/core` command with clean UI and Core Energy branding.
- **Core Tier Benefits**: Priority processing and increased rate limits for Core subscribers.
- **Poll System**: Create and manage native Discord polls with `/poll` command.
- **Poll Commands**: `/poll create`, `/poll list`, `/poll end`, `/poll delete` for full poll management.
- **Interactive Poll Creation**: Easy-to-use forms for creating polls with custom duration and vote types.

### Fixed

- **Command Timeouts**: Fixed "Unknown interaction" errors that occurred when commands took too long to respond.
- **Leaderboard and Level Commands**: Improved response times for `/leaderboard` and `/level` commands.
- **Role Parser**: Fixed role parsing to properly strip `@` symbol from role names (e.g., `@Gamer` → `Gamer`).
- **Button Interactions**: Fixed "This interaction failed" errors on various system buttons.

## [1.1.0] - 2025-10-05

### Added

- **Goodbye System**: Complete goodbye system with auto-goodbye messages when members leave.
- **Goodbye System Commands**: Added `/goodbye` command with comprehensive configuration options.
- **Goodbye Message Placeholders**: Support for `{user}`, `{user.name}`, `{user.tag}`, `{user.id}`, `{server}`, `{server.id}`, `{memberCount}`, `{memberCount.ordinal}`.
- **Goodbye Embed Support**: Rich embed format for goodbye messages with member information.
- **Channel Selection Dropdown**: Interactive channel selection for goodbye system configuration.
- **Welcome System Improvements**: Enhanced welcome system with better button layout and organization.
- **Role List Pagination**: Added page navigation for role lists (4 items per page).

### Changed

- **Welcome System**: Consolidated welcome commands into unified `/welcome` command.
- **Welcome Button Layout**: Reorganized button layout with Reset button moved to Configure page.
- **Goodbye Message Format**: Updated to modern format with bold user/server names and improved layout.

### Removed

- **Serverinfo Command**: Removed `/serverinfo` command and all related files to reduce bot complexity and remove dependency on presence data.

### Fixed

- **Welcome System**: Fixed welcome system to properly assign roles during testing.
- **Goodbye Message Consistency**: Fixed old goodbye message format across all components.
- **Back to Settings Button**: Fixed "Back to Settings" button to show actual settings interface.
- **Role Reactions Delete Command**: Fixed "Message Not Found" error when deleting role reactions.
- **Permission Parameter Issues**: Fixed incorrect permission parameter usage in temp-roles and welcome commands.
- **Role List Pagination**: Fixed pagination buttons to work correctly when navigating role lists.
- **Role Reactions**: Fixed issues where role list and delete commands could show outdated information.
- **Role Reactions Setup**: Fixed permission errors in role-reactions setup command.
- **Channel Permission Validation**: Added proper channel-specific permission checks for `SendMessages` and `EmbedLinks`.

## [1.0.2] - 2025-09-16

### Fixed

- **Bot Permissions**: Added missing bot permissions for full functionality.
- **Permission Detection**: Improved permission handling and validation system.

## [1.0.1] - 2025-09-16

### Fixed

- **Role Reactions Permission Error**: Fixed "Unknown Permission" error in role-reactions setup command when bot member data is unavailable.
- **Permission Error Messages**: Enhanced error messages with detailed permission explanations and step-by-step fix instructions.
- **Bot Permission Detection**: Improved permission detection when bot member data is unavailable.

## [1.0.0] - 2025-09-07

### Added

- **Schedule Role System**: Comprehensive role scheduling with one-time and recurring assignments.
- **Natural Language Scheduling**: Support for human-readable time formats like "tomorrow 9am" and "monday 6pm".
- **Smart 8ball System**: Intelligent question analysis with sentiment detection and context-aware responses.
- **Bulk Role Removal**: Enhanced temp-roles remove command with comprehensive multi-user support.
- **Interactive Sponsor Button**: Direct "Become a Sponsor" button linking to sponsor page.
- **Interactive Support Buttons**: Discord support server and GitHub repository buttons.
- **Enhanced Help System**: Comprehensive help documentation with autocomplete, interactive UI, and dynamic content generation.
- **XP Settings Management**: Interactive XP system configuration with real-time embed updates.
- **Role Reactions Consolidation**: Unified role-reaction management under single command with setup, list, update, and delete subcommands.

### Changed

- **Help Command**: Complete redesign with autocomplete support, interactive dropdowns, and comprehensive command documentation.
- **Role Reactions System**: Consolidated from multiple commands into single `/role-reactions` command with subcommands.
- **Temporary Role System**: Modernized embeds, improved user experience, and enhanced bulk operations.
- **XP Settings Interface**: Buttons now update embeds in place instead of sending separate confirmation messages.
- **8ball Command Design**: Redesigned with mystical theme and intelligent response system.
- **Sponsor Command**: Updated to focus on development support rather than premium features.
- **Support Command**: Enhanced with interactive buttons for better user engagement.
- **Interaction System**: Improved interaction handling for buttons and modals.

### Fixed

- **Help Command Emojis**: Fixed missing emojis showing as "undefined" in help output.
- **Button Emoji Visibility**: Fixed black emojis not visible in Discord dark theme.
- **Temporary Role Expiration Notifications**: Fixed DM notifications not being sent when roles expire.
- **8ball Response Selection**: Fixed bug in response selection logic.
- **Command Placeholder Content**: Replaced placeholder text with actual useful content in sponsor and support commands.
- **XP Settings Button Behavior**: Fixed buttons sending new messages instead of updating the original embed.
- **Temporary Role Bulk Removal**: Fixed "Invalid User List" error in multi-user removal operations.

## [0.4.1] - 2025-08-20

### Changed

- **XP System Configuration**: Simplified from complex command-based configuration to button-driven toggles.
- **XP System Default**: XP system is now disabled by default and requires admin activation.
- **Experience Manager**: Now checks guild settings before awarding XP.

## [0.4.0] - 2025-08-11

### Added

- **Enhanced Avatar Command**: Added direct download buttons for PNG, JPG, and WebP formats.
- **Experience (XP) System**: Complete XP system with leveling, leaderboards, and user profiles.
- **New General Commands**: Added `/8ball`, `/avatar`, `/leaderboard`, `/level`, `/serverinfo` for member engagement.
- **Interactive Leaderboard**: Added time filters (All Time, Daily, Weekly, Monthly) with interactive buttons.
- **Message XP**: Users earn 15-25 XP for messages with 60-second cooldown.
- **Command XP**: Users earn 3-15 XP for command usage with 30-second cooldown.
- **Role XP**: Users earn 50 XP for role assignments.
- **Server Rank Display**: Level command now shows actual server rank instead of "Coming soon...".
- **Welcome System**: Complete welcome system with auto-welcome messages and auto-role assignment.
- **Custom Welcome Messages**: Support for customizable welcome messages with placeholders.
- **Auto-Role Assignment**: Automatically assign roles to new members upon joining.
- **Welcome System Commands**: Added `/welcome setup` and `/welcome settings` for configuration.
- **Welcome Message Placeholders**: Support for `{user}`, `{user.name}`, `{user.tag}`, `{user.id}`, `{server}`, `{server.id}`, `{memberCount}`, `{memberCount.ordinal}`.
- **Welcome Embed Support**: Rich embed format for welcome messages with member information.
- **Welcome System Validation**: Comprehensive permission and configuration validation.

### Changed

- **Avatar Command UI**: Replaced interactive buttons with direct URL download buttons for better UX.
- **Avatar Command Colors**: Changed embed color from SUCCESS to PRIMARY theme.
- **Avatar Command Information**: Removed misleading image size claims and unnecessary download text.
- **Experience System**: Improved XP data reliability.
- **Leaderboard UI**: Enhanced with time filters and cleaner presentation.
- **Theme Consistency**: Fixed emoji display issues across all commands.

### Removed

- **Avatar Command Redundancy**: Removed unnecessary download options text and misleading image size information.

### Fixed

- **Avatar Download Formats**: Fixed Discord CDN format parameters for proper PNG/JPG/WebP downloads.
- **Experience System**: Fixed XP data not being saved or retrieved correctly.
- **Command XP Awarding**: Fixed XP not being awarded when using commands.
- **Theme Emojis**: Resolved "undefined" emoji display issues.
- **Leaderboard Display**: Fixed leaderboard display errors.

## [0.3.1] - 2025-08-03

### Added

- **Enhanced Role Parser**: Improved parsing for role mentions with spaces and flexible formatting.
- **Timeout Protection**: Added 10-second timeout for reaction adding process.
- **Automatic Reconnection**: Bot now automatically reconnects when internet connection is restored.
- **Connection Reliability**: Enhanced connection monitoring for improved stability.

### Changed

- **Simplified Setup-Roles Response**: Removed setup guide button for cleaner UI.
- **Reduced Minimum Duration**: Changed temporary role minimum from 5 minutes to 1 minute.
- **Improved Role Parser Logic**: Better handling of spaces around colons and role mentions.
- **Enhanced Error Response**: Role parser now returns empty array when errors exist.
- **Connection Reliability**: Improved connection timeout and reliability settings.

### Fixed

- **Role Parser Edge Cases**: Fixed parsing issues with spaces around colons.
- **Setup-Roles Interaction**: Added timeout protection to prevent hanging.
- **Temporary Role Duration**: Fixed minimum duration validation logic.

## [0.3.0] - 2025-08-03

### Added

- **Enhanced Help System**: Interactive help components with improved command categorization and metadata.
- **Ping Command**: Added `/ping` command for latency checking.
- **Automated Updates**: Automated update script with backup functionality.
- **Rate Limit Tracking**: Improved rate limit tracking and error reporting.

### Changed

- **Command Descriptions**: Enhanced command descriptions and usage examples.
- **Error Handling**: Improved error handling and user feedback.
- **Command Permissions**: Enhanced command permissions and safety measures.

### Fixed

- **Help Data**: Updated help data to include all available commands.
- **Command Categorization**: Fixed command categorization in help system.
- **Logging System**: Fixed missing logging functionality.

## [0.2.2] - 2025-07-23

### Changed

- **Health Check**: Added health check server configuration and improved error handling.
- **CI Pipeline**: Added CI workflow for automated testing and linting.

### Fixed

- **Release Workflow**: Fixed pnpm setup ordering in release workflow.
- **CI Configuration**: Fixed test environment variables and pnpm version compatibility.

## [0.2.1] - 2025-07-22

### Added

- **Dynamic External Links**: Dynamic external links in help command.
- **Component Handling**: Improved component handling for help system.

### Changed

- **Developer Commands**: Enhanced developer command descriptions and permissions.
- **Error Handling**: Improved error messages and validation.

### Fixed

- **Post-Refactor Bugs**: Resolved bugs introduced during utility modularization.

## [0.2.0] - 2025-07-20

### Added

- **Role Persistence**: Temporary roles now persist across bot restarts.
- **Role Management Validation**: Enhanced role management validation.
- **Automated Updates**: Automated bot update script.

### Changed

- **Developer Commands**: Updated developer command descriptions for clarity.
- **Command Visibility**: Improved command visibility and permission handling.
- **Error Messages**: Better error messages and validation.
- **Command Response Times**: Improved command response times with better error handling.

### Fixed

- **Discord Compatibility**: Fixed compatibility issues with Discord updates.
- **Temp-Roles List**: Fixed errors in `/list-temp-roles` command.
- **Date Parsing**: Fixed date parsing issues in temporary role display.
- **Temp-Roles Data**: Fixed data handling issues for temporary roles.
- **Data Reliability**: Added automatic data synchronization for improved reliability.

## [0.1.0] - 2025-07-10

### Added

- Initial Discord role reactor bot implementation.
- Self-assignable roles through reactions.
- Temporary role system with auto-expiration.
- Role management commands (`/setup-roles`, `/update-roles`, `/delete-roles`, `/list-roles`).
- Temporary role commands (`/assign-temp-role`, `/list-temp-roles`, `/remove-temp-role`).
- Health monitoring and performance metrics.
- Docker deployment support.
- Data persistence across bot restarts.
- Permission controls and validation.
- Custom emoji support (Unicode and server emojis).
- Role categories and organization.
- Comprehensive error handling and rate limiting.

[Unreleased]: https://github.com/rolereactor/bot/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/rolereactor/bot/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/rolereactor/bot/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/rolereactor/bot/compare/v1.6.3...v1.7.0
[1.6.3]: https://github.com/rolereactor/bot/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/rolereactor/bot/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/rolereactor/bot/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/rolereactor/bot/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/rolereactor/bot/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/rolereactor/bot/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/rolereactor/bot/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/rolereactor/bot/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/rolereactor/bot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/rolereactor/bot/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/rolereactor/bot/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/rolereactor/bot/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/rolereactor/bot/compare/v0.4.1...v1.0.0
[0.4.1]: https://github.com/rolereactor/bot/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/rolereactor/bot/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/rolereactor/bot/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/rolereactor/bot/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/rolereactor/bot/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/rolereactor/bot/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/rolereactor/bot/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rolereactor/bot/releases/tag/v0.1.0
