import express from "express";
import workoutRoutes from "./routes/workout.route.js";

const app = express();

// Parse incoming JSON
app.use(express.json());

// Mount routes
app.use("/workout", workoutRoutes);

// Optional base route
app.get("/", (req, res) => {
  res.send("👋 HYROX Workout API is running!");
});

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;
