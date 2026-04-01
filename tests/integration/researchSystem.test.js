import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { getEffectiveTechCost, resolveResearchTurn, selectResearch } from "../../src/systems/researchSystem.js";

function createCity(id, owner, q, r, population, buildings = []) {
  return {
    id,
    owner,
    q,
    r,
    population,
    workedHexes: [{ q, r }],
    yieldLastTurn: { food: 0, production: 0, science: 0 },
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    health: 12,
    maxHealth: 12,
    productionTab: "units",
    buildings: [...buildings],
    campus: {
      built: buildings.includes("campus"),
      adjacency: buildings.includes("campus") ? 2 : 0,
      adjacencyBreakdown: { mountains: 1, forests: 2, nearbyCampuses: 0 },
    },
    queue: [],
  };
}

describe("research progression with direct per-turn science", () => {
  it("applies era multipliers and city-count penalty to effective costs", () => {
    const gameState = createInitialGameState({ seed: 87 });
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2, 4, ["campus"]),
      createCity("player-city-2", "player", 5, 5, 4, []),
      createCity("player-city-3", "player", 7, 3, 4, []),
    ];

    const potteryCost = getEffectiveTechCost("pottery", gameState);
    const educationCost = getEffectiveTechCost("education", gameState);

    expect(potteryCost).toBeCloseTo(21.2, 1);
    expect(educationCost).toBeCloseTo(94.4, 1);

    gameState.cities.push(createCity("player-city-4", "player", 9, 2, 3, []));
    const updatedPotteryCost = getEffectiveTechCost("pottery", gameState);
    expect(updatedPotteryCost).toBeCloseTo(21.8, 1);
  });

  it("stores progress per tech and preserves it when switching research", () => {
    const gameState = createInitialGameState({ seed: 88 });
    gameState.cities = [createCity("player-city-1", "player", 2, 2, 6, ["campus", "library"])];

    expect(selectResearch("pottery", gameState).ok).toBe(true);
    const potteryTurn = resolveResearchTurn(gameState, "player");
    expect(potteryTurn.sciencePerTurn).toBeGreaterThan(0);
    const potteryProgress = gameState.research.progressByTech.pottery;
    expect(potteryProgress).toBeGreaterThan(0);

    expect(selectResearch("mining", gameState).ok).toBe(true);
    const miningTurn = resolveResearchTurn(gameState, "player");
    expect(miningTurn.sciencePerTurn).toBeGreaterThan(0);
    expect(gameState.research.progressByTech.mining).toBeGreaterThan(0);
    expect(gameState.research.progressByTech.pottery).toBe(potteryProgress);
  });

  it("applies 40% boost once when the condition is met", () => {
    const gameState = createInitialGameState({ seed: 99 });
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2, 4, ["campus"]),
      createCity("player-city-2", "player", 5, 5, 3, ["campus"]),
    ];
    gameState.research.completedTechIds.push("pottery");

    expect(selectResearch("writing", gameState).ok).toBe(true);
    const cost = getEffectiveTechCost("writing", gameState);
    const result = resolveResearchTurn(gameState, "player");
    expect(result.boostsApplied.some((entry) => entry.id === "writing")).toBe(true);

    const progress = gameState.research.progressByTech.writing / 10;
    expect(progress).toBeGreaterThanOrEqual(Math.round(cost * 0.4 * 10) / 10);
    expect(gameState.research.boostAppliedByTech.writing).toBe(true);

    const boostCountBeforeSecondTurn = result.boostsApplied.filter((entry) => entry.id === "writing").length;
    const secondTurn = resolveResearchTurn(gameState, "player");
    const boostCountAfterSecondTurn = secondTurn.boostsApplied.filter((entry) => entry.id === "writing").length;
    expect(boostCountBeforeSecondTurn).toBe(1);
    expect(boostCountAfterSecondTurn).toBe(0);
  });

  it("carries overflow into next selectable technology and unlocks units on completion", () => {
    const gameState = createInitialGameState({ seed: 100 });
    gameState.cities = [createCity("player-city-1", "player", 2, 2, 44, ["campus", "library", "university", "researchLab"])];

    expect(selectResearch("pottery", gameState).ok).toBe(true);
    const firstTurn = resolveResearchTurn(gameState, "player");
    expect(firstTurn.completedTechIds).toContain("pottery");
    expect(gameState.research.completedTechIds).toContain("mining");
    expect(gameState.research.activeTechId).toBe("writing");
    expect(gameState.research.progressByTech.writing).toBeGreaterThan(0);

    expect(selectResearch("bronzeWorking", gameState).ok).toBe(true);
    let guard = 0;
    while (!gameState.research.completedTechIds.includes("bronzeWorking") && guard < 6) {
      resolveResearchTurn(gameState, "player");
      guard += 1;
    }
    expect(gameState.research.completedTechIds).toContain("bronzeWorking");
    expect(gameState.unlocks.units).toContain("spearman");
  });
});
