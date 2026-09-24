import express from "express";
import { verifyOverlayToken } from "../../utils/overlayToken.js";

const router = express.Router();

/**
 * GET /overlay/verify/:guildId/:widget — Verify overlay token
 *
 * Used by website overlay pages to validate the token before connecting to SSE.
 * Returns 200 if valid, 403 if invalid/expired.
 */
router.get("/verify/:guildId/:widget", (req, res) => {
  const { guildId, widget } = req.params;
  const token = req.query.token;

  if (!/^\d{17,20}$/.test(guildId)) {
    return res.status(400).json({ valid: false, error: "Invalid guild ID" });
  }

  const validWidgets = ["alerts", "chat", "activity", "stats"];
  if (!validWidgets.includes(widget)) {
    return res.status(400).json({ valid: false, error: "Invalid widget type" });
  }

  if (!token || !verifyOverlayToken(guildId, widget, token)) {
    return res
      .status(403)
      .json({ valid: false, error: "Invalid or expired token" });
  }

  return res.json({ valid: true, guildId, widget });
});

export default router;
