import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { sendChatSchema } from "../routes/chat.schemas";
import * as chatService from "../services/chat.service";

export async function send(req: Request, res: Response) {
  const input = parseOrThrow(sendChatSchema, req.body);
  res.json(await chatService.sendMessage(req.userId!, input.message));
}

export async function history(req: Request, res: Response) {
  res.json({ messages: await chatService.getHistory(req.userId!) });
}
