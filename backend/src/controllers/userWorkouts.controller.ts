import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { createUserWorkoutSchema } from "../routes/userWorkouts.schemas";
import * as service from "../services/userWorkouts.service";

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

export async function suggestImage(_req: Request, res: Response) {
  res.json(await service.suggestCoverImage());
}
