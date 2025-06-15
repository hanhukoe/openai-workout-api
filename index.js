import express from "express";
import fetch from "node-fetch";
import { config } from "dotenv";
config();

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

app.post("/generate-plan", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    // 1. Fetch intake and user data from Supabase
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

    const user = (await userRes.json())[0];
    const intake = (await intakeRes.json())[0];

    if (!user || !intake) {
      return res.status(404).json({ error: "User or intake not found" });
    }

    // 2. Build the GPT prompt (simplified here, you’ll inject full v4.5 prompt later)
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


    // 3. Call OpenAI API
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
    const workoutJson = JSON.parse(data.choices[0].message.content);

    // 4. Store results (simplified: just insert into programs table for now)
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
      return res.status(500).json({ error: "Failed to insert program" });
    }

    return res.json({ message: "Workout program created successfully!", title: workoutJson.program_title });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
