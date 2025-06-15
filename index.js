import express from "express";
import fetch from "node-fetch";
import { config } from "dotenv";
config();

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔍 Test route (still here if needed)
app.get("/test-supabase", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    const userRes = await fetch(`${SUPABASE_URL}/rest/v1/00_users?user_id=eq.${user_id}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const intakeRes = await fetch(`${SUPABASE_URL}/rest/v1/02_01_program_intake?user_id=eq.${user_id}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const user = await userRes.json();
    const intake = await intakeRes.json();

    return res.json({ user, intake });
  } catch (err) {
    console.error("Supabase fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch data from Supabase" });
  }
});

// 🚀 Main route to generate plan
app.post("/generate-plan", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    // Helper to fetch from Supabase
    const fetchFromSupabase = async (table) => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
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

    // 💡 Build the anonymized client profile
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
You are a world-class fitness coach.

Below is a fully anonymized profile of a client. Using this, generate a ${intake.program_duration_weeks}-week training program tailored to their availability, goals, and fitness benchmarks.

Only return a valid JSON object that follows the structure below. Do not include explanations or commentary.

-- CLIENT PROFILE --
${JSON.stringify(clientProfile, null, 2)}

-- FORMAT & STRUCTURE --
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
              "day": "string (e.g., Monday)",
              "focus_area": "string",
              "duration_min": integer,
              "warmup": ["string", ...],
              "main_set": ["string", ...],
              "cooldown": ["string", ...]
            }
          ]
        }
      ]
    }
  ]
}
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      console.error("OpenAI response error:", data);
      return res.status(500).json({ error: "Failed to generate plan" });
    }

    const workoutJson = JSON.parse(data.choices[0].message.content);

    // Save summary of plan to programs table
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/02_02_programs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          user_id: user_id,
          goal_summary: workoutJson.program_title,
          duration_weeks: intake.program_duration_weeks,
          is_active: true,
        },
      ]),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error("Failed to insert program:", errText);
      return res.status(500).json({ error: "Failed to insert program" });
    }

    res.json({
      message: "Workout program created successfully!",
      title: workoutJson.program_title,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// 🧪 Test insert route
app.post("/test-supabase-insert", async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/02_02_programs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify([
        {
          user_id,
          goal_summary: "Test Program - Hansy Hype Edition",
          duration_weeks: 8,
          is_active: true
        }
      ])
    });

    const result = await insertRes.json();

    if (!insertRes.ok) {
      console.error("Insert failed:", result);
      return res.status(500).json({ error: "Failed to insert test program", details: result });
    }

    return res.json({
      message: "Test program inserted successfully!",
      inserted: result
    });
  } catch (err) {
    console.error("Insert error:", err);
    return res.status(500).json({ error: "Something went wrong during insert" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
