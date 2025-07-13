export async function generateOpenAIResponse({
  prompt,
  promptMeta,
  user_id,
  version_number = 1,
}) {
  try {
    // 🔥 Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        temperature: 0.7,
        max_tokens: 8000, // ✅ explicit limit
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(promptMeta, null, 2) },
        ],
      }),
    });

    // ✅ Safe parsing of OpenAI response
    let openaiResponse;
    let rawText;
    try {
      rawText = await response.text(); // Read once
      openaiResponse = JSON.parse(rawText);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response JSON:", err.message);
      console.error("📦 Raw OpenAI response body:", rawText);
      throw new Error("OpenAI API returned malformed JSON or failed silently.");
    }

    if (!response.ok) {
      console.error("❌ OpenAI API returned error:", openaiResponse);
      throw new Error(openaiResponse.error?.message || "Unknown error from OpenAI");
    }

    // Extract data
    const rawContent = openaiResponse.choices?.[0]?.message?.content || "";
    const usage = openaiResponse.usage || {};
    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = prompt_tokens + completion_tokens;
    const estimated_cost_usd = Number(
      ((prompt_tokens / 1000) * 0.01 + (completion_tokens / 1000) * 0.03).toFixed(4)
    );

    const program_generation_id = crypto.randomUUID();

    // 🧪 Check for proper ending
    if (!rawContent.trim().endsWith("---END---")) {
      console.warn("⚠️ OpenAI response may be incomplete — missing expected ---END--- marker.");
    }

    // 🔄 Insert log into Supabase
    const payload = [
      {
        program_ge_
