# spec-005-combat-siege-and-ranged

## Goal and scope

- Define authoritative combat behavior for unit-vs-unit and unit-vs-city engagements.
- Keep combat deterministic, transparent, and testable.
- Keep city siege/capture/raze flow aligned with domination victory.

## Decisions made (and alternatives rejected)

- Chosen: each acting unit is gated by one primary action per turn (`hasActed`).
- Chosen: range gates are min/max based (`minAttackRange` + `attackRange`).
- Chosen: armor/terrain/role combat modifiers with deterministic damage formula.
- Chosen: one-step counterattack only if defender survives and attacker is in defender range.
- Chosen: cities have durability (`health/maxHealth`, default `12/12`) and are valid combat targets.
- Chosen: city defeat resolution:
  - player attacker chooses `Capture`/`Raze` via modal,
  - AI attacker resolves deterministically by personality policy from `spec-014`.
- Chosen: pure preview APIs mirror resolver math with no state mutation.
- Rejected for now: multi-retaliation chains, critical hits, flanking systems, city ranged strikes.

## Interfaces/types added

- Unit combat fields:
  - `health`, `maxHealth`, `attack`, `armor`, `attackRange`, `minAttackRange`, `role`, `hasActed`
- City combat fields:
  - `health`, `maxHealth`
- Combat system APIs:
  - `getAttackableTargets(attackerId, gameState)`
  - `canAttack(attackerId, targetId, gameState)`
  - `resolveAttack(attackerId, targetId, gameState)`
  - `getAttackableCities(attackerId, gameState)`
  - `canAttackCity(attackerId, cityId, gameState)`
  - `resolveCityAttack(attackerId, cityId, gameState)`
  - `resolveCityOutcome(cityId, choice, gameState)`
  - `previewAttack(attackerId, targetId, gameState)`
  - `previewCityAttack(attackerId, cityId, gameState)`
- Runtime/testability payloads:
  - `lastCombatEvent`
  - `pendingCityResolution`
  - hooks: `attackCity`, `chooseCityOutcome`

## Behavior and acceptance criteria

- Damage formula (authoritative):
  - `max(1, attacker.attack + roleBonus + terrainAttackBonus - defender.armor - terrainDefenseBonus)`
- Terrain modifiers:
  - attacker on `hill`: `+1` attack
  - defender on `forest`/`hill`: `+1` defense
  - city defense uses terrain defense modifier on city tile
- Role matrix:
  - `spearman -> warrior +1`
  - `warrior -> archer +1`
  - `archer -> spearman +1`
- Attacks consume attacker action and movement for the turn.
- Defeated units are removed immediately.
- Defeated city opens/executes outcome resolution and triggers immediate victory re-evaluation.
- Capture preserves city economy/identity/queue fields and resets HP to full; raze removes the city.
- Preview outputs match resolver outcomes while not mutating game state.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/combat.test.js`
  - `tests/integration/enemyTurn.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` (ranged attack path + city resolution flow)

## Known gaps and next steps

- No line-of-sight blocking for ranged attacks.
- No dedicated combat timeline/animation UX beyond compact notification breakdowns.
- No city garrison/fortification subsystem yet.
