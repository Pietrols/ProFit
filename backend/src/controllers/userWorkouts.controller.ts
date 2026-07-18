import { Request, Response } from "express";
import { z } from "zod";
import { parseOrThrow } from "../lib/errors";
import { createUserWorkoutSchema } from "../routes/userWorkouts.schemas";
import * as service from "../services/userWorkouts.service";

const reportSchema = z.object({ reason: z.string().min(3).max(300) });

export async function create(req: Request, res: Response) {
  const input = parseOrThrow(createUserWorkoutSchema, req.body);
  res.status(201).json({ workout: await service.createUserWorkout(req.userId!, input) });
}

export async function mine(req: Request, res: Response) {
  res.json({ workouts: await service.listMine(req.userId!) });
}

export async function publicList(_req: Request, res: Response) {
  res.json({ workouts: await service.listPublic() });
}

export async function getOne(req: Request, res: Response) {
  res.json({ workout: await service.getPublicWorkout(String(req.params.id)) });
}

export async function copy(req: Request, res: Response) {
  res
    .status(201)
    .json({ plan: await service.copyToPlans(req.userId!, String(req.params.id)) });
}

export async function report(req: Request, res: Response) {
  const input = parseOrThrow(reportSchema, req.body);
  res.json(
    await service.reportWorkout(req.userId!, String(req.params.id), input.reason),
  );
}

export async function suggestImage(_req: Request, res: Response) {
  res.json(await service.suggestCoverImage());
}
