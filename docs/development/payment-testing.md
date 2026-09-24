# Payment Flow Testing Guide

This guide walks you through testing the complete payment flow from login to receiving Cores.

## Prerequisites

1. **Bot running:** `pnpm run dev`
2. **ngrok installed:** For local webhook testing (development only)
3. **Plisio account:** With API key configured
4. **`.env` configured** with all required variables

---

## Step 1: Start Your Services

### Terminal 1 - Start the Bot

```bash
pnpm run dev
```

### Terminal 2 - Start ngrok (local development only)

```bash
ngrok http 3030
```

Copy the **https URL** (e.g., `https://abc123.ngrok.io`)

### Update Environment

Add to `.env`:

```env
PUBLIC_URL=https://abc123.ngrok.io
```

Restart the bot after updating.

> **Production:** Set `PUBLIC_URL` to your Caddy domain (e.g., `https://api.rolereactor.xyz`). No ngrok needed.

---

## Step 2: Test Discord OAuth Login

### Option A: Browser Test

1. Open: `http://localhost:3030/auth/discord`
2. Authorize with Discord
3. Should redirect back to `/` or your specified redirect

### Option B: API Test

```bash
# Check if logged in
curl -c cookies.txt -b cookies.txt http://localhost:3030/auth/me

# Expected: 401 if not logged in
# After login: 200 with user data
```

### Verify Session

After logging in via browser, check:

```bash
curl -b cookies.txt http://localhost:3030/auth/me
```

Expected response:

```json
{
  "success": true,
  "status": "success",
  "user": {
    "id": "YOUR_DISCORD_USER_ID",
    "username": "your_username",
    "email": "your@email.com",
    "credits": 0,
    "role": "user"
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

## Step 3: Test Pricing Endpoint

```bash
# Public - no auth needed
curl http://localhost:3030/api/v1/pricing

# With user ID for personalized data
curl "http://localhost:3030/api/v1/pricing?user_id=YOUR_DISCORD_USER_ID"
```

---

## Step 4: Test Payment Creation

`POST /api/v1/payments/create` requires the internal service key (`Authorization: Bearer <INTERNAL_API_KEY>`) plus a session cookie **or** `discordId` in the body.

```bash
# First login via browser, then:
curl -X POST http://localhost:3030/api/v1/payments/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_KEY" \
  -b cookies.txt \
  -d '{"packageId": "$10", "amount": 10}'
```

Expected response (flat fields, not nested under `data`):

```json
{
  "success": true,
  "status": "success",
  "invoiceUrl": "https://plisio.net/invoice/...",
  "orderId": "YOUR_DISCORD_USER_ID_1705234567890",
  "amount": 10,
  "currency": "USD",
  "packageId": "$10",
  "message": "Payment invoice created successfully. Redirect user to invoiceUrl.",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

## Step 5: Test Webhook (Simulated Payment)

### Method A: Plisio Test Mode

Plisio has a sandbox/test mode. Use test payments there.

### Method B: Manual Webhook Simulation

```javascript
// test-webhook.js
import crypto from "crypto";

const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY || "your-secret-key";

const testData = {
  status: "completed",
  order_number: "YOUR_DISCORD_USER_ID_" + Date.now(),
  amount: "0.00010551",
  currency: "BTC",
  source_amount: "10.00",
  source_currency: "USD",
  email: "test@example.com",
  txn_id: "test_txn_" + Date.now(),
};

const orderedKeys = Object.keys(testData).sort();
const orderedData = {};
for (const key of orderedKeys) {
  orderedData[key] = testData[key].toString();
}
const dataString = JSON.stringify(orderedData);
const verifyHash = crypto
  .createHmac("sha1", PLISIO_SECRET_KEY)
  .update(dataString)
  .digest("hex");

testData.verify_hash = verifyHash;

console.log("\nCurl command:");
console.log(`curl -X POST http://localhost:3030/webhook/crypto \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(testData)}'`);
```

Run it:

```bash
PLISIO_SECRET_KEY=your_key node test-webhook.js
```

Expected response:

```json
{ "received": true, "processed": true, "type": "Plisio Payment Confirmed" }
```

---

## Step 6: Verify User Received Cores

### Via API

```bash
curl http://localhost:3030/api/v1/user/YOUR_DISCORD_USER_ID/balance
```

### Via Discord Bot

Use the `/balance` command in Discord.

### Via Database

```bash
mongosh
use role-reactor-bot
db.storage.find({ key: "core_credit" })
```

---

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Webhook not received | Check ngrok URL matches `PUBLIC_URL` in `.env` |
| Invalid signature | Ensure `PLISIO_SECRET_KEY` has no extra whitespace |
| Cores not added | Check bot logs; verify user ID is 17-20 digits |
| Session not working | Ensure `SESSION_SECRET` is set in `.env` |
| CORS errors | Add your domain to `CORS_ALLOWED_ORIGINS` in `.env` |

---

## Production Checklist

Before going live:

- [ ] Set `PUBLIC_URL` to your Caddy domain (e.g., `https://api.rolereactor.xyz`)
- [ ] Configure Plisio webhook URL to `https://api.rolereactor.xyz/webhook/crypto`
- [ ] Set `NODE_ENV=production`
- [ ] Set a secure `SESSION_SECRET`
- [ ] Set `CORS_ALLOWED_ORIGINS` to your frontend domain
- [ ] Test with a small package (e.g. $5)
- [ ] Monitor logs for first few transactions

---

## Quick Reference

| What | Command/URL |
|---|---|
| Start bot | `pnpm run dev` |
| Start ngrok (dev) | `ngrok http 3030` |
| Login | `http://localhost:3030/auth/discord` |
| Check user | `curl http://localhost:3030/auth/me -b cookies.txt` |
| Get pricing | `curl http://localhost:3030/api/v1/pricing` |
| Check balance | `curl http://localhost:3030/api/v1/user/USER_ID/balance` |
| Bot logs | `pnpm run docker:logs` |
