# spec-005-combat-and-unit-health

## Goal and scope

- Introduce combat stakes with unit health, attacks, and defeat/removal.
- Add combat-capable turn behavior for both player and enemy units.

## Decisions made (and alternatives rejected)

- Chosen: each unit can perform one primary action per turn (`hasActed` gate).
- Chosen: attacks are range-based (adjacent for current units) and apply direct damage.
- Chosen: defeated units are removed immediately from game state.
- Chosen baseline has since been extended by `spec-015` with armor, role bonuses, terrain modifiers, ranged min/max range, and one-step counterattack.
- Rejected for now: retaliation chains beyond one-step, status effects, and critical hits.

## Interfaces/types added

- Unit fields:
  - `type`, `health`, `maxHealth`, `attack`, `attackRange`, `hasActed` (baseline)
- Combat system:
  - `CombatSystem.getAttackableTargets(attackerId, gameState)`
  - `CombatSystem.canAttack(attackerId, targetId, gameState)`
  - `CombatSystem.resolveAttack(attackerId, targetId, gameState)`

## Behavior and acceptance criteria

- Player can click enemy units in attack range when a valid unit is selected.
- Attacks reduce target HP.
- Targets at 0 HP are removed from the map.
- Enemy turn can attack adjacent player units (counter-pressure on enemy phase).

## Validation performed (tests/manual checks)

- Integration tests:
  - `tests/integration/combat.test.js`
  - `tests/integration/enemyTurn.test.js`
- E2E scenario includes a player attack step.

## Known gaps and next steps

- No attack animations or hit effects yet.
- Ranged/armor/terrain depth is now tracked in `spec-015`; this spec remains the baseline milestone.
- No dedicated combat log/history view in UI yet.
