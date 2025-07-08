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

  const safeInsert = async (tableName, payload) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`❌ Insert failed for ${tableName}:`, data);
      throw new Error(`Insert error in ${tableName}`);
    } else {
      console.log(`✅ Inserted into ${tableName}`);
    }
    return data;
  };

  await safeInsert("programs", [
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
  ]);

  for (const block of parsed.blocks || []) {
    const block_id = generateId();

    await safeInsert("program_blocks", [
      {
        block_id,
        program_id,
        user_id,
        block_title: block.title,
        block_type: block.block_type,
        summary: block.summary,
        week_range_start: block.week_range?.[0] ?? null,
        week_range_end: block.week_range?.[1] ?? null,
        created_at: new Date().toISOString(),
      },
    ]);

    for (const week of block.weeks || []) {
      const schedule_id = generateId();

      await safeInsert("program_schedule", [
        {
          schedule_id,
          program_id,
          user_id,
          block_id,
          week_number: week.week_number,
          created_at: new Date().toISOString(),
        },
      ]);

      for (const day of week.days || []) {
        const workout_id = generateId();

        await safeInsert("workout_blocks", [
          {
            block_id: workout_id,
            workout_id,
            user_id,
            block_order: 1,
            block_title: `${day.day} - ${day.focus_area}`,
            block_type: day.structure_type,
            rounds: null,
            duration_seconds: day.duration_min * 60,
            notes: day.quote,
            created_at: new Date().toISOString(),
          },
        ]);

        const sections = [
          { type: "warmup", list: day.warmup || [] },
          { type: "main_set", list: day.main_set || [] },
          { type: "cooldown", list: day.cooldown || [] },
        ];

        let seq = 1;
        for (const section of sections) {
          for (const ex of section.list) {
            const durationInSeconds =
              ex.duration_sec != null
                ? ex.duration_sec
                : ex.duration_min != null
                ? ex.duration_min * 60
                : null;

            await safeInsert("workout_exercises", [
              {
                id: generateId(),
                user_id,
                program_id,
                schedule_id,
                block_id: workout_id,
                workout_section: section.type,
                sequence_num: seq++,
                exercise_name: ex.name ?? "Unnamed",
                exercise_sets: ex.sets ?? null,
                exercise_reps: ex.reps ?? null,
                rest_after_sec: ex.rest_after_sec ?? null,
                exercise_duration_seconds: durationInSeconds,
                exercise_weight: ex.weight_kg ?? null,
                exercise_speed: ex.speed ?? null,
                exercise_distance_meters: ex.distance_m ?? null,
                exercise_notes: ex.notes ?? "",
                exercise_description: "",
                created_at: new Date().toISOString(),
              },
            ]);
          }
        }
      }
    }
  }

  console.log("🎉 All program data inserted successfully.");
  return program_id;
};

// 🧼 Clean and normalize AI response before validation
export const cleanProgramStructure = (parsed) => {
  if (!parsed || !Array.isArray(parsed.blocks)) return parsed;

  parsed.blocks.forEach((block) => {
    if (!Array.isArray(block.weeks)) {
      block.weeks = [];
      return;
    }

    block.weeks.forEach((week) => {
      if (!Array.isArray(week.days)) {
        week.days = [];
        return;
      }

      const seenDays = new Set();

      week.days = week.days.filter((day) => {
        if (seenDays.has(day.day)) {
          console.warn(`⚠️ Duplicate day "${day.day}" found — skipping.`);
          return false;
        }
        seenDays.add(day.day);

        day.warmup = Array.isArray(day.warmup) ? day.warmup : [];
        day.main_set = Array.isArray(day.main_set) ? day.main_set : [];
        day.cooldown = Array.isArray(day.cooldown) ? day.cooldown : [];

        day.day = day.day ?? "Unknown";
        day.focus_area = day.focus_area ?? "General";
        day.duration_min = typeof day.duration_min === "number" ? day.duration_min : 0;
        day.structure_type = day.structure_type ?? "Unstructured";
        day.quote = typeof day.quote === "string" ? day.quote : "";

        return true;
      });
    });
  });

  return parsed;
};
