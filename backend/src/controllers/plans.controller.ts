import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import {
  createCustomPlanSchema,
  createFromTemplateSchema,
  createPlanSchema,
  listTemplatesQuerySchema,
  setDifficultySchema,
} from "../routes/plans.schemas";
import * as planDifficultyService from "../services/planDifficulty.service";
import * as plansService from "../services/plans.service";

export async function create(req: Request, res: Response) {
  const input = parseOrThrow(createPlanSchema, req.body);
  res.status(201).json({ plan: await plansService.createPlan(req.userId!, input) });
}

export async function createCustom(req: Request, res: Response) {
  const input = parseOrThrow(createCustomPlanSchema, req.body);
  res
    .status(201)
    .json({ plan: await plansService.createCustomPlan(req.userId!, input) });
}

export async function listTemplates(req: Request, res: Response) {
  const query = parseOrThrow(listTemplatesQuerySchema, req.query);
  res.json({ templates: await plansService.listStarterTemplates(query) });
}

export async function createFromTemplate(req: Request, res: Response) {
  const input = parseOrThrow(createFromTemplateSchema, req.body);
  res.status(201).json({
    plan: await plansService.createPlanFromTemplate(req.userId!, input),
  });
}

export async function setDifficulty(req: Request, res: Response) {
  const input = parseOrThrow(setDifficultySchema, req.body);
  res.json({
    plan: await planDifficultyService.setPlanDifficulty(req.userId!, input),
  });
}

export async function getActive(req: Request, res: Response) {
  res.json({ plan: await plansService.getActivePlan(req.userId!) });
}
