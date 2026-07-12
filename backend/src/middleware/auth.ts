import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../lib/errors";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token", "NO_TOKEN");
  }

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Bad payload");
    }
    req.userId = payload.sub;
  } catch {
    throw ApiError.unauthorized("Invalid or expired token", "BAD_TOKEN");
  }
  next();
}
