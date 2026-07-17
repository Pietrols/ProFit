import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { LoginInput, RegisterInput } from "../routes/auth.schemas";
import { toPublicUser } from "./profile.service";

const TOKEN_TTL = "30d";

/** `tv` (token version) makes tokens revocable: bump the user's column and
 *  every outstanding JWT dies at the next request (AUDIT S2). */
export function signToken(userId: string, tokenVersion: number) {
  return jwt.sign({ tv: tokenVersion }, process.env.JWT_SECRET!, {
    subject: userId,
    expiresIn: TOKEN_TTL,
  });
}

/** Revoke every outstanding token for the user (logout, password reset). */
export async function revokeAllTokens(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw ApiError.conflict("Email already registered", "EMAIL_TAKEN");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, 12),
    },
  });
  return { token: signToken(user.id, user.tokenVersion), user: toPublicUser(user) };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw ApiError.unauthorized("Invalid email or password", "BAD_CREDENTIALS");
  }
  return { token: signToken(user.id, user.tokenVersion), user: toPublicUser(user) };
}
