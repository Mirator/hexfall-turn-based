# spec-005-combat-and-unit-health

## Goal and scope

- Introduce combat stakes with unit health, attacks, and defeat/removal.
- Add combat-capable turn behavior for both player and enemy units.

## Decisions made (and alternatives rejected)

- Chosen: each unit can perform one primary action per turn (`hasActed` gate).
- Chosen: attacks are range-based (adjacent for current units) and apply direct damage.
- Chosen: defeated units are removed immediately from game state.
- Rejected for now: retaliation chains, armor stats, status effects, and critical hits.

## Interfaces/types added

- Unit fields:
  - `type`, `health`, `maxHealth`, `attack`, `attackRange`, `hasActed`
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
- No ranged units beyond current range-1 defaults.
- No dedicated combat log/history view in UI yet.
