// 🎯 Workout Plan Generator (OpenAI → Supabase) - Debug V8
// Strict schema, tight prompt, validated format, and ready for Supabase insert

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

app.post("/generate-plan", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  const fetchFromSupabase = async (table) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`;
    const response = await fetch(url, { headers: headersWithAuth });
    if (!response.ok) return null;
    return await response.json();
  };

  try {
    console.log("📥 Fetching user context from Supabase...");
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
      days_per_week: intake.days_per_week ?? 4,
      session_length_minutes: intake.session_length_minutes ?? 45,
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap(e => e.equipment_list || []),
    };

    const prompt = `You are a certified expert personal trainer and coach.

Design a workout program that lasts for ${clientProfile.program_duration_weeks} weeks and includes 7 days per week.

Each week belongs to a structured training block (such as Base, Build, Peak, Recovery). Use progressive overload and principles of periodization.

The required JSON structure is:
{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "description": "string",
      "weeks": [
        {
          "week_number": number,
          "days": [
            {
              "day_name": "string",
              "focus_area": "string",
              "duration_min": number,
              "structure_type": "training | recovery | rest",
              "warmup": [ { "name": "string", "sets": number, "reps": number } ],
              "main_set": [ { "name": "string", "sets": number, "reps": number } ],
              "cooldown": [ { "name": "string" } ],
              "quote": "string"
            }
          ]
        }
      ]
    }
  ]
}

Respond ONLY with valid JSON. No extra commentary, no markdown, no text.`;

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
    console.log("📤 FULL OpenAI response:", rawContent.slice(0, 500));

    let workoutJson;
    try {
      const jsonStart = rawContent.indexOf("{");
      const jsonEnd = rawContent.lastIndexOf("}") + 1;
      const jsonString = rawContent.slice(jsonStart, jsonEnd);
      workoutJson = JSON.parse(jsonString);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response:", err.message);
      return res.status(500).json({ error: "Invalid JSON from OpenAI" });
    }

    if (!workoutJson?.blocks || !Array.isArray(workoutJson.blocks) || workoutJson.blocks.length === 0) {
      console.error("❌ OpenAI response missing valid 'blocks':", JSON.stringify(workoutJson, null, 2));
      return res.status(500).json({ error: "OpenAI response missing or invalid 'blocks' format." });
    }

    // 🟢 Success!
    console.log("✅ Parsed program title:", workoutJson.program_title);
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
