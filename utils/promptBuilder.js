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

  const equipmentList = equipment.flatMap((e) => e.equipment_list || []);
  const equipmentStr = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only";
  const limitationsText = limitations.limitations_list || "none";

  const promptLines = [
    "You are a highly experienced personal trainer specializing in:",
    "- Functional strength and conditioning",
    "- Race prep (e.g., HYROX, Spartan)",
    "- Recovery, injury-aware training, and adaptive programs",
    "",
    `Design a ${weeks}-week training program for the client's goal: "${goal}".`,
    "",
    "-- CLIENT PROFILE --",
    `- Fitness Level: ${fitnessLevel}`,
    `- Program Length: ${weeks} weeks`,
    `- Training Days/Week: ${daysPerWeek}`,
    `- Session Length: ~${sessionLength} minutes`,
    `- Unavailable Days: ${unavailable.join(", ") || "none"}`,
    `- Training Preferences: ${trainingPreferences}`,
    `- Dislikes: ${dislikes}`,
    `- Limitations: ${limitationsText}`,
    `- Available Equipment: ${equipmentStr}`,
    "",
    "-- STRUCTURE INSTRUCTIONS --",
    "You MUST break the program into 3–5 training blocks (e.g., Base, Build, Peak, Taper).",
    "Each block MUST include:",
    "- A `title`, `block_type`, and `summary`",
    "- A `week_range`: the start and end week numbers (e.g., [1, 3])",
    "",
    "-- WORKOUT INSTRUCTIONS --",
    `Only generate detailed daily workouts for **weeks 1 through 3**.`,
    "Each workout MUST include a `day`, `focus_area`, `duration_min`, `structure_type`, `quote`, and arrays for `warmup`, `main_set`, and `cooldown`.",
    "These workouts MUST align with the blocks and themes you defined above.",
    "Use motivating, concise quotes (max 100 characters).",
    "Never assign workouts on unavailable days.",
    "Avoid more than 2 rest days in a row.",
    "",
    "-- OUTPUT FORMAT --",
    "Return only valid, clean JSON — no markdown, no commentary, no explanation.",
    "All arrays and objects must be properly closed. End with a closing brace `}`.",
    "",
    `{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "block_type": "string",
      "summary": "string",
      "week_range": [start_week, end_week]
    }
  ],
  "workouts": {
    "1": {
      "days": [
        {
          "day": "string (e.g., Monday)",
          "focus_area": "string",
          "duration_min": integer,
          "structure_type": "string",
          "quote": "string (max 100 characters)",
          "warmup": [ { "name": "string" } ],
          "main_set": [ 
            { "name": "string", "sets": int, "reps": int, "rest_after_sec": int }
          ],
          "cooldown": [ { "name": "string" } ]
        }
      ]
    },
    "2": { "days": [...] },
    "3": { "days": [...] }
  }
}`,
    "",
    "-- REMINDERS --",
    "- You MUST define the full 12-week program using blocks.",
    "- You MUST return detailed day-level workouts for weeks 1–3 only.",
    "- Be creative but consistent. The workouts must match the block and week themes.",
    "- Be concise. Return only raw JSON, no extra text.",
    "- All JSON keys and structure must be valid and complete.",
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
