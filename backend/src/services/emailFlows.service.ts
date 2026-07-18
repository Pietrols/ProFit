// Email verification + password reset (AUDIT S3). Both flows use short-lived
// 6-digit codes: only the SHA-256 lands in the DB, codes burn on use, and a
// token dies after 5 wrong attempts. Every "does this email exist?" question
// is answered identically to prevent account enumeration.
import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { emailHash, logger } from "../lib/logger";
import { sendMail } from "../lib/mailer";
import { EmailTokenPurpose } from "../generated/prisma/client";

const CODE_TTL_MS = { verify: 24 * 60 * 60 * 1000, reset: 15 * 60 * 1000 };
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

async function issueCode(userId: string, purpose: EmailTokenPurpose) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // one live token per purpose — reissuing invalidates the previous code
  await prisma.emailToken.deleteMany({ where: { userId, purpose } });
  await prisma.emailToken.create({
    data: {
      userId,
      purpose,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS[purpose]),
    },
  });
  return code;
}

/** Consume a code: throws BAD_CODE unless valid, unexpired, under attempts. */
async function consumeCode(
  userId: string,
  purpose: EmailTokenPurpose,
  code: string,
) {
  const token = await prisma.emailToken.findFirst({
    where: { userId, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const bad = () =>
    ApiError.badRequest("That code is invalid or has expired.", "BAD_CODE");

  if (!token || token.expiresAt < new Date() || token.attempts >= MAX_ATTEMPTS) {
    throw bad();
  }
  if (token.codeHash !== hashCode(code)) {
    await prisma.emailToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    throw bad();
  }
  await prisma.emailToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
}

export async function sendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // identical response whether or not the account exists
  if (!user || user.emailVerifiedAt) return;
  const code = await issueCode(user.id, "verify");
  await sendMail({
    to: email,
    subject: "Confirm your ProFit email",
    text: `Your ProFit confirmation code is ${code}. It expires in 24 hours. If you didn't create a ProFit account, you can ignore this email.`,
  });
  logger.info({ event: "auth.verify_sent", user: emailHash(email) }, "verification code issued");
}

export async function verifyEmail(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.badRequest("That code is invalid or has expired.", "BAD_CODE");
  await consumeCode(user.id, "verify", code);
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });
  logger.info({ event: "auth.verified", userId: user.id }, "email verified");
}

export async function sendPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // identical response — no enumeration
  const code = await issueCode(user.id, "reset");
  await sendMail({
    to: email,
    subject: "Reset your ProFit password",
    text: `Your ProFit password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email — your password is unchanged.`,
  });
  logger.info({ event: "auth.reset_sent", user: emailHash(email) }, "reset code issued");
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.badRequest("That code is invalid or has expired.", "BAD_CODE");
  await consumeCode(user.id, "reset", code);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      // a reset proves email control — count it as verification too,
      // and revoke every outstanding session token (AUDIT S2)
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      tokenVersion: { increment: 1 },
    },
  });
  logger.info({ event: "auth.password_reset", userId: user.id }, "password reset");
}
