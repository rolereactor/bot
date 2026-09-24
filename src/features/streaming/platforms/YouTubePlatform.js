import { getLogger } from "../../../utils/logger.js";
import Platform from "./Platform.js";
import {
  refreshYouTubeToken,
  getYouTubeChannelInfo,
  getYouTubeActiveBroadcast,
  getYouTubeChatMessages,
  sendYouTubeChatMessage,
} from "../utils/youtubeOauth.js";

const logger = getLogger();

/**
 * YouTubePlatform handles YouTube Live interactions for a single connected
 * streamer account:
 * - YouTube Data API v3 for channel info, live stream status
 * - YouTube Live Chat API for chat messages (polling-based)
 * - Pub/Sub for live events (follows, subscriptions)
 *
 * Required OAuth scopes:
 * - youtube.readonly
 * - youtube.force-ssl
 * - youtube.channel.moderate (for timeout/ban)
 *
 * Note: YouTube chat uses polling (not WebSocket), so message delivery
 * may have slight delays compared to Twitch.
 */
class YouTubePlatform extends Platform {
  constructor(connection) {
    super(connection);
    this._pollingInterval = null;
    this._chatToken = null;
    this._liveChatId = null;
    this._nextPageToken = null;
    this._pollingIntervalMs = 5000; // Default, updated from API response
    this._channelInfo = null;
  }

  /**
   * Platform identifier
   * @returns {string}
   */
  get platformId() {
    return "youtube";
  }

  /**
   * Initialize the YouTube platform.
   * Validates tokens, fetches channel info, and starts event subscription.
   */
  async init() {
    const { accessToken, refreshToken, expiresAt } =
      this.connection.tokens || {};

    if (!accessToken) {
      throw new Error("YouTube access token is required");
    }

    // Check if token needs refresh
    if (expiresAt && Date.now() >= expiresAt) {
      if (!refreshToken) {
        throw new Error(
          "YouTube access token expired and no refresh token available",
        );
      }
      await this.refreshTokensIfNeeded();
    }

    // Validate token and get user info
    const userInfo = await this._validateToken();
    if (!userInfo) {
      throw new Error("YouTube token validation failed");
    }

    // Fetch channel info
    this._channelInfo = await getYouTubeChannelInfo(
      this.connection.tokens.accessToken,
    );
    if (!this._channelInfo) {
      throw new Error("Failed to fetch YouTube channel info");
    }

    this.isConnected = true;
    logger.info("YouTubePlatform initialized", {
      channelId: this._channelInfo.id,
      channelTitle: this._channelInfo.title,
    });
  }

