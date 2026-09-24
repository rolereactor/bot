import express from "express";
import { config } from "../../../config/config.js";
import { getLogger } from "../../../utils/logger.js";
import {
  exchangeCodeForToken,
  validateToken,
  getUserInfo,
} from "../../../features/streaming/utils/oauth.js";
import { upsertStreamBotAccount } from "../../../features/streaming/utils/streamBotAccount.js";

const logger = getLogger();
const router = express.Router();

/**
 * Twitch OAuth callback endpoint
 * Handles the redirect from Twitch after user authorization
 */
router.get("/callback/twitch", async (req, res) => {
  const {
    code: rawCode,
    state: rawState,
    error,
    error_description: errorDescription,
  } = req.query;
  const code = typeof rawCode === "string" ? rawCode : undefined;
  const state = typeof rawState === "string" ? rawState : undefined;

  // Handle OAuth errors
  if (error) {
    logger.error("Twitch OAuth error", { error, errorDescription });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage(String(errorDescription || error)));
  }

  if (!code) {
    logger.error("Twitch OAuth callback missing code");
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Missing authorization code."));
  }

  if (!state) {
    logger.error("Twitch OAuth callback missing state");
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Missing state parameter."));
  }

  // Validate state (CSRF protection)
  const { hasTwitchUserState, getTwitchUserState } = await import(
    "../../../utils/oauthStateStore.js"
  );
  if (!hasTwitchUserState(state)) {
    logger.error("Twitch OAuth invalid state", { state });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Invalid state. Please try connecting again."));
  }

  const stateData = getTwitchUserState(state);

  // Check state expiry (10 minutes)
  if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
    logger.error("Twitch OAuth state expired");
    return res
      .type("html")
      .status(400)
      .send(
        renderErrorPage(
          "The authorization session expired. Please try connecting again.",
        ),
      );
  }

  const { userId, guildId } = stateData;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(code);

    // Validate token and get user info
    const validation = await validateToken(tokens.accessToken);
    if (!validation) {
      throw new Error("Token validation failed");
    }

    const userInfo = await getUserInfo(tokens.accessToken);

    // Verify the user owns the channel they're trying to connect
    if (!userInfo || userInfo.id !== validation.user_id) {
      throw new Error("User validation failed");
    }

    // Get streaming manager and connect account
    const { getStorageManager } = await import(
      "../../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();

    // Import streaming manager dynamically to avoid circular dependency
    const { getStreamingManager } = await import(
      "../../../features/streaming/StreamingManager.js"
    );
    const streamingManager = getStreamingManager(storage.client);

    await streamingManager.connectAccount(
      guildId,
      userId,
      "twitch",
      tokens,
      userInfo,
      {
        alertsEnabled: true,
        alertTypes: {
          goLive: true,
          follow: true,
          subscribe: true,
          giftSub: true,
          raid: true,
          resub: true,
        },
      },
    );

    logger.info(
      `Twitch account connected for user ${userId} in guild ${guildId}: ${userInfo.login}`,
    );

    const targetDomain =
      process.env.WEBSITE_URL ||
      process.env.BOT_WEBSITE_URL ||
      "http://localhost:8080";

    return res.redirect(
      `${targetDomain}/dashboard/${guildId}/live-reactor?connected=twitch`,
    );
  } catch (err) {
    logger.error("Twitch OAuth callback failed", err);
    const targetDomain =
      process.env.WEBSITE_URL ||
      process.env.BOT_WEBSITE_URL ||
      "http://localhost:8080";
    return res.redirect(
      `${targetDomain}/dashboard/${guildId}/live-reactor?error=${encodeURIComponent(err.message || "Twitch authorization failed")}`,
    );
  }
});

/**
 * Twitch EventSub webhook callback (for future webhook support)
 * Currently we use WebSocket transport, but keeping this for future
 */
