import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    senderRole: {
      type: String,
      enum: ["coach", "player", "scout"],
      required: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file"],
      default: "text"
    },
    text: {
      type: String,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: Date
  },
  {
    timestamps: true
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, isRead: 1 });

messageSchema.statics.getUnreadCount = function (conversationId, userId) {
  return this.countDocuments({
    conversationId,
    receiverId: userId,
    isRead: false
  });
};

export const Message = mongoose.model("Message", messageSchema);
