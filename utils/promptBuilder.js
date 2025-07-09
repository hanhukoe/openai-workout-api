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
    "Break the program into 3–4 logical training blocks (e.g., Base, Build, Peak, Taper).",
    "Each block must include: title, block_type, summary, and week_range.",
    "Each block MUST include a `weeks` array with exactly one entry for every week in the block.",
    "Each `week` must include the correct `week_number`, even if `days` is empty.",
    "Only weeks 1 through 3 should include full day-by-day workouts.",
    "Weeks 4 and later should still include `week_number` and `days: []`.",
    "",
    "-- RESPONSE FORMAT --",
    "Return ONLY strict JSON — do NOT include any comments, notes, or triple backticks.",
    "Ensure your response is valid JSON and ends with a closing brace `}`.",
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
    `- Build a full ${weeks}-week program using well-structured training blocks.`,
    "- Do NOT skip or omit any weeks — include every week explicitly.",
    "- Only fill out detailed `days` for weeks 1, 2, and 3.",
    "- Use `days: []` for weeks 4 and onward — but include the `week_number`.",
    "- Include all 7 days per week (use rest days where needed).",
    "- Never schedule workouts on blackout/unavailable days.",
    "- Avoid more than 2 consecutive rest days.",
    "- Use gym/studio access only if available or credits exist.",
    "- Always respect physical limitations — never assign unsafe exercises.",
    "- Dislikes can be overridden if needed — but justify and minimize them.",
    "- Every workout must include warmup, main_set, and cooldown arrays (can be empty).",
    "- Quotes must be brief, motivating, and max 100 characters.",
    "- Apply progressive overload: modest for beginners, aggressive for advanced."
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
    equipmentCount: equipmentList.length,
  };

  return { prompt, promptMeta };
}
