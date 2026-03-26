import { describe, expect, it } from "vitest";
import { createInitialGameState, getCityById } from "../../src/core/gameState.js";
import { createUnit } from "../../src/core/unitData.js";
import { resolveCityAttack } from "../../src/systems/combatSystem.js";
import {
  pickEnemyGoal,
  pickEnemyQueueUnit,
  pickEnemyResearchTech,
  prepareEnemyTurnPlan,
  runEnemyTurn,
} from "../../src/systems/enemyTurnSystem.js";
import { beginEnemyTurn } from "../../src/systems/turnSystem.js";
import { getSeenHostileOwners, recomputeVisibility } from "../../src/systems/visibilitySystem.js";

describe("enemy AI personalities and deterministic decisions", () => {
  it("derives enemy personality from seed and supports explicit override", () => {
    expect(createInitialGameState({ seed: 3 }).ai.enemy.personality).toBe("raider");
    expect(createInitialGameState({ seed: 4 }).ai.enemy.personality).toBe("expansionist");
    expect(createInitialGameState({ seed: 5 }).ai.enemy.personality).toBe("guardian");

    const overridden = createInitialGameState({
      seed: 3,
      enemyPersonality: "guardian",
    });
    expect(overridden.ai.enemy.personality).toBe("guardian");
  });

  it("records goal and action summary each enemy turn", () => {
    const gameState = createInitialGameState({
      seed: 711,
      enemyPersonality: "expansionist",
    });

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState);

    expect(gameState.ai.enemy.lastGoal).toBe("foundFirstCity");
    expect(gameState.ai.enemy.lastTurnSummary).toBeTruthy();
    if (!gameState.ai.enemy.lastTurnSummary) {
      return;
    }
    expect(gameState.ai.enemy.lastTurnSummary.actions.some((action) => action.action === "foundCity")).toBe(true);
  });

  it("refills enemy empty queue with personality-aware typed items", () => {
    const gameState = createInitialGameState({
      seed: 944,
      enemyPersonality: "guardian",
    });

    gameState.units = [
      createUnit({ id: "enemy-warrior", owner: "enemy", type: "warrior", q: 5, r: 5 }),
      createUnit({ id: "player-warrior", owner: "player", type: "warrior", q: 8, r: 8 }),
    ];
    gameState.cities = [createCity("enemy-city-1", "enemy", 4, 4)];
    gameState.cities[0].queue = [];
    gameState.research.completedTechIds = ["bronzeWorking", "masonry"];
    gameState.unlocks.units = ["warrior", "settler", "spearman", "archer"];

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState);

    expect(gameState.cities[0].queue[0]).toEqual({ kind: "building", id: "monument" });
    expect(gameState.ai.enemy.lastTurnSummary?.queueRefills[0]).toEqual({
      cityId: "enemy-city-1",
      item: "building:monument",
    });
  });

  it("uses deterministic score tie-breaks for equal-value attacks", () => {
    const gameState = createInitialGameState({
      seed: 812,
      enemyPersonality: "raider",
    });

    gameState.units = [
      createUnit({
        id: "enemy-warrior",
        owner: "enemy",
        type: "warrior",
        q: 5,
        r: 5,
      }),
      createUnit({
        id: "player-a",
        owner: "player",
        type: "settler",
        q: 6,
        r: 5,
      }),
      createUnit({
        id: "player-z",
        owner: "player",
        type: "settler",
        q: 5,
        r: 6,
      }),
    ];

    gameState.cities = [
      createCity("enemy-city-1", "enemy", 8, 8),
      createCity("player-city-1", "player", 1, 1),
    ];
    gameState.nextIds.unit = 3;
    gameState.nextIds.city = 2;

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState);

    const playerA = gameState.units.find((unit) => unit.id === "player-a");
    const playerZ = gameState.units.find((unit) => unit.id === "player-z");
    expect(playerA && playerZ).toBeTruthy();
    if (!playerA || !playerZ) {
      return;
    }

    // Equal scores resolve by q -> r, so (5,6) is attacked before (6,5).
    expect(playerZ.health).toBeLessThan(playerZ.maxHealth);
    expect(playerA.health).toBe(playerA.maxHealth);
  });

  it("chooses research and queue priorities by personality deterministically", () => {
    expect(pickEnemyResearchTech("raider", ["masonry", "archery", "bronzeWorking"])).toBe("archery");
    expect(pickEnemyResearchTech("expansionist", ["masonry", "archery", "bronzeWorking"])).toBe("bronzeWorking");
    expect(pickEnemyResearchTech("guardian", ["masonry", "archery", "bronzeWorking"])).toBe("masonry");

    const gameState = createInitialGameState({ seed: 91 });
    expect(pickEnemyQueueUnit(gameState, "raider")).toBe("warrior");
    expect(pickEnemyQueueUnit(gameState, "expansionist")).toBe("settler");

    gameState.unlocks.units.push("spearman");
    expect(pickEnemyQueueUnit(gameState, "guardian")).toBe("spearman");
  });

  it("applies personality-specific AI capture and raze policy", () => {
    const expansionistState = createInitialGameState({
      seed: 100,
      enemyPersonality: "expansionist",
    });
    expansionistState.units = [
      createUnit({ id: "enemy-warrior", owner: "enemy", type: "warrior", q: 5, r: 4 }),
    ];
    expansionistState.cities = [createCity("player-city-a", "player", 4, 4)];
    expansionistState.cities[0].health = 1;

    const captureAttack = resolveCityAttack("enemy-warrior", "player-city-a", expansionistState);
    expect(captureAttack.ok).toBe(true);
    expect(captureAttack.outcomeChoice).toBe("capture");
    expect(getCityById(expansionistState, "player-city-a")?.owner).toBe("enemy");

    const raiderState = createInitialGameState({
      seed: 101,
      enemyPersonality: "raider",
    });
    raiderState.units = [
      createUnit({ id: "enemy-warrior", owner: "enemy", type: "warrior", q: 5, r: 4 }),
    ];
    raiderState.cities = [
      createCity("enemy-city-home", "enemy", 7, 7),
      createCity("player-city-b", "player", 4, 4),
    ];
    raiderState.cities[1].health = 1;

    const razeAttack = resolveCityAttack("enemy-warrior", "player-city-b", raiderState);
    expect(razeAttack.ok).toBe(true);
    expect(razeAttack.outcomeChoice).toBe("raze");
    expect(getCityById(raiderState, "player-city-b")).toBeNull();
  });

  it("selects defend goal when enemy cities are threatened", () => {
    const gameState = createInitialGameState({
      seed: 222,
      enemyPersonality: "guardian",
    });
    gameState.units = [
      createUnit({
        id: "enemy-warrior",
        owner: "enemy",
        type: "warrior",
        q: 5,
        r: 5,
      }),
      createUnit({
        id: "player-warrior",
        owner: "player",
        type: "warrior",
        q: 6,
        r: 5,
      }),
    ];
    gameState.cities = [
      createCity("enemy-city-1", "enemy", 6, 6),
      createCity("player-city-1", "player", 1, 1),
    ];

    const goal = pickEnemyGoal(gameState, "guardian");
    expect(goal).toBe("defend");
  });

  it("can target visible non-player hostiles", () => {
    const gameState = createInitialGameState({
      seed: 1201,
      enemyPersonality: "raider",
    });

    gameState.units = [
      createUnit({ id: "enemy-warrior", owner: "enemy", type: "warrior", q: 5, r: 5 }),
      createUnit({ id: "purple-settler", owner: "purple", type: "settler", q: 6, r: 5 }),
      createUnit({ id: "player-settler", owner: "player", type: "settler", q: 12, r: 12 }),
    ];
    gameState.cities = [createCity("enemy-city-1", "enemy", 4, 4)];

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");

    const summary = gameState.ai.enemy.lastTurnSummary;
    expect(summary).toBeTruthy();
    expect(summary?.actions.some((action) => action.action === "attackUnit" && action.targetId === "purple-settler")).toBe(
      true
    );

    const purpleAfter = gameState.units.find((unit) => unit.id === "purple-settler") ?? null;
    if (purpleAfter) {
      expect(purpleAfter.health).toBeLessThan(purpleAfter.maxHealth);
    }
  });

  it("does not target hostile factions it has not seen yet", () => {
    const gameState = createInitialGameState({
      seed: 1202,
      enemyPersonality: "raider",
    });

    gameState.units = [
      createUnit({ id: "enemy-warrior", owner: "enemy", type: "warrior", q: 4, r: 4 }),
      createUnit({ id: "player-visible", owner: "player", type: "settler", q: 5, r: 4 }),
      createUnit({ id: "purple-hidden", owner: "purple", type: "settler", q: 14, r: 14 }),
    ];
    gameState.cities = [createCity("enemy-city-1", "enemy", 3, 3)];

    recomputeVisibility(gameState);
    const seenHostiles = getSeenHostileOwners(gameState, "enemy");
    expect(seenHostiles).toContain("player");
    expect(seenHostiles).not.toContain("purple");

    const plan = prepareEnemyTurnPlan(gameState, "enemy");
    const targetIds = new Set(plan.steps.map((step) => step.targetId).filter(Boolean));
    expect(targetIds.has("player-visible")).toBe(true);
    expect(targetIds.has("purple-hidden")).toBe(false);
  });
});

function createCity(id, owner, q, r) {
  return {
    id,
    owner,
    q,
    r,
    population: 1,
    focus: "balanced",
    workedHexes: [{ q, r }],
    yieldLastTurn: { food: 0, production: 0, science: 0 },
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    health: 12,
    maxHealth: 12,
    productionTab: "units",
    buildings: [],
    queue: [{ kind: "unit", id: "warrior" }],
  };
}
