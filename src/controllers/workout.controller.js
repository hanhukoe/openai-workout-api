import { buildWorkoutPrompt } from "../prompts/workoutPrompt.js";
import { generateOpenAIResponse } from "../services/openai.service.js";
import { buildClientProfile } from "../utils/buildClientProfile.js";
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

    const clientProfile = buildClientProfile({
      user_id,
      intake: intakeData[0],
      gyms,
      boutiques,
      equipment,
      limitations: limitationsData[0],
      benchmarks: benchmarkData[0],
      availability: availabilityData[0],
    });
    

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
