import mongoose from "mongoose";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import User from "../models/user.model.js";

export const startConversation = async (req, res) => {
    try {
        const coachId = req.user._id;
        const { playerId, text } = req.body;
        const baseURL = `${req.protocol}://${req.get("host")}`;

        if (req.user.role !== "coach") {
            return res.status(403).json({ message: "Only coach can start conversation" });
        }

        // Check existing conversation
        let conversation = await Conversation.findOne({
            "participants.userId": { $all: [coachId, playerId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                coachId: coachId,
                playerId: playerId,
                participants: [
                    { userId: coachId, role: "coach" },
                    { userId: playerId, role: "player" }
                ],
                initiatedBy: {
                    userId: coachId,
                    role: "coach"
                },
                isUnlocked: true
            });
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId: coachId,
            senderRole: "coach",
            receiverId: playerId,
            text
        });

        conversation.lastMessage = {
            text,
            senderId: coachId,
            createdAt: message.createdAt
        };

        await conversation.save();

        // Fetch player basic info
        const player = await User.findById(playerId).select(
            "firstName lastName profileImage"
        );

        const participant = {
            _id: player._id,
            firstName: player.firstName,
            lastName: player.lastName,
            profileImage: player.profileImage ? `${baseURL}${player.profileImage}` : null
        };

        // res.status(201).json({ conversation, message });

        res.status(201).json({
            conversation: {
                ...conversation.toObject(),
                participant,
                unreadCount: 0
            },
            message
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const startConversationOLLLD = async (req, res) => {
    try {
        const coachId = req.user._id;
        const { playerId, text } = req.body;

        if (req.user.role !== "coach") {
            return res.status(403).json({ message: "Only coach can start conversation" });
        }

        // Check existing conversation
        let conversation = await Conversation.findOne({
            "participants.userId": { $all: [coachId, playerId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                coachId: coachId,
                playerId: playerId,
                participants: [
                    { userId: coachId, role: "coach" },
                    { userId: playerId, role: "player" }
                ],
                initiatedBy: {
                    userId: coachId,
                    role: "coach"
                },
                isUnlocked: true
            });
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId: coachId,
            senderRole: "coach",
            receiverId: playerId,
            text
        });

        conversation.lastMessage = {
            text,
            senderId: coachId,
            createdAt: message.createdAt
        };

        await conversation.save();

        res.status(201).json({ conversation, message });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getMyConversationsOLDD = async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const conversations = await Conversation.aggregate([
        {
            $match: {
                "participants.userId": userId
            }
        },
        {
            $lookup: {
                from: "messages",
                let: { conversationId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$conversationId", "$$conversationId"] },
                                    { $eq: ["$receiverId", userId] },
                                    { $eq: ["$isRead", false] }
                                ]
                            }
                        }
                    },
                    { $count: "count" }
                ],
                as: "unreadMessages"
            }
        },
        {
            $addFields: {
                unreadCount: {
                    $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0]
                }
            }
        },
        {
            $project: {
                unreadMessages: 0
            }
        },
        {
            $sort: { updatedAt: -1 }
        }
    ]);

    res.json(conversations);
};

export const getMyConversations = async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const baseURL = `${req.protocol}://${req.get("host")}`;
    const type = req.query.type; // "request" or undefined

    let matchStage = {
        "participants.userId": userId,
        deletedFor: { $ne: userId }
    };

    if (type === "request") {
        if (req.user.role === "player") {
            matchStage["initiatedBy.role"] = "coach";
            matchStage["hasPlayerReplied"] = false;
        }

        if (req.user.role === "coach") {
            matchStage["initiatedBy.role"] = "player";
            matchStage["hasCoachReplied"] = false;
        }
    }


    const conversations = await Conversation.aggregate([
        { $match: matchStage },
        // Unread count
        {
            $lookup: {
                from: "messages",
                let: { conversationId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$conversationId", "$$conversationId"] },
                                    { $eq: ["$receiverId", userId] },
                                    { $eq: ["$isRead", false] }
                                ]
                            }
                        }
                    },
                    { $count: "count" }
                ],
                as: "unreadMessages"
            }
        },
        {
            $addFields: {
                unreadCount: {
                    $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0]
                },
                participantRef: {
                    $arrayElemAt: [
                        {
                            $filter: {
                                input: "$participants",
                                as: "p",
                                cond: { $ne: ["$$p.userId", userId] }
                            }
                        },
                        0
                    ]
                }
            }
        },
        // Lookup basic participant info only
        {
            $lookup: {
                from: "users",
                localField: "participantRef.userId",
                foreignField: "_id",
                pipeline: [
                    {
                        $project: {
                            firstName: 1,
                            lastName: 1,
                            profileImage: 1
                        }
                    }
                ],
                as: "participant"
            }
        },
        { $unwind: "$participant" },
        // Add full image URL
        {
            $addFields: {
                "participant.profileImage": {
                    $cond: {
                        if: { $ifNull: ["$participant.profileImage", false] },
                        then: { $concat: [baseURL, "$participant.profileImage"] },
                        else: null
                    }
                }
            }
        },
        {
            $project: {
                unreadMessages: 0,
                participantRef: 0
            }
        },
        { $sort: { updatedAt: -1 } }
    ]);

    res.json(conversations);
};

export const deleteConversationsOLDDD = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationIds } = req.body;

        if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
            return res.status(400).json({ message: "conversationIds array is required" });
        }

        await Conversation.updateMany(
            {
                _id: { $in: conversationIds },
                "participants.userId": userId
            },
            {
                $addToSet: { deletedFor: userId }
            }
        );

        res.json({ success: true, message: "Conversations deleted." });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Real-Time Conversation Delete Event
export const deleteConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationIds } = req.body;
        const io = req.app.get("io");

        if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
            return res.status(400).json({ message: "conversationIds array is required" });
        }

        const conversations = await Conversation.find({
            _id: { $in: conversationIds },
            "participants.userId": userId
        });

        for (const convo of conversations) {
            // Soft delete for current user
            // if (!convo.deletedFor.includes(userId)) {
            if (!convo.deletedFor.some(id => id.toString() === userId.toString())) {
                convo.deletedFor.push(userId);
                await convo.save();
            }

            // Find other participant
            const other = convo.participants.find(
                p => p.userId.toString() !== userId.toString()
            );

            // Emit real-time event
            io.to(`user_${other.userId}`).emit("conversationDeleted", {
                conversationId: convo._id,
                deletedBy: userId
            });
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

