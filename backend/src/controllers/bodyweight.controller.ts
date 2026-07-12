import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { syncBodyweightSchema } from "../routes/bodyweight.schemas";
import * as bodyweightService from "../services/bodyweight.service";

export async function sync(req: Request, res: Response) {
  const input = parseOrThrow(syncBodyweightSchema, req.body);
  res.json(await bodyweightService.syncEntries(req.userId!, input));
}

export async function list(req: Request, res: Response) {
  res.json({ entries: await bodyweightService.listEntries(req.userId!) });
}
