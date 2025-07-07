// 📄 utils/promptBuilder.js

export function buildPrompt(profile) {
  const goal = profile.intake.primary_goal;
  const weeks = profile.intake.program_duration_weeks;
  const sessionLength = profile.availability.session_length_minutes || 45;
  const daysPerWeek = profile.availability.days_per_week || 4;

  const unavailable = profile.availability.unavailable_days || [];
  const limitations = profile.limitations.limitations_list || "none";
  const equipment = profile.equipment.flatMap(e => e.equipment_list || []).join(", ") || "bodyweight only";

  const prompt = `
You are an expert personal trainer and coach.
Design a ${weeks}-week program for the following client goal: "${goal}".

Return JSON ONLY.
Include a block structure for the entire program, but only detailed workouts for the first 3 weeks.
Each day must include:
- day
- focus_area
- duration_min
- structure_type
- quote (max 100 characters)
- warmup (1-3 exercises)
- main_set (3-6 exercises max)
- cooldown (1-3 exercises)

Constraints:
- Max ${daysPerWeek} training days/week
- Sessions ~${sessionLength} minutes ±5
- Avoid these days: ${unavailable.join(", ") || "none"}
- Limitations: ${limitations}
- Equipment: ${equipment}

Use the following structure in your response:
{
  "program_title": "string",
  "blocks": [
    {
      "title": "string",
      "weeks": [ ... up to 3 detailed weeks ... ]
    }
  ]
}
`;

  return { prompt, promptMeta: { goal, weeks } };
}
