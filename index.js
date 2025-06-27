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

    const [intakeData, gyms, boutiques, equipment, limitationsData, benchmarkData] = await Promise.all([
      fetchFromSupabase("02_01_program_intake"),
      fetchFromSupabase("01_03_01_full_service_gyms"),
      fetchFromSupabase("01_03_02_boutique_credits"),
      fetchFromSupabase("01_03_03_home_equipment_items"),
      fetchFromSupabase("01_05_limitations"),
      fetchFromSupabase("01_06_benchmark_log"),
    ]);

    if (!intakeData || intakeData.length === 0) {
      return res.status(404).json({ error: "Intake data not found" });
    }

    const intake = intakeData[0];
    const limitations = limitationsData[0] || {};
    const benchmarks = benchmarkData[0] || {};

    const clientProfile = {
      user_id,
      goal: intake.goal,
      target_date: intake.target_date,
      program_duration_weeks: intake.program_duration_weeks,
      days_per_week: intake.days_per_week,
      session_length_minutes: intake.workout_time,
      limitations: `${intake.other_blackouts || ""} ${intake.restrictions_check || ""}`.trim(),
      interests: limitations.interests || [],
      workout_styles: limitations.workout_styles || [],
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.category || []),
      fitness_level: benchmarks.fitness_level || "Intermediate",
      benchmarks: {
        "1km": benchmarks.benchmark_1km || null,
        "5km": benchmarks.benchmark_5km || null,
        squatWeight: benchmarks.benchmark_squatWeight || null,
        workoutWeight: benchmarks.benchmark_workoutWeight || null,
      }
    };

    const prompt = `
You are an expert in:
- Athletic personal training
- Functional coaching and race prep (e.g., HYROX, Spartan)
- Physical therapy and injury prevention
- Nutrition for performance and recovery
- Your coach persona is auto-selected based on client goal (e.g., Triathlon Coach for endurance prep, CrossFit L2 for strength, etc.)

You have 10+ years of experience designing progressive, individualized training programs.

Using the profile below, create a ${intake.program_duration_weeks}-week fitness program. The plan must follow a block/phase structure appropriate to the client’s fitness level, program length, and goal.

Also include a motivational quote each day aligned with that day’s theme.

Return the complete plan as a valid JSON object with this structure:
{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "weeks": [
        {
          "week_number": integer,
          "days": [
            {
              "day": "string",
              "focus_area": "string",
              "duration_min": integer,
              "structure_type": "string",
              "warmup": [ { "name": "string" }, ... ],
              "main_set": [ { "name": "string", "sets": integer, "reps": integer, "rest_after_sec": integer }, ... ],
              "cooldown": [ { "name": "string" }, ... ],
              "quote": "string"
            }
          ]
        }
      ]
    }
  ]
}
Only return the JSON object. Do not include commentary or formatting explanations.
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
          { role: "user", content: `Client profile:\n${JSON.stringify(clientProfile, null, 2)}` }
        ],
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();
    console.log("🧠 OpenAI Raw Response:", data.choices[0].message.content);
    const workoutJson = JSON.parse(data.choices[0].message.content);

    // Insert program
    const program_id = crypto.randomUUID();
    await fetch(`${SUPABASE_URL}/rest/v1/02_02_programs`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([
        {
          program_id,
          user_id,
          goal_summary: workoutJson.program_title,
          duration_weeks: intake.program_duration_weeks,
          is_active: true,
        },
      ]),
    });

    for (let blockIndex = 0; blockIndex < workoutJson.blocks.length; blockIndex++) {
      const block = workoutJson.blocks[blockIndex];
      const block_id = crypto.randomUUID();

      await fetch(`${SUPABASE_URL}/rest/v1/02_03_blocks`, {
        method: "POST",
        headers: headersWithAuth,
        body: JSON.stringify([{ block_id, program_id, block_order: blockIndex + 1, title: block.title }]),
      });

      for (let week of block.weeks) {
        for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
          const day = week.days[dayIndex];
          const schedule_id = crypto.randomUUID();
          const workout_id = crypto.randomUUID();

          await fetch(`${SUPABASE_URL}/rest/v1/02_04_schedule`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify([
              {
                schedule_id,
                block_id,
                day_number: dayIndex + 1,
                week_number: week.week_number,
                focus_area: day.focus_area,
                is_rest_day: day.structure_type === "recovery" || day.duration_min === 0,
              },
            ]),
          });

          await fetch(`${SUPABASE_URL}/rest/v1/02_05_workout`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify([
              {
                workout_id,
                schedule_id,
                duration_minutes: day.duration_min,
                ai_generated: true,
                is_active: true,
                quote: day.quote || null,
              },
            ]),
          });

          const insertBlockWithExercises = async (phaseName, blockType, exercises) => {
            if (!exercises || exercises.length === 0) return;
            const blockID = crypto.randomUUID();

            await fetch(`${SUPABASE_URL}/rest/v1/workout_blocks`, {
              method: "POST",
              headers: headersWithAuth,
              body: JSON.stringify([
                {
                  id: blockID,
                  workout_id,
                  block_order: 1,
                  block_type: blockType,
                  title: `${day.focus_area} – ${phaseName}`,
                },
              ]),
            });

            const formattedExercises = exercises.map((ex, index) => {
              return {
                id: crypto.randomUUID(),
                workout_block_id: blockID,
                exercise_order: index + 1,
                name: typeof ex === "string" ? ex : ex.name,
                sets: ex.sets || null,
                reps: ex.reps || null,
                rest_after_sec: ex.rest_after_sec || null,
                duration_sec: ex.duration_sec || null,
                distance_m: ex.distance_m || null,
                weight_kg: ex.weight_kg || null,
                speed: ex.speed || null,
                side_specific: ex.side_specific || false,
              };
            });

            await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
              method: "POST",
              headers: headersWithAuth,
              body: JSON.stringify(formattedExercises),
            });
          };

          await insertBlockWithExercises("Warmup", "warmup", day.warmup);
          await insertBlockWithExercises("Main", "main", day.main_set);
          await insertBlockWithExercises("Cooldown", "cooldown", day.cooldown);
        }
      }
    }

    res.json({
      message: "Workout program generated and saved successfully!",
      title: workoutJson.program_title,
    });
  } catch (err) {
    console.error("🔥 Full Error:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
