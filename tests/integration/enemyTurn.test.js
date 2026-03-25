import { describe, expect, it } from "vitest";
import { cloneGameState, createInitialGameState } from "../../src/core/gameState.js";
import {
  executeEnemyTurnPrelude,
  executeEnemyTurnStep,
  finalizeEnemyTurnPlan,
  prepareEnemyTurnPlan,
  runEnemyTurn,
} from "../../src/systems/enemyTurnSystem.js";
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

  it("still applies enemy prelude queue refill when no enemy units remain", () => {
    const gameState = createInitialGameState({ seed: 902, enemyPersonality: "expansionist" });
    gameState.units = gameState.units.filter((unit) => unit.owner !== "enemy");
    gameState.cities.push({
      id: "enemy-city-seed",
      owner: "enemy",
      q: 8,
      r: 8,
      population: 1,
      focus: "balanced",
      workedHexes: [{ q: 8, r: 8 }],
      yieldLastTurn: { food: 0, production: 0, science: 0 },
      identity: "balanced",
      specialization: "balanced",
      growthProgress: 0,
      health: 12,
      maxHealth: 12,
      productionTab: "units",
      buildings: [],
      queue: [],
    });

    beginEnemyTurn(gameState);
    const plan = prepareEnemyTurnPlan(gameState);
    expect(plan.steps).toHaveLength(0);
    expect(plan.queueRefills.length).toBeGreaterThan(0);

    const prelude = executeEnemyTurnPrelude(gameState, plan);
    expect(prelude.queueRefills.length).toBeGreaterThan(0);

    const enemyCity = gameState.cities.find((city) => city.id === "enemy-city-seed");
    expect(enemyCity).toBeTruthy();
    if (!enemyCity) {
      return;
    }
    expect(enemyCity.queue.length).toBeGreaterThan(0);
  });

  it("step-based enemy flow matches runEnemyTurn wrapper behavior", () => {
    const initial = createInitialGameState({ seed: 811, enemyPersonality: "guardian" });
    beginEnemyTurn(initial);

    const wrapperState = cloneGameState(initial);
    const stepState = cloneGameState(initial);

    runEnemyTurn(wrapperState);

    const plan = prepareEnemyTurnPlan(stepState);
    const prelude = executeEnemyTurnPrelude(stepState, plan);
    const actionSummaries = [];
    for (const step of plan.steps) {
      const execution = executeEnemyTurnStep(stepState, step);
      if (execution.ok && execution.actionSummary) {
        actionSummaries.push(execution.actionSummary);
      }
    }
    finalizeEnemyTurnPlan(stepState, plan, actionSummaries, prelude);

    expect(stepState).toEqual(wrapperState);
  });
});
