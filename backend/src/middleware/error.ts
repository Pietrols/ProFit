import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";

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

  // Correlate the client-visible error with the server log without leaking
  // internals: the id travels both ways, the details stay here.
  const errorId = randomUUID();
  logger.error(
    { errorId, method: _req.method, path: _req.path, err },
    "unhandled error",
  );
  res.status(500).json({
    error: { code: "INTERNAL", message: `Internal server error (ref ${errorId})` },
  });
}
