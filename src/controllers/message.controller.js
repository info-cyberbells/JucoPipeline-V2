import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";

export const getMessagesOLD = async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ conversationId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(messages.reverse());
};

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

        sender: {
            _id: msg.senderId._id,
            firstName: msg.senderId.firstName,
            role: msg.senderId.role,
            profileImage: msg.senderId.profileImage ? `${baseURL}${msg.senderId.profileImage}` : null
        },

        receiver: {
            _id: msg.receiverId._id,
            firstName: msg.receiverId.firstName,
            role: msg.receiverId.role,
            profileImage: msg.receiverId.profileImage ? `${baseURL}${msg.receiverId.profileImage}` : null
        }
    }));

    res.json(formatted);
};

export const sendMessageOLDDDD = async (req, res) => {
    const { conversationId, text } = req.body;
    const user = req.user;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(user._id)) {
        return res.status(403).json({ message: "Not allowed" });
    }

    // Player restriction
    if (user.role === "player" && !conversation.isUnlocked) {
        return res.status(403).json({
            message: "Player cannot send message until coach initiates"
        });
    }

    const receiver = conversation.getOtherParticipant(user._id);
    const message = await Message.create({
        conversationId,
        senderId: user._id,
        senderRole: user.role,
        receiverId: receiver.userId,
        text
    });

    conversation.lastMessage = {
        text,
        senderId: user._id,
        createdAt: message.createdAt
    };

    await conversation.save();

    const io = req.app.get("io");
    const receiverUser = conversation.participants.find(
        p => p.userId.toString() !== req.user._id.toString()
    );

    const receiverRoom = `user_${receiverUser.userId.toString()}`;
    console.log("Emitting to room:", receiverRoom);
    io.to(receiverRoom).emit("newMessage", {
        conversationId: conversation._id,
        message: message
    });

    io.to(receiverRoom).emit("unreadUpdate", {
        conversationId: conversation._id
    });

    res.status(201).json(message);
};

export const sendMessage = async (req, res) => {
    const { conversationId, text } = req.body;
    const user = req.user;
    const baseURL = `${req.protocol}://${req.get("host")}`;

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
        text
    });

    conversation.lastMessage = {
        text,
        senderId: user._id,
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

        sender: {
            _id: populatedMessage.senderId._id,
            firstName: populatedMessage.senderId.firstName,
            role: populatedMessage.senderId.role,
            profileImage: populatedMessage.senderId.profileImage ? `${baseURL}${populatedMessage.senderId.profileImage}` : null
        },

        receiver: {
            _id: populatedMessage.receiverId._id,
            firstName: populatedMessage.receiverId.firstName,
            role: populatedMessage.receiverId.role,
            profileImage: populatedMessage.receiverId.profileImage ? `${baseURL}${populatedMessage.receiverId.profileImage}` : null
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

export const markAsReadOLDDSS = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user._id;

    await Message.updateMany(
        {
            conversationId,
            receiverId: userId,
            isRead: false
        },
        { $set: { isRead: true } }
    );

    res.json({ success: true });
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
        if (!message) return res.status(404).json({ message: "Message not found" });

        // Only sender can delete
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Not allowed" });
        }

        await message.deleteOne();

        io.to(`user_${message.receiverId}`).emit("messageDeleted", {
            messageId,
            chatId: message.conversationId
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
