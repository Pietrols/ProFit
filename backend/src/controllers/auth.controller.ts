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

/** Server-side logout (AUDIT S2): revokes every outstanding token. */
export async function logout(req: Request, res: Response) {
  await authService.revokeAllTokens(req.userId!);
  logger.info({ event: "auth.logout", userId: req.userId }, "tokens revoked");
  res.json({ ok: true });
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
