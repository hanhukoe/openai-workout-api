// /src/utils/buildClientProfile.js

export function buildClientProfile({
  user_id,
  intake,
  gyms,
  boutiques,
  equipment,
  limitations = {},
  benchmarks = {},
  availability = {},
  blackout = {},
  styles = {}
}) {
  const fitnessLevel = benchmarks.fitness_level || "Intermediate";
  const trainingPreferences = styles.styles_likes || "Not specified";
  const dislikes = styles.styles_dislikes || "None";
  const equipmentList = equipment.flatMap(e => e.equipment_list || []);
  const equipmentStr = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only";
  const limitationsText = limitations.limitations_list || "none";
  const unavailableDays = blackout.recurring_day || [];

  return {
    user_id,
    goal: intake.primary_goal,
    target_date: intake.primary_goal_date,
    program_duration_weeks: intake.program_duration_weeks,
    days_per_week: availability.days_per_week ?? 4,
    session_length_minutes: availability.session_length_minutes ?? 45,
    unavailable_days: unavailableDays,
    limitations: limitationsText,
    fitness_level: fitnessLevel,
    training_preferences: trainingPreferences,
    training_dislikes: dislikes,
    full_service_gyms: gyms.map(g => ({ gym_name: g.gym_name, access: g.access })),
    boutique_studios: boutiques.map(b => ({ studio_name: b.studio_name, credits_remaining: b.credits_remaining })),
    home_equipment: equipmentList
  };
}
