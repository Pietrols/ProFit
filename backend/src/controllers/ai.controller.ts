import { Request, Response } from "express";
import * as aiService from "../services/ai.service";

export async function ability(req: Request, res: Response) {
  res.json(await aiService.inferAbility(req.userId!));
}

export async function nextSession(req: Request, res: Response) {
  res.json(
    await aiService.nextSessionAdjustment(
      req.userId!,
      String(req.params.planDayId),
    ),
  );
}
