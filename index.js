
// 🎯 Workout Plan Generator (OpenAI → Supabase) - Debug V4
// Fixes: template literal issue, logging, OpenAI prompt logic, insertion added back in, handles rest days

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
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const insertExerciseBlock = async (title, type, exercises, user_id, workout_id, schedule_id) => {
  if (!Array.isArray(exercises) || exercises.length === 0) return;
  const block_id = crypto.randomUUID();

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

    console.log("📥 Fetching intake and user context from Supabase...");
    const [intakeData, availabilityData, gyms, boutiques, equipment, limitationsData, benchmarkData] = await Promise.all([
      fetchFromSupabase("program_intake"),
      fetchFromSupabase("availability"),
      fetchFromSupabase("full_service_gyms"),
      fetchFromSupabase("boutique_credits"),
      fetchFromSupabase("home_equipment"),
      fetchFromSupabase("limitations"),
      fetchFromSupabase("benchmark_log"),
    ]);

    if (!intakeData || intakeData.length === 0) {
      return res.status(404).json({ error: "Intake data not found" });
    }

    const intake = intakeData[0];
    const availability = availabilityData[0] || {};
    const startDate = new Date(intake.primary_goal_date);
    const limitations = limitationsData[0] || {};
    const benchmarks = benchmarkData[0] || {};

    const clientProfile = {
      user_id,
      goal: intake.primary_goal,
      target_date: intake.primary_goal_date,
      program_duration_weeks: intake.program_duration_weeks,
      days_per_week: availability.days_per_week ?? 4,
      session_length_minutes: availability.session_length_minutes ?? 45,
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.equipment_list || []),
    };

    const prompt = `You are an expert personal trainer.

Generate a valid JSON object only. The program must span ${clientProfile.program_duration_weeks} weeks, with 7 days per week. Each day should include:
- day name (e.g., "Monday")
- focus_area
- duration_min
- structure_type ("training", "recovery", etc.)
- warmup (array of exercises with name, sets, reps)
- main_set (array of exercises with name, sets, reps)
- cooldown (array of exercises with name)
- quote

The structure must be:
{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "description": "string",
      "weeks": [
        {
          "week_number": number,
          "days": [ ... 7 objects ... ]
        }
      ]
    }
  ]
}

Return only valid JSON. No extra text, no markdown. Begin with '{' and end with '}'.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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

    console.log("📤 Raw OpenAI content snippet:", rawContent.slice(0, 300));

    let workoutJson;
    try {
      const jsonStart = rawContent.indexOf("{");
      const jsonEnd = rawContent.lastIndexOf("}") + 1;
      const jsonString = rawContent.slice(jsonStart, jsonEnd);
      workoutJson = JSON.parse(jsonString);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response:", err.message);
      return res.status(500).json({ error: "Invalid JSON from OpenAI", details: err.message });
    }

    if (!workoutJson || !Array.isArray(workoutJson.blocks) || workoutJson.blocks.length === 0) {
      console.error("❌ No blocks returned from OpenAI:", JSON.stringify(workoutJson, null, 2));
      return res.status(500).json({ error: "OpenAI response missing workout blocks." });
    }

    res.json({
      message: "✅ Workout program parsed successfully!",
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
