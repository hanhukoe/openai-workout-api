import { buildWorkoutPrompt } from "../prompts/workoutPrompt.js";
import { generateOpenAIResponse } from "../services/openai.service.js";
import fetch from "node-fetch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

export const generateWorkoutPlan = async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    // Fetch intake-related data from Supabase
    const fetchFromSupabase = async (table) => {
      const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`;
      const response = await fetch(url, { headers: headersWithAuth });
      if (!response.ok) return null;
      return await response.json();
    };

    const [intakeData, gyms, boutiques, equipment, limitationsData, benchmarkData, availabilityData] = await Promise.all([
      fetchFromSupabase("program_intake"),
      fetchFromSupabase("full_service_gyms"),
      fetchFromSupabase("boutique_credits"),
      fetchFromSupabase("home_equipment"),
      fetchFromSupabase("limitations"),
      fetchFromSupabase("benchmark_log"),
      fetchFromSupabase("availability"),
    ]);

    if (!intakeData || intakeData.length === 0) {
      return res.status(404).json({ error: "Intake data not found" });
    }

    const intake = intakeData[0];
    const limitations = limitationsData[0] || {};
    const benchmarks = benchmarkData[0] || {};
    const availability = availabilityData[0] || {};

    // Construct client profile for GPT
    const clientProfile = {
      user_id,
      goal: intake.primary_goal,
      target_date: intake.primary_goal_date,
      program_duration_weeks: intake.program_duration_weeks,
      days_per_week: intake.days_per_week ?? 4,
      session_length_minutes: intake.session_length_minutes ?? 45,
      unavailable_days: availability.unavailable_days || [],
      limitations: limitations.limitations_list || "",
      fitness_level: benchmarks.fitness_level || "Intermediate",
      full_service_gyms: gyms.map((g) => ({ gym_name: g.gym_name, access: g.access })),
      boutique_studios: boutiques.map((b) => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
      home_equipment: equipment.flatMap((e) => e.equipment_list || []),
    };

    // Build prompt and call OpenAI
    const { prompt, promptMeta } = buildWorkoutPrompt(clientProfile);
    const { rawContent, usage, logId } = await generateOpenAIResponse({
      prompt,
      promptMeta,
      user_id,
      version_number: 1,
      generation_type: "initial",
    });

    // For now, just return raw
    return res.status(200).json({
      message: "✅ Raw OpenAI response received and logged",
      log_id: logId,
      usage,
      content_snippet: rawContent.slice(0, 1000),
    });
  } catch (err) {
    console.error("🔥 Controller Error:", err);
    return res.status(500).json({ error: "Unexpected server error", details: err.message });
  }
};
