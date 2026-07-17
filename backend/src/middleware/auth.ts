import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { ApiError } from "../lib/errors";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token", "NO_TOKEN");
  }

  let sub: string;
  let tv: number;
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Bad payload");
    }
    sub = payload.sub;
    // pre-S2 tokens carry no tv; they map to version 0
    tv = typeof payload.tv === "number" ? payload.tv : 0;
  } catch {
    throw ApiError.unauthorized("Invalid or expired token", "BAD_TOKEN");
  }

  // Revocation check (AUDIT S2): the token's version must match the user's
  // current one — logout/password-reset bump it and orphan old tokens.
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { tokenVersion: true },
  });
  if (!user || user.tokenVersion !== tv) {
    throw ApiError.unauthorized("Invalid or expired token", "BAD_TOKEN");
  }

  req.userId = sub;
  next();
}
