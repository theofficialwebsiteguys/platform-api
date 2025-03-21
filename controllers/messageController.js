// controllers/messageController.js
const { Message, User } = require('../models');
const AppError = require('../toolbox/appErrorClass');
const { Op } = require('sequelize');

// Save a message
exports.saveMessage = async (data) => {
  const { senderId, receiverId, content } = data;

  try {
    const message = await Message.create({
      senderId,
      receiverId,
      content,
      timestamp: new Date(),
    });

    return message;
  } catch (error) {
    console.error('Error saving message:', error);
    throw new AppError('Database Error', 500, { issue: 'Error saving message' });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const senderId = parseInt(req.params.senderId, 10);
    const receiverId = parseInt(req.params.receiverId, 10);

    if (isNaN(senderId) || isNaN(receiverId)) {
      return res.status(400).json({ error: 'Invalid senderId or receiverId' });
    }

    console.log('Fetching chat history for:', { senderId, receiverId });

    const chatHistory = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: senderId }, // Messages sent by the user
          { receiverId: senderId }, // Messages received by the user
        ],
      },
      order: [['timestamp', 'ASC']], // Order by time ascending
    });

    res.status(200).json(chatHistory);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
};
