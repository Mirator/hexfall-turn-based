# spec-011-city-siege-and-capture-lite

## Goal and scope

- Make domination winnable in settler-first starts by allowing city assault and resolution.
- Add lightweight city durability and outcome choices without expanding into full diplomacy/occupation systems.

## Decisions made (and alternatives rejected)

- Chosen: cities have HP (`12/12`) and can be attacked by units in normal attack range.
- Chosen: city attack uses the combat damage model defined in `spec-015` (terrain/range/modifier aware) and consumes attacker action.
- Chosen: defeated city triggers outcome flow:
  - player attacker gets `Capture` / `Raze` modal choice,
  - AI resolves deterministically using personality policy from `spec-014` (`raider`, `expansionist`, `guardian`).
- Chosen: capture transfers ownership and restores city HP to full.
- Chosen: raze removes city from map/state.
- Rejected for now: city garrisons, city ranged strikes, multi-turn sieges, occupation resistance.

## Interfaces/types added

- `City` adds:
  - `health`, `maxHealth`
- Combat APIs:
  - `CombatSystem.getAttackableCities(attackerId, gameState)`
  - `CombatSystem.canAttackCity(attackerId, cityId, gameState)`
  - `CombatSystem.resolveCityAttack(attackerId, cityId, gameState)`
  - `CombatSystem.resolveCityOutcome(cityId, choice, gameState)`
- Game state:
  - `pendingCityResolution` payload for modal-driven player decisions
- UI/Test hooks:
  - event `city-outcome-requested`
  - `window.__hexfallTest.attackCity(cityId)`
  - `window.__hexfallTest.chooseCityOutcome(choice)`
  - `window.__hexfallTest.getCityResolutionModalState()`

## Behavior and acceptance criteria

- Enemy city in range is highlighted as attackable when a player unit is selected.
- City assault reduces city HP and consumes attacking unit action.
- On city defeat by player, turn flow pauses until capture/raze choice is made.
- On city defeat by AI, outcome resolves immediately via deterministic personality policy (`spec-014`).
- Capture preserves city queue/population/focus/economy fields with new owner.
- Raze removes city and updates elimination checks immediately.
- Domination victory continues to require removal of all enemy units and cities.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/combat.test.js` (city assault + capture/raze + AI policy)
- Integration: `tests/integration/enemyTurn.test.js` (enemy opening and attack behavior)
- Integration: `tests/integration/uiSurface.test.js` (pending-resolution hint state)
- E2E: `tests/e2e/smoke.mjs` validates city assault/resolution flow, modal visibility state, and outcome selection in the multi-turn scenario.

## Known gaps and next steps

- No separate city-attack animation layer yet.
- No capture/raze confirmation sub-step (single click resolves).
- No city garrison or city-ranged-strike subsystem yet.
