# spec-001-bootstrap-and-runtime-foundation

## Goal and scope

- Define repository/tooling foundation for a Phaser + Vite turn-based game.
- Keep runtime startup lightweight with lazy Phaser loading and predictable chunk splitting.
- Keep startup flow deterministic (`Boot -> MainMenu -> NewGame/About -> World + UI`) with viewport gating.

## Decisions made (and alternatives rejected)

- Chosen: `Vite + npm` for fast local startup and simple build pipeline.
- Chosen: JavaScript + JSDoc typing for rapid iteration.
- Chosen: dynamic runtime bootstrap (lazy import of game creation from `main.js`).
- Chosen: Rolldown chunk grouping in `vite.config.js` (`phaser-vendor`, `gameplay`) to keep runtime/vendor boundaries stable.
- Chosen: startup scene flow enters a full-screen menu first (`MainMenu -> NewGame/About`) before launching gameplay scenes.
- Chosen: enforce viewport support at bootstrap (`>= 768px`) and block unsupported widths before Phaser canvas initialization.
- Rejected for now: TypeScript-first bootstrap and CI-specific workflow requirements in this foundational spec.

## Interfaces/types added

- Project scripts:
  - `dev`, `build`, `preview`, `lint`, `test`, `test:e2e`
- Core repository structure:
  - `src/core`, `src/scenes`, `src/systems`, `src/ui`, `src/assets`, `tests/e2e`, `docs`
- Runtime bootstrap/build interfaces:
  - lazy game import from `src/main.js`
  - unsupported viewport banner contract `#unsupported-viewport-banner`
  - Vite Rolldown chunk grouping in `vite.config.js`
- Startup/runtime helpers:
  - `createGame()` scene stack (`BootScene`, `MainMenuScene`, `NewGameScene`, `AboutScene`, `WorldScene`, `UIScene`)
  - bootstrap state selectors (`getMainMenuScene`, `getNewGameScene`, `getAboutScene`, `getBootstrapState`)

## Behavior and acceptance criteria

- `npm run dev` starts a playable Phaser app.
- `npm run build` produces deployable assets in `dist/`.
- `npm run lint` and `npm test` run locally after dependency install.
- Runtime is initialized through lazy loading rather than eager Phaser bootstrap.
- Supported viewports (`>= 768px`) initialize startup scenes first; gameplay begins only after explicit new-game start.
- Unsupported viewports (`< 768px`) show blocker content and do not create gameplay canvas.
- Build output is split into meaningful runtime chunk groups (`phaser-vendor`, `gameplay`).

## Validation performed (tests/manual checks)

- Local validation of script wiring:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- E2E startup/bootstrap flow is covered via `npm run test:e2e` and `tests/e2e/smoke.mjs`.

## Known gaps and next steps

- CI workflow/pipeline policy is documented in `spec-010-ci-github-actions-pages-publishing.md`; this foundation spec intentionally keeps CI policy out of scope.
- Bundle-size optimization can be expanded further if gameplay modules continue to grow.
