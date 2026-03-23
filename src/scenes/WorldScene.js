import Phaser from "phaser";
import { COLORS, HEX_SIZE } from "../core/constants.js";
import { gameEvents } from "../core/eventBus.js";
import { cloneGameState, createInitialGameState, getUnitAt, getUnitById, isInsideMap } from "../core/gameState.js";
import { axialKey, axialToWorld, worldToAxial } from "../core/hexGrid.js";
import { getReachable, moveUnit } from "../systems/movementSystem.js";
import { endTurn } from "../systems/turnSystem.js";

const SQRT_3 = Math.sqrt(3);

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("WorldScene");

    this.gameState = createInitialGameState();
    this.reachableHexes = [];
    this.reachableLookup = new Set();
    this.mapOrigin = { x: 0, y: 0 };
    this.manualTimeMs = 0;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.worldBackground);

    this.mapGraphics = this.add.graphics();
    this.reachableGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.scale.on("resize", this.handleResize, this);
    gameEvents.on("end-turn-requested", this.handleEndTurnRequested, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.scale.off("resize", this.handleResize, this);
      gameEvents.off("end-turn-requested", this.handleEndTurnRequested, this);
    });

    this.recalculateOrigin();
    this.renderAll();
    this.publishState();
  }

  handleResize(gameSize) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.recalculateOrigin();
    this.renderAll();
  }

  handlePointerDown(pointer) {
    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const clickedHex = worldToAxial(worldPoint.x, worldPoint.y, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
    if (!isInsideMap(this.gameState.map, clickedHex.q, clickedHex.r)) {
      this.clearSelection();
      return;
    }

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (selectedUnit && this.reachableLookup.has(axialKey(clickedHex))) {
      const result = moveUnit(selectedUnit.id, clickedHex, this.gameState);
      if (result.ok) {
        this.refreshReachable();
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const unitAtHex = getUnitAt(this.gameState, clickedHex.q, clickedHex.r);
    if (unitAtHex && unitAtHex.owner === "player") {
      this.gameState.selectedUnitId = unitAtHex.id;
      this.refreshReachable();
      this.renderAll();
      this.publishState();
      return;
    }

    this.clearSelection();
  }

  handleEndTurnRequested = () => {
    endTurn(this.gameState);
    this.refreshReachable();
    this.renderAll();
    this.publishState();
  };

  clearSelection() {
    if (!this.gameState.selectedUnitId) {
      return;
    }

    this.gameState.selectedUnitId = null;
    this.refreshReachable();
    this.renderAll();
    this.publishState();
  }

  refreshReachable() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit) {
      this.reachableHexes = [];
      this.reachableLookup = new Set();
      return;
    }

    this.reachableHexes = getReachable(selectedUnit.id, this.gameState);
    this.reachableLookup = new Set(this.reachableHexes.map((hex) => axialKey(hex)));
  }

  publishState() {
    gameEvents.emit("state-changed", this.getGameStateSnapshot());
  }

  getGameStateSnapshot() {
    return cloneGameState(this.gameState);
  }

  recalculateOrigin() {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const hexWidth = SQRT_3 * HEX_SIZE;
    const mapWidth = hexWidth * this.gameState.map.width + hexWidth * 0.5 * (this.gameState.map.height - 1);
    const mapHeight = HEX_SIZE * 1.5 * (this.gameState.map.height - 1) + HEX_SIZE * 2;

    this.mapOrigin.x = (viewportWidth - mapWidth) / 2 + hexWidth / 2;
    this.mapOrigin.y = (viewportHeight - mapHeight) / 2 + HEX_SIZE;
  }

  hexToWorld(q, r) {
    return axialToWorld({ q, r }, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
  }

  renderAll() {
    this.renderMap();
    this.renderReachable();
    this.renderSelection();
    this.renderUnits();
  }

  renderMap() {
    this.mapGraphics.clear();

    for (let q = 0; q < this.gameState.map.width; q += 1) {
      for (let r = 0; r < this.gameState.map.height; r += 1) {
        const center = this.hexToWorld(q, r);
        const fillColor = (q + r) % 2 === 0 ? COLORS.tileFillA : COLORS.tileFillB;
        drawHex(this.mapGraphics, center.x, center.y, HEX_SIZE, fillColor, 1, COLORS.tileStroke, 1.2);
      }
    }
  }

  renderReachable() {
    this.reachableGraphics.clear();
    for (const hex of this.reachableHexes) {
      const center = this.hexToWorld(hex.q, hex.r);
      drawHex(
        this.reachableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.93,
        COLORS.reachableFill,
        0.45,
        COLORS.reachableStroke,
        1
      );
    }
  }

  renderSelection() {
    this.selectionGraphics.clear();
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit) {
      return;
    }
    const center = this.hexToWorld(selectedUnit.q, selectedUnit.r);
    drawHex(this.selectionGraphics, center.x, center.y, HEX_SIZE * 1.02, undefined, 0, COLORS.selectedStroke, 3);
  }

  renderUnits() {
    this.unitGraphics.clear();
    for (const unit of this.gameState.units) {
      const center = this.hexToWorld(unit.q, unit.r);
      this.unitGraphics.fillStyle(COLORS.playerUnit, 1);
      this.unitGraphics.fillCircle(center.x, center.y, HEX_SIZE * 0.42);
      this.unitGraphics.lineStyle(2, COLORS.playerUnitStroke, 1);
      this.unitGraphics.strokeCircle(center.x, center.y, HEX_SIZE * 0.42);
    }
  }

  manualAdvanceTime(ms) {
    this.manualTimeMs += Math.max(0, ms);
  }

  renderGameToText() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const payload = {
      coordinateSystem: "Axial coordinates: q increases down-right, r increases down.",
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
      map: {
        width: this.gameState.map.width,
        height: this.gameState.map.height,
      },
      selectedUnitId: this.gameState.selectedUnitId,
      selectedUnitMovementRemaining: selectedUnit ? selectedUnit.movementRemaining : null,
      reachableHexes: this.reachableHexes.map((hex) => ({ q: hex.q, r: hex.r, cost: hex.cost })),
      units: this.gameState.units.map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        q: unit.q,
        r: unit.r,
        movementRemaining: unit.movementRemaining,
        maxMovement: unit.maxMovement,
      })),
      simulatedTimeMs: this.manualTimeMs,
    };
    return JSON.stringify(payload);
  }
}

function drawHex(graphics, x, y, size, fillColor, fillAlpha, strokeColor, strokeWidth) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    points.push(new Phaser.Math.Vector2(x + size * Math.cos(angle), y + size * Math.sin(angle)));
  }

  graphics.lineStyle(strokeWidth, strokeColor, 1);
  if (typeof fillColor === "number" && fillAlpha > 0) {
    graphics.fillStyle(fillColor, fillAlpha);
    graphics.fillPoints(points, true);
  }
  graphics.strokePoints(points, true);
}
