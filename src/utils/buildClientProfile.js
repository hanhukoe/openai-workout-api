export function buildClientProfile({
  user_id,
  intake,
  availability = {},
  limitations = {},
  benchmarks = {},
  blackout = {},
  equipment = [],
  styles = {}
}) {
  const goal = intake.primary_goal;
  const weeks = intake.program_duration_weeks;
  const fitnessLevel = benchmarks.fitness_level || "Intermediate";
  const trainingPreferences = styles.styles_likes || "Not specified";
  const dislikes = styles.styles_dislikes || "None";
  const daysPerWeek = availability.days_per_week ?? 4;
  const sessionLength = availability.session_length_minutes ?? 45;
  const unavailableDays = blackout.recurring_day || [];
  const limitationsText = limitations.limitations_list || "none";
  const equipmentList = equipment.flatMap(e => e.equipment_list || []);
  const equipmentSummary = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only";

  return {
    user_id,
    goal,
    weeks,
    fitnessLevel,
    trainingPreferences,
    dislikes,
    daysPerWeek,
    sessionLength,
    unavailableDays,
    limitationsText,
    equipmentSummary
  };
}
