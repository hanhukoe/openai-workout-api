// 🎯 Workout Plan Generator (OpenAI → Supabase) - ES Module Compatible

import express from "express";
import fetch from "node-fetch";
import { config } from "dotenv";
import crypto from "crypto";
import generateInitialPlanRoute from "./routes/generateInitialPlan.js";

config();

const app = express();
app.use(express.json());

// 🛠️ Mount your custom route
app.use("/", generateInitialPlanRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
