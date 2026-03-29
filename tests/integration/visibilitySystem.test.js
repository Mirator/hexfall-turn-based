import { describe, expect, it } from "vitest";
import { createInitialGameState, getTileAt, isInsideMap } from "../../src/core/gameState.js";
import { distance, neighbors } from "../../src/core/hexGrid.js";
import {
  canOwnerSeeUnit,
  getSeenHostileOwners,
  getSeenOwners,
  isHexExploredByOwner,
  isHexVisibleToOwner,
  isPlayerDevVisionEnabled,
  recomputeVisibility,
  togglePlayerDevVision,
} from "../../src/systems/visibilitySystem.js";

describe("visibility and fog of war", () => {
  it("keeps explored-memory when a tile leaves current vision", () => {
    const gameState = createInitialGameState({ seed: 901 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(playerSettler).toBeTruthy();
    if (!playerSettler) {
      return;
    }

    const origin = { q: playerSettler.q, r: playerSettler.r };
    recomputeVisibility(gameState);
    expect(isHexVisibleToOwner(gameState, "player", origin.q, origin.r)).toBe(true);

    const destination = gameState.map.tiles.find(
      (tile) =>
        !tile.blocksMovement &&
        distance(tile, origin) > 5 &&
        !gameState.units.some((unit) => unit.id !== playerSettler.id && unit.q === tile.q && unit.r === tile.r)
    );
    expect(destination).toBeTruthy();
    if (!destination) {
      return;
    }

    playerSettler.q = destination.q;
    playerSettler.r = destination.r;
    recomputeVisibility(gameState);

    expect(isHexVisibleToOwner(gameState, "player", origin.q, origin.r)).toBe(false);
    expect(isHexExploredByOwner(gameState, "player", origin.q, origin.r)).toBe(true);
  });

  it("conceals hostiles until seen, then keeps encounter memory", () => {
    const gameState = createInitialGameState({ seed: 902 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "settler");
    expect(playerSettler && enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    recomputeVisibility(gameState);
    expect(canOwnerSeeUnit(gameState, "player", enemySettler)).toBe(false);
    expect(getSeenOwners(gameState, "player")).not.toContain("enemy");

    const adjacentVisibleHex = pickAdjacentPassableHex(gameState, playerSettler, enemySettler.id);
    expect(adjacentVisibleHex).toBeTruthy();
    if (!adjacentVisibleHex) {
      return;
    }
    enemySettler.q = adjacentVisibleHex.q;
    enemySettler.r = adjacentVisibleHex.r;
    recomputeVisibility(gameState);

    expect(canOwnerSeeUnit(gameState, "player", enemySettler)).toBe(true);
    expect(getSeenOwners(gameState, "player")).toContain("enemy");

    const hiddenHex = pickFarPassableHex(gameState, playerSettler, enemySettler.id);
    expect(hiddenHex).toBeTruthy();
    if (!hiddenHex) {
      return;
    }
    enemySettler.q = hiddenHex.q;
    enemySettler.r = hiddenHex.r;
    recomputeVisibility(gameState);

    expect(canOwnerSeeUnit(gameState, "player", enemySettler)).toBe(false);
    expect(getSeenOwners(gameState, "player")).toContain("enemy");
  });

  it("tracks AI encounter memory used for hostile-priority filtering", () => {
    const gameState = createInitialGameState({ seed: 903 });
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "settler");
    const purpleSettler = gameState.units.find((unit) => unit.owner === "purple" && unit.type === "settler");
    expect(enemySettler && purpleSettler).toBeTruthy();
    if (!enemySettler || !purpleSettler) {
      return;
    }

    recomputeVisibility(gameState);
    expect(getSeenHostileOwners(gameState, "enemy")).not.toContain("purple");

    const adjacentVisibleHex = pickAdjacentPassableHex(gameState, enemySettler, purpleSettler.id);
    expect(adjacentVisibleHex).toBeTruthy();
    if (!adjacentVisibleHex) {
      return;
    }
    purpleSettler.q = adjacentVisibleHex.q;
    purpleSettler.r = adjacentVisibleHex.r;
    recomputeVisibility(gameState);

    expect(getSeenHostileOwners(gameState, "enemy")).toContain("purple");
  });

  it("tracks seen hostiles for expanded AI roster and keeps dynamic byOwner buckets", () => {
    const gameState = createInitialGameState({ seed: 1903, aiFactionCount: 4, mapWidth: 24, mapHeight: 24 });
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "settler");
    const amberSettler = gameState.units.find((unit) => unit.owner === "amber" && unit.type === "settler");
    expect(enemySettler && amberSettler).toBeTruthy();
    if (!enemySettler || !amberSettler) {
      return;
    }

    for (const owner of gameState.factions.allOwners) {
      expect(gameState.visibility.byOwner[owner]).toBeTruthy();
    }
    recomputeVisibility(gameState);
    expect(getSeenHostileOwners(gameState, "enemy")).not.toContain("amber");

    const adjacentVisibleHex = pickAdjacentPassableHex(gameState, enemySettler, amberSettler.id);
    expect(adjacentVisibleHex).toBeTruthy();
    if (!adjacentVisibleHex) {
      return;
    }
    amberSettler.q = adjacentVisibleHex.q;
    amberSettler.r = adjacentVisibleHex.r;
    recomputeVisibility(gameState);
    expect(getSeenHostileOwners(gameState, "enemy")).toContain("amber");
  });

  it("toggles player dev reveal without changing AI fog data", () => {
    const gameState = createInitialGameState({ seed: 904 });
    recomputeVisibility(gameState);

    const beforeVisible = [...gameState.visibility.byOwner.enemy.visibleHexes];
    const beforeExplored = [...gameState.visibility.byOwner.enemy.exploredHexes];

    expect(isPlayerDevVisionEnabled(gameState)).toBe(false);
    expect(togglePlayerDevVision(gameState)).toBe(true);
    expect(isPlayerDevVisionEnabled(gameState)).toBe(true);

    expect(gameState.visibility.byOwner.enemy.visibleHexes).toEqual(beforeVisible);
    expect(gameState.visibility.byOwner.enemy.exploredHexes).toEqual(beforeExplored);

    expect(togglePlayerDevVision(gameState)).toBe(false);
    expect(isPlayerDevVisionEnabled(gameState)).toBe(false);
  });
});

function pickAdjacentPassableHex(gameState, center, ignoredUnitId) {
  return neighbors(center).find((hex) => {
    if (!isInsideMap(gameState.map, hex.q, hex.r)) {
      return false;
    }
    if (gameState.units.some((unit) => unit.id !== ignoredUnitId && unit.q === hex.q && unit.r === hex.r)) {
      return false;
    }
    if (gameState.cities.some((city) => city.q === hex.q && city.r === hex.r)) {
      return false;
    }
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    return !!tile && !tile.blocksMovement;
  });
}

function pickFarPassableHex(gameState, center, ignoredUnitId) {
  return gameState.map.tiles.find((tile) => {
    if (tile.blocksMovement) {
      return false;
    }
    if (distance(tile, center) <= 6) {
      return false;
    }
    if (gameState.units.some((unit) => unit.id !== ignoredUnitId && unit.q === tile.q && unit.r === tile.r)) {
      return false;
    }
    if (gameState.cities.some((city) => city.q === tile.q && city.r === tile.r)) {
      return false;
    }
    return true;
  });
}
