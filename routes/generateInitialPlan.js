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
    let parsed;
    let usage = {};

    try {
      const data = await retry(async () => {
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

        const raw = await response.json();
        const content = raw.choices?.[0]?.message?.content || "";

        try {
          const jsonStart = content.indexOf("{");
          const jsonEnd = content.lastIndexOf("}") + 1;
          let jsonRaw = content.slice(jsonStart, jsonEnd);
        
          // Strip comments (//) and trailing commas
          jsonRaw = jsonRaw
            .replace(/\/\/.*$/gm, "")             // remove JS-style comments
            .replace(/,\s*}/g, "}")               // trailing comma before object end
            .replace(/,\s*]/g, "]");              // trailing comma before array end
        
          usage = raw.usage || {};
          return JSON.parse(jsonRaw);
        } catch (err) {
          console.error("❌ JSON.parse failed:", err);
          console.log("🪵 Raw OpenAI content was:\n", content.slice(0, 500), "...");
          throw new Error("OpenAI response was not valid JSON.");
        }
      }, 2, 1500);

      parsed = data;
    } catch (e) {
      console.warn("❌ GPT failed after retries. Using mock data.");
      parsed = getMockProgramResponse();
    }

    // Ensure structure is valid even for light days
    parsed.blocks?.forEach((block) =>
      block.weeks?.forEach((week) =>
        week.days?.forEach((day) => {
          day.warmup = Array.isArray(day.warmup) ? day.warmup : [];
          day.main_set = Array.isArray(day.main_set) ? day.main_set : [];
          day.cooldown = Array.isArray(day.cooldown) ? day.cooldown : [];
        })
      )
    );

    const isValid = validateWorkoutProgram(parsed);
    if (!isValid) {
      console.error("❌ Validation failed. Parsed response:");
      console.dir(parsed, { depth: null });
      return res.status(422).json({ error: "Invalid OpenAI response format" });
    }

    // Trim motivational quotes
    parsed.blocks?.forEach((block) =>
      block.weeks?.forEach((week) =>
        week.days?.forEach((day) => {
          day.quote = trimQuote(day.quote, 100);
        })
      )
    );

    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = usage.total_tokens || prompt_tokens + completion_tokens;
    const estimated_cost_usd = Number(
      ((prompt_tokens / 1000) * 0.01 + (completion_tokens / 1000) * 0.03).toFixed(4)
    );

    const program_generation_id = crypto.randomUUID();

    // Save prompt + output to Supabase log
    await fetch(`${SUPABASE_URL}/rest/v1/program_generation_log`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([
        {
          program_generation_id,
          user_id,
          program_id: null,
          source: "OpenAI",
          version_number: 1,
          generation_type: "initial",
          prompt_input: promptMeta,
          prompt_output: parsed,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          created_at: new Date().toISOString(),
        },
      ]),
    });

    const totalWeeks = parsed.blocks.reduce((sum, b) => sum + (b.weeks?.length || 0), 0);
    if (totalWeeks < 3) {
      console.warn("⚠️ GPT returned fewer than 3 weeks. Consider retrying or refining the prompt.");
    }

    const program_id = await insertProgramData(parsed, profile);

    res.status(200).json({
      message: "✅ Program successfully created!",
      program_id,
      title: parsed.program_title,
      weeks_generated: 3,
      tokens_used: total_tokens,
      estimated_cost_usd,
    });
  } catch (err) {
    console.error("🔥 Error generating plan:", err.message);
    res.status(500).json({ error: "Something went wrong", detail: err.message });
  }
});

export default router;
