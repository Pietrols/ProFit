import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { listExercisesSchema } from "../routes/exercises.schemas";
import * as exercisesService from "../services/exercises.service";

export async function list(req: Request, res: Response) {
  const { updatedSince } = parseOrThrow(listExercisesSchema, req.query);
  res.json(await exercisesService.listExercises(updatedSince));
}
