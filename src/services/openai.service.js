// /src/services/openai.service.js

import fetch from "node-fetch";
import crypto from "crypto";
import { config } from "dotenv";
config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

export async function generateOpenAIResponse({
  prompt,
  promptMeta,
  user_id,
  version_number = 1,
}) {
  try {
    // 🔥 Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        temperature: 0.7,
        max_tokens: 8000, // ✅ explicit limit
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(promptMeta, null, 2) },
        ],
      }),
    });

    // ✅ Safe parsing of OpenAI response
    let openaiResponse;
    let rawText;
    try {
      rawText = await response.text(); // Read once
      openaiResponse = JSON.parse(rawText);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response JSON:", err.message);
      console.error("📦 Raw OpenAI response body:", rawText);
      throw new Error("OpenAI API returned malformed JSON or failed silently.");
    }

    if (!response.ok) {
      console.error("❌ OpenAI API returned error:", openaiResponse);
      throw new Error(openaiResponse.error?.message || "Unknown error from OpenAI");
    }

    // Extract data
    const rawContent = openaiResponse.choices?.[0]?.message?.content || "";
    const usage = openaiResponse.usage || {};
    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = prompt_tokens + completion_tokens;
    const estimated_cost_usd = Number(
      ((prompt_tokens / 1000) * 0.01 + (completion_tokens / 1000) * 0.03).toFixed(4)
    );

    const program_generation_id = crypto.randomUUID();

    // 🧪 Check for proper ending
    if (!rawContent.trim().endsWith("---END---")) {
      console.warn("⚠️ OpenAI response may be incomplete — missing expected ---END--- marker.");
    }

    // 🔄 Insert log into Supabase
    const payload = [
      {
        program_generation_id,
        user_id,
        program_id: null,
        source: "openai",
        version_number,
        prompt_input: {
          prompt_text: prompt, // ✅ system prompt
          prompt_meta: promptMeta, // ✅ user input
        },
        prompt_output: rawContent, // ✅ raw OpenAI response
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost_usd,
        created_at: new Date().toISOString(),
      },
    ];

    const res = await fetch(`${SUPABASE_URL}/rest/v1/program_generation_log`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify(payload),
    });

    // ✅ Safe parsing of Supabase response
    let supabaseData;
    let supabaseRaw;
    try {
      supabaseRaw = await res.text();
      supabaseData = JSON.parse(supabaseRaw);
    } catch (err) {
      console.error("❌ Failed to parse Supabase insert response JSON:", err.message);
      console.error("📦 Raw Supabase response body:", supabaseRaw);
    }

    if (!res.ok) {
      console.error("❌ Failed to insert into program_generation_log:", supabaseData);
    } else {
      console.log("✅ Log inserted into program_generation_log");
    }

    return {
      rawContent,
      usage: {
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost_usd,
      },
      logId: program_generation_id,
    };
  } catch (err) {
    console.error("🔥 Error in OpenAI service:", err.message);
    throw err;
  }
}
