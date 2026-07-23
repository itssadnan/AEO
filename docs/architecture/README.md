# System Architecture & Entity Diagrams

- **[system-architecture.md](./system-architecture.md)** — data-flow diagrams (Mermaid) for the core check pipeline, the growth loop, and how the cross-cutting modules (billing, admin, crawl audit, alerting) connect in.
- **[entity-relationship-diagram.md](./entity-relationship-diagram.md)** — the Postgres schema: entities, relationships, full column reference, RLS scoping strategy, and the design decisions behind it (what was merged, what was deliberately left out).

Both are populated. Application code in `app/` may now begin — start with module `0.0` in `progress/progress.json` (Project Setup) if it isn't `done` yet, then follow the dependency order from there.
