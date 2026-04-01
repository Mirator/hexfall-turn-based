import { describe, expect, it } from "vitest";

import { AI_OWNERS } from "../../src/core/factions.js";
import { DEFAULT_MIN_FACTION_DISTANCE, createInitialGameState } from "../../src/core/gameState.js";
import { runEnemyTurn } from "../../src/systems/enemyTurnSystem.js";
import { resolveResearchTurn } from "../../src/systems/researchSystem.js";
import { beginPlayerTurn } from "../../src/systems/turnSystem.js";
import { evaluateMatchState } from "../../src/systems/victorySystem.js";
import { processTurn as processCityTurn } from "../../src/systems/citySystem.js";

describe("visual polish parity", () => {
  it("keeps deterministic outcomes unchanged for a fixed seed", () => {
    const seed = 20260327;
    const snapshotA = runReferenceSimulation(seed, 6);
    const snapshotB = runReferenceSimulation(seed, 6);
    expect(snapshotA).toEqual(snapshotB);
  });
});

function runReferenceSimulation(seed, rounds) {
  const gameState = createInitialGameState({
    seed,
    minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE,
  });

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (const owner of AI_OWNERS) {
      runEnemyTurn(gameState, owner);
      processCityTurn(gameState, owner);
    }
    beginPlayerTurn(gameState);
    processCityTurn(gameState, "player");
    const researchTurn = resolveResearchTurn(gameState, "player");
    gameState.economy.researchIncomeThisTurn = researchTurn.sciencePerTurn;
    evaluateMatchState(gameState);
    if (gameState.match.status !== "ongoing") {
      break;
    }
  }

  return {
    turn: gameState.turnState.turn,
    phase: gameState.turnState.phase,
    match: { ...gameState.match },
    research: {
      activeTechId: gameState.research.activeTechId,
      progress: gameState.research.progress,
      completedTechIds: [...gameState.research.completedTechIds].sort(),
    },
    economy: {
      player: { ...gameState.economy.player },
      enemy: { ...gameState.economy.enemy },
      purple: { ...gameState.economy.purple },
    },
    units: gameState.units
      .map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        health: unit.health,
        movementRemaining: unit.movementRemaining,
        hasActed: unit.hasActed,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    cities: gameState.cities
      .map((city) => ({
        id: city.id,
        owner: city.owner,
        q: city.q,
        r: city.r,
        population: city.population,
        health: city.health,
        identity: city.identity,
        specialization: city.specialization,
        queue: city.queue.map((item) => `${item.kind}:${item.id}`),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
