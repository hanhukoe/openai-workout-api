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
          { role: "user", content: JSON.stringify(promptMeta, null, 2) },
        ],
      }),
    });

    const openaiResponse = await response.json();

    const rawContent = openaiResponse.choices?.[0]?.message?.content || "";
    const usage = openaiResponse.usage || {};
    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = prompt_tokens + completion_tokens;

    const estimated_cost_usd = Number(
      ((prompt_tokens / 1000) * 0.01 + (completion_tokens / 1000) * 0.03).toFixed(4)
    );

    const program_generation_id = crypto.randomUUID();

    const payload = [
      {
        program_generation_id,
        user_id,
        program_id: null,
        source: "openai",
        version_number,
        prompt_input: promptMeta,
        prompt_output: rawContent,
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

    const data = await res.json();
    if (!res.ok) {
      console.error("❌ Failed to insert into program_generation_log:", data);
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
