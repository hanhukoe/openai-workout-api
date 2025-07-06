
// 🎯 Debugged and Fixed Workout Plan Generator (OpenAI → Supabase)

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

  console.log(`🧱 Inserting exercise block: ${title} (${type}) with ${exercises.length} exercises`);

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

    const [intakeData, gyms, boutiques, equipment, limitationsData, benchmarkData] = await Promise.all([
      fetchFromSupabase("program_intake"),
      fetchFromSupabase("full_service_gyms"),
      fetchFromSupabase("boutique_credits"),
      fetchFromSupabase("home_equipment"),
      fetchFromSupabase("limitations"),
      fetchFromSupabase("benchmark_log"),
    ]);

    if (!intakeData || intakeData.length === 0) {
      console.warn("⚠️ Intake data not found");
      return res.status(404).json({ error: "Intake data not found" });
    }

    const intake = intakeData[0];
    const startDate = new Date(intake.primary_goal_date);
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
You are an expert personal trainer. Generate a JSON-only 12-week program with 7 days/week.
Each "day" should include: day name, focus_area, duration, structure_type, warmup, main_set, cooldown, and quote.
Respond ONLY with JSON starting with { and ending with }.
`;

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

    let workoutJson;
    try {
      const sanitized = rawContent
        .replace(/^```(?:json)?/gm, "")
        .replace(/```$/gm, "")
        .trim();
      const jsonStart = sanitized.indexOf("{");
      const jsonEnd = sanitized.lastIndexOf("}") + 1;
      const jsonString = sanitized.slice(jsonStart, jsonEnd);
      workoutJson = JSON.parse(jsonString);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response:", err.message);
      return res.status(500).json({ error: "Invalid JSON from OpenAI", details: err.message });
    }

    if (!workoutJson.blocks || workoutJson.blocks.length === 0) {
      console.error("❌ No blocks returned from OpenAI");
      return res.status(500).json({ error: "No workout blocks found." });
    }

    const program_id = crypto.randomUUID();

    console.log("📦 Inserting program metadata...");
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

    for (let blockIndex = 0; blockIndex < workoutJson.blocks.length; blockIndex++) {
      const block = workoutJson.blocks[blockIndex];
      const block_id = crypto.randomUUID();
      const blockStart = new Date(startDate);
      blockStart.setDate(startDate.getDate() + blockIndex * 7);
      const blockEnd = new Date(blockStart);
      blockEnd.setDate(blockEnd.getDate() + 6);

      console.log(`📚 Inserting block ${block.title} (${blockIndex + 1})...`);

      await fetch(`${SUPABASE_URL}/rest/v1/program_blocks`, {
        method: "POST",
        headers: headersWithAuth,
        body: JSON.stringify([{
          block_id,
          program_id,
          user_id,
          block_title: block.title,
          block_order: blockIndex + 1,
          block_start: blockStart.toISOString().split("T")[0],
          block_end: blockEnd.toISOString().split("T")[0],
          block_description: block.description || "",
          created_at: new Date().toISOString()
        }])
      });

      const weeks = Array.isArray(block.weeks) ? block.weeks : [];
      for (const week of weeks) {
        const days = Array.isArray(week.days) ? week.days : [];
        for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
          const day = days[dayIndex];
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
              day_of_week: WEEKDAYS[dayIndex],
              focus_area: day.focus_area || "",
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
              duration_minutes: day.duration_min || 0,
              quote: day.quote || "",
              intensity: day.structure_type || "training",
              version_number: 1,
              is_active: true,
              created_at: new Date().toISOString()
            }])
          });

          await insertExerciseBlock("Warmup", "Warmup", day.warmup || [], user_id, workout_id, schedule_id);
          await insertExerciseBlock("Main Set", "Workout", day.main_set || [], user_id, workout_id, schedule_id);
          await insertExerciseBlock("Cooldown", "Cooldown", day.cooldown || [], user_id, workout_id, schedule_id);
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
