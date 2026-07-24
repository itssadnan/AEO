// Module 5.2 Brand / Prompt Configuration
// See progress/modules/5.2-brand-prompt-configuration.md for acceptance criteria,
// decisions log, caching/security notes.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts.
export {
  createBrandSchema,
  promptSuggestionRequestSchema,
  promptSuggestionResponseSchema,
  PROMPT_LIMIT_BY_PLAN_TIER,
  type PlanTier,
  type CreateBrandInput,
  type PromptSuggestionRequest,
  type PromptSuggestionResponse,
} from "./schemas";
export { suggestPrompts } from "./gemini";
export { createBrandWithDetails, type CreateBrandResult } from "./brand";
