import { Request, Response } from "express";
import { ApiError, parseOrThrow } from "../lib/errors";
import { emailHash, logger } from "../lib/logger";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../routes/auth.schemas";
import * as authService from "../services/auth.service";
import * as emailFlows from "../services/emailFlows.service";

export async function register(req: Request, res: Response) {
  const input = parseOrThrow(registerSchema, req.body);
  const result = await authService.register(input);
  logger.info(
    { event: "auth.register", user: emailHash(input.email), ip: req.ip },
    "account registered",
  );
  // Confirmation code goes out in the background; registration never blocks
  // on the mail provider.
  void emailFlows.sendVerification(input.email).catch((err) => {
    logger.error({ err }, "verification send failed");
  });
  res.status(201).json(result);
}

export async function resendVerification(req: Request, res: Response) {
  const input = parseOrThrow(emailOnlySchema, req.body);
  await emailFlows.sendVerification(input.email);
  res.json({ ok: true }); // identical whether or not the account exists
}

export async function verifyEmail(req: Request, res: Response) {
  const input = parseOrThrow(verifyEmailSchema, req.body);
  await emailFlows.verifyEmail(input.email, input.code);
  res.json({ ok: true });
}

export async function forgotPassword(req: Request, res: Response) {
  const input = parseOrThrow(emailOnlySchema, req.body);
  await emailFlows.sendPasswordReset(input.email);
  res.json({ ok: true }); // identical whether or not the account exists
}

export async function resetPassword(req: Request, res: Response) {
  const input = parseOrThrow(resetPasswordSchema, req.body);
  await emailFlows.resetPassword(input.email, input.code, input.newPassword);
  res.json({ ok: true });
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
