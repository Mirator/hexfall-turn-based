# spec-002-core-loop

## Goal and scope

- Deliver the first playable Civ-like slice:
  - Hex map render
  - Single controllable player unit + one enemy stub unit
  - Reachable tile preview based on movement points
  - End-turn loop with enemy phase and movement reset

## Decisions made (and alternatives rejected)

- Chosen: axial hex coordinates (`q`, `r`) and six-direction movement.
- Chosen: deterministic 12x12 map for predictable tests.
- Chosen: separate gameplay logic (`systems`) from rendering (`scenes`).
- Rejected for now: combat resolution, resource systems, city management.

## Interfaces/types added

- JSDoc types:
  - `Hex`, `Unit`, `TurnState`, `GameState`
- Core interfaces:
  - `neighbors(hex)`
  - `distance(a, b)`
  - `MovementSystem.getReachable(unitId, gameState)`
  - `TurnSystem.endTurn(gameState)`
- Scene contracts:
  - `WorldScene` emits state updates via event bus.
  - `UIScene` emits `end-turn-requested` interaction and disables controls during enemy phase.

## Behavior and acceptance criteria

- Player can select the unit by clicking its hex.
- Reachable tiles highlight according to remaining movement points.
- Clicking a reachable hex moves the unit and consumes movement points by distance.
- Ending turn enters enemy phase, runs one enemy movement stub, then returns to player phase.
- Turn counter increments when returning to player phase and player movement is restored.

## Validation performed (tests/manual checks)

- Unit tests validate axial neighbor and distance behavior.
- Integration tests validate movement consumption, invalid move rejection, and turn reset.
- Integration tests validate enemy stub movement and phase transitions.
- E2E and manual play confirm select -> move -> enemy step -> next player turn loop.

## Known gaps and next steps

- Terrain costs are not implemented (all tiles currently cost 1 per hex distance).
- No pathfinding constraints or blockers other than occupied tiles.
- Future specs should add AI, combat resolution, and fog-of-war.
