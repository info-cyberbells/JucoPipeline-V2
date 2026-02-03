import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Conversation } from "./models/conversation.model.js";
import { Message } from "./models/message.model.js";
import {addUserSocket, removeUserSocket, getOnlineUsers } from "./utils/onlineUsers.js";
const onlineUsers = new Map();

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  });

  io.on("connection", (socket) => {
    console.log("SOCKET CONNECTED:", socket.id);
    const userId = socket.user.id;

    // Save user as online
    addUserSocket(userId, socket.id);

    socket.on("sendMessage", async ({ chatId, receiverId, text, type }) => {
      try {
        const senderId = socket.user.id;
        console.log("sendMessage from", senderId, "to", receiverId, "in chat", chatId);
        const senderRole = socket.user.role;

        if (!text && type === "text") {
          return socket.emit("error", { message: "Message text required" });
        }

        const conversation = await Conversation.findById(chatId);
        console.log("Conversation found:", !!conversation);

        if (conversation) {
          console.log("Participants:", conversation.participants);
          console.log("SenderId:", senderId.toString());
          console.log(
            "Is Participant:",
            conversation.participants.some(p => p.userId.toString() === senderId.toString())
          );
        }
        if (!conversation || !conversation.isParticipant(senderId)) {
          return socket.emit("error", { message: "Not allowed in this chat" });
        }

        // Player restriction
        if (senderRole === "player" && !conversation.isUnlocked) {
          return socket.emit("error", { message: "Chat not unlocked yet" });
        }

        // Create message
        const message = await Message.create({
          conversationId: chatId,
          senderId,
          senderRole,
          receiverId,
          text,
          messageType: type || "text"
        });

        // Update last message
        conversation.lastMessage = {
          text,
          senderId,
          createdAt: message.createdAt
        };

        // Mark replied flags
        if (senderRole === "player") conversation.hasPlayerReplied = true;
        if (senderRole === "coach") conversation.hasCoachReplied = true;

        await conversation.save();

        // Emit to receiver (personal room)
        io.to(`user_${receiverId}`).emit("newMessage", {
          chatId,
          message,
          sender: { _id: senderId, role: senderRole }
        });

        // Confirm back to sender
        socket.emit("messageSent", {
          messageId: message._id,
          status: "delivered"
        });

        // Update unread count for receiver
        io.to(`user_${receiverId}`).emit("unreadUpdate", {
          chatId
        });

      } catch (err) {
        console.error("sendMessage error:", err);
        socket.emit("error", { message: "Message failed to send" });
      }
    });

    socket.on("joinChat", ({ chatId }) => {
      socket.join(`chat_${chatId}`);
    });

    socket.on("leaveChat", ({ chatId }) => {
      socket.leave(`chat_${chatId}`);
    });

    // join personal room
    socket.join(`user_${userId}`);
    console.log("User joined room:", `user_${userId}`);

    socket.on("joinConversation", (conversationId) => {
      socket.join(`conversation_${conversationId}`);
    });

    socket.on("typing", ({ chatId }) => {
      const userId = socket.user.id;
      // Notify everyone else in that chat room
      socket.to(`chat_${chatId}`).emit("typing", {
        chatId,
        userId
      });
    });


    socket.on("stopTyping", ({ chatId }) => {
      const userId = socket.user.id;
      socket.to(`chat_${chatId}`).emit("stopTyping", {
        chatId,
        userId
      });
    });

    socket.on("markAsRead", async ({ chatId }) => {
      try {
        const userId = socket.user.id;

        // Mark all messages sent TO this user as read
        const messages = await Message.updateMany(
          {
            conversationId: chatId,
            receiverId: userId,
            isRead: false
          },
          {
            $set: { isRead: true, readAt: new Date() }
          }
        );

        // Get the conversation to find the other participant
        const conversation = await Conversation.findById(chatId);

        const other = conversation.participants.find(
          p => p.userId.toString() !== userId.toString()
        );

        // Notify sender that messages are read
        io.to(`user_${other.userId}`).emit("messageRead", {
          chatId,
          readBy: userId
        });

        // Also reset unread counter live
        socket.emit("unreadUpdate", {
          chatId,
          unreadCount: 0
        });

      } catch (err) {
        console.error("markAsRead error:", err);
      }
    });

    // Notify others
    socket.broadcast.emit("userOnline", { userId });

    // Send current online users to this client
    socket.emit("onlineUsers", getOnlineUsers());

    socket.on("disconnect", () => {
      console.log("User disconnected", userId);
      removeUserSocket(userId, socket.id);

      socket.broadcast.emit("userOffline", { userId });
    });
  });

  return io;
};
