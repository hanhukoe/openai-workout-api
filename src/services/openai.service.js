import { buildWorkoutPrompt } from "../prompts/workoutPrompt.js";
import { generateOpenAIResponse } from "../services/openai.service.js";

const { prompt, promptMeta } = buildWorkoutPrompt(profile);
const result = await generateOpenAIResponse(prompt, promptMeta, profile.user_id);

