import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { syncWorkoutsSchema } from "../routes/workouts.schemas";
import * as workoutsService from "../services/workouts.service";

export async function sync(req: Request, res: Response) {
  const input = parseOrThrow(syncWorkoutsSchema, req.body);
  res.json(await workoutsService.syncSessions(req.userId!, input));
}

export async function list(req: Request, res: Response) {
  res.json({ sessions: await workoutsService.listSessions(req.userId!) });
}
