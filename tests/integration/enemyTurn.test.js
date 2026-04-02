import { describe, expect, it } from "vitest";
import { cloneGameState, createInitialGameState } from "../../src/core/gameState.js";
import { createUnit } from "../../src/core/unitData.js";
import {
  executeEnemyTurnPrelude,
  executeEnemyTurnStep,
  finalizeEnemyTurnPlan,
  prepareEnemyTurnPlan,
  runEnemyTurn,
} from "../../src/systems/enemyTurnSystem.js";
import { selectResearch } from "../../src/systems/researchSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../../src/systems/turnSystem.js";

describe("enemy turn flow", () => {
  it("enemy can counter-attack adjacent player units", () => {
    const gameState = createInitialGameState();
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");

    expect(playerUnit).toBeTruthy();
    if (!playerUnit) {
      return;
    }

    // Ensure enemy doesn't auto-found instead of attacking.
    gameState.cities.push({
      id: "enemy-city-test",
      owner: "enemy",
      q: 8,
      r: 8,
      population: 1,
      workedHexes: [{ q: 8, r: 8 }],
      yieldLastTurn: { food: 0, production: 0, gold: 0, science: 0 },
      identity: "balanced",
      specialization: "balanced",
      growthProgress: 0,
      productionProgress: 0,
      health: 12,
      maxHealth: 12,
      productionTab: "units",
      buildings: [],
      campus: {
        built: false,
        adjacency: 0,
        adjacencyBreakdown: { mountains: 0, forests: 0, nearbyCampuses: 0 },
      },
      queue: [{ kind: "unit", id: "warrior" }],
    });

    gameState.units = gameState.units.filter((unit) => unit.owner !== "enemy");
    const enemyUnit = createUnit({
      id: "enemy-2",
      owner: "enemy",
      type: "warrior",
      q: 4,
      r: 2,
    });
    gameState.units.push(enemyUnit);

    // Position units as adjacent to force attack behavior.
    playerUnit.q = 3;
    playerUnit.r = 2;

    const healthBefore = playerUnit.health;
    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");
    beginPlayerTurn(gameState);

    expect(playerUnit.health).toBeLessThan(healthBefore);
    expect(gameState.turnState.phase).toBe("player");
    expect(gameState.turnState.turn).toBe(2);
  });

  it("disabled enemy units are gated and cannot attack", () => {
    const gameState = createInitialGameState({ seed: 7001 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    expect(playerUnit).toBeTruthy();
    if (!playerUnit) {
      return;
    }

    gameState.cities.push({
      id: "enemy-city-test",
      owner: "enemy",
      q: 8,
      r: 8,
      population: 1,
      workedHexes: [{ q: 8, r: 8 }],
      yieldLastTurn: { food: 0, production: 0, gold: 0, science: 0 },
      identity: "balanced",
      specialization: "balanced",
      growthProgress: 0,
      productionProgress: 0,
      health: 12,
      maxHealth: 12,
      productionTab: "units",
      buildings: [],
      campus: {
        built: false,
        adjacency: 0,
        adjacencyBreakdown: { mountains: 0, forests: 0, nearbyCampuses: 0 },
      },
      queue: [{ kind: "unit", id: "warrior" }],
    });

    gameState.units = gameState.units.filter((unit) => unit.owner !== "enemy");
    const enemyUnit = createUnit({
      id: "enemy-2",
      owner: "enemy",
      type: "warrior",
      q: 4,
      r: 2,
    });
    enemyUnit.disabled = true;
    gameState.units.push(enemyUnit);

    playerUnit.q = 3;
    playerUnit.r = 2;
    const healthBefore = playerUnit.health;

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");
    beginPlayerTurn(gameState);

    expect(playerUnit.health).toBe(healthBefore);
  });

  it("auto-founds first enemy city from settler start", () => {
    const gameState = createInitialGameState({ seed: 711 });
    expect(gameState.cities).toHaveLength(0);
    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");

    const enemyCities = gameState.cities.filter((city) => city.owner === "enemy");
    expect(enemyCities.length).toBe(1);
    expect(gameState.units.some((unit) => unit.owner === "enemy" && unit.type === "settler")).toBe(false);
  });

  it("runs enemy and purple AI owners sequentially within one AI phase", () => {
    const gameState = createInitialGameState({ seed: 712 });
    beginEnemyTurn(gameState);

    runEnemyTurn(gameState, "enemy");
    runEnemyTurn(gameState, "purple");

    expect(gameState.ai.enemy.lastTurnSummary?.turn).toBe(1);
    expect(gameState.ai.purple.lastTurnSummary?.turn).toBe(1);
    expect(gameState.cities.some((city) => city.owner === "enemy")).toBe(true);
    expect(gameState.cities.some((city) => city.owner === "purple")).toBe(true);
    expect(gameState.units.some((unit) => unit.owner === "enemy" && unit.type === "settler")).toBe(false);
    expect(gameState.units.some((unit) => unit.owner === "purple" && unit.type === "settler")).toBe(false);
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

  it("step-based flow matches runEnemyTurn wrapper behavior for each AI owner", () => {
    const initial = createInitialGameState({
      seed: 811,
      aiFactionCount: 4,
      enemyPersonality: "guardian",
      purplePersonality: "guardian",
    });
    for (const owner of initial.factions.aiOwners) {
      const ownerSeedState = cloneGameState(initial);
      beginEnemyTurn(ownerSeedState);

      const wrapperState = cloneGameState(ownerSeedState);
      const stepState = cloneGameState(ownerSeedState);

      runEnemyTurn(wrapperState, owner);

      const plan = prepareEnemyTurnPlan(stepState, owner);
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
    }
  });

  it("runs all configured AI owners in order for multi-faction matches", () => {
    const gameState = createInitialGameState({ seed: 2711, mapWidth: 24, mapHeight: 24, aiFactionCount: 6 });
    beginEnemyTurn(gameState);
    for (const owner of gameState.factions.aiOwners) {
      runEnemyTurn(gameState, owner);
    }

    for (const owner of gameState.factions.aiOwners) {
      expect(gameState.ai.byOwner[owner]?.lastTurnSummary?.turn).toBe(1);
      expect(gameState.cities.some((city) => city.owner === owner)).toBe(true);
      expect(gameState.units.some((unit) => unit.owner === owner && unit.type === "settler")).toBe(false);
    }
  });

  it("does not overwrite player active research during enemy prelude execution", () => {
    const gameState = createInitialGameState({ seed: 3001 });
    gameState.research.completedTechIds.push("pottery");
    expect(selectResearch("writing", gameState).ok).toBe(true);
    const selectedBefore = gameState.research.currentTechId;

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");

    expect(gameState.research.currentTechId).toBe(selectedBefore);
    expect(gameState.research.activeTechId).toBe(selectedBefore);
  });
});
