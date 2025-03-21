// routes/messageRoutes.js
const express = require('express');
const messageController = require('../controllers/messageController');
const { authenticateRequest } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect routes with authentication
// router.use(authenticateRequest);

router.get('/:senderId/:receiverId', messageController.getChatHistory);

module.exports = router;
