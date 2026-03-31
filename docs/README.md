# Specs Index

Every meaningful work item in this repository must be captured in a spec file under `docs/`.

Consolidated domain specs; older milestone specs removed.

Support policy (authoritative): desktop + tablet only. Runtime support requires viewport width `>= 768px`; phone-sized viewports are intentionally blocked.

## Current Specs

- [spec-001-bootstrap-and-runtime-foundation.md](./spec-001-bootstrap-and-runtime-foundation.md) - Repository/tooling bootstrap, lazy runtime loading, startup scene flow, and current Vite chunking foundations.
- [spec-002-core-map-turn-and-victory.md](./spec-002-core-map-turn-and-victory.md) - Core map loop, terrain movement, seeded match generation for map presets and configurable AI roster, and domination victory/restart flow.
- [spec-003-testability.md](./spec-003-testability.md) - Browser hooks, `render_game_to_text` payload contract, deterministic smoke validation, and perf telemetry contract.
- [spec-004-combat-siege-and-ranged.md](./spec-004-combat-siege-and-ranged.md) - Authoritative combat math, ranged/counter behavior, and city siege/capture/raze flow.
- [spec-005-city-economy-production-and-specialization.md](./spec-005-city-economy-production-and-specialization.md) - Founding, per-owner economy buckets, shared production queues, buildings, and specialization.
- [spec-006-tech-tree-and-unlocks.md](./spec-006-tech-tree-and-unlocks.md) - Research progression, science-stock spending, and unlock behavior.
- [spec-007-hud-context-panels-and-notifications.md](./spec-007-hud-context-panels-and-notifications.md) - HUD layout, contextual panels, forecast/stats/minimap polish, readiness UX, pause flow, and notification center behavior.
- [spec-008-ai-personalities-and-strategy.md](./spec-008-ai-personalities-and-strategy.md) - Deterministic multi-faction AI personalities, visibility-aware goal/action scoring, and strategic policies across dynamic AI owners.
- [spec-009-action-timeline-and-turn-playback.md](./spec-009-action-timeline-and-turn-playback.md) - Presentation timeline, action animations, deterministic visual parity constraints, and sequential AI turn playback for explainable combat/movement flow.
- [spec-010-ci-github-actions-pages-publishing.md](./spec-010-ci-github-actions-pages-publishing.md) - GitHub Actions quality-gated build and automatic GitHub Pages publishing policy.

## Spec Template Rules

Each spec must include these sections:

1. Goal and scope
2. Decisions made (and alternatives rejected)
3. Interfaces/types added
4. Behavior and acceptance criteria
5. Validation performed (tests/manual checks)
6. Known gaps and next steps
