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

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error fetching ${table}:`, errorText);
        return null;
      }

      const json = await response.json();
      console.log(`✅ Fetched from ${table}:`, JSON.stringify(json, null, 2));
      return json;
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
    console.log("🧠 OpenAI Raw Response:", JSON.stringify(data, null, 2));

    let workoutJson;
    const rawContent = data.choices?.[0]?.message?.content || "";

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
      console.error("❌ Failed to parse OpenAI response:");
      console.error("Raw content:", rawContent);
      console.error("Error:", err.message);
      return res.status(500).json({
        error: "Invalid JSON from OpenAI",
        details: err.message,
        openai_output_preview: rawContent.slice(0, 500) + "..."
      });
    }

    if (!workoutJson || !Array.isArray(workoutJson.blocks)) {
      console.error("❌ Invalid program format: 'blocks' must be an array.");
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

    res.json({
      message: "✅ Workout program generated and parsed!",
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
