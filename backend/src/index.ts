import "dotenv/config";
import { createApp } from "./app";
import { logger } from "./lib/logger";

// AUDIT S2: never boot production with a missing or placeholder JWT secret.
const secret = process.env.JWT_SECRET;
if (!secret || secret === "change-me" || secret.length < 32) {
  const msg =
    "JWT_SECRET is missing, the placeholder, or under 32 chars — refusing to start.";
  if (process.env.NODE_ENV === "production") {
    logger.fatal(msg);
    process.exit(1);
  }
  logger.warn(`${msg} (allowed outside production — fix before deploying)`);
}

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  logger.info({ port }, "ProFit backend listening");
});
