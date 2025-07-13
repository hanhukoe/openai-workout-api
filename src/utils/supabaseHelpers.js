// /src/utils/supabaseHelpers.js

import crypto from "crypto";
import fetch from "node-fetch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const generateId = () => crypto.randomUUID();

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

export async function supabaseInsert(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`❌ Supabase insert failed for ${table}:`, data);
    throw new Error(`Insert error in ${table}`);
  }

  console.log(`✅ Inserted ${Array.isArray(payload) ? payload.length : 1} row(s) into ${table}`);
  return data;
}
