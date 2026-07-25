# Code Review & QA Lead Framework

Welcome to the **Code Review & QA Lead Module** for the AEO Visibility Platform.

This module houses the standing QA Lead rules, standards, checklists, and Nth review run logs generated after developer implementations of each module.

---

## 📁 Module Directory Structure

```
code-reviews/
  ├── README.md                      This overview file
  ├── CODE_REVIEW_STANDARDS.md       Master production-grade Code Review Standard & Checklist
  └── runs/                          Directory containing Nth code review report logs
      ├── review-run-001-module-0.0-project-setup.md (example)
      └── ...
```

---

## 🎯 Workflow & Protocol for QA Lead Reviews

1. **Trigger**: When developer completes a module (or major iteration), the user triggers the QA Lead review.
2. **Standard Evaluation**: QA Lead evaluates all committed code against `CODE_REVIEW_STANDARDS.md` across 7 Core Pillars (Architecture, Types & Zod, Security & RLS, Caching, Error Resilience, Testing, and Tracker Synchronization).
3. **Artifact Generation**: QA Lead creates a new review run report file in `code-reviews/runs/` named:
   `review-run-<NNN>-<module-id>-<slug>.md`
   _(e.g., `code-reviews/runs/review-run-001-module-0.0-project-setup.md`)_
4. **Developer Handoff**: The user prompts developer to review the generated QA report, resolve all flagged items, and request a follow-up review if needed (`review-run-002-...`).
