# Voting System Setup

Guide for integrating top.gg voting rewards. Users earn **Sparks** ⚡ per vote — starting at 5 and scaling with vote streak up to 8 (12-hour cooldown).

## 🚀 Quick Start

### 1. Get Your top.gg Token

1. Go to your bot's page on [top.gg](https://top.gg/bot/1392714201558159431)
2. Click **"Manage Bot"** → **"Webhook"** section
3. Copy the **Authorization Token**

### 2. Add Token to Environment

```env
TOPGG_WEBHOOK_AUTH=your_topgg_authorization_token_here
```

### 3. Configure Webhook URL on top.gg

Set the webhook URL in your top.gg bot dashboard:

```
https://your-domain.com/webhook/topgg
```

For local testing with ngrok:

```bash
ngrok http 3030
# Use: https://your-ngrok-url.ngrok.io/webhook/topgg
```

### 4. Deploy and Restart

```bash
pnpm run deploy:dev
pnpm start
```

## 🧪 Testing

### Test the Command

Run `/vote` in Discord. You should see:

- Vote link to top.gg
- Reward information (5–8 Sparks per vote, based on streak)
- Cooldown info (12 hours)

### Test the Webhook

top.gg signs each request with an HMAC of the raw body using your webhook token (`x-topgg-signature` header). For a quick local check you can temporarily verify with a computed signature, or hit the endpoint from the top.gg dashboard after setting the URL.

```json
{
  "user": "YOUR_DISCORD_USER_ID",
  "username": "TestUser",
  "discriminator": "0001",
  "type": "vote"
}
```

**Expected response (success):**

```json
{ "success": true }
```

On invalid signature or missing user you'll get a non-200 error with `{ "success": false, "message": "..." }`. The HTTP response does **not** include the Spark amount — check bot logs (`✅ top.gg: Rewarded...`) or the user's `/balance` instead.

**Verify:** You should receive a DM from the bot, your Sparks balance should increase, and bot logs should show `✅ top.gg: Rewarded [user-id] with N Sparks`.

## 🎯 How It Works

```
User votes on top.gg
  → top.gg sends POST to /webhook/topgg
  → Bot verifies token
  → Bot checks 12h cooldown
  → Bot awards 5–8 Sparks based on vote streak
  → Bot sends thank you DM
  → Bot logs the vote
```

### Reward Scaling

| Vote streak | Sparks |
|-------------|--------|
| 1–2 | 5 |
| 3–6 | 6 |
| 7–13 | 7 |
| 14+ | 8 (cap) |

Streak is maintained with a 36-hour grace window between votes.

## 🔧 Troubleshooting

### Webhook Not Receiving Votes

1. Verify `TOPGG_WEBHOOK_AUTH` is set in `.env`
2. Confirm webhook URL is correct in top.gg dashboard
3. Ensure your server is publicly accessible
4. Check bot logs for errors

### Users Not Receiving Sparks

1. Check database connection is working
2. Look for `✅ top.gg: Rewarded...` in logs
3. Verify user ID in webhook payload

```javascript
// Manual check in MongoDB
db.storage.findOne({ key: "core_credit_USER_ID" });
```

### Users Not Receiving DM

This is normal if the user has DMs disabled or blocked the bot. Sparks are still awarded even if the DM fails.

## 📊 Monitoring

### Vote Statistics

```javascript
db.storage.aggregate([
  { $match: { key: /^core_credit_/ } },
  {
    $project: {
      userId: 1,
      totalVotes: 1,
      lastVote: 1,
      voteStreak: 1,
      sparks: 1,
    },
  },
  { $match: { lastVote: { $exists: true } } },
  { $sort: { lastVote: -1 } },
  { $limit: 10 },
]);
```

## 🔐 Security

- Token is verified on every webhook request
- Rate limiting prevents spam
- 12-hour cooldown enforced server-side
- Only valid Discord user IDs accepted

## 📝 Environment Variables

```env
# Required
TOPGG_WEBHOOK_AUTH=your_topgg_authorization_token
```

## ✅ Setup Checklist

- [ ] Added `TOPGG_WEBHOOK_AUTH` to `.env`
- [ ] Configured webhook URL on top.gg
- [ ] Deployed bot with `/vote` command
- [ ] Tested webhook manually
- [ ] Verified Spark rewards working
- [ ] Checked logs for errors
