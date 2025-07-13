import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Inserts a new program record into the database.
 * @param {Object} params - The input data for the program.
 * @returns {string} program_id - The UUID of the newly inserted program.
 */
export async function insertProgram({
  user_id,
  intake_id,
  program_title,
  goal_summary,
  program_duration_weeks,
  timezone = "UTC",
  program_start_date = new Date().toISOString().split("T")[0],
}) {
  const program_id = uuidv4();

  const payload = [
    {
      program_id,
      user_id,
      intake_id,
      program_title,
      goal_summary,
      program_duration_weeks,
      timezone,
      program_start_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/program`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `❌ Failed to insert program: ${response.status} - ${errorText}`
    );
  }

  return program_id;
}
