# spec-003-testability

## Goal and scope

- Make gameplay state machine-readable for automated validation.
- Add deterministic time-step hook for test clients.
- Add Playwright smoke flow for the full select -> move -> end-turn interaction.

## Decisions made (and alternatives rejected)

- Chosen: expose browser hooks on `window` for simple integration.
- Chosen: keep e2e script self-contained (starts dev server, runs browser steps, asserts state).
- Rejected for now: heavyweight test framework wrappers around Playwright.

## Interfaces/types added

- Browser hooks:
  - `window.render_game_to_text(): string`
  - `window.advanceTime(ms: number): void`
  - `window.__hexfallTest.hexToWorld(q, r)`
  - `window.__hexfallTest.getEndTurnButtonCenter()`
- E2E command:
  - `npm run test:e2e`

## Behavior and acceptance criteria

- `render_game_to_text` returns concise JSON with turn, units, selection, movement, and map metadata.
- `advanceTime` exists and advances deterministic simulation time accounting used by tests.
- Smoke test verifies:
  - Initial state
  - Unit move and movement point decrement
  - End-turn behavior (turn increment and movement reset)
  - No console/page errors during scenario

## Validation performed (tests/manual checks)

- `npm run test:e2e` passes and captures `tests/e2e/artifacts/smoke.png`.
- Manual screenshot review confirms UI + map + unit visibility.
- Mobile viewport capture (`390x844`) confirms the game canvas and controls render on narrow screens.

## Known gaps and next steps

- Expand e2e scenarios for edge interactions (invalid destination, empty click deselect, repeat turn cycles).
- Add artifact comparison or snapshot checks once visuals stabilize.
