# spec-001-bootstrap

## Goal and scope

- Initialize a Phaser + Vite JavaScript repository for a turn-based prototype.
- Provide build, run, lint, and test scripts for fast local iteration.
- Establish an extensible folder structure for gameplay systems and scenes.

## Decisions made (and alternatives rejected)

- Chosen: `Vite + npm` for fast startup and low setup overhead.
- Chosen: JavaScript with JSDoc types for lightweight iteration.
- Rejected for now: TypeScript-first bootstrap to keep v1 setup minimal.

## Interfaces/types added

- `package.json` scripts:
  - `dev`, `build`, `preview`, `lint`, `test`, `test:e2e`
- Project directories:
  - `src/core`, `src/scenes`, `src/systems`, `src/ui`, `src/assets`, `tests/e2e`, `docs`

## Behavior and acceptance criteria

- `npm run dev` starts a runnable Phaser app.
- `npm run build` produces production assets in `dist/`.
- `npm run lint` and `npm test` execute locally without manual setup beyond dependency install.

## Validation performed (tests/manual checks)

- Dependency install completed for runtime and dev tooling via `npm install`.
- Script wiring validated by successful runs of:
  - `npm run lint`
  - `npm test`
  - `npm run build`

## Known gaps and next steps

- Add CI workflow in a future spec for automated checks on pull requests.
- Introduce coverage reporting once gameplay systems expand.
