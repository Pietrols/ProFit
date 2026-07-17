// Structured logging (AUDIT S8). JSON in production, pretty in dev.
// Redaction is enforced here so no call site can accidentally log a secret;
// bodies, chat content, and health data values are never passed to the
// logger in the first place (see AUDIT.md "Logging fix").
import { createHash } from "node:crypto";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "authorization",
      "*.authorization",
      "password",
      "*.password",
      "token",
      "*.token",
      "email",
      "*.email",
    ],
    censor: "[redacted]",
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

/** Stable 8-char handle for an email so auth events correlate without PII. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 8);
}
