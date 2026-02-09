import express from "express";
import { getMessages, sendMessage, markAsRead, deleteMessage } from "../controllers/message.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { uploadMessageFile } from "../middleware/upload.middleware.js";

const router = express.Router();
router.use(authenticate, authorizeRoles("player", "coach", "scout"));

router.get("/:conversationId", getMessages);
router.post("/send", uploadMessageFile.single("file"), sendMessage);
router.patch("/read", markAsRead);
router.delete("/:messageId", deleteMessage);

export default router;
