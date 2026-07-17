import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { planBuilderSchema } from "../routes/ai.schemas";
import * as aiService from "../services/ai.service";
import * as planBuilderService from "../services/planBuilder.service";

export async function ability(req: Request, res: Response) {
  res.json(await aiService.inferAbility(req.userId!));
}

export async function planBuilder(req: Request, res: Response) {
  const input = parseOrThrow(planBuilderSchema, req.body);
  res.json(
    await planBuilderService.planBuilderTurn(req.userId!, input.messages),
  );
}

export async function nextSession(req: Request, res: Response) {
  res.json(
    await aiService.nextSessionAdjustment(
      req.userId!,
      String(req.params.planDayId),
    ),
  );
}
