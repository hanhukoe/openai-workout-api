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
    "Break the program into training blocks (e.g., Base, Build, Peak, Taper).",
    "Each block must include: title, block_type, summary, and week_range.",
    "Every block MUST include a `weeks` array with one object for EACH week in the range.",
    "Weeks 1–3 should have detailed day-level workouts.",
    "Weeks 4 and later should still include `week_number` and `days: []`.",
    "",
    "-- RESPONSE FORMAT --",
    "Return ONLY strict JSON — do NOT include any comments, notes, or explanations.",
    "DO NOT wrap JSON in triple backticks.",
    "Ensure your response ends with a closing brace `}`.",
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
    `- Create a ${weeks}-week plan using clearly defined blocks.`,
    "- Provide detailed workouts only for weeks 1–3.",
    "- For later weeks, include `week_number` and empty `days: []`.",
    "- Include all 7 days in each week — use rest days if needed.",
    "- Never skip or omit a week in the `weeks` array.",
    "- Never leave a block without a complete `weeks` array.",
    "- Never schedule workouts on unavailable or blackout days.",
    "- Never assign more than 2 consecutive rest days.",
    "- Use gym/studio access only if available or credits exist.",
    "- Respect all physical limitations — never assign harmful exercises.",
    "- Style dislikes may be overridden if needed for the goal — but minimize them.",
    "- Keep warmup/main_set/cooldown arrays even on light days (use empty arrays if needed).",
    "- Keep motivational quotes short and coach-like (max 100 chars).",
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