router.post("/webhook/twitch", async (req, res) => {
  // EventSub webhook verification would go here
  // For now, we use WebSocket transport
  res.status(200).send("OK");
});

/**
 * OAuth callback for the dedicated RoleReactor bot Twitch account.
 * Stores the bot's token + user ID so chat can be sent as the bot
 * (so its Verified Bot badge appears in chat).
 */
router.get("/callback/bot", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    logger.error("Twitch bot OAuth error", { error, errorDescription });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage(String(errorDescription || error)));
  }

  if (
    !code ||
    !state ||
    typeof code !== "string" ||
    typeof state !== "string"
  ) {
    logger.error("Twitch bot OAuth callback missing code/state");
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Missing code or state."));
  }

  const { hasTwitchBotState, getTwitchBotState } = await import(
    "../../../utils/oauthStateStore.js"
  );
  if (!hasTwitchBotState(state)) {
    logger.error("Twitch bot OAuth invalid state", { state });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Invalid state. Please try again."));
  }

  getTwitchBotState(state);

  try {
    const botRedirectUri = config.twitch.redirectUri.replace(
      "/callback/twitch",
      "/callback/bot",
    );
    const tokens = await exchangeCodeForToken(code, botRedirectUri);
    const validation = await validateToken(tokens.accessToken);
    if (!validation) {
      throw new Error("Token validation failed");
    }

    const userInfo = await getUserInfo(tokens.accessToken);

    await upsertStreamBotAccount({
      _id: "global",
      botUserId: userInfo.id,
      login: userInfo.login,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });

    logger.info(
      `Twitch bot account connected: ${userInfo.login} (${userInfo.id})`,
    );

    // Re-subscribe chat as the bot on all active connections so the change
    // takes effect immediately (no manual /stream reconnect needed).
    try {
      const { getStorageManager } = await import(
        "../../../utils/storage/storageManager.js"
      );
      const storage = await getStorageManager();
      const { getStreamingManager } = await import(
        "../../../features/streaming/StreamingManager.js"
      );
      const streamingManager = getStreamingManager(storage.client);
      if (streamingManager?.reconnectAllTwitch) {
        streamingManager
          .reconnectAllTwitch()
          .catch(e => logger.error("Failed to reconnect after bot-connect", e));
      }
    } catch (reconnectErr) {
      logger.error(
        "Failed to trigger reconnect after bot-connect",
        reconnectErr,
      );
    }

    return res.type("html").send(renderSuccessPage(userInfo.login));
  } catch (err) {
    logger.error("Twitch bot OAuth callback failed", err);
    return res
      .type("html")
      .status(500)
      .send(renderErrorPage(err.message || "Unknown error"));
  }
});

/**
 * YouTube OAuth callback endpoint
 * Handles the redirect from Google after user authorization
 */
