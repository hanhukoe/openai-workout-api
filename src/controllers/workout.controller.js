import { buildWorkoutPrompt } from "../prompts/workoutPrompt.js";
import { generateOpenAIResponse } from "../services/openai.service.js";
import { buildClientProfile } from "../utils/buildClientProfile.js";
import { insertProgram } from "../services/program.service.js";
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
        
        const [
          intakeData,
          gyms,
          boutiques,
          equipment,
          limitationsData,
          benchmarkData,
          availabilityData,
          blackoutData,
          stylesData
        ] = await Promise.all([
          fetchFromSupabase("program_intake"),
          fetchFromSupabase("full_service_gyms"),
          fetchFromSupabase("boutique_credits"),
          fetchFromSupabase("home_equipment"),
          fetchFromSupabase("limitations"),
          fetchFromSupabase("benchmark_log"),
          fetchFromSupabase("availability"),
          fetchFromSupabase("blackout_dates"),
          fetchFromSupabase("workout_styles")
        ]);
        
        if (!intakeData || intakeData.length === 0) {
          return res.status(404).json({ error: "Intake data not found" });
        }
        
        // Build and clean up client profile
        const clientProfile = buildClientProfile({
          user_id,
          intake: intakeData[0],
          gyms,
          boutiques,
          equipment,
          limitations: limitationsData[0],
          benchmarks: benchmarkData[0],
          availability: availabilityData[0],
          blackout: blackoutData[0],
          styles: stylesData[0]
        });

    // Build prompt and call OpenAI
    const { prompt, promptMeta } = buildWorkoutPrompt(clientProfile);
    const { rawContent, usage, logId } = await generateOpenAIResponse({
      prompt,
      promptMeta,
      user_id,
      version_number: 1,
      generation_type: "initial",
      max_tokens: 8000, 
    });

  // ✅ Step 1: Clean and parse OpenAI response safely
  let parsedProgram;
  let cleanContent = rawContent.trim();
  const endMarker = "---END---";
  const endIndex = cleanContent.lastIndexOf(endMarker);
  
  if (endIndex !== -1) {
    cleanContent = cleanContent.slice(0, endIndex).trim(); // Remove marker and anything after
  }
  
  try {
    parsedProgram = JSON.parse(cleanContent);
  } catch (parseErr) {
    console.error("🧨 Failed to parse OpenAI JSON:", parseErr.message);
    return res.status(500).json({ error: "Failed to parse OpenAI response JSON" });
  }

    
  // ✅ Step 2: Insert into `program` table
  let program_id;
  try {
    program_id = await insertProgram({
      user_id,
      intake_id: intakeData[0].intake_id,
      program_generation_id: logId, // 👈 this is the UUID from the log insert
      program_title: parsedProgram.program_title,
      goal_summary: promptMeta.goal,
      program_duration_weeks: promptMeta.weeks,
      timezone: clientProfile.timezone || "UTC",
      program_start_date: new Date().toISOString().split("T")[0], // Optional default
    });
  } catch (insertErr) {
    console.error("❌ Failed to insert program:", insertErr.message);
    return res.status(500).json({ error: "Program insert failed", details: insertErr.message });
  }
  
  // ✅ Final: Return success response
  return res.status(200).json({
    message: "🎉 Program inserted successfully",
    program_id,
    log_id: logId,
    usage,
  });
    
  } catch (err) {
    console.error("🔥 Controller Error:", err);
    return res.status(500).json({ error: "Unexpected server error", details: err.message });
  }
}; 

export const processProgramFromLog = async (req, res) => {
  const { program_generation_id } = req.body;
  if (!program_generation_id) {
    return res.status(400).json({ error: "Missing program_generation_id" });
  }

  try {
    // Fetch the log from Supabase
    const logRes = await fetch(
      `${SUPABASE_URL}/rest/v1/program_generation_log?program_generation_id=eq.${program_generation_id}`,
      { headers: headersWithAuth }
    );
    const logs = await logRes.json();

    if (!logs.length) {
      return res.status(404).json({ error: "Generation log not found" });
    }

    const log = logs[0];

    // 🧹 Clean and parse the prompt_output
    let cleanOutput = log.prompt_output?.trim() || "";
    const endMarker = "---END---";
    const endIndex = cleanOutput.lastIndexOf(endMarker);
    if (endIndex !== -1) {
      cleanOutput = cleanOutput.slice(0, endIndex).trim();
    }

    let parsedProgram;
    try {
      parsedProgram = JSON.parse(cleanOutput);
    } catch (err) {
      console.error("❌ Failed to parse stored JSON:", err.message);
      return res.status(500).json({ error: "Failed to parse stored OpenAI JSON" });
    }

    // 🧠 Parse prompt_input to get metadata
    let promptMeta = {};
    try {
      promptMeta = JSON.parse(log.prompt_input)?.prompt_meta || {};
    } catch {
      console.warn("⚠️ Could not parse prompt_input meta");
    }

    // ✅ Insert into programs
    const program_id = await insertProgram({
      user_id: log.user_id,
      program_generation_id: log.program_generation_id,
      program_title: parsedProgram.program_title,
      goal_summary: promptMeta.goal,
      program_duration_weeks: promptMeta.weeks,
      timezone: "UTC", // You could optionally make this smarter
      program_start_date: new Date().toISOString().split("T")[0],
    });

    return res.status(200).json({
      message: "🎯 Program inserted from stored log",
      program_id,
    });
  } catch (err) {
    console.error("🔥 processProgramFromLog error:", err);
    return res.status(500).json({ error: "Unexpected error", details: err.message });
  }
};

