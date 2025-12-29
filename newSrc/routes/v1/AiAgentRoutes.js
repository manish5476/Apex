// src/routes/v1/aiAgentRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const { processUserMessage } = require("../../services/ai/agentService");

// Protect — this will attach req.user
router.use(authController.protect);

// POST /api/v1/ai-agent/chat
router.post("/chat", async (req, res) => {
  try {
    const message = req.body.message || req.query.message;
    if (!message) return res.status(400).json({ success: false, message: "message is required" });

    // organizationId: prefer req.user (auth), fallback to body
    const organizationId = (req.user && req.user.organizationId) || req.body.organizationId || req.query.organizationId;
    const branchId = (req.user && req.user.branchId) || req.body.branchId || req.query.branchId;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: "organizationId required" });
    }

    const reply = await processUserMessage(message, { organizationId, branchId });

    res.json({ success: true, reply });
  } catch (err) {
    console.error("AI Route Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;

