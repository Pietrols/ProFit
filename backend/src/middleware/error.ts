import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: { code: "BAD_JSON", message: "Request body is not valid JSON" },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL", message: "Internal server error" },
  });
}
