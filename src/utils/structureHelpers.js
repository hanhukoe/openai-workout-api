// /src/utils/structureHelpers.js

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function cleanProgramStructure(parsed) {
  if (!parsed || !Array.isArray(parsed.blocks)) return parsed;

  parsed.blocks.forEach((block) => {
    if (!Array.isArray(block.weeks)) {
      block.weeks = [];
      return;
    }

    block.weeks.forEach((week) => {
      if (!Array.isArray(week.days)) {
        week.days = [];
        return;
      }

      const seenDays = new Set();

      week.days = week.days.filter((day) => {
        const key = `${day.week_number}-${day.day_number}`;
        if (seenDays.has(key)) {
          console.warn(`⚠️ Duplicate day (Week ${day.week_number}, Day ${day.day_number}) — skipping`);
          return false;
        }
        seenDays.add(key);

        // Default safety
        day.day = day.day ?? "Unknown";
        day.focus_area = day.focus_area ?? "General";
        day.duration_min = typeof day.duration_min === "number" ? day.duration_min : 0;
        day.structure_type = day.structure_type ?? "Unstructured";
        day.quote = typeof day.quote === "string" ? day.quote : "";

        // Ensure arrays
        day.warmup = Array.isArray(day.warmup) ? day.warmup : [];
        day.main_set = Array.isArray(day.main_set) ? day.main_set : [];
        day.cooldown = Array.isArray(day.cooldown) ? day.cooldown : [];

        return true;
      });

      // Sort days of the week for nice consistency
      week.days.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
    });
  });

  return parsed;
}
