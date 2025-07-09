// 🎯 Workout Plan Generator (OpenAI → Supabase)

import express from "express";
import { config } from "dotenv";
import generateInitialPlanRoute from "./routes/generateInitialPlan.js";

config(); // Load .env variables

const app = express();
app.use(express.json());

// ✅ Register main route
app.use("/", generateInitialPlanRoute);

// 🩺 Optional: Health check route
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// 🚀 Start server
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
