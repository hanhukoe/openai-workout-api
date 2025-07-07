export function buildPrompt(profile) {
  const { intake, availability, limitations, benchmarks, blackout, equipment, styles } = profile;

  const goal = intake.primary_goal;
  const weeks = intake.program_duration_weeks;
  const daysPerWeek = availability.days_per_week || 4;
  const sessionLength = availability.session_length_minutes || 45;
  const unavailable = availability.unavailable_days || [];
  const fitnessLevel = benchmarks.fitness_level || "Intermediate";
  const trainingPreferences = styles.styles_likes || "";
  const dislikes = styles.styles_dislikes || "";

  const equipmentList = equipment.flatMap((e) => e.equipment_list || []);
  const equipmentStr = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only";

  const blackoutDays = blackout.recurring_day?.join(", ") || "none";
  const userLimitations = limitations.limitations_list || "none";

  const promptLines = [
    "You are an expert personal trainer and coach.",
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
    `- Blackout Days: ${blackoutDays}`,
    `- Physical Limitations: ${userLimitations}`,
    `- Available Equipment: ${equipmentStr}`,
    "",
    "-- RESPONSE FORMAT --",
    "Return ONLY JSON in the following format:",
    "",
    `{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
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
              "main_set": [ { "name": "string", "sets": int, "reps": int, "rest_after_sec": int }, ... ],
              "cooldown": [ { "name": "string" }, ... ]
            }
          ]
        }
      ]
    }
  ]
}`,
    "",
    "-- RULES --",
    "- Create a complete block structure for the full program duration",
    "- ONLY provide detailed workouts for the first 3 weeks",
    "- Include all 7 days in each week (rest days are allowed)",
    "- Never assign workouts on unavailable or blackout days",
    "- Match session length, style, and equipment constraints",
    "- Keep quotes short, max 100 characters",
  ];

  const prompt = promptLines.join("\n");

  const promptMeta = {
    goal,
    weeks,
    fitnessLevel,
    daysPerWeek,
    sessionLength,
    equipmentCount: equipmentList.length,
    trainingPreferences,
    unavailable,
    blackoutDays,
  };

  return { prompt, promptMeta };
}
