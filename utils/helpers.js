import crypto from "crypto";
import fetch from "node-fetch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

// Generate a UUID
export const generateId = () => crypto.randomUUID();

// Format date to YYYY-MM-DD (UTC-safe)
export const formatDate = (date) => {
  return new Date(date).toISOString().split("T")[0];
};

// Add days to a date
export const addDays = (date, numDays) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
};

// Add weeks to a date
export const addWeeks = (date, numWeeks) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numWeeks * 7);
  return result;
};

// Calculate block start and end dates
export const calculateBlockDates = (startDate, weekCounts) => {
  const blocks = [];
  let current = new Date(startDate);

  for (let weeks of weekCounts) {
    const blockStart = new Date(current);
    const blockEnd = addWeeks(current, weeks);
    blocks.push({
      block_start: formatDate(blockStart),
      block_end: formatDate(addDays(blockEnd, -1)),
    });
    current = blockEnd;
  }

  return blocks;
};

// Retry wrapper for GPT calls or other async ops
export const retry = async (fn, maxRetries = 2, delayMs = 1000) => {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};

// Enforce quote character limit
export const trimQuote = (quote, maxLength = 100) => {
  if (!quote) return "";
  return quote.length > maxLength ? quote.slice(0, maxLength - 1) + "…" : quote;
};

// 🔁 Insert program + blocks + schedule + workouts into Supabase
export const insertProgramData = async (parsed, profile) => {
  const program_id = generateId();
  const user_id = profile.user_id;
  const startDate = formatDate(profile.start_date);
  const duration = profile.intake.program_duration_weeks;

  // Insert to programs
  await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify([
      {
        program_id,
        user_id,
        intake_id: profile.intake.intake_id,
        program_title: parsed.program_title,
        goal_summary: profile.intake.primary_goal,
        program_start_date: startDate,
        program_duration_weeks: duration,
        is_active: true,
        created_at: new Date().toISOString(),
        version_number: 1,
      },
    ]),
  });

  // Future: Insert blocks, schedule, workouts, exercises
  // (Leave stubs or simple logs for now — or we can add in next sprint)
  console.log("🧱 Program inserted:", parsed.program_title);
  return program_id;
};
