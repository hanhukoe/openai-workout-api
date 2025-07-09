router.post("/generate-initial-plan", async (req, res) => {
  const { user_id, start_date } = req.body;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    console.log("📥 Fetching user data...");
    const fetchTable = async (table) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${user_id}`, {
        headers: headersWithAuth,
      });
      return await res.json();
    };

    const [intake, gyms, boutiques, equipment, limitations, benchmarks, availability, blackout, styles] =
      await Promise.all([
        fetchTable("program_intake"),
        fetchTable("full_service_gyms"),
        fetchTable("boutique_credits"),
        fetchTable("home_equipment"),
        fetchTable("limitations"),
        fetchTable("benchmark_log"),
        fetchTable("availability"),
        fetchTable("blackout_dates"),
        fetchTable("workout_styles"),
      ]);

    if (!intake.length) return res.status(404).json({ error: "User intake not found" });

    const startDate = start_date ? new Date(start_date) : new Date();
    const profile = {
      user_id,
      intake: intake[0],
      gyms,
      boutiques,
      equipment,
      limitations: limitations[0] || {},
      benchmarks: benchmarks[0] || {},
      availability: availability[0] || {},
      blackout: blackout[0] || {},
      styles: styles[0] || {},
      start_date: startDate,
    };

    const { prompt, promptMeta } = buildPrompt(profile);

    console.log("🧠 Sending prompt to OpenAI...");
    let parsed;
    let usage = {};
    let rawContent = "";

    try {
      const data = await retry(async () => {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4-turbo",
            temperature: 0.7,
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: JSON.stringify(profile, null, 2) },
            ],
          }),
        });

        const raw = await response.json();
        rawContent = raw.choices?.[0]?.message?.content || "";
        usage = raw.usage || {};

        const match = rawContent.match(/```json\s*([\s\S]+?)\s*```/) || rawContent.match(/({[\s\S]+})/);
        if (!match) {
          throw new Error("No valid JSON block found in OpenAI response");
        }

        let jsonRaw = match[1];

        jsonRaw = jsonRaw
          .replace(/\/\/.*$/gm, "")       // remove JS-style comments
          .replace(/,\s*}/g, "}")         // trailing commas in objects
          .replace(/,\s*]/g, "]")         // trailing commas in arrays
          .trim();

        // ✅ Attempt to close the final JSON brace if it looks truncated
        if (!jsonRaw.endsWith("}")) {
          console.warn("⚠️ JSON response may be truncated. Appending closing brace.");
          jsonRaw += "}";
        }

        console.log("🔎 Cleaned JSON snippet:", jsonRaw.slice(0, 300) + "...");
        const parsedData = JSON.parse(jsonRaw);

        // Basic structure check
        if (!parsedData.blocks || !parsedData.workouts) {
          throw new Error("Parsed JSON is missing 'blocks' or 'workouts'");
        }

        return parsedData;
      }, 2, 1500);

      parsed = data;
    } catch (e) {
      console.warn("❌ GPT failed after retries. Using mock data instead.");
      parsed = getMockProgramResponse();
    }

    // 🧼 Clean up the parsed data
    parsed = cleanProgramStructure(parsed);

    // ✅ Validate structure after cleaning
    const isValid = validateWorkoutProgram(parsed);
    if (!isValid) {
      console.error("❌ Validation failed. Parsed response:");
      console.dir(parsed, { depth: null });
      return res.status(422).json({ error: "Invalid OpenAI response format", raw_content: rawContent });
    }

    // ✂️ Trim motivational quotes
    Object.values(parsed.workouts || {}).forEach((week) =>
      week.days?.forEach((day) => {
        day.quote = trimQuote(day.quote, 100);
      })
    );

    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = usage.total_tokens || prompt_tokens + completion_tokens;
    const estimated_cost_usd = Number(
      ((prompt_tokens / 1000) * 0.01 + (completion_tokens / 1000) * 0.03).toFixed(4)
    );

    const program_generation_id = crypto.randomUUID();

    // 🪵 Save to generation log
    await fetch(`${SUPABASE_URL}/rest/v1/program_generation_log`, {
      method: "POST",
      headers: headersWithAuth,
      body: JSON.stringify([
        {
          program_generation_id,
          user_id,
          program_id: null,
          source: "OpenAI",
          version_number: 1,
          generation_type: "initial",
          prompt_input: promptMeta,
          prompt_output: parsed,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          created_at: new Date().toISOString(),
        },
      ]),
    });

    const program_id = await insertProgramData(parsed, profile);

    res.status(200).json({
      message: "✅ Program successfully created!",
      program_id,
      title: parsed.program_title,
      weeks_generated: Object.keys(parsed.workouts || {}).length,
      tokens_used: total_tokens,
      estimated_cost_usd,
      raw_content: rawContent, // <-- Always return this now for debugging
    });
  } catch (err) {
    console.error("🔥 Error generating plan:", err.message);
    res.status(500).json({ error: "Something went wrong", detail: err.message });
  }
});
