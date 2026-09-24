# Docker Deployment Guide

## Architecture

Production runs on a VPS with two containers behind Caddy, which handles SSL and domain routing automatically:

```
Internet → Caddy (SSL + api.rolereactor.xyz) → role-reactor-bot:3030
```

The bot container is not exposed directly to the host — Caddy proxies to it via an internal Docker network.

---

## Development

For local development, use nodemon directly:

```bash
pnpm run dev
```

This provides hot reload without Docker overhead. For Docker-based development, run `docker compose -f docker-compose.dev.yml up -d` manually.

---

## Production (VPS)

### Prerequisites

1. **DNS** — Add an A record pointing your domain to the VPS IP:
   ```
   api.rolereactor.xyz  →  <your VPS IP>
   ```

2. **Firewall** — Open ports 80 and 443:
   ```bash
   ufw allow 80 && ufw allow 443
   ```

3. **Environment** — Create a `.env` file on the VPS:
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   MONGODB_URI=your_mongodb_connection_string
   NODE_ENV=production
   CORS_ALLOWED_ORIGINS=https://api.rolereactor.xyz
   ```

4. **Caddyfile** — Update the domain in `Caddyfile` at the project root if different from `api.rolereactor.xyz`.

### Deploy

```bash
# First deploy
pnpm run docker:prod

# Update to latest version
pnpm run docker:deploy
```

Caddy fetches and renews the SSL certificate automatically on first startup. No certbot or cron jobs needed.

### Logs

```bash
pnpm run docker:logs
```

---

## Health Monitoring

```bash
# Container status
docker ps | grep role-reactor-bot

# Health endpoint (from VPS — not exposed externally)
curl http://localhost:3030/health
```

Via your domain after Caddy is running:

```bash
curl https://api.rolereactor.xyz/health
```

---

## Troubleshooting

### Permission errors on mounted volumes

```bash
sudo chown -R 1001:1001 ./data ./logs
```

### Container not starting

```bash
# Check logs for the error
docker logs role-reactor-bot

# Verify required env vars are set
docker exec role-reactor-bot printenv | grep DISCORD
```

### SSL certificate not issuing

- Confirm DNS is propagated: `dig api.rolereactor.xyz`
- Confirm ports 80 and 443 are open: `ufw status`
- Check Caddy logs: `docker logs role-reactor-caddy`

### Build cache issues

```bash
pnpm run docker:deploy
```

### Restart

```bash
docker restart role-reactor-bot
```

---

## Volume Reference

| Path (host) | Path (container) | Purpose |
|---|---|---|
| `./data` | `/usr/src/app/data` | Persistent bot data |
| `./logs` | `/usr/src/app/logs` | Application logs |
| `caddy_data` (volume) | `/data` | Caddy SSL certificates |
| `caddy_config` (volume) | `/config` | Caddy config cache |
