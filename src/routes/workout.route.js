import express from "express";
import { generateWorkoutPlan } from "../controllers/workout.controller.js";
import { generateWorkoutPlan, processProgramFromLog } from "../controllers/workout.controller.js";

const router = express.Router();

router.post("/generate", generateWorkoutPlan);
router.post("/process-log", processProgramFromLog); // 🆕

export default router;
