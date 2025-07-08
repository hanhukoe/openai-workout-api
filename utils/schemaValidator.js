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
      console.error("❌ Blocks is not an array");
      return false;
    }

    for (const [blockIndex, block] of data.blocks.entries()) {
      if (!block.title || typeof block.title !== "string") {
        console.error(`❌ Block ${blockIndex + 1} missing title`);
        return false;
      }
      if (!Array.isArray(block.weeks)) {
        console.error(`❌ Block ${blockIndex + 1} weeks is not an array`);
        return false;
      }

      for (const [weekIndex, week] of block.weeks.entries()) {
        if (!("week_number" in week)) {
          console.error(`❌ Week ${weekIndex + 1} in block ${blockIndex + 1} is missing week_number`);
          return false;
        }

        if (!Array.isArray(week.days)) {
          console.error(`❌ Block ${blockIndex + 1} → Week ${weekIndex + 1} days is not an array`);
          return false;
        }

        // If there are no days in this week, skip day-level validation (valid for weeks 4+)
        if (week.days.length === 0) continue;

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
              console.error(`❌ Missing field "${field}" in block ${blockIndex + 1}, week ${weekIndex + 1}, day ${dayIndex + 1}`);
              return false;
            }
          }

          if (typeof day.duration_min !== "number") {
            console.error(`❌ duration_min should be a number in day ${day.day}`);
            return false;
          }

          if (
            !Array.isArray(day.warmup) ||
            !Array.isArray(day.main_set) ||
            !Array.isArray(day.cooldown)
          ) {
            console.error(`❌ One of warmup/main_set/cooldown is not an array in day ${day.day}`);
            return false;
          }
        }
      }
    }

    return true;
  } catch (err) {
    console.error("🛑 Unexpected error during schema validation:", err);
    return false;
  }
}
