# spec-015-combat-roles-terrain-bonuses-and-ranged

## Goal and scope

- Deepen combat with unit roles, armor, terrain bonuses, and ranged rules.
- Introduce `archery` tech and `archer` unit to create tactical spacing decisions.
- Keep combat deterministic and visible through machine-readable breakdown payloads.

## Decisions made (and alternatives rejected)

- Chosen: add `archery` tech (`cost=6`, prerequisite `bronzeWorking`) unlocking `archer`.
- Chosen: archer defaults:
  - `maxHealth=8`, `attack=3`, `attackRange=2`, `minAttackRange=2`, `maxMovement=2`, `productionCost=9`.
- Chosen: armor defaults:
  - `warrior=1`, `settler=0`, `spearman=2`, `archer=0`.
- Chosen: terrain modifiers:
  - attacker on `hill`: `+1 attack`
  - defender on `forest` or `hill`: `+1 defense`
- Chosen: role bonus matrix:
  - `spearman -> warrior +1`
  - `warrior -> archer +1`
  - `archer -> spearman +1`
- Chosen damage formula:
  - `max(1, attacker.attack + roleBonus + terrainAttackBonus - defender.armor - terrainDefenseBonus)`
- Chosen: one-step counterattack only (no retaliation chains), gated by defender range.
- Chosen: city terrain defense modifier uses same forest/hill `+1 defense`.
- Rejected for now: crits, flanking, zone-of-control, and multi-hit exchanges.

## Interfaces/types added

- Unit fields:
  - `armor`
  - `minAttackRange`
  - `role` (`melee`/`ranged`)
- Combat additions:
  - `getAttackableCities(attackerId, gameState)`
  - `canAttackCity(attackerId, cityId, gameState)`
  - `resolveCityAttack(attackerId, cityId, gameState)`
- Combat payload includes:
  - full damage breakdown (`baseAttack`, role/terrain modifiers, armor/defense, raw/damage),
  - counterattack breakdown/trigger data.
- Runtime text surface:
  - `lastCombatEvent` with breakdown details.

## Behavior and acceptance criteria

- Min/max range is enforced for all unit attacks.
- Damage is always at least 1 after modifiers.
- Counterattack occurs only once and only if defender survives and can legally attack back.
- City attacks apply city terrain defense modifier.
- Notifications include concise combat modifier/counter context.
- `render_game_to_text` includes detailed combat payload fields for automation.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/combat.test.js` (range gates, modifiers, counterattack, city defense).
  - `tests/integration/researchSystem.test.js` (archery unlock path).
- Full suite:
  - `npm run lint`
  - `npm test`
- E2E:
  - `npm run test:e2e` verifies archer production and ranged city attack with combat payload presence.

## Known gaps and next steps

- No line-of-sight blocking for ranged attacks.
- No attack-of-opportunity/reactive fire systems.
- No visual combat timeline panel yet.
