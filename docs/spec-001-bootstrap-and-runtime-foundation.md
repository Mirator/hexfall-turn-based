# spec-001-bootstrap-and-runtime-foundation

## Goal and scope

- Define repository/tooling foundation for a Phaser + Vite turn-based game.
- Keep runtime startup lightweight with lazy Phaser loading and bundle splitting.
- Preserve the baseline historical context of the first enemy-phase runtime milestone.

## Decisions made (and alternatives rejected)

- Chosen: `Vite + npm` for fast local startup and simple build pipeline.
- Chosen: JavaScript + JSDoc typing for rapid iteration.
- Chosen: dynamic runtime bootstrap (lazy import of game creation from `main.js`).
- Chosen: chunk-splitting for runtime separation (`entry`, `gameplay`, `vendor/runtime`).
- Chosen: startup scene flow enters a full-screen menu first (`MainMenu -> NewGame/About`) before launching gameplay scenes.
- Chosen: keep the early enemy-turn implementation documented as baseline history; current enemy behavior is authoritative in `spec-008`/`spec-004`.
- Rejected for now: TypeScript-first bootstrap and CI-specific workflow requirements in this foundational spec.

## Interfaces/types added

- Project scripts:
  - `dev`, `build`, `preview`, `lint`, `test`, `test:e2e`
- Core repository structure:
  - `src/core`, `src/scenes`, `src/systems`, `src/ui`, `src/assets`, `tests/e2e`, `docs`
- Runtime bootstrap/build interfaces:
  - lazy game import from `src/main.js`
  - Vite manual chunking in `vite.config.js`
- Baseline phase helpers (historical foundation):
  - `beginEnemyTurn(gameState)`
  - `beginPlayerTurn(gameState)`

## Behavior and acceptance criteria

- `npm run dev` starts a playable Phaser app.
- `npm run build` produces deployable assets in `dist/`.
- `npm run lint` and `npm test` run locally after dependency install.
- Runtime is initialized through lazy loading rather than eager Phaser bootstrap.
- Supported viewports (`>= 768px`) initialize a startup menu first; gameplay starts only after confirming startup new-game configuration.
- Build output is split into meaningful runtime chunks.
- Historical milestone behavior (enemy phase stub) is treated as baseline context and superseded by later AI/combat specs.

## Validation performed (tests/manual checks)

- Local validation of script wiring:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- E2E baseline flow exists via `npm run test:e2e` and `tests/e2e/smoke.mjs`.

## Known gaps and next steps

- CI workflow/pipeline policy is documented in `spec-010-ci-github-actions-pages-publishing.md`; this foundation spec intentionally keeps CI policy out of scope.
- Bundle-size optimization can be expanded further if gameplay modules continue to grow.
- Historical baseline notes should remain concise to avoid duplicating current behavior specs.
