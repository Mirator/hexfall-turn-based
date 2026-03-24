import { describe, expect, it } from "vitest";
import { createInitialGameState, getUnitById } from "../../src/core/gameState.js";
import { canAttack, resolveAttack } from "../../src/systems/combatSystem.js";

describe("combat system", () => {
  it("allows adjacent attacks and reduces health", () => {
    const gameState = createInitialGameState();
    const playerWarrior = gameState.units.find((unit) => unit.owner === "player" && unit.type === "warrior");
    const enemyWarrior = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "warrior");

    expect(playerWarrior).toBeTruthy();
    expect(enemyWarrior).toBeTruthy();
    if (!playerWarrior || !enemyWarrior) {
      return;
    }

    playerWarrior.q = 3;
    playerWarrior.r = 2;
    enemyWarrior.q = 4;
    enemyWarrior.r = 2;

    const canAttackResult = canAttack(playerWarrior.id, enemyWarrior.id, gameState);
    expect(canAttackResult.ok).toBe(true);

    const hpBefore = enemyWarrior.health;
    const attackResult = resolveAttack(playerWarrior.id, enemyWarrior.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(enemyWarrior.health).toBeLessThan(hpBefore);
  });

  it("removes defeated units", () => {
    const gameState = createInitialGameState();
    const playerWarrior = gameState.units.find((unit) => unit.owner === "player" && unit.type === "warrior");
    const enemyWarrior = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "warrior");

    expect(playerWarrior).toBeTruthy();
    expect(enemyWarrior).toBeTruthy();
    if (!playerWarrior || !enemyWarrior) {
      return;
    }

    playerWarrior.q = 3;
    playerWarrior.r = 2;
    enemyWarrior.q = 4;
    enemyWarrior.r = 2;
    enemyWarrior.health = 2;

    const attackResult = resolveAttack(playerWarrior.id, enemyWarrior.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(attackResult.targetDefeated).toBe(true);
    expect(getUnitById(gameState, enemyWarrior.id)).toBeNull();
  });
});
