// Module 5.3 Engine Query Engine
// See progress/modules/*.md for acceptance criteria, decisions log, caching/security notes.
// No implementation yet — this barrel export is the folder's public interface placeholder.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts.
export { enqueueFreeCheck } from "./engine-query.ts";
export { freeCheckRequestSchema, type FreeCheckRequest } from "./schemas.ts";
