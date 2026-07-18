import { Router } from "express";
import * as controller from "../controllers/userWorkouts.controller";
import { requireAuth } from "../middleware/auth";

export const userWorkoutsRouter = Router();

userWorkoutsRouter.use(requireAuth);
userWorkoutsRouter.post("/", controller.create);
userWorkoutsRouter.get("/mine", controller.mine);
userWorkoutsRouter.get("/public", controller.publicList);
userWorkoutsRouter.post("/suggest-image", controller.suggestImage);
userWorkoutsRouter.get("/:id", controller.getOne);
userWorkoutsRouter.post("/:id/copy", controller.copy);
userWorkoutsRouter.post("/:id/report", controller.report);
