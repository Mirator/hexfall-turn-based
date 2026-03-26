import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { evaluateMatchState } from "../../src/systems/victorySystem.js";

describe("victory conditions", () => {
  it("wins when all AI factions are eliminated", () => {
    const gameState = createInitialGameState();
    gameState.units = gameState.units.filter((unit) => unit.owner === "player");
    gameState.cities = gameState.cities.filter((city) => city.owner === "player");

    evaluateMatchState(gameState);

    expect(gameState.match.status).toBe("won");
    expect(gameState.match.reason).toBe("elimination");
  });

  it("does not win while at least one AI faction remains", () => {
    const gameState = createInitialGameState();
    gameState.units = gameState.units.filter((unit) => unit.owner !== "enemy");

    evaluateMatchState(gameState);

    expect(gameState.match.status).toBe("ongoing");
    expect(gameState.match.reason).toBeNull();
  });

  it("does not win from turn count alone", () => {
    const gameState = createInitialGameState();
    gameState.turnState.turn = 99;

    evaluateMatchState(gameState);

    expect(gameState.match.status).toBe("ongoing");
    expect(gameState.match.reason).toBeNull();
  });
});
