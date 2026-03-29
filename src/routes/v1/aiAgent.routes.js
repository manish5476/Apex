// src/routes/v1/aiAgentRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../../modules/auth/core/auth.controller");
const { processUserMessage } = require("../../modules/ai/agentService");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all AI routes globally
router.use(authController.protect);

/**
 * @route   POST /api/v1/ai-agent/chat
 * @desc    Process natural language queries using AI
 * @access  Private (Requires ai:chat permission)
 */
router.post("/chat", checkPermission(PERMISSIONS.AI.CHAT), async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: "Message is required" 
      });
    }

    // SECURITY: Strictly use IDs from the authenticated user object.
    // This prevents "ID spoofing" where a user queries data from another org.
    const organizationId = req.user.organizationId;
    const branchId = req.user.branchId;

    if (!organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: "Your user account is not associated with an organization." 
      });
    }

    // Process the message through your AI Service
    const reply = await processUserMessage(message, { 
      organizationId, 
      branchId,
      userId: req.user.id // Pass userId for auditing if needed
    });

    res.json({ 
      success: true, 
      reply 
    });

  } catch (err) {
    console.error("AI Route Error:", err);
    res.status(500).json({ 
      success: false, 
      message: "The AI agent is currently unavailable. Please try again later." 
    });
  }
});

module.exports = router;