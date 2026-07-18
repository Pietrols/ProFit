import bcrypt from "bcrypt";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";
import { User } from "../generated/prisma/client";
import { UpdateProfileInput } from "../routes/profile.schemas";

export type PublicUser = ReturnType<typeof toPublicUser>;

export function toPublicUser(user: User) {
  const {
    id,
    email,
    displayName,
    goal,
    trainingDays,
    defaultContext,
    units,
    avatar,
    publicBio,
    onboardedAt,
    emailVerifiedAt,
  } = user;
  return {
    id,
    email,
    displayName,
    goal,
    trainingDays,
    defaultContext,
    units,
    avatar,
    publicBio,
    onboardedAt,
    emailVerifiedAt,
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized("User no longer exists", "GONE_USER");
  return toPublicUser(user);
}

/**
 * Permanent account deletion (AUDIT S5 — right to erasure). Password
 * re-confirmation guards against a stolen unlocked phone; every relation
 * cascades, including public community workouts.
 */
export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized("User no longer exists", "GONE_USER");
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized("Password is incorrect", "BAD_CREDENTIALS");
  }
  await prisma.user.delete({ where: { id: userId } });
  logger.info({ event: "account.deleted", userId }, "account deleted");
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { onboarded, ...rest } = input;
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(onboarded === undefined
        ? {}
        : { onboardedAt: onboarded ? new Date() : null }),
    },
  });
  return toPublicUser(user);
}
