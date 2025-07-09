// 🎯 Workout Plan Generator (OpenAI → Supabase)

const express = require("express");
const dotenv = require("dotenv");
const generateInitialPlanRoute = require("./routes/generateInitialPlan.js");

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Register your main route
app.use("/", generateInitialPlanRoute);

// 🩺 Optional: health check route
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// 🚀 Start server
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
