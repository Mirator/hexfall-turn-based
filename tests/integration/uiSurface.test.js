import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { getAttackableTargets } from "../../src/systems/combatSystem.js";
import { foundCity, getFoundCityReasonText } from "../../src/systems/citySystem.js";
import { deriveUiSurface } from "../../src/systems/uiSurfaceSystem.js";

describe("UI surface hints/actions", () => {
  it("shows found-city guidance when settler is selected and valid", () => {
    const gameState = createInitialGameState();
    const settler = gameState.units.find((unit) => unit.type === "settler" && unit.owner === "player");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const ui = deriveUiSurface(gameState, settler, null, [], []);
    expect(ui.uiActions.canFoundCity).toBe(true);
    expect(ui.uiHints.primary).toContain("Found city now");
  });

  it("shows warning guidance when settler already acted", () => {
    const gameState = createInitialGameState();
    const settler = gameState.units.find((unit) => unit.type === "settler" && unit.owner === "player");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    settler.hasActed = true;
    const ui = deriveUiSurface(gameState, settler, null, [], []);
    expect(ui.uiActions.canFoundCity).toBe(false);
    expect(ui.uiHints.level).toBe("warning");
    expect(ui.uiHints.primary).toContain("already acted");
  });

  it("shows combat hint when targets are attackable", () => {
    const gameState = createInitialGameState();
    const warrior = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    const enemy = gameState.units.find((unit) => unit.owner === "enemy");
    expect(warrior && enemy).toBeTruthy();
    if (!warrior || !enemy) {
      return;
    }

    warrior.type = "warrior";
    warrior.q = 3;
    warrior.r = 2;
    enemy.q = 4;
    enemy.r = 2;
    const attackableTargets = getAttackableTargets(warrior.id, gameState);
    const ui = deriveUiSurface(gameState, warrior, null, attackableTargets, []);
    expect(attackableTargets.length).toBeGreaterThan(0);
    expect(ui.uiHints.primary).toContain("Enemy in range");
  });

  it("maps found-city reason codes to user-facing text", () => {
    expect(getFoundCityReasonText("requires-settler")).toContain("Only settlers");
    expect(getFoundCityReasonText("unit-already-acted")).toContain("already acted");
  });

  it("shows restart confirmation hint while modal context is active", () => {
    const gameState = createInitialGameState();
    const ui = deriveUiSurface(gameState, null, null, [], [], { restartConfirmOpen: true });
    expect(ui.uiHints.primary).toContain("Confirm restart");
    expect(ui.uiHints.level).toBe("info");
  });

  it("enables direct focus and queue actions for player city selection", () => {
    const gameState = createInitialGameState({ seed: 121 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);

    const city = gameState.cities[0];
    const ui = deriveUiSurface(gameState, null, city, [], []);
    expect(ui.uiActions.canSetCityFocus).toBe(true);
    expect(ui.uiActions.canQueueProduction).toBe(true);
    expect(ui.uiActions.cityQueueMax).toBe(3);
    expect(ui.uiActions.cityProductionChoices.length).toBeGreaterThan(0);
    expect(ui.uiHints.primary).toContain("City selected");
  });

  it("reports queue-full reason when city queue reaches max", () => {
    const gameState = createInitialGameState({ seed: 122 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);

    const city = gameState.cities[0];
    city.queue = ["warrior", "settler", "warrior"];
    const ui = deriveUiSurface(gameState, null, city, [], []);
    expect(ui.uiActions.canQueueProduction).toBe(false);
    expect(ui.uiActions.cityQueueReason).toContain("full");
  });

  it("shows pending city-resolution hint while modal context is active", () => {
    const gameState = createInitialGameState({ seed: 133 });
    gameState.pendingCityResolution = {
      cityId: "enemy-city-1",
      attackerOwner: "player",
      defenderOwner: "enemy",
      choices: ["capture", "raze"],
    };
    const ui = deriveUiSurface(gameState, null, null, [], [], {
      pendingCityResolution: gameState.pendingCityResolution,
    });
    expect(ui.uiHints.primary).toContain("City defeated");
  });
});
