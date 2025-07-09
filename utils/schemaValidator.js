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

      if (!block.block_type || typeof block.block_type !== "string") {
        console.error(`❌ Block ${blockIndex + 1} is missing or has an invalid block_type`);
        return false;
      }

      if (!block.summary || typeof block.summary !== "string") {
        console.error(`❌ Block ${blockIndex + 1} is missing or has an invalid summary`);
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

      if (!Array.isArray(block.weeks)) {
        console.error(`❌ Block ${blockIndex + 1} → weeks is not an array`);
        return false;
      }

      for (const [weekIndex, week] of block.weeks.entries()) {
        if (!("week_number" in week) || typeof week.week_number !== "number") {
          console.error(`❌ Block ${blockIndex + 1} → Week ${weekIndex + 1} is missing or has invalid week_number`);
          return false;
        }

        // Default to empty array if days missing
        if (!Array.isArray(week.days)) {
          console.warn(`⚠️ Block ${blockIndex + 1} → Week ${weekIndex + 1} missing days array. Defaulting to [].`);
          week.days = [];
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
              console.error(`❌ Missing "${field}" in Block ${blockIndex + 1} → Week ${weekIndex + 1} → Day ${dayIndex + 1}`);
              return false;
            }
          }

          if (
            typeof day.day !== "string" ||
            typeof day.focus_area !== "string" ||
            typeof day.structure_type !== "string" ||
            typeof day.quote !== "string"
          ) {
            console.error(`❌ Invalid string field in Block ${blockIndex + 1} → Week ${weekIndex + 1} → Day ${dayIndex + 1}`);
            return false;
          }

          if (typeof day.duration_min !== "number") {
            console.error(`❌ "duration_min" should be a number in Block ${blockIndex + 1} → Week ${weekIndex + 1} → Day ${dayIndex + 1}`);
            return false;
          }

          if (
            !Array.isArray(day.warmup) ||
            !Array.isArray(day.main_set) ||
            !Array.isArray(day.cooldown)
          ) {
            console.error(`❌ warmup/main_set/cooldown must be arrays in Block ${blockIndex + 1} → Week ${weekIndex + 1} → Day ${dayIndex + 1}`);
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
