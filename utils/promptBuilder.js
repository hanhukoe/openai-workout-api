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
    "- Race prep (e.g., HYROX, Spartan)",
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
    "-- STRUCTURE RULES --",
    "Break the full program into logical training blocks (e.g., Base, Build, Peak, Taper).",
    "Each block must include: title, block type, summary, and week range.",
    "Choose block structure based on duration, fitness level, and goal.",
    "",
    "-- RESPONSE FORMAT --",
    "Return ONLY JSON in the following structure:",
    `{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "block_type": "string",
      "summary": "string",
      "week_range": [start_week, end_week],
      "weeks": [
        {
          "week_number": integer,
          "days": [
            {
              "day": "string (e.g., Monday)",
              "focus_area": "string",
              "duration_min": integer,
              "structure_type": "string",
              "quote": "string (max 100 characters)",
              "warmup": [ { "name": "string" }, ... ],
              "main_set": [
                { 
                  "name": "string", 
                  "sets": int, 
                  "reps": int, 
                  "rest_after_sec": int 
                },
                ...
              ],
              "cooldown": [ { "name": "string" }, ... ]
            }
          ]
        }
      ]
    }
  ]
}`,
    "",
    "-- DESIGN RULES --",
    `- Design the full ${weeks}-week program with clearly defined training blocks.`,
    "- Provide detailed day-by-day workouts ONLY for the first 3 weeks.",
    "- Include all 7 days in each week (use rest days if needed).",
    "- Avoid assigning workouts on unavailable or blackout days.",
    "- Never schedule more than 2 consecutive rest days.",
    "- Respect preferred training frequency and equipment.",
    "- Use gym access if available; only assign studio classes if credits exist.",
    "- If credits are exhausted, substitute with gym-based equivalents.",
    "- main_set (limit complexity: 2–3 segments, 3–6 exercises per segment max)",
    "- Do not include warmup/cooldown for studio classes or light recovery sessions.",
    "- Apply progressive overload (beginners = modest, advanced = aggressive).",
    "- Keep motivational quotes short (max 100 characters) and coach-like."
    "- Even for light or recovery days, include warmup, main_set, and cooldown arrays (use empty arrays if not applicable)."
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
