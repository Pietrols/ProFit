import { Request, Response } from "express";
import { parseOrThrow } from "../lib/errors";
import { loginSchema, registerSchema } from "../routes/auth.schemas";
import * as authService from "../services/auth.service";

export async function register(req: Request, res: Response) {
  const input = parseOrThrow(registerSchema, req.body);
  res.status(201).json(await authService.register(input));
}

export async function login(req: Request, res: Response) {
  const input = parseOrThrow(loginSchema, req.body);
  res.json(await authService.login(input));
}
