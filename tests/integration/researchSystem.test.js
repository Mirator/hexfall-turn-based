import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { advanceResearch, selectResearch } from "../../src/systems/researchSystem.js";

describe("research progression", () => {
  it("completes research and unlocks new unit option", () => {
    const gameState = createInitialGameState();

    const selectResult = selectResearch("bronzeWorking", gameState);
    expect(selectResult.ok).toBe(true);
    expect(gameState.research.activeTechId).toBe("bronzeWorking");

    advanceResearch(gameState, 3);
    expect(gameState.research.progress).toBe(3);

    const completion = advanceResearch(gameState, 3);
    expect(completion.completedTechIds).toContain("bronzeWorking");
    expect(gameState.research.completedTechIds).toContain("bronzeWorking");
    expect(gameState.unlocks.units).toContain("spearman");
  });
});
