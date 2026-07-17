import { prisma } from "../db";
import { ApiError } from "../lib/errors";
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
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized("User no longer exists", "GONE_USER");
  return toPublicUser(user);
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
