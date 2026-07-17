import { Request, Response } from "express";
import { ApiError, parseOrThrow } from "../lib/errors";
import { emailHash, logger } from "../lib/logger";
import { loginSchema, registerSchema } from "../routes/auth.schemas";
import * as authService from "../services/auth.service";

export async function register(req: Request, res: Response) {
  const input = parseOrThrow(registerSchema, req.body);
  const result = await authService.register(input);
  logger.info(
    { event: "auth.register", user: emailHash(input.email), ip: req.ip },
    "account registered",
  );
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const input = parseOrThrow(loginSchema, req.body);
  try {
    const result = await authService.login(input);
    logger.info(
      { event: "auth.login", user: emailHash(input.email), ip: req.ip },
      "login ok",
    );
    res.json(result);
  } catch (e) {
    if (e instanceof ApiError && e.code === "BAD_CREDENTIALS") {
      logger.warn(
        { event: "auth.login_failed", user: emailHash(input.email), ip: req.ip },
        "login failed",
      );
    }
    throw e;
  }
}
