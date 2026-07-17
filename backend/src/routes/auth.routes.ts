import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { authRateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

// AUDIT S1: brute-force / mass-registration throttles. Windows are generous
// for real users (fat-fingered passwords) and hostile to scripts.
const loginLimit = authRateLimit({
  scope: "login",
  maxPerIp: 20,
  maxPerEmail: 10,
  windowMs: 15 * 60 * 1000,
});
const registerLimit = authRateLimit({
  scope: "register",
  maxPerIp: 10,
  maxPerEmail: 3,
  windowMs: 60 * 60 * 1000,
});

authRouter.post("/register", registerLimit, authController.register);
authRouter.post("/login", loginLimit, authController.login);
authRouter.post("/logout", requireAuth, authController.logout);
