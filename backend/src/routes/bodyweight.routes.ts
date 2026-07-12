import { Router } from "express";
import * as bodyweightController from "../controllers/bodyweight.controller";
import { requireAuth } from "../middleware/auth";

export const bodyweightRouter = Router();

bodyweightRouter.use(requireAuth);
bodyweightRouter.post("/sync", bodyweightController.sync);
bodyweightRouter.get("/", bodyweightController.list);
