// ✅ helpers.js — Cleaned and Updated

import crypto from "crypto";
import fetch from "node-fetch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headersWithAuth = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

export const generateId = () => crypto.randomUUID();

export const formatDate = (date) => new Date(date).toISOString().split("T")[0];

export const addDays = (date, numDays) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
};

export const addWeeks = (date, numWeeks) => addDays(date, numWeeks * 7);

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

export const trimQuote = (quote, maxLength = 100) => {
  if (!quote) return "";
  return quote.length > maxLength ? quote.slice(0, maxLength - 1) + "…" : quote;
};

export const cleanProgramStructure = (parsed) => {
  if (!parsed || !Array.isArray(parsed.blocks)) return parsed;

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

      week.days.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
    });
  });

  return parsed;
};

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
        block_goal: block.block_goal,
        block_summary: block.block_summary,
        block_order: parsed.blocks.indexOf(block) + 1,
        created_at: new Date().toISOString(),
      },
    ]);

    for (const week of block.weeks || []) {
      for (const day of week.days || []) {
        const schedule_id = generateId();
        const workout_id = generateId();
    
        // 🧠 Determine if it's a rest day based on structure_type
        const restKeywords = ["rest", "rest day", "recovery", "off", "recovery day"];
        const isRestDay = restKeywords.includes((day.structure_type || "").toLowerCase().trim());
    
        // You’ll need to compute the actual schedule_date here too if not already
        const schedule_date = formatDate(addDays(profile.start_date, (week.week_number - 1) * 7 + (day.day_number - 1)));
    
        await safeInsert("program_schedule", [
          {
            schedule_id,
            program_id,
            user_id,
            block_id,
            schedule_date,
            week_number: day.week_number,
            day_number: day.day_number,
            is_generated: true,
            is_rest_day: isRestDay,
            status: "planned",
            focus_area: day.focus_area || "General",
            day_of_week: WEEKDAYS[(day.day_number - 1) % 7],
            created_at: new Date().toISOString(),
          },
        ]);

    // 🏋️ Insert workout and blocks/exercises here (after this)


        await safeInsert("workouts", [
          {
            workout_id,
            schedule_id,
            user_id,
            workout_name: day.title,
            duration_minutes: day.duration_min,
            quote: day.quote,
            structure_type: day.structure_type,
            is_active: true,
            created_at: new Date().toISOString(),
            version_number: 1,
          },
        ]);

        const sections = [
          { type: "Warmup", list: day.warmup || [] },
          { type: "Workout", list: day.main_set || [] },
          { type: "Cooldown", list: day.cooldown || [] },
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
                schedule_id,
                workout_id,
                block_id: null,
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
