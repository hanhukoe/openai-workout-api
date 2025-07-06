// 🎯 Workout Plan Generator (OpenAI → Supabase)
// Ensure: .env has OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

    const [intakeData, gyms, boutiques, equipment, limitationsData, benchmarkData] = await Promise.all([
      fetchFromSupabase("program_intake"),
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
    const limitations = limitationsData[0] || {};
    const benchmarks = benchmarkData[0] || {};

    const clientProfile = {
      user_id,
      goal: intake.primary_goal,
      target_date: intake.primary_goal_date,
      program_duration_weeks: intake.program_duration_weeks,
      days_per_week: 4,
      session_length_minutes: 45,
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.equipment_list || []),
    };

    const prompt = `
You are an expert personal trainer. 
Based on the client's profile, generate a detailed 12-week workout program structured in JSON format only. 
DO NOT include explanations, markdown headers, or non-JSON text. 
Your output must begin with "{" and end with "}". 
The structure must be: {
  "program_title": "...",
  "blocks": [
    {
      "title": "...",
      "weeks": [
        {
          "week_number": 1,
          "days": [
            {
              "day": "Monday",
              "focus_area": "...",
              "duration_min": 45,
              "structure_type": "training",
              "warmup": [ { "name": "...", "sets": 2, "reps": 10 } ],
              "main_set": [ { "name": "...", "sets": 3, "reps": 12 } ],
              "cooldown": [ { "name": "..." } ],
              "quote": "..."
            }
          ]
        }
      ]
    }
  ]
}`;

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
          { role: "user", content: `Client profile:\n${JSON.stringify(clientProfile, null, 2)}` },
          { role: "user", content: "Reminder: ONLY return valid JSON. No explanations or headers." }
        ],
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    let workoutJson;
    try {
      const sanitized = rawContent
        .replace(/^```(?:json)?/gm, "")
        .replace(/```$/gm, "")
        .replace(/^#+\s.+$/gm, "")
        .trim();

      const jsonStart = sanitized.indexOf("{");
      const jsonEnd = sanitized.lastIndexOf("}") + 1;
      if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error("No JSON object boundaries found.");

      const jsonString = sanitized.slice(jsonStart, jsonEnd);
      const cleanJson = jsonString.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      workoutJson = JSON.parse(cleanJson);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response:", err.message);
      return res.status(500).json({ error: "Invalid JSON from OpenAI", details: err.message });
    }

    if (!workoutJson || !Array.isArray(workoutJson.blocks)) {
      return res.status(500).json({ error: "OpenAI did not return a valid workout program." });
    }

    for (const block of workoutJson.blocks) {
      if (!Array.isArray(block.weeks)) block.weeks = [];

      for (const week of block.weeks) {
        if (!Array.isArray(week.days)) week.days = [];

        for (const day of week.days) {
          day.warmup = Array.isArray(day.warmup) ? day.warmup : [];
          day.main_set = Array.isArray(day.main_set) ? day.main_set : [];
          day.cooldown = Array.isArray(day.cooldown) ? day.cooldown : [];
          day.duration_min = typeof day.duration_min === "number" ? day.duration_min : 45;
          day.focus_area = day.focus_area || "General Fitness";
          day.structure_type = day.structure_type || "training";
          day.quote = day.quote || "";
        }
      }
    }

    // ✅ Supabase Insertion Starts Here
    const program_id = crypto.randomUUID();

    await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([{
        program_id,
        user_id,
        intake_id: intake.intake_id,
        program_title: workoutJson.program_title,
        goal_summary: intake.primary_goal,
        program_start_date: intake.primary_goal_date,
        program_duration_weeks: intake.program_duration_weeks,
        is_active: true,
        created_at: new Date().toISOString(),
        version_number: 1
      }])
    });

    for (let blockIndex = 0; blockIndex < workoutJson.blocks.length; blockIndex++) {
      const block = workoutJson.blocks[blockIndex];
      const block_id = crypto.randomUUID();

      await fetch(`${SUPABASE_URL}/rest/v1/program_blocks`, {
        method: "POST",
        headers: headersWithAuth,
        body: JSON.stringify([{
          block_id,
          program_id,
          user_id,
          block_title: block.title,
          block_order: blockIndex + 1,
          created_at: new Date().toISOString()
        }])
      });

      for (const week of block.weeks) {
        for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
          const day = week.days[dayIndex];
          const schedule_id = crypto.randomUUID();
          const workout_id = crypto.randomUUID();

          await fetch(`${SUPABASE_URL}/rest/v1/program_schedule`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify([{
              schedule_id,
              user_id,
              program_id,
              block_id,
              day_number: dayIndex + 1,
              week_number: week.week_number,
              schedule_date: null,
              focus_area: day.focus_area,
              is_rest_day: day.structure_type === "recovery" || day.duration_min === 0,
              is_generated: true,
              created_at: new Date().toISOString()
            }])
          });

          await fetch(`${SUPABASE_URL}/rest/v1/workouts`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify([{
              workout_id,
              user_id,
              schedule_id,
              duration_minutes: day.duration_min,
              quote: day.quote,
              intensity: day.structure_type,
              version_number: 1,
              is_active: true,
              created_at: new Date().toISOString()
            }])
          });

          const insertExerciseBlock = async (title, type, exercises) => {
            if (!exercises || exercises.length === 0) return;
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

            const formattedExercises = exercises.map((ex, i) => ({
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
              exercise_duration_seconds: ex.duration_per_set_sec ?? null,
              exercise_speed: ex.speed ?? null,
              exercise_distance_meters: ex.distance_m ?? null,
              exercise_notes: ex.notes || "",
              exercise_description: ""
            }));

            await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
              method: "POST",
              headers: headersWithAuth,
              body: JSON.stringify(formattedExercises)
            });
          };

          await insertExerciseBlock("Warmup", "Warmup", day.warmup);
          await insertExerciseBlock("Main Set", "Workout", day.main_set);
          await insertExerciseBlock("Cooldown", "Cooldown", day.cooldown);
        }
      }
    }

    res.json({
      message: "✅ Workout program generated and saved to Supabase!",
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
