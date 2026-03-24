import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { consumeScienceStock, selectResearch } from "../../src/systems/researchSystem.js";

describe("research progression with empire science stock", () => {
  it("consumes pooled science and carries overflow into the next tech", () => {
    const gameState = createInitialGameState({ seed: 88 });

    const selectResult = selectResearch("bronzeWorking", gameState);
    expect(selectResult.ok).toBe(true);
    expect(gameState.research.activeTechId).toBe("bronzeWorking");

    const result = consumeScienceStock(gameState, "player", 7);
    expect(result.completedTechIds).toContain("bronzeWorking");
    expect(result.spentScience).toBe(7);
    expect(gameState.research.completedTechIds).toContain("bronzeWorking");
    expect(gameState.unlocks.units).toContain("spearman");
    expect(gameState.research.activeTechId).toBe("masonry");
    expect(gameState.research.progress).toBe(1);
    expect(gameState.economy.player.scienceStock).toBe(0);
  });

  it("keeps leftover science in stock when no tech is selectable", () => {
    const gameState = createInitialGameState({ seed: 99 });
    selectResearch("bronzeWorking", gameState);

    const result = consumeScienceStock(gameState, "player", 12);
    expect(result.completedTechIds).toEqual(["bronzeWorking", "masonry"]);
    expect(gameState.research.completedTechIds).toEqual(["bronzeWorking", "masonry"]);
    expect(gameState.research.activeTechId).toBe(null);
    expect(gameState.research.progress).toBe(0);
    expect(gameState.economy.player.scienceStock).toBe(1);
    expect(result.remainingScience).toBe(1);
  });
});
