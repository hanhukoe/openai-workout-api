import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";

import { buildPrompt } from "../utils/promptBuilder.js";
import { validateWorkoutProgram } from "../utils/schemaValidator.js";
import { insertProgramData, retry, trimQuote } from "../utils/helpers.js";
import { getMockProgramResponse } from "../utils/mockResponse.js";

dotenv.config();
const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

router.post("/generate-initial-plan", async (req, res) => {
  const { user_id, start_date } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    console.log("📥 Fetching user data...");
    const fetchTable = async (table) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`, {
        headers: headersWithAuth,
      });
      return await res.json();
    };

    const [intake, gyms, boutiques, equipment, limitations, benchmarks, availability, blackout, styles] =
      await Promise.all([
        fetchTable("program_intake"),
        fetchTable("full_service_gyms"),
        fetchTable("boutique_credits"),
        fetchTable("home_equipment"),
        fetchTable("limitations"),
        fetchTable("benchmark_log"),
        fetchTable("availability"),
        fetchTable("blackout_dates"),
        fetchTable("workout_styles"),
      ]);

    if (!intake.length) return res.status(404).json({ error: "User intake not found" });

    const startDate = start_date ? new Date(start_date) : new Date();
    const profile = {
      user_id,
      intake: intake[0],
      gyms,
      boutiques,
      equipment,
      limitations: limitations[0] || {},
      benchmarks: benchmarks[0] || {},
      availability: availability[0] || {},
      blackout: blackout[0] || {},
      styles: styles[0] || {},
      start_date: startDate,
    };

    const { prompt, promptMeta } = buildPrompt(profile);

    console.log("🧠 Sending prompt to OpenAI...");
    const callOpenAI = async () => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4-turbo",
          temperature: 0.7,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: JSON.stringify(profile, null, 2) },
          ],
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}") + 1;
      return JSON.parse(content.slice(jsonStart, jsonEnd));
    };

    let parsed;
    try {
      parsed = await retry(callOpenAI, 2, 1500); // 2 retries, 1.5s delay
    } catch (e) {
      console.warn("❌ GPT failed after retries. Using mock data.");
      parsed = getMockProgramResponse();
    }

    const isValid = validateWorkoutProgram(parsed);
    if (!isValid) return res.status(422).json({ error: "Invalid OpenAI response format" });

    // Optional: Trim quotes if too long
    parsed.blocks?.forEach((block) =>
      block.weeks?.forEach((week) =>
        week.days?.forEach((day) => {
          day.quote = trimQuote(day.quote, 100);
        })
      )
    );

    // 💾 Log prompt + response
    await fetch(`${SUPABASE_URL}/rest/v1/program_generation_log`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([
        {
          program_generation_id: crypto.randomUUID(),
          user_id,
          program_id: null, // will be updated after insertion
          source: "OpenAI",
          version_number: 1,
          generation_type: "initial",
          prompt_input: promptMeta,
          prompt_output: parsed,
          created_at: new Date().toISOString(),
        },
      ]),
    });

    // 🧠 Save full program
    const program_id = await insertProgramData(parsed, profile);

    res.status(200).json({
      message: "✅ Program successfully created!",
      program_id,
      title: parsed.program_title,
      weeks_generated: 3,
    });
  } catch (err) {
    console.error("🔥 Error generating plan:", err.message);
    res.status(500).json({ error: "Something went wrong", detail: err.message });
  }
});

export default router;
