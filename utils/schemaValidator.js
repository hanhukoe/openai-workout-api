export function validateWorkoutProgram(data) {
  try {
    if (!data || typeof data !== "object") {
      console.error("❌ Program is not a valid object");
      return false;
    }

    if (!data.program_title || typeof data.program_title !== "string") {
      console.error("❌ Missing or invalid program_title");
      return false;
    }

    if (!Array.isArray(data.blocks)) {
      console.error("❌ 'blocks' is not an array");
      return false;
    }

    for (const [blockIndex, block] of data.blocks.entries()) {
      if (!block.title || typeof block.title !== "string") {
        console.error(`❌ Block ${blockIndex + 1} is missing or has an invalid title`);
        return false;
      }

      if (!block.block_goal || typeof block.block_goal !== "string") {
        console.error(`❌ Block ${blockIndex + 1} is missing or has an invalid block_goal`);
        return false;
      }

      if (!block.block_summary || typeof block.block_summary !== "string") {
        console.error(`❌ Block ${blockIndex + 1} is missing or has an invalid block_summary`);
        return false;
      }

      if (
        !Array.isArray(block.week_range) ||
        block.week_range.length !== 2 ||
        !block.week_range.every(Number.isInteger)
      ) {
        console.error(`❌ Block ${blockIndex + 1} has an invalid week_range`);
        return false;
      }
    }

    // ✅ Validate daily_workouts
    if (!Array.isArray(data.daily_workouts)) {
      console.error("❌ 'daily_workouts' is not an array");
      return false;
    }

    for (const [i, workout] of data.daily_workouts.entries()) {
      const requiredFields = [
        "title",
        "week_number",
        "day_number",
        "duration_min",
        "focus_area",
        "structure_type",
        "quote_text",
        "warmup",
        "main_set",
        "cooldown",
      ];

      for (const field of requiredFields) {
        if (!(field in workout)) {
          console.error(`❌ Missing "${field}" in daily_workouts[${i}]`);
          return false;
        }
      }

      if (
        typeof workout.title !== "string" ||
        typeof workout.focus_area !== "string" ||
        typeof workout.structure_type !== "string" ||
        typeof workout.quote_text !== "string"
      ) {
        console.error(`❌ Invalid string field in daily_workouts[${i}]`);
        return false;
      }

      if (typeof workout.duration_min !== "number") {
        console.error(`❌ "duration_min" should be a number in daily_workouts[${i}]`);
        return false;
      }

      if (
        !Array.isArray(workout.warmup) ||
        !Array.isArray(workout.main_set) ||
        !Array.isArray(workout.cooldown)
      ) {
        console.error(`❌ warmup/main_set/cooldown must be arrays in daily_workouts[${i}]`);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("🛑 Unexpected error during schema validation:", err);
    return false;
  }
}
