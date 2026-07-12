import { Router } from "express";
import * as chatController from "../controllers/chat.controller";
import { requireAuth } from "../middleware/auth";

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.post("/", chatController.send);
chatRouter.get("/", chatController.history);
