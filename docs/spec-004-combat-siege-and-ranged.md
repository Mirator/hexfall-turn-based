# spec-004-combat-siege-and-ranged

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
- Chosen: city attack range check includes a recovery edge case for legacy overlap states (`distance == 0` is treated as attackable for city combat only).
- Chosen: city defeat resolution:
  - player attacker chooses `Capture`/`Raze` via modal,
  - AI attacker resolves deterministically by owner personality policy from `spec-008` (for any active AI owner).
- Chosen: pure preview APIs mirror resolver math with no state mutation.
- Chosen: combat presentation uses timeline clips over committed authoritative state (lunge/pulse/floating damage/defeat burst), with no simulation rewind.
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
  - AI action playback metadata `EnemyActionSummary.presentation` (`from`/`to`/`target`) for deterministic render choreography
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
- Capture preserves city economy/identity/queue fields with owner flip and resets HP to full; raze removes the city.
- If a unit/city overlap exists in legacy or test-recovery states, city attack validation permits the attack at `distance 0` so the state can resolve without soft-locking combat flow.
- Preview outputs match resolver outcomes while not mutating game state.
- Combat readability timeline acceptance:
  - unit attack clip shows attacker lunge + target hit pulse + floating damage
  - counterattack (when triggered) shows responsive pulse/lunge + damage feedback
  - city attacks pulse city health feedback and apply outcome burst on capture/raze
  - defeats trigger short burst/screen-shake feedback even when entity removal is immediate

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/combat.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/enemyAi.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` (ranged attack path + city resolution flow)

## Known gaps and next steps

- No line-of-sight blocking for ranged attacks.
- Combat timeline is currently shape/tween based (no authored sprite-sheet/VFX pipeline yet).
- No city garrison/fortification subsystem yet.
