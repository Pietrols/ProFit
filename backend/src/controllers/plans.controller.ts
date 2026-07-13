import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import {
  createCustomPlanSchema,
  createPlanSchema,
} from "../routes/plans.schemas";
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

export async function getActive(req: Request, res: Response) {
  res.json({ plan: await plansService.getActivePlan(req.userId!) });
}
