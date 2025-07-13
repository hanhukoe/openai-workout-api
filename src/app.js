import express from "express";
import workoutRoutes from "./routes/workout.route.js";

const app = express();

// Middleware to parse incoming JSON bodies
app.use(express.json());

// Mounts routes defined in workout.route.js at "/workout"
app.use("/workout", workoutRoutes);

export default app;
