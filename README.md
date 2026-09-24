# Role Reactor Bot

<div align="center">
  <img src="./assets/banner.png" alt="Role Reactor Bot - React for Roles!" width="100%">
</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/) [![Discord.js](https://img.shields.io/badge/Discord.js-14.22.1-blue.svg)](https://discord.js.org/) [![License](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE) [![Documentation](https://img.shields.io/badge/Documentation-rolereactor.xyz-blue.svg)](https://rolereactor.xyz/docs)

</div>

---

A powerful Discord bot for server management with role assignment, AI features, moderation tools, and community engagement. Built with Discord.js v14, featuring enterprise-grade logging, health monitoring, and scalable MongoDB integration.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [Contributing](#-contributing)

## 🚀 Quick Start

### Prerequisites

- Node.js 22 or higher
- pnpm 9.9.0 or higher
- MongoDB (local or Atlas)
- Discord Bot Token

### Installation

```bash
git clone https://github.com/rolereactor/bot.git
cd bot
pnpm install
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
MONGODB_URI=mongodb://localhost:27017
```

Deploy slash commands and start:

```bash
pnpm run deploy:prod  # Production (excludes dev commands)
pnpm start
```

### Docker

```bash
pnpm run docker:build   # Build image
pnpm run docker:prod    # Start with Docker Compose
pnpm run docker:logs    # View logs
```

## 🔧 Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DISCORD_TOKEN` | Discord bot token | Yes | - |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes | - |
| `DISCORD_GUILD_ID` | Target guild ID (for dev) | No | - |
| `DISCORD_DEVELOPERS` | Developer user IDs (comma-separated) | No | - |
| `MONGODB_URI` | MongoDB connection URI | No | `mongodb://localhost:27017` |
| `MONGODB_DB` | MongoDB database name | No | `role-reactor-bot` |
| `LOG_LEVEL` | Log level (ERROR, WARN, INFO, DEBUG) | No | `INFO` |

## 🚀 Deployment

Production runs on a VPS with Caddy handling SSL:

```
Internet → Caddy (SSL + api.rolereactor.xyz) → Docker container:3030
```

```bash
pnpm run docker:deploy    # Pull, build, and start
pnpm run docker:logs      # View logs
```

See the [Deployment Guide](./docs/setup/deployment.md) for full setup.

## 📖 Documentation

- [Command Reference](https://rolereactor.xyz/docs)
- [Deployment Guide](./docs/setup/deployment.md)
- [Contributing Guidelines](./docs/CONTRIBUTING.md)

## 🤝 Contributing

See [Contributing Guidelines](./docs/CONTRIBUTING.md).

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
```

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0-or-later) — see the [LICENSE](LICENSE) file for details.

In short: you are free to use, study, modify, and self-host this bot, but if you offer it (modified or not) as a network service, you must release your modified source code under the same license. For commercial licensing inquiries, contact us.
