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

    for (const [i, block] of data.blocks.entries()) {
      if (typeof block.title !== "string") {
        console.error(`❌ Block ${i + 1} is missing or has invalid title`);
        return false;
      }
      if (typeof block.block_type !== "string") {
        console.error(`❌ Block ${i + 1} is missing or has invalid block_type`);
        return false;
      }
      if (typeof block.summary !== "string") {
        console.error(`❌ Block ${i + 1} is missing or has invalid summary`);
        return false;
      }
      if (
        !Array.isArray(block.week_range) ||
        block.week_range.length !== 2 ||
        !block.week_range.every(Number.isInteger)
      ) {
        console.error(`❌ Block ${i + 1} has invalid week_range`);
        return false;
      }
    }

    if (!data.workouts || typeof data.workouts !== "object") {
      console.error("❌ Missing or invalid workouts object");
      return false;
    }

    const expectedWeeks = ["1", "2", "3"];
    for (const weekKey of expectedWeeks) {
      const week = data.workouts[weekKey];
      if (!week || !Array.isArray(week.days)) {
        console.error(`❌ Missing or invalid days array for week ${weekKey}`);
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
          "cooldown"
        ];

        for (const field of requiredFields) {
          if (!(field in day)) {
            console.error(`❌ Missing "${field}" in Week ${weekKey} → Day ${dayIndex + 1}`);
            return false;
          }
        }

        if (
          typeof day.day !== "string" ||
          typeof day.focus_area !== "string" ||
          typeof day.structure_type !== "string" ||
          typeof day.quote !== "string"
        ) {
          console.error(`❌ Invalid string fields in Week ${weekKey} → Day ${dayIndex + 1}`);
          return false;
        }

        if (typeof day.duration_min !== "number") {
          console.error(`❌ "duration_min" must be number in Week ${weekKey} → Day ${dayIndex + 1}`);
          return false;
        }

        if (
          !Array.isArray(day.warmup) ||
          !Array.isArray(day.main_set) ||
          !Array.isArray(day.cooldown)
        ) {
          console.error(`❌ warmup/main_set/cooldown must be arrays in Week ${weekKey} → Day ${dayIndex + 1}`);
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
