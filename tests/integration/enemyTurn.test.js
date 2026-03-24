import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { runEnemyTurn } from "../../src/systems/enemyTurnSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../../src/systems/turnSystem.js";

describe("enemy turn flow", () => {
  it("enemy can counter-attack adjacent player units", () => {
    const gameState = createInitialGameState();
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    const enemyUnit = gameState.units.find((unit) => unit.owner === "enemy");

    expect(playerUnit).toBeTruthy();
    expect(enemyUnit).toBeTruthy();
    if (!playerUnit || !enemyUnit) {
      return;
    }

    // Ensure enemy doesn't auto-found instead of attacking.
    gameState.cities.push({
      id: "enemy-city-test",
      owner: "enemy",
      q: 8,
      r: 8,
      population: 1,
      focus: "balanced",
      workedHexes: [{ q: 8, r: 8 }],
      yieldLastTurn: { food: 0, production: 0, science: 0 },
      identity: "balanced",
      growthProgress: 0,
      health: 12,
      maxHealth: 12,
      queue: ["warrior"],
    });

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

  it("auto-founds first enemy city from settler start", () => {
    const gameState = createInitialGameState({ seed: 711 });
    expect(gameState.cities).toHaveLength(0);
    beginEnemyTurn(gameState);
    runEnemyTurn(gameState);

    const enemyCities = gameState.cities.filter((city) => city.owner === "enemy");
    expect(enemyCities.length).toBe(1);
    expect(gameState.units.some((unit) => unit.owner === "enemy" && unit.type === "settler")).toBe(false);
  });
});
