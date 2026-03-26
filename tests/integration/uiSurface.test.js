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
    expect(ui.uiHints.primary).toContain("Hostile unit in range");
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

  it("enables city production and queue actions for player city selection", () => {
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
    expect(ui.uiActions.canQueueProduction).toBe(true);
    expect(ui.uiActions.canQueueUnits).toBe(true);
    expect(ui.uiActions.canQueueBuildings).toBe(true);
    expect(ui.uiActions.cityProductionTab).toBe("units");
    expect(ui.uiActions.contextMenuType).toBe("city");
    expect(ui.uiActions.cityQueueMax).toBe(3);
    expect(ui.uiActions.cityProductionChoices.length).toBeGreaterThan(0);
    expect(ui.uiActions.cityBuildingChoices.length).toBeGreaterThan(0);
    expect(ui.uiActions.cityQueueItems).toEqual([]);
    expect(ui.uiActions.cityQueueSlots.length).toBe(3);
    expect(ui.uiActions.cityQueueSlots[0].empty).toBe(true);
    expect(typeof ui.uiActions.cityProductionStock).toBe("number");
    expect(typeof ui.uiActions.cityLocalProduction).toBe("number");
    expect(ui.uiActions.cityProductionChoices[0].hoverText).toContain("Production Cost");
    expect(ui.uiActions.cityBuildingChoices[0].hoverText).toContain("Estimated Turns");
    expect(ui.uiHints.primary).toContain("City selected");
  });

  it("exposes unit context actions for selected player units", () => {
    const gameState = createInitialGameState({ seed: 125 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const ui = deriveUiSurface(gameState, settler, null, [], []);
    expect(ui.uiActions.contextMenuType).toBe("unit");
    expect(ui.uiActions.canSkipUnit).toBe(true);
    expect(ui.uiActions.skipUnitReason).toBeNull();
  });

  it("hides contextual menu while enemy phase is active", () => {
    const gameState = createInitialGameState({ seed: 126 });
    gameState.turnState.phase = "enemy";
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const ui = deriveUiSurface(gameState, settler, null, [], []);
    expect(ui.uiActions.contextMenuType).toBeNull();
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
    city.queue = [
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
      { kind: "unit", id: "warrior" },
    ];
    const ui = deriveUiSurface(gameState, null, city, [], []);
    expect(ui.uiActions.canQueueProduction).toBe(false);
    expect(ui.uiActions.cityQueueReason).toContain("full");
    expect(ui.uiActions.disabledActionHints["city-enqueue-warrior"]).toContain("Queue is full");
  });

  it("reports building-tab reason when unlocked buildings are already built/queued", () => {
    const gameState = createInitialGameState({ seed: 223 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);

    const city = gameState.cities[0];
    city.productionTab = "buildings";
    city.buildings = ["granary"];

    const ui = deriveUiSurface(gameState, null, city, [], []);
    expect(ui.uiActions.cityProductionTab).toBe("buildings");
    expect(ui.uiActions.canQueueBuildings).toBe(false);
    expect(ui.uiActions.canQueueProduction).toBe(false);
    expect(ui.uiActions.cityQueueReason).toContain("already built or queued");

    const granaryChoice = ui.uiActions.cityBuildingChoices.find((choice) => choice.id === "granary");
    expect(granaryChoice?.alreadyBuilt).toBe(true);
    expect(granaryChoice?.reasonCode).toBe("already-built");
    expect(ui.uiActions.disabledActionHints["city-enqueue-building-granary"]).toContain("already exists");
  });

  it("exposes locked reasons and queue slot controls for unavailable items", () => {
    const gameState = createInitialGameState({ seed: 227 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);
    const city = gameState.cities[0];

    const ui = deriveUiSurface(gameState, null, city, [], []);
    const archerChoice = ui.uiActions.cityProductionChoices.find((choice) => choice.type === "archer");
    expect(archerChoice?.unlocked).toBe(false);
    expect(archerChoice?.reasonCode).toBe("locked");
    expect(archerChoice?.reasonText).toContain("Archery");
    expect(archerChoice?.hoverText).toContain("Production Cost");
    expect(archerChoice?.hoverText).toContain("Archery");
    expect(ui.uiActions.disabledActionHints["city-enqueue-archer"]).toContain("Archery");

    const queueSlots = ui.uiActions.cityQueueSlots;
    expect(queueSlots[0].canMoveUp).toBe(false);
    expect(queueSlots[0].canMoveDown).toBe(false);
    expect(ui.uiActions.disabledActionHints["city-queue-move-up-0"]).toContain("empty");
    expect(ui.uiActions.disabledActionHints["city-queue-remove-0"]).toContain("empty");
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
