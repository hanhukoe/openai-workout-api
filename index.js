const program_id = crypto.randomUUID();

try {
  console.log("📦 Inserting program...");
  await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
    method: "POST",
    headers: headersWithAuth,
    body: JSON.stringify([{
      program_id,
      user_id,
      program_title: workoutJson.program_title,
      goal_summary: workoutJson.program_title,
      program_duration_weeks: intake.program_duration_weeks,
      program_start_date: intake.primary_goal_date,
      is_active: true,
      created_at: new Date().toISOString()
    }])
  });
  console.log("✅ Program inserted");
} catch (err) {
  console.error("❌ Failed to insert program:", err);
  return res.status(500).json({ error: "Failed to insert program" });
}

for (let blockIndex = 0; blockIndex < workoutJson.blocks.length; blockIndex++) {
  const block = workoutJson.blocks[blockIndex];
  const block_id = crypto.randomUUID();

  try {
    console.log(`📦 Inserting block ${blockIndex + 1}: ${block.title}`);
    await fetch(`${SUPABASE_URL}/rest/v1/program_blocks`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([{
        block_id,
        program_id,
        user_id,
        block_title: block.title,
        block_order: blockIndex + 1,
        created_at: new Date().toISOString()
      }])
    });
  } catch (err) {
    console.error(`❌ Failed to insert block ${block.title}:`, err);
    continue;
  }

  for (const week of block.weeks || []) {
    for (let dayIndex = 0; dayIndex < (week.days || []).length; dayIndex++) {
      const day = week.days[dayIndex];
      const schedule_id = crypto.randomUUID();
      const workout_id = crypto.randomUUID();

      try {
        console.log(`📅 Inserting day ${day.day} (week ${week.week_number})`);
        await fetch(`${SUPABASE_URL}/rest/v1/program_schedule`, {
          method: "POST",
          headers: headersWithAuth,
          body: JSON.stringify([{
            schedule_id,
            user_id,
            program_id,
            block_id,
            day_number: dayIndex + 1,
            week_number: week.week_number,
            focus_area: day.focus_area,
            is_rest_day: day.structure_type === "recovery" || day.duration_min === 0,
            is_generated: true,
            created_at: new Date().toISOString()
          }])
        });

        await fetch(`${SUPABASE_URL}/rest/v1/workouts`, {
          method: "POST",
          headers: headersWithAuth,
          body: JSON.stringify([{
            workout_id,
            user_id,
            schedule_id,
            duration_minutes: day.duration_min,
            quote: day.quote || "",
            intensity: day.structure_type,
            is_active: true,
            version_number: 1,
            created_at: new Date().toISOString()
          }])
        });
      } catch (err) {
        console.error(`❌ Failed to insert schedule or workout for day ${day.day}:`, err);
        continue;
      }

      const insertBlockWithExercises = async (phaseName, blockType, exercises) => {
        if (!exercises || !Array.isArray(exercises) || exercises.length === 0) return;

        const workout_block_id = crypto.randomUUID();

        try {
          await fetch(`${SUPABASE_URL}/rest/v1/workout_blocks`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify([{
              block_id: workout_block_id,
              user_id,
              workout_id,
              block_order: 1,
              block_title: `${day.focus_area} – ${phaseName}`,
              block_type: blockType,
              created_at: new Date().toISOString()
            }])
          });

          const formattedExercises = exercises.map((ex, i) => ({
            id: crypto.randomUUID(),
            user_id,
            workout_id,
            schedule_id,
            block_id: workout_block_id,
            workout_section: blockType,
            sequence_num: i + 1,
            exercise_name: ex?.name || typeof ex === "string" ? ex : "Unnamed",
            exercise_sets: ex.sets ?? null,
            exercise_reps: ex.reps ?? null,
            exercise_weight: ex.weight_kg ?? null,
            exercise_duration_seconds: ex.duration_per_set_sec ?? null,
            exercise_description: "",
            exercise_notes: "",
            exercise_speed: ex.speed ?? null,
            exercise_distance_meters: ex.distance_m ?? null
          }));

          await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
            method: "POST",
            headers: headersWithAuth,
            body: JSON.stringify(formattedExercises)
          });

        } catch (err) {
          console.error(`❌ Failed to insert ${blockType} for ${day.day}:`, err);
        }
      };

      await insertBlockWithExercises("Warmup", "Warmup", day.warmup);
      await insertBlockWithExercises("Main", "Workout", day.main_set);
      await insertBlockWithExercises("Cooldown", "Cooldown", day.cooldown);
    }
  }
}

res.json({
  message: "✅ Workout program generated and saved!",
  title: workoutJson.program_title
});
