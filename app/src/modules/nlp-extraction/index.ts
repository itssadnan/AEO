// Module 5.4 NLP Extraction & Structuring
// See progress/modules/*.md for acceptance criteria, decisions log, caching/security notes.
// No implementation yet � this barrel export is the folder's public interface placeholder.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts.
export { buildExtractionPrompt } from "./prompt";
export { parseExtractionResponse } from "./parse-extraction-response";
export { extractionResultSchema, DOMAIN_TYPES } from "./schemas";
export type { ExtractionResult, DomainType } from "./schemas";
