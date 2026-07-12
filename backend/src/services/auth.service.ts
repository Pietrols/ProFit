import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { LoginInput, RegisterInput } from "../routes/auth.schemas";
import { toPublicUser } from "./profile.service";

const TOKEN_TTL = "30d";

function signToken(userId: string) {
  return jwt.sign({}, process.env.JWT_SECRET!, {
    subject: userId,
    expiresIn: TOKEN_TTL,
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
  return { token: signToken(user.id), user: toPublicUser(user) };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw ApiError.unauthorized("Invalid email or password", "BAD_CREDENTIALS");
  }
  return { token: signToken(user.id), user: toPublicUser(user) };
}
