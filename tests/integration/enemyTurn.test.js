import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { runEnemyTurn } from "../../src/systems/enemyTurnSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../../src/systems/turnSystem.js";

describe("enemy turn flow", () => {
  it("enemy can counter-attack adjacent player units", () => {
    const gameState = createInitialGameState();
    const playerUnit = gameState.units.find((unit) => unit.owner === "player" && unit.type === "warrior");
    const enemyUnit = gameState.units.find((unit) => unit.owner === "enemy");

    expect(playerUnit).toBeTruthy();
    expect(enemyUnit).toBeTruthy();
    if (!playerUnit || !enemyUnit) {
      return;
    }

    // Position units as adjacent to force attack behavior.
    playerUnit.q = 3;
    playerUnit.r = 2;
    enemyUnit.q = 4;
    enemyUnit.r = 2;

    const healthBefore = playerUnit.health;
    beginEnemyTurn(gameState);
    runEnemyTurn(gameState);
    beginPlayerTurn(gameState);

    expect(playerUnit.health).toBeLessThan(healthBefore);
    expect(gameState.turnState.phase).toBe("player");
    expect(gameState.turnState.turn).toBe(2);
  });
});
