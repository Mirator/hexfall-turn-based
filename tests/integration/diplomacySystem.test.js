import { describe, expect, it } from "vitest";
import { areOwnersAtWar } from "../../src/core/factions.js";
import { createInitialGameState } from "../../src/core/gameState.js";
import { canAttack } from "../../src/systems/combatSystem.js";
import { declareWar, offerPeace } from "../../src/systems/diplomacySystem.js";
import { runEnemyTurn } from "../../src/systems/enemyTurnSystem.js";
import { beginEnemyTurn } from "../../src/systems/turnSystem.js";
import { deriveUiSurface } from "../../src/systems/uiSurfaceSystem.js";

describe("diplomacy system", () => {
  it("starts at war by default and allows peace to block attacks", () => {
    const gameState = createInitialGameState({ seed: 4101, aiFactionCount: 1 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    const enemyUnit = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerUnit && enemyUnit).toBeTruthy();
    if (!playerUnit || !enemyUnit) {
      return;
    }

    playerUnit.q = 3;
    playerUnit.r = 2;
    enemyUnit.q = 4;
    enemyUnit.r = 2;

    expect(areOwnersAtWar("player", "enemy", gameState)).toBe(true);
    expect(canAttack(playerUnit.id, enemyUnit.id, gameState)).toEqual({ ok: true });

    const peaceResult = offerPeace("player", "enemy", gameState);
    expect(peaceResult.ok).toBe(true);
    expect(areOwnersAtWar("player", "enemy", gameState)).toBe(false);
    expect(canAttack(playerUnit.id, enemyUnit.id, gameState)).toEqual({ ok: false, reason: "not-at-war" });
  });

  it("allows war declaration after peace and restores combat", () => {
    const gameState = createInitialGameState({ seed: 4102, aiFactionCount: 1 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    const enemyUnit = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerUnit && enemyUnit).toBeTruthy();
    if (!playerUnit || !enemyUnit) {
      return;
    }

    playerUnit.q = 3;
    playerUnit.r = 2;
    enemyUnit.q = 4;
    enemyUnit.r = 2;

    expect(offerPeace("player", "enemy", gameState).ok).toBe(true);
    expect(canAttack(playerUnit.id, enemyUnit.id, gameState)).toEqual({ ok: false, reason: "not-at-war" });

    const warResult = declareWar("player", "enemy", gameState);
    expect(warResult.ok).toBe(true);
    expect(areOwnersAtWar("player", "enemy", gameState)).toBe(true);
    expect(canAttack(playerUnit.id, enemyUnit.id, gameState)).toEqual({ ok: true });
  });

  it("exposes diplomacy action metadata for unit command UI", () => {
    const gameState = createInitialGameState({ seed: 4103, aiFactionCount: 1 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    expect(playerUnit).toBeTruthy();
    if (!playerUnit) {
      return;
    }

    const uiAtWar = deriveUiSurface(gameState, playerUnit, null, [], []);
    expect(uiAtWar.uiActions.canToggleDiplomacy).toBe(true);
    expect(uiAtWar.uiActions.diplomacyTargetOwner).toBe("enemy");
    expect(uiAtWar.uiActions.diplomacyActionLabel).toBe("Offer Peace");

    expect(offerPeace("player", "enemy", gameState).ok).toBe(true);
    const uiAtPeace = deriveUiSurface(gameState, playerUnit, null, [], []);
    expect(uiAtPeace.uiActions.diplomacyStatus).toBe("peace");
    expect(uiAtPeace.uiActions.diplomacyActionLabel).toBe("Declare War");
  });

  it("keeps enemy AI from attacking player units while at peace", () => {
    const gameState = createInitialGameState({ seed: 4104, aiFactionCount: 1 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    const enemyUnit = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerUnit && enemyUnit).toBeTruthy();
    if (!playerUnit || !enemyUnit) {
      return;
    }

    playerUnit.type = "warrior";
    playerUnit.attack = 4;
    playerUnit.armor = 1;
    playerUnit.health = 10;
    playerUnit.maxHealth = 10;
    playerUnit.attackRange = 1;
    playerUnit.minAttackRange = 1;
    playerUnit.q = 3;
    playerUnit.r = 2;

    enemyUnit.type = "warrior";
    enemyUnit.attack = 4;
    enemyUnit.armor = 1;
    enemyUnit.health = 10;
    enemyUnit.maxHealth = 10;
    enemyUnit.attackRange = 1;
    enemyUnit.minAttackRange = 1;
    enemyUnit.q = 4;
    enemyUnit.r = 2;

    gameState.cities.push(createCity("enemy-city-safe", "enemy", 8, 8));
    const healthBefore = playerUnit.health;
    expect(offerPeace("player", "enemy", gameState).ok).toBe(true);

    beginEnemyTurn(gameState);
    runEnemyTurn(gameState, "enemy");

    expect(playerUnit.health).toBe(healthBefore);
  });
});

function createCity(id, owner, q, r) {
  return {
    id,
    owner,
    q,
    r,
    population: 1,
    workedHexes: [{ q, r }],
    yieldLastTurn: { food: 0, production: 0, science: 0 },
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
  };
}

