// 🎯 Workout Plan Generator (OpenAI → Supabase) - V9
// Re-enables inserts, includes availability, limitations, preferences in prompt

import express from "express";
import fetch from "node-fetch";
import { config } from "dotenv";
import crypto from "crypto";
config();

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const insertExerciseBlock = async (title, type, exercises, user_id, workout_id, schedule_id) => {
  if (!Array.isArray(exercises) || exercises.length === 0) return;
  const block_id = crypto.randomUUID();

  console.log("🧱 Inserting workout block:", title);

  await fetch(`${SUPABASE_URL}/rest/v1/workout_blocks`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify([{
      block_id,
      workout_id,
      user_id,
      block_order: 1,
      block_title: title,
      block_type: type,
      rounds: null,
      duration_seconds: null,
      notes: "",
      created_at: new Date().toISOString()
    }])
  });

  const formattedExercises = exercises.map((ex, i) => {
    const durationInSeconds =
      ex.duration_sec != null
        ? ex.duration_sec
        : ex.duration_min != null
        ? ex.duration_min * 60
        : null;

    return {
      id: crypto.randomUUID(),
      user_id,
      workout_id,
      schedule_id,
      block_id,
      workout_section: type,
      sequence_num: i + 1,
      exercise_name: ex.name || "Unnamed",
      exercise_sets: ex.sets ?? null,
      exercise_reps: ex.reps ?? null,
      exercise_weight: ex.weight_kg ?? null,
      exercise_duration_seconds: durationInSeconds,
      exercise_speed: ex.speed ?? null,
      exercise_distance_meters: ex.distance_m ?? null,
      exercise_notes: ex.notes || "",
      exercise_description: ""
    };
  });

  await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify(formattedExercises)
  });
};

app.post("/generate-plan", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    const fetchFromSupabase = async (table) => {
      const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`;
      const response = await fetch(url, { headers: headersWithAuth });
      if (!response.ok) return null;
      return await response.json();
    };

    console.log("📥 Fetching user context...");
    const [intakeData, gyms, boutiques, equipment, limitationsData, benchmarkData, availabilityData] = await Promise.all([
      fetchFromSupabase("program_intake"),
      fetchFromSupabase("full_service_gyms"),
      fetchFromSupabase("boutique_credits"),
      fetchFromSupabase("home_equipment"),
      fetchFromSupabase("limitations"),
      fetchFromSupabase("benchmark_log"),
      fetchFromSupabase("availability")
    ]);

    if (!intakeData || intakeData.length === 0) {
      return res.status(404).json({ error: "Intake data not found" });
    }

    const intake = intakeData[0];
    const startDate = new Date(intake.primary_goal_date);
    const limitations = limitationsData[0] || {};
    const benchmarks = benchmarkData[0] || {};
    const availability = availabilityData[0] || {};

    const clientProfile = {
      user_id,
      goal: intake.primary_goal,
      target_date: intake.primary_goal_date,
      program_duration_weeks: intake.program_duration_weeks,
      days_per_week: intake.days_per_week ?? 4,
      session_length_minutes: intake.session_length_minutes ?? 45,
      unavailable_days: availability.unavailable_days || [],
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.equipment_list || []),
    };

    const prompt = `You are a certified personal trainer.

Using the user's profile, design a personalized, progressive training program over ${clientProfile.program_duration_weeks} weeks. Structure it into logical blocks (e.g., Base, Build, Peak). Each week has 7 days. Each day includes:
- day_name (Monday, Tuesday, etc.)
- focus_area
- duration_min
- structure_type (e.g., training, recovery)
- warmup (array of exercises: name, sets, reps)
- main_set (same format)
- cooldown (array: name)
- quote

❗ DO NOT assign workouts on unavailable days: ${clientProfile.unavailable_days.join(", ") || "none"}.
❗ Accommodate these limitations: ${clientProfile.limitations || "none"}.
💡 Keep sessions to ~${clientProfile.session_length_minutes} min and ${clientProfile.days_per_week} days/week.
🏋️ Use appropriate equipment: ${clientProfile.home_equipment.join(", ") || "bodyweight only"}.

Return a valid JSON object only. Start with { and end with }.`

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Client profile:
${JSON.stringify(clientProfile, null, 2)}` }
        ],
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    console.log("📤 FULL OpenAI response (truncated):", rawContent.slice(0, 1000));

    let workoutJson;
    try {
      const jsonStart = rawContent.indexOf("{");
      const jsonEnd = rawContent.lastIndexOf("}") + 1;
      const jsonString = rawContent.slice(jsonStart, jsonEnd);
      workoutJson = JSON.parse(jsonString);
    } catch (err) {
      console.error("❌ JSON parse failed:", err.message);
      return res.status(500).json({ error: "Invalid JSON from OpenAI" });
    }

    if (!workoutJson || !Array.isArray(workoutJson.blocks) || workoutJson.blocks.length === 0) {
      console.error("❌ OpenAI returned no blocks:", JSON.stringify(workoutJson));
      return res.status(500).json({ error: "Missing or empty blocks array from OpenAI." });
    }

    const program_id = crypto.randomUUID();
    console.log("💾 Inserting program:", workoutJson.program_title);

    await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([{
        program_id,
        user_id,
        intake_id: intake.intake_id,
        program_title: workoutJson.program_title,
        goal_summary: intake.primary_goal,
        program_start_date: startDate.toISOString().split("T")[0],
        program_duration_weeks: intake.program_duration_weeks,
        is_active: true,
        created_at: new Date().toISOString(),
        version_number: 1
      }])
    });

    res.json({
      message: "✅ Workout program parsed and inserted successfully!",
      title: workoutJson.program_title,
      block_count: workoutJson.blocks.length
    });

  } catch (err) {
    console.error("🔥 Unexpected Error:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
