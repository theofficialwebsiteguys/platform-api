require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require('http');
const { Server } = require("socket.io");
const sequelize = require("./db");

const logger = require("./middleware/logger");
const errorHandler = require("./middleware/errorHandler");

const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");

const messageController = require("./controllers/messageController");

const app = express();
const server = http.createServer(app);

// Enable CORS
const corsOptions = {
  origin: ["http://localhost:4200"], // Allow requests from Ionic frontend
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: "http://localhost:4200", // Frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  },
});


app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(logger);

// Routes - mounting /api/users to all userRoutes in userRoutes.js
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

// error handling must go after route definitions
app.use(errorHandler);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join room based on userId
  socket.on('join-room', (userId) => {
    socket.join(userId); // Join the room named after the userId
    console.log(`User ${userId} joined their room.`);
  });

  // Handle incoming messages
  socket.on('send-message', async (data) => {
    try {
      console.log('Message received:', data);

      // Save the message to the database (pseudo-code)
      const message = {
        senderId: data.senderId,
        receiverId: data.receiverId,
        content: data.content,
        timestamp: new Date(),
      };
      // Save to database here if needed

      const savedMessage = await messageController.saveMessage(data);

      // Broadcast the message to the receiver's room
      io.to(data.receiverId).emit('receive-message', savedMessage);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


sequelize
  .authenticate()
  .then(() => {
    console.log("Connected to the database.");
    const port = process.env.PORT || 3333; // Use Heroku's PORT or 3333 locally
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
    process.exit(1); // Exit process on failure
  });




module.exports = app;
