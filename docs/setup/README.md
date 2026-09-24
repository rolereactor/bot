# Setup Guide

## 🚀 Quick Start

### 1. Environment Setup

Copy the environment template and fill in your values:

```bash
# Basic setup (single .env file)
cp .env.example .env
```

### 2. Edit Environment Files

#### Basic Setup (`.env`)

```bash
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=role-reactor-bot
```

Environment variables are loaded from a single `.env` file (there is no separate `.env.production` — secrets are never baked into images). For development, include `DISCORD_GUILD_ID` for faster guild-specific command deployment. For production, omit `DISCORD_GUILD_ID` to deploy commands globally.

### 3. Start the Bot

#### Development Mode

```bash
pnpm dev
```

#### Production Mode

```bash
pnpm start
```

### 4. Deploy Commands

#### Development (Guild-specific)

```bash
pnpm run deploy:dev
```

#### Production (Global)

```bash
pnpm run deploy:prod
```

## 🔐 Security Notes

- **Never commit** `.env.*` files to version control
- **Use different tokens** for development and production
- **Keep templates** in version control for easy setup
- **Rotate tokens** regularly for security

## 🐳 Docker Setup

### Development

```bash
pnpm run dev
```

### Production

```bash
pnpm run docker:prod
```

## 📚 Additional Resources

- [Discord Developer Portal](https://discord.com/developers/applications)
- [MongoDB Setup](https://docs.mongodb.com/manual/installation/)
- [Environment Variables Best Practices](https://12factor.net/config)
