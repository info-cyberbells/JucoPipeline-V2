import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    role: {
      type: String,
      enum: ["coach", "player", "scout"],
      required: true
    }
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    participants: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        role: String
      }
    ],
    initiatedBy: {
      userId: mongoose.Schema.Types.ObjectId,
      role: { type: String, enum: ["coach", "scout"] }
    },
    isUnlocked: {
      type: Boolean,
      default: false
    },
    lastMessage: {
      text: { type: String, default: "" },
      messageType: {
        type: String,
        enum: ["text", "image", "file"],
        default: "text"
      },
      file: {
        name: String
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      senderRole: {
        type: String,
        enum: ["coach", "player", "scout"]
      },
      createdAt: Date
    },
    deletedFor: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    hasPlayerReplied: {
      type: Boolean,
      default: false
    },
    hasCoachReplied: {
      type: Boolean,
      default: false
    },
  },
  { timestamps: true }
);

conversationSchema.index(
  { coachId: 1, playerId: 1 },
  { unique: true }
);

conversationSchema.methods.isParticipant = function (userId) {
  return this.participants.some(p =>
    p.userId.toString() === userId.toString()
  );
};

conversationSchema.methods.getOtherParticipant = function (userId) {
  return this.participants.find(
    p => p.userId.toString() !== userId.toString()
  );
};

export const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);
