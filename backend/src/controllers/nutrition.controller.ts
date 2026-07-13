import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import {
  estimateMacrosSchema,
  syncMealLogsSchema,
  syncMealProfileSchema,
} from "../routes/nutrition.schemas";
import * as nutritionService from "../services/nutrition.service";

export async function syncProfile(req: Request, res: Response) {
  const input = parseOrThrow(syncMealProfileSchema, req.body);
  res.json(await nutritionService.syncProfile(req.userId!, input));
}

export async function getProfile(req: Request, res: Response) {
  res.json({ items: await nutritionService.getProfile(req.userId!) });
}

export async function syncMeals(req: Request, res: Response) {
  const input = parseOrThrow(syncMealLogsSchema, req.body);
  res.json(await nutritionService.syncMeals(req.userId!, input));
}

export async function listMeals(req: Request, res: Response) {
  res.json({ meals: await nutritionService.listMeals(req.userId!) });
}

export async function suggestion(req: Request, res: Response) {
  res.json(await nutritionService.mealSuggestion(req.userId!));
}

export async function estimateMacros(req: Request, res: Response) {
  const input = parseOrThrow(estimateMacrosSchema, req.body);
  res.json(await nutritionService.estimateMacros(input));
}
