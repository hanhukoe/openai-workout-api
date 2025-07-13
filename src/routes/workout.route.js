import express from "express";
import { generateWorkoutPlan } from "../controllers/workout.controller.js";

const router = express.Router();

router.post("/generate", generateWorkoutPlan);

export default router;
