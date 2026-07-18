import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import {
  deleteAccountSchema,
  updateProfileSchema,
} from "../routes/profile.schemas";
import * as profileService from "../services/profile.service";

export async function getMe(req: Request, res: Response) {
  res.json({ user: await profileService.getProfile(req.userId!) });
}

export async function updateMe(req: Request, res: Response) {
  const input = parseOrThrow(updateProfileSchema, req.body);
  res.json({ user: await profileService.updateProfile(req.userId!, input) });
}

export async function deleteMe(req: Request, res: Response) {
  const input = parseOrThrow(deleteAccountSchema, req.body);
  await profileService.deleteAccount(req.userId!, input.password);
  res.json({ ok: true });
}