  /**
   * Tear down all connections.
   */
  async disconnect() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
    this._liveChatId = null;
    this._nextPageToken = null;
    this.isConnected = false;
    logger.info("YouTubePlatform disconnected");
  }

  /**
   * Send a chat message to YouTube Live.
   * @param {string} message - Message text
   * @param {Object} [options] - Options (unused for YouTube)
   * @returns {Promise<boolean>}
   */
  async sendMessage(message, _options = {}) {
    if (!this._liveChatId) {
      logger.warn("Cannot send YouTube chat message: no active live chat");
      return false;
    }

    try {
      await this.refreshTokensIfNeeded();
      const result = await sendYouTubeChatMessage(
        this.connection.tokens.accessToken,
        this._liveChatId,
        message,
      );
      return result !== null;
    } catch (error) {
      logger.error("Failed to send YouTube chat message", error);
      return false;
    }
  }

  /**
   * Subscribe to YouTube events.
   * Starts chat polling for live messages.
   */
  async subscribeToEvents() {
    await this.startChatPolling();
  }

  /**
   * Get YouTube channel info.
   * @returns {Promise<Object|null>}
   */
  async getChannelInfo() {
    if (!this._channelInfo) {
      try {
        await this.refreshTokensIfNeeded();
        this._channelInfo = await getYouTubeChannelInfo(
          this.connection.tokens.accessToken,
        );
      } catch (error) {
        logger.error("Failed to fetch YouTube channel info", error);
        return null;
      }
    }
    return this._channelInfo;
  }

  /**
   * Check if the stream is live.
   * @returns {Promise<boolean>}
   */
  async isLive() {
    try {
      await this.refreshTokensIfNeeded();
      const broadcast = await getYouTubeActiveBroadcast(
        this.connection.tokens.accessToken,
      );
      return broadcast !== null && broadcast.status === "live";
    } catch (error) {
      logger.error("Failed to check YouTube live status", error);
      return false;
    }
  }

  /**
   * Timeout a user from YouTube Live Chat.
   * Note: YouTube doesn't have a native timeout API, so we ban temporarily
   * by removing the message and noting the user.
   * @param {string} userId - YouTube channel ID
   * @param {number} duration - Duration in seconds (unused for YouTube)
   * @param {string} [reason] - Optional reason
   * @returns {Promise<boolean>}
   */
  async timeoutUser(userId, _duration, reason = "") {
    // YouTube doesn't have a native timeout API
    // We can only ban/unban users
    logger.info("YouTube timeout requested, using ban instead", {
      userId,
      reason,
    });
    return this.banUser(userId, reason);
  }

  /**
   * Ban a user from YouTube Live Chat.
   * @param {string} userId - YouTube channel ID
   * @param {string} [reason] - Optional reason
   * @returns {Promise<boolean>}
   */
  async banUser(userId, _reason = "") {
    // YouTube Live Chat moderation requires the channel owner or moderator
    // to use the liveChat.messages API with a ban action
    // This is complex and may require additional permissions
    logger.warn(
      "YouTubePlatform.banUser() requires channel moderator permissions",
      {
        userId,
      },
    );
    return false;
  }

  /**
   * Get list of users currently in chat.
   * Note: YouTube doesn't provide a direct chatters list API.
   * We track unique users from chat messages.
   * @returns {Promise<Array>}
   */
  async getChannelChatters() {
    // YouTube doesn't have a direct API for listing chat participants
    // We'd need to track this from chat messages
    return [];
  }

  /**
   * Refresh YouTube OAuth tokens if needed.
   */
  async refreshTokensIfNeeded() {
    const { expiresAt, refreshToken } = this.connection.tokens || {};

    // No expiry set or token still valid
    if (!expiresAt || Date.now() < expiresAt - 60000) {
      return;
    }

    if (!refreshToken) {
      logger.warn("No YouTube refresh token available");
      return;
    }

    try {
      const newTokens = await refreshYouTubeToken(refreshToken);
      this.connection.tokens = {
        ...this.connection.tokens,
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: Date.now() + newTokens.expiresIn * 1000,
      };
      logger.info("YouTube tokens refreshed");
    } catch (error) {
      logger.error("Failed to refresh YouTube tokens", error);
      throw error;
    }
  }

  /**
   * Poll YouTube Live Chat for new messages.
   * YouTube uses polling (not WebSocket), so we check periodically.
   */
  async startChatPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }

    // Get active broadcast to find liveChatId
    try {
      await this.refreshTokensIfNeeded();
      const broadcast = await getYouTubeActiveBroadcast(
        this.connection.tokens.accessToken,
      );

      if (!broadcast || !broadcast.liveChatId) {
        logger.warn("No active YouTube broadcast with live chat");
        return;
      }

      this._liveChatId = broadcast.liveChatId;
      this._nextPageToken = null;

      logger.info("Starting YouTube chat polling", {
        liveChatId: this._liveChatId,
      });

      // Start polling
      await this._pollChatMessages();
    } catch (error) {
      logger.error("Failed to start YouTube chat polling", error);
    }
  }

  /**
   * Poll for new chat messages.
   * @private
   */
  async _pollChatMessages() {
    if (!this._liveChatId || !this.isConnected) return;

    try {
      await this.refreshTokensIfNeeded();

      const result = await getYouTubeChatMessages(
        this.connection.tokens.accessToken,
        this._liveChatId,
        this._nextPageToken,
      );

      if (!result) {
        // API error, retry after default interval
        this._scheduleNextPoll();
        return;
      }

      // Check if stream went offline
      if (result.offlineAt) {
        logger.info("YouTube stream went offline");
        this.emit("stream.offline", {
          platform: this.platformId,
          offlineAt: result.offlineAt,
        });
        return;
      }

      // Process messages
      for (const msg of result.messages) {
        this._processChatMessage(msg);
      }

      // Update pagination token
      this._nextPageToken = result.nextPageToken;

      // Update polling interval from API response
      if (result.pollingIntervalMillis) {
        this._pollingIntervalMs = result.pollingIntervalMillis;
      }

      // Schedule next poll
      this._scheduleNextPoll();
    } catch (error) {
      logger.error("YouTube chat polling error", error);
      this._scheduleNextPoll();
    }
  }

  /**
   * Schedule the next poll.
   * @private
   */
  _scheduleNextPoll() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }

    this._pollingInterval = setInterval(() => {
      this._pollChatMessages();
    }, this._pollingIntervalMs);
  }

  /**
   * Process a YouTube chat message and emit normalized event.
   * @param {Object} rawMessage - Raw YouTube chat message
   * @private
   */
  _processChatMessage(rawMessage) {
    const { snippet, authorDetails } = rawMessage;

    if (!snippet || !authorDetails) return;

    // Handle different message types
    switch (snippet.type) {
      case "textMessageEvent":
        this._handleTextMessage(rawMessage, authorDetails);
        break;
      case "superChatEvent":
        this._handleSuperChat(snippet, authorDetails);
        break;
      case "superStickerEvent":
        this._handleSuperSticker(snippet, authorDetails);
        break;
      case "newSponsorEvent":
        this._handleNewSponsor(snippet, authorDetails);
        break;
      case "membershipGiftingEvent":
        this._handleMembershipGift(snippet, authorDetails);
        break;
      case "userBannedEvent":
        this._handleUserBanned(snippet, authorDetails);
        break;
      default:
        // Ignore other message types
        break;
    }
  }

  /**
   * Handle a text chat message.
   * @private
   */
  _handleTextMessage(rawMessage, authorDetails) {
    const { snippet } = rawMessage;
    const normalized = this.normalizeChatMessage({
      messageId: rawMessage.id,
      userId: authorDetails.channelId,
      userLogin: authorDetails.displayName,
      userName: authorDetails.displayName,
      text: snippet.textMessageDetails?.messageText || "",
      badges: this._extractBadges(authorDetails),
      isBroadcaster: authorDetails.isChatOwner || false,
      isMod: authorDetails.isChatModerator || false,
      isVip: false, // YouTube doesn't have VIP
      isSubscriber: authorDetails.isChatSponsor || false,
    });

    this.emit("chat", normalized);
  }

  /**
   * Handle a Super Chat event.
   * @private
   */
  _handleSuperChat(snippet, authorDetails) {
    const amount = snippet.superChatDetails?.amountDisplayString || "";
    this.emit("event", {
      type: "superchat",
      platform: this.platformId,
      userId: authorDetails.channelId,
      username: authorDetails.displayName,
      amount,
      message: snippet.displayMessage || "",
    });
  }

  /**
   * Handle a Super Sticker event.
   * @private
   */
  _handleSuperSticker(snippet, authorDetails) {
    this.emit("event", {
      type: "supersticker",
      platform: this.platformId,
      userId: authorDetails.channelId,
      username: authorDetails.displayName,
    });
  }

  /**
   * Handle a new sponsor (membership) event.
   * @private
   */
  _handleNewSponsor(snippet, authorDetails) {
    this.emit("event", {
      type: "subscribe",
      platform: this.platformId,
      userId: authorDetails.channelId,
      username: authorDetails.displayName,
      tier: snippet.newSponsorDetails?.memberLevelName || "Member",
    });
  }

  /**
   * Handle a membership gift event.
   * @private
   */
  _handleMembershipGift(snippet, authorDetails) {
    const giftedCount =
      snippet.membershipGiftingDetails?.giftedMembersCount || 1;
    this.emit("event", {
      type: "subgift",
      platform: this.platformId,
      userId: authorDetails.channelId,
      username: authorDetails.displayName,
      count: giftedCount,
    });
  }

  /**
   * Handle a user banned event.
   * @private
   */
  _handleUserBanned(snippet, authorDetails) {
    this.emit("event", {
      type: "ban",
      platform: this.platformId,
      moderatorId: authorDetails.channelId,
      moderatorName: authorDetails.displayName,
    });
  }

  /**
   * Extract badges from author details.
   * @private
   */
  _extractBadges(authorDetails) {
    const badges = [];
    if (authorDetails.isChatOwner) badges.push("broadcaster");
    if (authorDetails.isChatModerator) badges.push("moderator");
    if (authorDetails.isChatSponsor) badges.push("subscriber");
    return badges;
  }

  /**
   * Validate the current access token.
   * @private
   * @returns {Promise<Object|null>}
   */
  async _validateToken() {
    try {
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${this.connection.tokens.accessToken}`,
          },
        },
      );

      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      logger.error("YouTube token validation failed", error);
      return null;
    }
  }
}

export default YouTubePlatform;
