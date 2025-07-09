export const insertProgramData = async (parsed, profile) => {
  const program_id = generateId();
  const user_id = profile.user_id;
  const startDate = formatDate(profile.start_date);
  const duration = profile.intake.program_duration_weeks;

  const safeInsert = async (tableName, payload) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`❌ Insert failed for ${tableName}:`, data);
      throw new Error(`Insert error in ${tableName}`);
    } else {
      console.log(`✅ Inserted into ${tableName}`);
    }
    return data;
  };

  // 🟩 Insert the program
  await safeInsert("programs", [
    {
      program_id,
      user_id,
      intake_id: profile.intake.intake_id,
      program_title: parsed.program_title,
      goal_summary: profile.intake.primary_goal,
      program_start_date: startDate,
      program_duration_weeks: duration,
      is_active: true,
      created_at: new Date().toISOString(),
      version_number: 1,
    },
  ]);

  // 🟩 Loop through blocks (structure only)
  for (const block of parsed.blocks || []) {
    const block_id = generateId();

    await safeInsert("program_blocks", [
      {
        block_id,
        program_id,
        user_id,
        block_title: block.title,
        block_type: block.block_type,
        summary: block.summary,
        week_range_start: block.week_range?.[0] ?? null,
        week_range_end: block.week_range?.[1] ?? null,
        created_at: new Date().toISOString(),
      },
    ]);

    const weekStart = block.week_range?.[0];
    const weekEnd = block.week_range?.[1];

    for (let weekNum = weekStart; weekNum <= weekEnd; weekNum++) {
      const weekData = parsed.workouts?.[String(weekNum)];
      if (!weekData) continue; // Skip if this week has no detailed workouts

      const schedule_id = generateId();

      await safeInsert("program_schedule", [
        {
          schedule_id,
          program_id,
          user_id,
          block_id,
          week_number: weekNum,
          created_at: new Date().toISOString(),
        },
      ]);

      for (const day of weekData.days || []) {
        const workout_id = generateId();

        await safeInsert("workout_blocks", [
          {
            block_id: workout_id,
            workout_id,
            user_id,
            block_order: 1,
            block_title: `${day.day || "Unknown Day"} - ${day.focus_area || "General"}`,
            block_type: day.structure_type || "Unstructured",
            rounds: null,
            duration_seconds: (day.duration_min || 0) * 60,
            notes: day.quote || "",
            created_at: new Date().toISOString(),
          },
        ]);

        const sections = [
          { type: "warmup", list: day.warmup || [] },
          { type: "main_set", list: day.main_set || [] },
          { type: "cooldown", list: day.cooldown || [] },
        ];

        let seq = 1;
        for (const section of sections) {
          for (const ex of section.list) {
            const durationInSeconds =
              ex.duration_sec != null
                ? ex.duration_sec
                : ex.duration_min != null
                ? ex.duration_min * 60
                : null;

            await safeInsert("workout_exercises", [
              {
                id: generateId(),
                user_id,
                program_id,
                schedule_id,
                block_id: workout_id,
                workout_section: section.type,
                sequence_num: seq++,
                exercise_name: ex.name ?? "Unnamed",
                exercise_sets: ex.sets ?? null,
                exercise_reps: ex.reps ?? null,
                rest_after_sec: ex.rest_after_sec ?? null,
                exercise_duration_seconds: durationInSeconds,
                exercise_weight: ex.weight_kg ?? null,
                exercise_speed: ex.speed ?? null,
                exercise_distance_meters: ex.distance_m ?? null,
                exercise_notes: ex.notes ?? "",
                exercise_description: "",
                created_at: new Date().toISOString(),
              },
            ]);
          }
        }
      }
    }
  }

  console.log("🎉 All program data inserted successfully.");
  return program_id;
};
