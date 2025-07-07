// 📄 utils/schemaValidator.js

export function validateWorkoutProgram(data) {
  try {
    if (!data || typeof data !== "object") return false;
    if (!data.program_title || !Array.isArray(data.blocks)) return false;

    for (const block of data.blocks) {
      if (!block.title || !Array.isArray(block.weeks)) return false;
      for (const week of block.weeks) {
        if (!Array.isArray(week.days)) return false;
        for (const day of week.days) {
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
            if (!(field in day)) return false;
          }
        }
      }
    }
    return true;
  } catch (err) {
    console.error("🛑 Schema validation error:", err);
    return false;
  }
}

