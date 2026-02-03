import express from "express";
import { startConversation, getMyConversations, deleteConversations } from "../controllers/conversation.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

const router = express.Router();
router.use(authenticate, authorizeRoles("coach"));

router.post("/start", startConversation);
router.get("/", getMyConversations);
router.delete("/", deleteConversations);

export default router;
