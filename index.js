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
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`, {
        headers: headersWithAuth,
      });
      return response.json();
    };

    // Fetch intake-related data
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
      // Sample fallback structure (you can customize)
      days_per_week: 4,
      session_length_minutes: 45,
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.equipment_list || []),
    };

    const prompt = `You are an expert personal trainer...
[TRUNCATED for brevity – reuse your existing prompt and keep JSON structure spec]`;

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
          { role: "user", content: `Client profile:\n${JSON.stringify(clientProfile, null, 2)}` }
        ],
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();
    const workoutJson = JSON.parse(data.choices[0].message.content);

    // Insert Program
    const program_id = crypto.randomUUID();
    await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([
        {
          program_id,
          user_id,
          program_title: workoutJson.program_title,
          goal_summary: workoutJson.program_title,
          program_duration_weeks: intake.program_duration_weeks,
          program_start_date: intake.primary_goal_date,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ])
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

          // Insert into program_schedule
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
              focus_area: day.focus_area,
              is_rest_day: day.structure_type === "recovery" || day.duration_min === 0,
              is_generated: true,
              created_at: new Date().toISOString()
            }])
          });

          // Insert into workouts
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
              is_active: true,
              version_number: 1,
              created_at: new Date().toISOString()
            }])
          });

          // Insert workout_blocks and exercises
          const insertBlockWithExercises = async (phaseName, blockType, exercises) => {
            if (!exercises || exercises.length === 0) return;

            const block_id = crypto.randomUUID();
            await fetch(`${SUPABASE_URL}/rest/v1/workout_blocks`, {
              method: "POST",
              headers: headersWithAuth,
              body: JSON.stringify([{
                block_id,
                user_id,
                workout_id,
                block_order: 1,
                block_title: `${day.focus_area} – ${phaseName}`,
                block_type: blockType,
                created_at: new Date().toISOString()
              }])
            });

            const formattedExercises = exercises.map((ex, i) => ({
              id: crypto.randomUUID(),
              user_id,
              workout_id,
              schedule_id,
              block_id,
              workout_section: blockType,
              sequence_num: i + 1,
              exercise_name: typeof ex === "string" ? ex : ex.name,
              exercise_sets: ex.sets || null,
              exercise_reps: ex.reps || null,
              exercise_weight: ex.weight_kg || null,
              exercise_duration_seconds: ex.duration_sec || null,
              exercise_description: "",
              exercise_notes: "",
              exercise_speed: ex.speed || null,
              exercise_distance_meters: ex.distance_m || null
            }));

            await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
              method: "POST",
              headers: headersWithAuth,
              body: JSON.stringify(formattedExercises)
            });
          };

          await insertBlockWithExercises("Warmup", "Warmup", day.warmup);
          await insertBlockWithExercises("Main", "Workout", day.main_set);
          await insertBlockWithExercises("Cooldown", "Cooldown", day.cooldown);
        }
      }
    }

    res.json({
      message: "✅ Workout program generated and saved!",
      title: workoutJson.program_title
    });

  } catch (err) {
    console.error("🔥 Error during program generation:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