router.get("/callback/youtube", async (req, res) => {
  const {
    code: rawCode,
    state: rawState,
    error,
    error_description: errorDescription,
  } = req.query;
  const code = typeof rawCode === "string" ? rawCode : undefined;
  const state = typeof rawState === "string" ? rawState : undefined;

  // Handle OAuth errors
  if (error) {
    logger.error("YouTube OAuth error", { error, errorDescription });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage(String(errorDescription || error)));
  }

  if (!code) {
    logger.error("YouTube OAuth callback missing code");
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Missing authorization code."));
  }

  if (!state) {
    logger.error("YouTube OAuth callback missing state");
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Missing state parameter."));
  }

  // Validate state (CSRF protection)
  const { hasYouTubeUserState, getYouTubeUserState } = await import(
    "../../../utils/oauthStateStore.js"
  );
  if (!hasYouTubeUserState(state)) {
    logger.error("YouTube OAuth invalid state", { state });
    return res
      .type("html")
      .status(400)
      .send(renderErrorPage("Invalid state. Please try connecting again."));
  }

  const stateData = getYouTubeUserState(state);

  // Check state expiry (10 minutes)
  if (Date.now() - stateData.createdAt > 10 * 60 * 1000) {
    logger.error("YouTube OAuth state expired");
    return res
      .type("html")
      .status(400)
      .send(
        renderErrorPage(
          "The authorization session expired. Please try connecting again.",
        ),
      );
  }

  const { userId, guildId } = stateData;

  try {
    // Exchange code for tokens
    const { exchangeYouTubeCodeForToken } = await import(
      "../../../features/streaming/utils/youtubeOauth.js"
    );
    const tokens = await exchangeYouTubeCodeForToken(code);

    // Validate token and get user info
    const { validateYouTubeToken, getYouTubeChannelInfo } = await import(
      "../../../features/streaming/utils/youtubeOauth.js"
    );
    const validation = await validateYouTubeToken(tokens.accessToken);
    if (!validation) {
      throw new Error("Token validation failed");
    }

    // Get channel info
    const channelInfo = await getYouTubeChannelInfo(tokens.accessToken);

    // Get streaming manager and connect account
    const { getStorageManager } = await import(
      "../../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();
    const { getStreamingManager } = await import(
      "../../../features/streaming/StreamingManager.js"
    );
    const streamingManager = getStreamingManager(storage.client);

    // Calculate expiry time
    const expiresAt = Date.now() + tokens.expiresIn * 1000;

    await streamingManager.connectAccount(
      guildId,
      userId,
      "youtube",
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      },
      {
        id: validation.id,
        login: validation.name,
        displayName: channelInfo?.title || validation.name,
      },
    );

    // Return to dashboard
    const targetDomain =
      process.env.WEBSITE_URL ||
      process.env.BOT_WEBSITE_URL ||
      "http://localhost:8080";

    return res.redirect(
      `${targetDomain}/dashboard/${guildId}/live-reactor?connected=youtube`,
    );
  } catch (err) {
    logger.error("YouTube OAuth callback failed", err);
    const targetDomain =
      process.env.WEBSITE_URL ||
      process.env.BOT_WEBSITE_URL ||
      "http://localhost:8080";
    return res.redirect(
      `${targetDomain}/dashboard/${guildId}/live-reactor?error=${encodeURIComponent(err.message || "YouTube authorization failed")}`,
    );
  }
});

export default router;

/**
 * Render a minimal self-contained success page (no external site dependency).
 * @param {string} username - Connected Twitch username
 * @returns {string} HTML
 */
function renderSuccessPage(username) {
  const safeName = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Twitch Connected</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0e0e10; color: #efeff1;
           display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #18181b; padding: 32px 40px; border-radius: 12px; text-align: center; max-width: 420px; }
    h1 { color: #9146ff; margin: 0 0 12px; }
    p { line-height: 1.5; margin: 8px 0; }
    a { color: #9146ff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Twitch Connected!</h1>
    <p>Your Twitch account <strong>${safeName}</strong> is now linked to the bot.</p>
    <p>A confirmation has been sent to your Discord DMs.</p>
    <p>You can close this tab and return to <a href="https://discord.com">Discord</a>.</p>
  </div>
</body>
</html>`;
}

/**
 * Render a minimal self-contained error page (no external site dependency).
 * @param {string} message - Error message to display
 * @returns {string} HTML
 */
function renderErrorPage(message) {
  const safeMsg = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connection Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0e0e10; color: #efeff1;
           display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #18181b; padding: 32px 40px; border-radius: 12px; text-align: center; max-width: 420px; }
    h1 { color: #ff4d4d; margin: 0 0 12px; }
    p { line-height: 1.5; margin: 8px 0; }
    a { color: #9146ff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚠️ Connection Failed</h1>
    <p>${safeMsg}</p>
    <p>Please try again from Discord with <code>/stream connect</code>.</p>
    <p>You can close this tab and return to <a href="https://discord.com">Discord</a>.</p>
  </div>
</body>
</html>`;
}

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
