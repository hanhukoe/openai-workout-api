export function buildPrompt(profile) {
  const { intake, availability, limitations, benchmarks, blackout, equipment, styles } = profile;

  const goal = intake.primary_goal;
  const weeks = intake.program_duration_weeks;
  const daysPerWeek = availability.days_per_week || 4;
  const sessionLength = availability.session_length_minutes || 45;
  const unavailable = blackout.recurring_day || [];
  const fitnessLevel = benchmarks.fitness_level || "Intermediate";
  const trainingPreferences = styles.styles_likes || "Not specified";
  const dislikes = styles.styles_dislikes || "None";

  const equipmentList = equipment.flatMap(e => e.equipment_list || []);
  const equipmentStr = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only";
  const limitationsText = limitations.limitations_list || "none";

  const promptLines = [
    "You are a highly experienced personal trainer specializing in:",
    "- Functional strength and conditioning",
    "- Race prep (e.g., HYROX, Spartan, Marathon)",
    "- Recovery, injury-aware training, and adaptive programs",
    "",
    `Design a ${weeks}-week fitness program for the following client goal: "${goal}".`,
    "",
    "-- CLIENT PROFILE --",
    `- Fitness Level: ${fitnessLevel}`,
    `- Goal Duration: ${weeks} weeks`,
    `- Preferred Styles: ${trainingPreferences}`,
    `- Avoided Styles: ${dislikes}`,
    `- Max Training Days/Week: ${daysPerWeek}`,
    `- Session Length: ~${sessionLength} min ±5`,
    `- Unavailable Days: ${unavailable.join(", ") || "none"}`,
    `- Physical Limitations: ${limitationsText}`,
    `- Available Equipment: ${equipmentStr}`,
    "",
    "-- PROGRAM DESIGN --",
    `1. Build a full ${weeks}-week program, structured into 3–5 clear training blocks (e.g., Base, Build, Peak, Taper) that support the client's goal.`,
    "2. Each block must include: title, block_goal (main training goal), block_summary (types of exercises), and week_range (e.g., [1, 3]).",
    "3. Then generate detailed day-by-day workouts ONLY for weeks 1 to 3 (up to 21 days). These should reflect the training blocks.",
    "4. Each daily workout must include the following fields:",
    "   - title",
    "   - week_number (1–3)",
    "   - day_number (1–7)",
    "   - duration_min",
    "   - focus_area (e.g., cardio, arms and back, rest day, etc.)",
    "   - structure_type (e.g., EMOM, circuits, rest day, etc.)",
    "   - quote_text (short, max 100 characters)",
    "   - warmup: array of { name: string }",
    "   - main_set: array of { name: string, sets: int, reps: int, rest_after_sec: int }",
    "   - cooldown: array of { name: string }",
    "",
    "-- RESPONSE FORMAT --",
    "Return a single JSON object with exactly two top-level keys: 'blocks' and 'daily_workouts'.",
    "Do NOT nest daily_workouts inside blocks. These must be separate arrays.",
    "Return ONLY valid JSON with the following structure (no markdown, no extra commentary):",
    `{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "block_goal": "string",
      "block_summary": "string",
      "week_range": [start_week, end_week]
    }
  ],
  "daily_workouts": [
    {
      "title": "string",
      "week_number": integer (1–3),
      "day_number": integer (1–7),
      "duration_min": integer,
      "focus_area": "string",
      "structure_type": "string",
      "quote_text": "string (max 100 characters)",
      "warmup": [ { "name": "string" } ],
      "main_set": [
        {
          "name": "string",
          "sets": integer,
          "reps": integer,
          "rest_after_sec": integer
        }
      ],
      "cooldown": [ { "name": "string" } ]
    }
  ]
}`,
    "Include ONLY the fields exactly as described — do NOT add extra keys or fields.",
    `Return the full program structure covering all ${weeks} weeks in the "blocks" section.`,
    "Only generate detailed daily workouts for weeks 1, 2, and 3 — do NOT include any daily entries beyond week 3.",
    "For rest days, only return these fields: week_number, day_number, and focus_area.",
    "Ensure your response is valid JSON and ends with a single closing brace \"}\".",
    "Do NOT include any notes, comments, or markdown formatting — only raw JSON.",
    "Only stop once all workouts for weeks 1, 2, and 3 have been generated. Do not stop early, even if the response is long.",
    "The final JSON must be syntactically valid. Keep responses concise but prioritize completeness over brevity. You may use up to 8000 tokens if needed, but do not cut off the final week early.",
    "",
    "-- DESIGN RULES --",
    "- Every workout must include warmup, main_set, and cooldown arrays (they can be empty).",
    "- Never schedule workouts on unavailable days.",
    "- Avoid more than 2 consecutive rest days.",
    "- Dislikes may be used sparingly if justified.",
    "- Respect physical limitations — do NOT assign unsafe exercises.",
    "- Include progressive overload where applicable.",
    "- quote_text must be motivational and under 100 characters."
  ];

  const prompt = promptLines.join("\n");

  const promptMeta = {
    goal,
    weeks,
    fitnessLevel,
    daysPerWeek,
    sessionLength,
    trainingPreferences,
    unavailable,
    limitations: limitationsText,
    equipmentCount: equipmentList.length
  };

  return { prompt, promptMeta };
}
