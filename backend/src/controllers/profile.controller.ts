import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { updateProfileSchema } from "../routes/profile.schemas";
import * as profileService from "../services/profile.service";

export async function getMe(req: Request, res: Response) {
  res.json({ user: await profileService.getProfile(req.userId!) });
}

export async function updateMe(req: Request, res: Response) {
  const input = parseOrThrow(updateProfileSchema, req.body);
  res.json({ user: await profileService.updateProfile(req.userId!, input) });
}
