import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { syncRecoverySchema } from "../routes/recovery.schemas";
import * as recoveryService from "../services/recovery.service";

export async function sync(req: Request, res: Response) {
  const input = parseOrThrow(syncRecoverySchema, req.body);
  res.json(await recoveryService.syncCheckins(req.userId!, input));
}
