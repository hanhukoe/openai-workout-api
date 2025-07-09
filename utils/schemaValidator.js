export function validateWorkoutProgram(data) {
  try {
    if (!data || typeof data !== "object") {
      console.error("❌ Program data is not a valid object.");
      return false;
    }

    if (!data.program_title || typeof data.program_title !== "string") {
      console.error("❌ 'program_title' is missing or not a string.");
      return false;
    }

    if (!Array.isArray(data.blocks)) {
      console.error("❌ 'blocks' must be an array.");
      return false;
    }

    for (const [i, block] of data.blocks.entries()) {
      if (typeof block.title !== "string") {
        console.error(`❌ Block ${i + 1}: 'title' is missing or not a string.`);
        return false;
      }
      if (typeof block.block_type !== "string") {
        console.error(`❌ Block ${i + 1}: 'block_type' is missing or not a string.`);
        return false;
      }
      if (typeof block.summary !== "string") {
        console.error(`❌ Block ${i + 1}: 'summary' is missing or not a string.`);
        return false;
      }
      if (
        !Array.isArray(block.week_range) ||
        block.week_range.length !== 2 ||
        !block.week_range.every(Number.isInteger)
      ) {
        console.error(`❌ Block ${i + 1}: 'week_range' must be an array of two integers.`);
        return false;
      }
    }

    if (!data.workouts || typeof data.workouts !== "object") {
      console.error("❌ 'workouts' is missing or not a valid object.");
      return false;
    }

    // Loop through all keys (not just "1" through "3") to allow extended validation
    for (const [weekKey, week] of Object.entries(data.workouts)) {
      if (!week || !Array.isArray(week.days)) {
        console.error(`❌ Week ${weekKey}: 'days' must be an array.`);
        return false;
      }

      for (const [dayIndex, day] of week.days.entries()) {
        const requiredFields = [
          "day",
          "focus_area",
          "duration_min",
          "structure_type",
          "quote",
          "warmup",
          "main_set",
          "cooldown",
        ];

        for (const field of requiredFields) {
          if (!(field in day)) {
            console.error(`❌ Week ${weekKey} → Day ${dayIndex + 1}: Missing field "${field}".`);
            return false;
          }
        }

        if (
          typeof day.day !== "string" ||
          typeof day.focus_area !== "string" ||
          typeof day.structure_type !== "string" ||
          typeof day.quote !== "string"
        ) {
          console.error(`❌ Week ${weekKey} → Day ${dayIndex + 1}: One or more string fields are invalid.`);
          return false;
        }

        if (typeof day.duration_min !== "number") {
          console.error(`❌ Week ${weekKey} → Day ${dayIndex + 1}: 'duration_min' must be a number.`);
          return false;
        }

        if (
          !Array.isArray(day.warmup) ||
          !Array.isArray(day.main_set) ||
          !Array.isArray(day.cooldown)
        ) {
          console.error(`❌ Week ${weekKey} → Day ${dayIndex + 1}: warmup, main_set, and cooldown must be arrays.`);
          return false;
        }
      }
    }

    return true;
  } catch (err) {
    console.error("🛑 Unexpected error during schema validation:", err);
    return false;
  }
}
