import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { foundCity, processTurn } from "../../src/systems/citySystem.js";

describe("city founding and production", () => {
  it("settler can found city and city accumulates/uses production", () => {
    const gameState = createInitialGameState();
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const foundResult = foundCity(settler.id, gameState);
    expect(foundResult.ok).toBe(true);
    expect(gameState.cities.length).toBe(1);

    const city = gameState.cities[0];
    expect(city.storedProduction).toBe(0);

    processTurn(gameState, "player");
    expect(city.storedProduction).toBe(2);

    processTurn(gameState, "player");
    processTurn(gameState, "player");

    const producedUnit = gameState.units.find((unit) => unit.owner === "player" && unit.id.startsWith("player-"));
    expect(producedUnit).toBeTruthy();
    expect(gameState.units.some((unit) => unit.type === "warrior")).toBe(true);
  });
});
