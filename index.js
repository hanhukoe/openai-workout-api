import express from "express";
import fetch from "node-fetch";
import { config } from "dotenv";
config();

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔍 NEW ROUTE: /test-supabase?user_id=abc123
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

// EXISTING: /generate-plan
app.post("/generate-plan", async (req, res) => {
  const { user_id } = req.body;
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

    const userData = await userRes.json();
    const intakeData = await intakeRes.json();

    if (!userData || userData.length === 0 || !intakeData || intakeData.length === 0) {
      console.error("User or intake not found", { userData, intakeData });
      return res.status(404).json({ error: "User or intake not found" });
    }

    const user = userData[0];
    const intake = intakeData[0];

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
    {
      "name": "${user.first_name}",
      "goal": "${intake.goal}",
      "fitness_level": "${intake.fitness_level || 'Intermediate'}",
      "program_duration_weeks": ${intake.program_duration_weeks || 12},
      "target_date": "${intake.target_date}",
      "session_length": "${intake.workout_time || 45}",
      "days_per_week": "${intake.days_per_week || 3}",
      "limitations": "${intake.limitations || ''}",
      "equipment": [],
      "full_service_gyms": [],
      "boutique_studios": [],
      "training_styles": []
    }

    -- FORMAT & STRUCTURE REQUIREMENTS --

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

    Only return the raw JSON object — no extra text, commentary, or formatting.
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
      return res.status(500).json({ error: "Failed to generate response from OpenAI" });
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

    return res.json({
      message: "Workout program created successfully!",
      title: workoutJson.program_title,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// Add this new route just before app.listen

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
          user_id: user_id,
          goal_summary: "Test Program - Hansy Hype Edition",
          duration_week: 8,
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

// Start server
app.listen(3000, () => {
  console.log("Server running on port 3000");
});


app.listen(3000, () => {
  console.log("Server running on port 3000");
});
