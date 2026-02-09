import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import fs from "fs";
import path from "path";

export const getMessages = async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const baseURL = `${req.protocol}://${req.get("host")}`;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("senderId", "firstName profileImage role")
        .populate("receiverId", "firstName profileImage role")
        .lean();

    const formatted = messages.reverse().map(msg => ({
        _id: msg._id,
        conversationId: msg.conversationId,
        messageType: msg.messageType,
        text: msg.text,
        isRead: msg.isRead,
        createdAt: msg.createdAt,
         file: msg.fileUrl
        ? {
            url: msg.fileUrl.startsWith("http")
                ? msg.fileUrl
                : `${baseURL}/${msg.fileUrl.replace(/\\/g, "/")}`,
            name: msg.fileName,
            size: msg.fileSize
        }
        : null,
        sender: {
            _id: msg.senderId._id,
            firstName: msg.senderId.firstName,
            role: msg.senderId.role,
            profileImage: msg.senderId.profileImage ? `${msg.senderId.profileImage}` : null
        },

        receiver: {
            _id: msg.receiverId._id,
            firstName: msg.receiverId.firstName,
            role: msg.receiverId.role,
            profileImage: msg.receiverId.profileImage ? `${msg.receiverId.profileImage}` : null
        }
    }));

    res.json(formatted);
};

export const sendMessage = async (req, res) => {
    const conversationId = req.body?.conversationId;
    const text = req.body?.text || "";

    if (!conversationId) {
        return res.status(400).json({
            message: "conversationId is required"
        });
    }

    let messageType = "text";
    let fileData = {};

    if (req.file) {
        const baseURL = `${req.protocol}://${req.get("host")}`;

        fileData = {
            fileUrl: `${baseURL}/${req.file.path.replace(/\\/g, "/")}`,
            fileName: req.file.originalname,
            fileSize: req.file.size
        };
        messageType = req.file.mimetype.startsWith("image/") ? "image" : "file";
    }


    const user = req.user;
    const conversation = await Conversation.findById(conversationId).populate(
        "participants.userId",
        "firstName profileImage role"
    );

    if (!conversation || !conversation.isParticipant(user._id)) {
        return res.status(403).json({ message: "Not allowed" });
    }

    if (user.role === "player" && !conversation.isUnlocked) {
        return res.status(403).json({
            message: "Player cannot send message until coach initiates"
        });
    }

    const receiverParticipant = conversation.participants.find(
        p => p.userId._id.toString() !== user._id.toString()
    );

    const message = await Message.create({
        conversationId,
        senderId: user._id,
        senderRole: user.role,
        receiverId: receiverParticipant.userId._id,
        text,
        messageType,
        ...fileData
    });

    conversation.lastMessage = {
        text: messageType === "text" ? text : "",
        messageType,
        file: fileData.fileName ? { name: fileData.fileName } : null,
        senderId: user._id,
        senderRole: user.role,
        createdAt: message.createdAt
    };

    if (user.role === "player") {
        conversation.hasPlayerReplied = true;
    }

    if (user.role === "coach") {
        conversation.hasCoachReplied = true;
    }

    await conversation.save();

    // Fetch populated message
    const populatedMessage = await Message.findById(message._id)
        .populate("senderId", "firstName profileImage role")
        .populate("receiverId", "firstName profileImage role")
        .lean();

    const formattedMessage = {
        _id: populatedMessage._id,
        conversationId: populatedMessage.conversationId,
        text: populatedMessage.text,
        messageType: populatedMessage.messageType,
        createdAt: populatedMessage.createdAt,
        isRead: populatedMessage.isRead,
        file: populatedMessage.fileUrl
            ? {
                url: populatedMessage.fileUrl,
                name: populatedMessage.fileName,
                size: populatedMessage.fileSize
            }
            : null,

        sender: {
            _id: populatedMessage.senderId._id,
            firstName: populatedMessage.senderId.firstName,
            role: populatedMessage.senderId.role,
            profileImage: populatedMessage.senderId.profileImage ? `${populatedMessage.senderId.profileImage}` : null
        },

        receiver: {
            _id: populatedMessage.receiverId._id,
            firstName: populatedMessage.receiverId.firstName,
            role: populatedMessage.receiverId.role,
            profileImage: populatedMessage.receiverId.profileImage ? `${populatedMessage.receiverId.profileImage}` : null
        }
    };

    const io = req.app.get("io");
    const receiverRoom = `user_${receiverParticipant.userId._id.toString()}`;

    console.log("📡 Emitting to room:", receiverRoom);

    io.to(receiverRoom).emit("newMessage", {
        conversationId,
        message: formattedMessage
    });

    io.to(receiverRoom).emit("unreadUpdate", { conversationId });

    res.status(201).json(formattedMessage);
};

export const markAsRead = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user._id;
    const io = req.app.get("io");

    const messages = await Message.find({
        conversationId,
        receiverId: userId,
        isRead: false
    });

    await Message.updateMany(
        { _id: { $in: messages.map(m => m._id) } },
        { $set: { isRead: true } }
    );

    // Notify senders
    messages.forEach(msg => {
        io.to(`user_${msg.senderId}`).emit("messageRead", {
            chatId: conversationId,
            messageId: msg._id,
            readBy: userId
        });
    });

    res.json({ success: true });
};

export const deleteMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { messageId } = req.params;
        const io = req.app.get("io");

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        // Only sender can delete
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Not allowed" });
        }

        // ===== Delete file from disk if exists =====
        if (message.fileUrl) {
            try {
                // Convert URL to local path
                const filePath = message.fileUrl
                    .replace(`${req.protocol}://${req.get("host")}/`, "");

                const fullPath = path.join(process.cwd(), filePath);

                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log("🗑 File deleted:", fullPath);
                }
            } catch (fileErr) {
                console.error("File delete error:", fileErr.message);
                // Don't stop execution if file delete fails
            }
        }

        // Delete message from DB
        await message.deleteOne();

        // Real-time event
        io.to(`user_${message.receiverId}`).emit("messageDeleted", {
            messageId,
            chatId: message.conversationId
        });

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
