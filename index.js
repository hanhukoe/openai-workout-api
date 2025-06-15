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

-- CLIENT PROFILE --
${JSON.stringify(clientProfile, null, 2)}

-- BLOCK STRUCTURE RULES
- Use a block breakdown like 4+4+4, 5+4+4+3, etc.
- Each block must have a clear focus (e.g., base, build, peak, taper)
- Choose the block structure to match:
  1. Total program duration
  2. Client’s goal (e.g., taper for event prep)
  3. Fitness level (e.g., longer base for beginners)

-- WORKOUT DESIGN – WEEKLY FORMAT
- Return a structured day-by-day table (Mon–Sun)
- Display all 7 days each week (no gaps)
- Each active day must include:
  - Warm-up
  - Clearly themed workout with specific exercises
  - Cooldown and/or mobility
  - Estimated duration
  - A "structure_type" field to classify the workout type. Use one of the following values:
    ["straight_sets", "superset", "circuit", "amrap", "emom", "steady_state", "drop_set", "pyramid", "cluster", "recovery"]

-- SESSION DURATION RULES
- If a number is provided (e.g., 45), assume range of 35–55 minutes
- If a range is provided (e.g., 45–60), respect that range
- If not defined, default to ~45 minutes ±10
- If duration exceeds 55 minutes, explain why

-- EXCEPTIONS TO WARM-UP/COOLDOWN
- Do not include warm-up or cooldown for:
  - Prebuilt studio classes (e.g., Barry’s, Spin, Yoga)
  - Non-gym-based light recovery activities (e.g., outdoor walk, casual home yoga)
- Gym-based conditioning sessions (e.g., treadmill, elliptical, circuits) must include warm-up and cooldown unless labeled as a studio class

-- SCHEDULING RULES
- Respect stated training days/week:
  - If a range is given (e.g., 3–5), vary it week to week without exceeding the upper bound
  - If a fixed number is given (e.g., 4), deliver exactly that number each week
- Include 1–2 rest days per week
- Never allow more than 2 consecutive rest days, even across week boundaries
- Optional mobility or recovery sessions are allowed only if they do not exceed the client’s max training days/week

-- OPTIONAL WORKOUTS
- Must include:
  - Theme label
  - Workout description
  - Duration
  - Warm-up/cooldown only if intensity requires it

-- EQUIPMENT & GYM LOGIC
- Do not assign home-based workouts unless home equipment is listed
- If a full-service gym is listed, assume access to it for all custom workouts
- If boutique studio credits are listed:
  - Do not exceed the total across the entire program
  - Only assign classes that match the training goal and that day’s theme
  - Label simply as: “Barry’s Class” or “Spin Class” (no breakdown of class content)
  - If none are listed, assume zero boutique access
  - If credits are exhausted:
    - Do NOT assign additional studio classes
    - Do NOT use labels like “Studio Class (No Credit)” or “Barry’s (No Credits Left)”
    - Instead, create a gym-based circuit or cardio session and label accordingly

-- GOAL ALIGNMENT & TRAINING STYLE
- Plan must reflect the client’s primary goal and preferred style(s)
- Apply progressive overload within each block:
  - For beginners: progress modestly week to week
  - For intermediate/advanced: increase volume, complexity, or intensity more aggressively
- Match training style(s) selected in intake:
  - Foundational Strength
  - Circuit/Conditioning-Based
  - Event Block Training
  - Hybrid/Concurrent
  - Skill Development
  - Recovery-Oriented

-- FORMATTING & CLARITY
- Circuits and supersets must specify round counts (e.g., “Repeat 3 rounds of:”)
- EMOMs and intervals must specify total duration (e.g., “EMOM – 18 Minutes Total”)
- If using rotating formats: clarify cycles or logic (e.g., “3 stations x 6 rounds”)
- Use clean formatting and structured weekly tables
- Include estimated duration for every session
- Include short explanations only as needed (e.g., long sessions or credit use)

-- OUTPUT FORMAT REQUIREMENTS
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
              "day": "string (e.g., Monday)",
              "focus_area": "string",
              "duration_min": integer,
              "structure_type": "string",
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

Only return the raw JSON object — no extra commentary, formatting, or tables.`;

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
