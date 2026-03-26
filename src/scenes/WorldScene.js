import Phaser from "../core/phaserRuntime.js";
import { COLORS, HEX_SIZE } from "../core/constants.js";
import { gameEvents } from "../core/eventBus.js";
import {
  cloneGameState,
  createInitialGameState,
  DEFAULT_MIN_FACTION_DISTANCE,
  getCityAt,
  getTileAt,
  getUnitAt,
  getUnitById,
  isInsideMap,
} from "../core/gameState.js";
import { AI_OWNERS, getOwnerLabel, isAiOwner } from "../core/factions.js";
import { axialKey, axialToWorld, distance, neighbors, worldToAxial } from "../core/hexGrid.js";
import { TERRAIN } from "../core/terrainData.js";
import {
  CITY_QUEUE_MAX,
  computeCityYield,
  enqueueCityBuilding,
  enqueueCityQueue,
  enqueueCityQueueItem,
  foundCity,
  getFoundCityReasonText,
  moveCityQueueItem,
  removeCityQueueAt,
  setCityFocus,
  setCityProductionTab,
  processTurn as processCityTurn,
} from "../systems/citySystem.js";
import {
  getAttackableCities,
  getAttackableTargets,
  previewAttack,
  previewCityAttack,
  resolveAttack,
  resolveCityAttack,
  resolveCityOutcome,
} from "../systems/combatSystem.js";
import {
  ensureAiState,
  ensureEnemyAiState,
  executeEnemyTurnPrelude,
  executeEnemyTurnStep,
  finalizeEnemyTurnPlan,
  normalizeEnemyPersonality,
  prepareEnemyTurnPlan,
  runEnemyTurn,
} from "../systems/enemyTurnSystem.js";
import { getReachable, moveUnit } from "../systems/movementSystem.js";
import { consumeScienceStock, cycleResearch, selectResearch } from "../systems/researchSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../systems/turnSystem.js";
import { deriveUiSurface } from "../systems/uiSurfaceSystem.js";
import { getSkipUnitReasonText, skipUnit } from "../systems/unitActionSystem.js";
import { evaluateMatchState } from "../systems/victorySystem.js";
import {
  canOwnerSeeUnit,
  isHexExploredByOwner,
  isHexVisibleToOwner,
  isPlayerDevVisionEnabled,
  recomputeVisibility,
  togglePlayerDevVision,
} from "../systems/visibilitySystem.js";

const SQRT_3 = Math.sqrt(3);
const RESTART_MIN_FACTION_DISTANCE = DEFAULT_MIN_FACTION_DISTANCE;
const CAMERA_KEYBOARD_PAN_SPEED = 700;
const MOVE_SEGMENT_MS = 160;
const ATTACK_ANIMATION_MS = 260;
const FOUND_CITY_ANIMATION_MS = 420;
const ENEMY_ACTION_GAP_MS = 120;

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("WorldScene");

    this.gameState = createInitialGameState({ seed: 1, minFactionDistance: RESTART_MIN_FACTION_DISTANCE });
    this.reachableHexes = [];
    this.reachableLookup = new Set();
    this.reachableCostByKey = new Map();
    this.attackableTargets = [];
    this.attackableLookup = new Set();
    this.attackableCities = [];
    this.attackableCityLookup = new Set();
    this.threatHexes = [];
    this.threatLookup = new Set();
    this.uiPreview = null;
    this.mapOrigin = { x: 0, y: 0 };
    this.manualTimeMs = 0;
    this.enemyTurnPlaybackToken = 0;
    this.enemyTurnActivePlan = null;
    this.foundCityKeyBinding = null;
    this.nextUnitKeyBinding = null;
    this.devVisionKeyBinding = null;
    this.cameraPanKeys = null;
    this.uiModalOpen = false;
    this.runtimeSeedCounter = 0;
    this.lastCombatEvent = null;
    this.cameraFocusHex = null;
    this.isRightDraggingCamera = false;
    this.cameraDragLastScreenPos = null;
    this.preventContextMenuHandler = null;
    this.animationQueue = [];
    this.animationQueueRunning = false;
    this.isAnimationBusy = false;
    this.activeAnimationKind = null;
    this.unitRenderOverrides = new Map();
    this.cityRenderOverrides = new Map();
    this.fxBursts = [];
    this.floatingDamage = [];
    this.floatingDamageTextById = new Map();
    this.floatingDamageNextId = 1;
    this.turnPlayback = this.createTurnPlaybackState();
    this.activeTimers = new Set();
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.worldBackground);
    this.startNewMatch();

    this.mapGraphics = this.add.graphics();
    this.threatGraphics = this.add.graphics();
    this.reachableGraphics = this.add.graphics();
    this.attackableGraphics = this.add.graphics();
    this.previewGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics();
    this.cityGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();
    this.fxGraphics = this.add.graphics();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.foundCityKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F) ?? null;
    this.nextUnitKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TAB) ?? null;
    this.devVisionKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.V) ?? null;
    this.cameraPanKeys =
      this.input.keyboard?.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        d: Phaser.Input.Keyboard.KeyCodes.D,
      }) ?? null;
    this.foundCityKeyBinding?.on("down", this.handleFoundCityRequested, this);
    this.nextUnitKeyBinding?.on("down", this.handleNextReadyUnitRequested, this);
    this.devVisionKeyBinding?.on("down", this.handleDevVisionToggleRequested, this);
    if (this.game.canvas) {
      this.preventContextMenuHandler = (event) => event.preventDefault();
      this.game.canvas.addEventListener("contextmenu", this.preventContextMenuHandler);
    }
    this.scale.on("resize", this.handleResize, this);
    gameEvents.on("end-turn-requested", this.handleEndTurnRequested, this);
    gameEvents.on("next-ready-unit-requested", this.handleNextReadyUnitRequested, this);
    gameEvents.on("found-city-requested", this.handleFoundCityRequested, this);
    gameEvents.on("research-cycle-requested", this.handleResearchCycleRequested, this);
    gameEvents.on("unit-action-requested", this.handleUnitActionRequested, this);
    gameEvents.on("city-focus-set-requested", this.handleCityFocusSetRequested, this);
    gameEvents.on("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
    gameEvents.on("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
    gameEvents.on("city-queue-move-requested", this.handleCityQueueMoveRequested, this);
    gameEvents.on("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
    gameEvents.on("city-outcome-requested", this.handleCityOutcomeRequested, this);
    gameEvents.on("restart-match-requested", this.handleRestartRequested, this);
    gameEvents.on("notification-focus-requested", this.handleNotificationFocusRequested, this);
    gameEvents.on("ui-modal-state-changed", this.handleUiModalStateChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.input.off("pointermove", this.handlePointerMove, this);
      this.input.off("pointerup", this.handlePointerUp, this);
      this.foundCityKeyBinding?.off("down", this.handleFoundCityRequested, this);
      this.nextUnitKeyBinding?.off("down", this.handleNextReadyUnitRequested, this);
      this.devVisionKeyBinding?.off("down", this.handleDevVisionToggleRequested, this);
      this.scale.off("resize", this.handleResize, this);
      gameEvents.off("end-turn-requested", this.handleEndTurnRequested, this);
      gameEvents.off("next-ready-unit-requested", this.handleNextReadyUnitRequested, this);
      gameEvents.off("found-city-requested", this.handleFoundCityRequested, this);
      gameEvents.off("research-cycle-requested", this.handleResearchCycleRequested, this);
      gameEvents.off("unit-action-requested", this.handleUnitActionRequested, this);
      gameEvents.off("city-focus-set-requested", this.handleCityFocusSetRequested, this);
      gameEvents.off("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
      gameEvents.off("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
      gameEvents.off("city-queue-move-requested", this.handleCityQueueMoveRequested, this);
      gameEvents.off("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
      gameEvents.off("city-outcome-requested", this.handleCityOutcomeRequested, this);
      gameEvents.off("restart-match-requested", this.handleRestartRequested, this);
      gameEvents.off("notification-focus-requested", this.handleNotificationFocusRequested, this);
      gameEvents.off("ui-modal-state-changed", this.handleUiModalStateChanged, this);
      this.abortEnemyPlayback();
      this.clearAnimationArtifacts();
      if (this.game.canvas && this.preventContextMenuHandler) {
        this.game.canvas.removeEventListener("contextmenu", this.preventContextMenuHandler);
      }
      this.preventContextMenuHandler = null;
      this.endCameraDrag();
    });

    this.recalculateOrigin();
    this.evaluateAndPublish();
  }

  update(time, delta) {
    const moved = this.updateKeyboardCameraPan(delta);
    const hasAnimationFrame = this.updateTransientVisualState(time);
    if (hasAnimationFrame) {
      this.renderAll();
    }
    if (moved) {
      this.publishState();
    }
  }

  handleResize(gameSize) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.recalculateOrigin();
    this.cameras.main.setScroll(0, 0);
    this.cameraFocusHex = null;
    this.endCameraDrag();
    this.renderAll();
  }

  handlePointerDown(pointer) {
    const rightClick = pointer.button === 2 || pointer.rightButtonDown();
    if (rightClick) {
      if (this.canPanCamera()) {
        this.beginCameraDrag(pointer);
      }
      return;
    }
    if (this.isRightDraggingCamera) {
      return;
    }
    if (!this.canAcceptPlayerCommands()) {
      return;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const clickedHex = worldToAxial(worldPoint.x, worldPoint.y, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
    if (!isInsideMap(this.gameState.map, clickedHex.q, clickedHex.r)) {
      this.clearSelection();
      return;
    }

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const clickedUnit = getUnitAt(this.gameState, clickedHex.q, clickedHex.r);
    const clickedCity = getCityAt(this.gameState, clickedHex.q, clickedHex.r);
    const clickedUnitVisible = clickedUnit ? this.isUnitVisibleToPlayer(clickedUnit) : false;
    const clickedCityVisible = clickedCity ? this.isCityVisibleToPlayer(clickedCity) : false;

    if (selectedUnit && clickedUnit && clickedUnit.owner !== selectedUnit.owner) {
      if (!clickedUnitVisible) {
        return;
      }
      void this.handlePlayerUnitAttack(selectedUnit.id, clickedUnit.id);
      return;
    }

    if (selectedUnit && clickedCity && clickedCity.owner !== selectedUnit.owner) {
      if (!clickedCityVisible) {
        return;
      }
      if (!this.attackableCityLookup.has(clickedCity.id)) {
        return;
      }
      void this.handlePlayerCityAttack(selectedUnit.id, clickedCity.id);
      return;
    }

    if (selectedUnit && this.reachableLookup.has(axialKey(clickedHex))) {
      void this.handlePlayerMove(selectedUnit.id, clickedHex);
      return;
    }

    if (clickedUnit && clickedUnit.owner === "player") {
      this.selectUnit(clickedUnit.id);
      return;
    }

    if (clickedCity && clickedCity.owner === "player") {
      this.selectCity(clickedCity.id);
      return;
    }

    this.clearSelection();
  }

  handlePointerUp(pointer) {
    if (!this.isRightDraggingCamera) {
      return;
    }
    if (pointer.button === 2 || !pointer.rightButtonDown()) {
      this.endCameraDrag();
    }
  }

  handlePointerMove(pointer) {
    if (this.isRightDraggingCamera || pointer.rightButtonDown()) {
      if (!this.canPanCamera()) {
        this.endCameraDrag();
        return;
      }
      if (!this.isRightDraggingCamera) {
        this.beginCameraDrag(pointer);
      }
      const moved = this.updateCameraDrag(pointer);
      if (moved) {
        this.publishState();
      }
      return;
    }

    if (!this.canAcceptPlayerCommands()) {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== "player") {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const hoveredHex = worldToAxial(worldPoint.x, worldPoint.y, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
    if (!isInsideMap(this.gameState.map, hoveredHex.q, hoveredHex.r)) {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const nextPreview = this.buildHoverPreview(selectedUnit, hoveredHex);
    if (this.setUiPreview(nextPreview)) {
      this.renderAll();
      this.publishState();
    }
  }

  handleEndTurnRequested = () => {
    if (!this.canAcceptPlayerCommands() || this.turnPlayback.active) {
      return;
    }

    this.enterEnemyPhase();
  };

  handleNextReadyUnitRequested = (event) => {
    event?.preventDefault?.();
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const nextAttentionTarget = this.getNextAttentionTarget();
    if (!nextAttentionTarget) {
      this.emitNotification("No units or city queues need attention.", {
        level: "warning",
        category: "System",
      });
      return false;
    }
    if (nextAttentionTarget.kind === "unit") {
      this.selectUnit(nextAttentionTarget.id);
    } else {
      this.selectCity(nextAttentionTarget.id);
    }
    return true;
  };

  handleNotificationFocusRequested = (payload) => {
    const focus = payload?.focus ?? payload;
    const resolved = this.resolveNotificationFocus(focus);
    if (!resolved) {
      this.emitNotification("Cannot focus this notification target anymore.", {
        level: "warning",
        category: "System",
      });
      return false;
    }

    this.focusCameraOnHex(resolved.q, resolved.r);
    this.cameraFocusHex = { q: resolved.q, r: resolved.r };
    this.renderAll();
    this.publishState();
    return true;
  };

  handleDevVisionToggleRequested = () => {
    const enabled = togglePlayerDevVision(this.gameState);
    this.evaluateAndPublish();
    this.emitNotification(`Dev Vision ${enabled ? "enabled" : "disabled"}.`, {
      level: "info",
      category: "System",
    });
    return enabled;
  };

  handleFoundCityRequested = () => {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      this.emitNotification(getFoundCityReasonText("unit-not-found"), {
        level: "warning",
        category: "City",
      });
      return false;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      const foundedCity = result.cityId ? this.gameState.cities.find((city) => city.id === result.cityId) : null;
      this.emitNotification("City founded.", {
        level: "info",
        category: "City",
        focus: foundedCity ? { cityId: foundedCity.id, q: foundedCity.q, r: foundedCity.r } : null,
      });
      if (foundedCity) {
        void this.enqueueAnimation("found-city", async () => {
          await this.animateFoundCityClip({
            cityId: foundedCity.id,
            q: foundedCity.q,
            r: foundedCity.r,
          });
        });
      }
      return true;
    }
    this.emitNotification(getFoundCityReasonText(result.reason), {
      level: "warning",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
    return false;
  };

  handleResearchCycleRequested = () => {
    if (this.gameState.match.status !== "ongoing") {
      return;
    }
    const result = cycleResearch(this.gameState);
    this.evaluateAndPublish();
    if (result.selected) {
      this.emitNotification(`Research selected: ${capitalizeLabel(result.selected)}.`, {
        level: "info",
        category: "Research",
      });
    } else {
      this.emitNotification("No available research right now.", {
        level: "warning",
        category: "Research",
      });
    }
  };

  handleUnitActionRequested = (payload) => {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const actionId = payload?.actionId;
    if (actionId === "foundCity") {
      return this.handleFoundCityRequested();
    }
    if (actionId === "skipUnit") {
      const selectedUnitId = this.gameState.selectedUnitId;
      if (!selectedUnitId) {
        this.emitNotification(getSkipUnitReasonText("unit-not-found"), {
          level: "warning",
          category: "System",
        });
        return false;
      }
      const result = skipUnit(selectedUnitId, this.gameState);
      if (!result.ok) {
        this.emitNotification(getSkipUnitReasonText(result.reason), {
          level: "warning",
          category: "System",
          focus: this.buildSelectionFocusPayload(),
        });
        return false;
      }
      this.evaluateAndPublish();
      this.emitNotification("Unit is waiting this turn.", {
        level: "info",
        category: "System",
        focus: this.buildSelectionFocusPayload(),
      });
      return true;
    }
    return false;
  };

  handleCityFocusSetRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const focus = payload?.focus;
    if (focus !== "balanced" && focus !== "food" && focus !== "production" && focus !== "science") {
      return;
    }

    const result = setCityFocus(this.gameState.selectedCityId, focus, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      const city = this.gameState.cities.find((candidate) => candidate.id === this.gameState.selectedCityId) ?? null;
      this.emitNotification(`City focus: ${result.focus}.`, {
        level: "info",
        category: "City",
        focus: city ? { cityId: city.id, q: city.q, r: city.r } : null,
      });
      return;
    }
    this.emitNotification("Could not set city focus.", {
      level: "warning",
      category: "City",
    });
  };

  handleCityProductionTabSetRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const tab = payload?.tab;
    if (tab !== "units" && tab !== "buildings") {
      return;
    }

    const result = setCityProductionTab(this.gameState.selectedCityId, tab, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      this.emitNotification(`Production tab: ${tab}.`, {
        level: "info",
        category: "City",
        focus: this.buildSelectionFocusPayload(),
      });
      return;
    }

    this.emitNotification("Could not switch production tab.", {
      level: "warning",
      category: "City",
    });
  };

  handleCityQueueEnqueueRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const queueItem = normalizeIncomingQueueItem(payload);
    if (!queueItem) {
      return;
    }

    const result = enqueueCityQueueItem(this.gameState.selectedCityId, queueItem, this.gameState);
    if (!result.ok) {
      const message = this.getQueueFailureMessage(result.reason);
      this.emitNotification(message, {
        level: "warning",
        category: "City",
        focus: this.buildSelectionFocusPayload(),
      });
      this.evaluateAndPublish();
      return;
    }

    this.evaluateAndPublish();
    const queuedLabel =
      queueItem.kind === "building" ? `${capitalizeLabel(queueItem.id)} building` : `${capitalizeLabel(queueItem.id)} unit`;
    this.emitNotification(`${queuedLabel} added to queue (${result.queue?.length ?? 0}/${CITY_QUEUE_MAX}).`, {
      level: "info",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
  };

  handleCityQueueMoveRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const slotIndex = Number(payload?.index);
    const direction = payload?.direction;
    if (direction !== "up" && direction !== "down") {
      return;
    }

    const result = moveCityQueueItem(this.gameState.selectedCityId, slotIndex, direction, this.gameState);
    if (!result.ok) {
      this.emitNotification(this.getQueueMoveFailureMessage(result.reason, direction), {
        level: "warning",
        category: "City",
        focus: this.buildSelectionFocusPayload(),
      });
      return;
    }

    this.evaluateAndPublish();
    this.emitNotification(`Queue item moved ${direction}.`, {
      level: "info",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
  };

  handleCityQueueRemoveRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const slotIndex = Number(payload?.index);
    const result = removeCityQueueAt(this.gameState.selectedCityId, slotIndex, this.gameState);
    if (!result.ok) {
      this.emitNotification("Could not remove queue item.", {
        level: "warning",
        category: "City",
      });
      return;
    }

    this.evaluateAndPublish();
    this.emitNotification("Queue item removed.", {
      level: "info",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
  };

  handleCityOutcomeRequested = (payload) => {
    const cityId = this.gameState.pendingCityResolution?.cityId;
    if (!cityId) {
      return;
    }
    const cityBefore = this.gameState.cities.find((city) => city.id === cityId) ?? null;
    const cityHexBefore = cityBefore ? { q: cityBefore.q, r: cityBefore.r } : null;

    const choice = payload?.choice;
    if (choice !== "capture" && choice !== "raze") {
      return;
    }

    const result = resolveCityOutcome(cityId, choice, this.gameState);
    if (!result.ok) {
      this.emitNotification("Could not resolve city outcome.", {
        level: "warning",
        category: "Combat",
      });
      this.evaluateAndPublish();
      return;
    }

    const message = choice === "capture" ? "City captured." : "City razed.";
    this.emitNotification(message, {
      level: "info",
      category: "Combat",
    });
    this.evaluateAndPublish();
    if (cityHexBefore) {
      void this.enqueueAnimation("city-outcome", async () => {
        await this.animateCityOutcomeClip({
          q: cityHexBefore.q,
          r: cityHexBefore.r,
          choice,
        });
      });
    }
  };

  handleRestartRequested = () => {
    this.abortEnemyPlayback();
    this.clearAnimationArtifacts();
    const previousLayout = this.captureLayoutFingerprint(this.gameState);
    this.startNewMatch(previousLayout);
    this.evaluateAndPublish();
    gameEvents.emit("ui-notifications-reset-requested");
    this.emitNotification("Match restarted.", {
      level: "info",
      category: "System",
    });
  };

  handleUiModalStateChanged = (isOpen) => {
    this.uiModalOpen = !!isOpen;
    if (isOpen) {
      this.endCameraDrag();
    }
    const previewCleared = isOpen ? this.setUiPreview(null) : false;
    if (previewCleared) {
      this.renderAll();
    }
    this.publishState();
  };

  getQueueFailureMessage(reason) {
    if (reason === "queue-full") {
      return `Queue is full (${CITY_QUEUE_MAX}/${CITY_QUEUE_MAX}). Remove one item first.`;
    }
    if (reason === "unit-not-unlocked") {
      return "That unit is not unlocked yet.";
    }
    if (reason === "building-not-unlocked") {
      return "That building is not unlocked yet.";
    }
    if (reason === "building-already-built") {
      return "This building already exists in the city.";
    }
    if (reason === "building-already-queued") {
      return "This building is already queued.";
    }
    if (reason === "invalid-unit-type" || reason === "invalid-building-id" || reason === "invalid-queue-item") {
      return "That queue item is not valid.";
    }
    if (reason === "city-not-found") {
      return "Select a city first.";
    }
    return "Could not add item to queue.";
  }

  getQueueMoveFailureMessage(reason, direction) {
    if (reason === "queue-index-invalid") {
      return "Queue slot is empty.";
    }
    if (reason === "queue-move-out-of-range") {
      return direction === "up" ? "Item is already at the top of the queue." : "Item is already at the bottom of the queue.";
    }
    if (reason === "queue-move-direction-invalid") {
      return "Queue move direction is invalid.";
    }
    if (reason === "city-not-found") {
      return "Select a city first.";
    }
    return "Could not move queue item.";
  }

  startNewMatch(previousLayout = null) {
    let nextState = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const seed = this.generateRuntimeSeed();
      const candidate = createInitialGameState({
        seed,
        minFactionDistance: RESTART_MIN_FACTION_DISTANCE,
      });
      if (!previousLayout || !this.matchesLayout(candidate, previousLayout)) {
        nextState = candidate;
        break;
      }
    }

    this.gameState =
      nextState ??
      createInitialGameState({
        seed: this.generateRuntimeSeed(),
        minFactionDistance: RESTART_MIN_FACTION_DISTANCE,
      });
    ensureEnemyAiState(this.gameState);
    this.enemyTurnPlaybackToken += 1;
    this.enemyTurnActivePlan = null;
    this.uiModalOpen = false;
    this.manualTimeMs = 0;
    this.lastCombatEvent = null;
    this.threatHexes = [];
    this.threatLookup = new Set();
    this.turnPlayback = this.createTurnPlaybackState();
    this.animationQueue = [];
    this.animationQueueRunning = false;
    this.isAnimationBusy = false;
    this.activeAnimationKind = null;
    this.clearAnimationArtifacts();
    this.setUiPreview(null);
    this.cameraFocusHex = null;
    this.cameras?.main?.setScroll(0, 0);
    this.endCameraDrag();
  }

  generateRuntimeSeed() {
    this.runtimeSeedCounter += 1;
    const randomBits = Math.floor(Math.random() * 0xffffffff);
    const value = (Date.now() ^ randomBits ^ Math.imul(this.runtimeSeedCounter, 0x9e3779b1)) >>> 0;
    return value === 0 ? 1 : value;
  }

  captureLayoutFingerprint(gameState) {
    const unitPositions = gameState.units
      .map((unit) => `${unit.id}:${unit.q},${unit.r}`)
      .sort()
      .join("|");

    return {
      seed: gameState.map.seed,
      terrainHash: this.computeTerrainHash(gameState.map.tiles),
      unitPositions,
    };
  }

  matchesLayout(nextState, previousLayout) {
    const nextUnitPositions = nextState.units
      .map((unit) => `${unit.id}:${unit.q},${unit.r}`)
      .sort()
      .join("|");

    return (
      nextState.map.seed === previousLayout.seed &&
      this.computeTerrainHash(nextState.map.tiles) === previousLayout.terrainHash &&
      nextUnitPositions === previousLayout.unitPositions
    );
  }

  enterEnemyPhase() {
    this.setUiPreview(null);
    beginEnemyTurn(this.gameState);
    this.turnPlayback = {
      active: true,
      actor: AI_OWNERS[0],
      stepIndex: 0,
      totalSteps: 0,
      message: "Planning AI actions...",
    };
    this.evaluateAndPublish();
    const playbackToken = ++this.enemyTurnPlaybackToken;
    void this.runEnemyTurnPlayback(playbackToken);
  }

  async runEnemyTurnPlayback(playbackToken) {
    /** @type {Array<ReturnType<typeof prepareEnemyTurnPlan>>} */
    const ownerPlans = [];
    for (const owner of AI_OWNERS) {
      if (!this.isPlaybackTokenCurrent(playbackToken)) {
        return;
      }

      const plan = prepareEnemyTurnPlan(this.gameState, owner);
      ownerPlans.push(plan);
      this.enemyTurnActivePlan = ownerPlans;
      this.turnPlayback.actor = owner;
      this.turnPlayback.stepIndex = 0;
      this.turnPlayback.totalSteps = plan.steps.length;
      this.turnPlayback.message = `Planning ${getOwnerLabel(owner)} actions...`;
      const appliedPrelude = executeEnemyTurnPrelude(this.gameState, plan);
      finalizeEnemyTurnPlan(this.gameState, plan, [], appliedPrelude);
      this.evaluateAndPublish();

      if (!this.isPlaybackTokenCurrent(playbackToken)) {
        return;
      }

      /** @type {import("../core/types.js").EnemyActionSummary[]} */
      const executedActions = [];
      for (let index = 0; index < plan.steps.length; index += 1) {
        if (!this.isPlaybackTokenCurrent(playbackToken)) {
          return;
        }

        const step = plan.steps[index];
        this.turnPlayback.stepIndex = index + 1;
        this.turnPlayback.message = this.describeEnemyStep(step, index + 1, plan.steps.length, owner);
        this.publishState();

        const execution = executeEnemyTurnStep(this.gameState, step);
        if (!execution.ok || !execution.actionSummary) {
          continue;
        }
        executedActions.push(execution.actionSummary);
        this.handleEnemyStepNotification(owner, step, execution);
        this.evaluateAndPublish();

        await this.animateEnemyStep(step, execution, playbackToken);
        if (!this.isPlaybackTokenCurrent(playbackToken)) {
          return;
        }
        await this.waitForAnimationDelay(ENEMY_ACTION_GAP_MS, playbackToken);
      }

      if (!this.isPlaybackTokenCurrent(playbackToken)) {
        return;
      }

      finalizeEnemyTurnPlan(this.gameState, plan, executedActions, appliedPrelude);
      this.turnPlayback.message = plan.steps.length > 0 ? `${getOwnerLabel(owner)} turn complete.` : `${getOwnerLabel(owner)} is idle.`;
      this.publishState();
      await this.waitForAnimationDelay(ENEMY_ACTION_GAP_MS, playbackToken);
    }

    this.resolveEnemyAndAdvanceTurn();
  }

  resolveEnemyAndAdvanceTurn() {
    if (this.turnPlayback.active && this.enemyTurnActivePlan) {
      this.enemyTurnActivePlan = null;
    } else {
      for (const owner of AI_OWNERS) {
        runEnemyTurn(this.gameState, owner);
      }
    }
    for (const owner of AI_OWNERS) {
      processCityTurn(this.gameState, owner);
    }
    beginPlayerTurn(this.gameState);
    const cityTurnResult = processCityTurn(this.gameState, "player");
    const researchResult = consumeScienceStock(this.gameState, "player", 1);
    this.gameState.economy.researchIncomeThisTurn = 1 + cityTurnResult.researchIncome;
    if (researchResult.completedTechIds.length > 0) {
      for (const techId of researchResult.completedTechIds) {
        this.emitNotification(`Research completed: ${capitalizeLabel(techId)}.`, {
          level: "info",
          category: "Research",
        });
      }
    }

    evaluateMatchState(this.gameState);
    this.turnPlayback = this.createTurnPlaybackState();
    this.evaluateAndPublish();
  }

  handleUnitAttackResult(attacker, target, attackResult, attackerOwner = null) {
    if (!attackResult.ok) {
      return;
    }

    this.lastCombatEvent = {
      type: "unit",
      attackerId: attacker.id,
      targetId: target.id,
      damage: attackResult.damage ?? 0,
      targetDefeated: !!attackResult.targetDefeated,
      attackerDefeated: !!attackResult.attackerDefeated,
      breakdown: attackResult.breakdown ?? null,
      counterattack: attackResult.counterattack ?? null,
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
    };

    const summary = formatCombatBreakdownSummary(attackResult.breakdown);
    const counterSummary = formatCounterattackSummary(attackResult.counterattack);
    const actorPrefix =
      attackerOwner && attackerOwner !== "player" ? `${getOwnerLabel(attackerOwner)} ` : "";
    const message =
      `${actorPrefix}hit ${target.id} for ${attackResult.damage ?? 0}${summary}.` +
      `${attackResult.targetDefeated ? " Target defeated." : ""}${counterSummary}`;
    this.emitNotification(message, {
      level: "info",
      category: "Combat",
      focus: { unitId: target.id, q: target.q, r: target.r },
      sourceOwner: attackerOwner,
    });
  }

  recordCityAttackEvent(attacker, city, attackResult, attackerOwner = null) {
    this.lastCombatEvent = {
      type: "city",
      attackerId: attacker.id,
      targetId: city.id,
      damage: attackResult.damage ?? 0,
      cityDefeated: !!attackResult.cityDefeated,
      breakdown: attackResult.breakdown ?? null,
      outcomeChoice: attackResult.outcomeChoice ?? null,
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
    };

    const summary = formatCombatBreakdownSummary(attackResult.breakdown);
    this.emitNotification(`City attack dealt ${attackResult.damage ?? 0}${summary}.`, {
      level: "info",
      category: "Combat",
      focus: { cityId: city.id, q: city.q, r: city.r },
      sourceOwner: attackerOwner,
    });
  }

  handleCityAttackResult(attackResult, attackerOwner = null, eventFocus = null) {
    if (!attackResult.cityDefeated) {
      return;
    }

    if (attackResult.pendingResolution) {
      this.emitNotification("City defenses broken. Choose Capture or Raze.", {
        level: "info",
        category: "Combat",
        focus: this.gameState.pendingCityResolution ? { cityId: this.gameState.pendingCityResolution.cityId } : null,
        sourceOwner: attackerOwner,
      });
      return;
    }

    if (attackResult.outcomeChoice === "capture") {
      const actorLabel = attackerOwner && attackerOwner !== "player" ? getOwnerLabel(attackerOwner) : "Hostile faction";
      this.emitNotification(`${actorLabel} captured a city.`, {
        level: "warning",
        category: "Combat",
        focus: eventFocus,
        sourceOwner: attackerOwner,
      });
      return;
    }

    if (attackResult.outcomeChoice === "raze") {
      const actorLabel = attackerOwner && attackerOwner !== "player" ? getOwnerLabel(attackerOwner) : "Hostile faction";
      this.emitNotification(`${actorLabel} razed a city.`, {
        level: "warning",
        category: "Combat",
        focus: eventFocus,
        sourceOwner: attackerOwner,
      });
    }
  }

  async handlePlayerMove(unitId, destination) {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const moveResult = moveUnit(unitId, destination, this.gameState);
    if (!moveResult.ok) {
      return false;
    }

    this.setUiPreview(null);
    this.evaluateAndPublish();
    await this.enqueueAnimation("move", async () => {
      await this.animateMoveClip(unitId, moveResult.path ?? [], 1);
    });
    return true;
  }

  async handlePlayerUnitAttack(attackerId, targetId) {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }

    const attackerBefore = getUnitById(this.gameState, attackerId);
    const targetBefore = getUnitById(this.gameState, targetId);
    if (!attackerBefore || !targetBefore) {
      return false;
    }

    const attackerFrom = { q: attackerBefore.q, r: attackerBefore.r };
    const targetHex = { q: targetBefore.q, r: targetBefore.r };
    const attackResult = resolveAttack(attackerId, targetId, this.gameState);
    if (!attackResult.ok) {
      return false;
    }

    this.handleUnitAttackResult(attackerBefore, targetBefore, attackResult);
    this.setUiPreview(null);
    this.evaluateAndPublish();
    await this.enqueueAnimation("attack", async () => {
      await this.animateUnitAttackClip({
        attackerId,
        defenderId: targetId,
        attackerFrom,
        targetHex,
        attackResult,
        speedScale: 1,
      });
    });
    return true;
  }

  async handlePlayerCityAttack(attackerId, cityId) {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }

    const attackerBefore = getUnitById(this.gameState, attackerId);
    const cityBefore = this.gameState.cities.find((city) => city.id === cityId) ?? null;
    if (!attackerBefore || !cityBefore) {
      return false;
    }

    const attackerFrom = { q: attackerBefore.q, r: attackerBefore.r };
    const cityHex = { q: cityBefore.q, r: cityBefore.r };
    const cityAttackResult = resolveCityAttack(attackerId, cityId, this.gameState);
    if (!cityAttackResult.ok) {
      return false;
    }

    this.recordCityAttackEvent(attackerBefore, cityBefore, cityAttackResult);
    this.handleCityAttackResult(cityAttackResult);
    this.setUiPreview(null);
    this.evaluateAndPublish();
    await this.enqueueAnimation("attack-city", async () => {
      await this.animateCityAttackClip({
        attackerId,
        cityId,
        attackerFrom,
        cityHex,
        attackResult: cityAttackResult,
        speedScale: 1,
      });
    });
    return true;
  }

  handleEnemyStepNotification(owner, step, execution) {
    if (!execution?.ok || !execution.result) {
      return;
    }

    if (step.action === "foundCity") {
      const foundedCityId = execution.result.cityId ?? null;
      const foundedCity = foundedCityId ? this.gameState.cities.find((city) => city.id === foundedCityId) ?? null : null;
      this.emitNotification(`${getOwnerLabel(owner)} founded a city.`, {
        level: "warning",
        category: "City",
        focus: foundedCity
          ? { cityId: foundedCity.id, q: foundedCity.q, r: foundedCity.r }
          : Number.isFinite(step.q) && Number.isFinite(step.r)
            ? { q: step.q, r: step.r }
            : null,
        sourceOwner: owner,
      });
      return;
    }

    if (step.action === "attackUnit") {
      const targetHex =
        execution.actionSummary?.presentation?.target ??
        (Number.isFinite(step.q) && Number.isFinite(step.r) ? { q: step.q, r: step.r } : null);
      this.handleUnitAttackResult(
        { id: step.unitId },
        {
          id: step.targetId ?? "target",
          q: targetHex?.q ?? 0,
          r: targetHex?.r ?? 0,
        },
        execution.result,
        owner
      );
      return;
    }

    if (step.action === "attackCity") {
      const targetHex =
        execution.actionSummary?.presentation?.target ??
        (Number.isFinite(step.q) && Number.isFinite(step.r) ? { q: step.q, r: step.r } : null);
      this.recordCityAttackEvent(
        { id: step.unitId },
        {
          id: step.targetId ?? "city",
          q: targetHex?.q ?? 0,
          r: targetHex?.r ?? 0,
        },
        execution.result,
        owner
      );
      this.handleCityAttackResult(
        execution.result,
        owner,
        targetHex ? { cityId: step.targetId ?? undefined, q: targetHex.q, r: targetHex.r } : null
      );
    }
  }

  describeEnemyStep(step, index, total, owner = "enemy") {
    const prefix = `${getOwnerLabel(owner)} action ${index}/${Math.max(1, total)}`;
    if (!step) {
      return `${prefix}: thinking...`;
    }

    if (step.action === "foundCity") {
      return `${prefix}: ${step.unitId} founds a city`;
    }
    if (step.action === "attackUnit") {
      return `${prefix}: ${step.unitId} attacks ${step.targetId ?? "a unit"}`;
    }
    if (step.action === "attackCity") {
      return `${prefix}: ${step.unitId} assaults ${step.targetId ?? "a city"}`;
    }
    if (step.action === "move") {
      return `${prefix}: ${step.unitId} moves to (${step.q ?? "?"}, ${step.r ?? "?"})`;
    }
    return `${prefix}: ${step.unitId} waits`;
  }

  async animateEnemyStep(step, execution, playbackToken) {
    if (!execution?.ok || !step) {
      return;
    }

    const speedScale = this.getEnemyPlaybackSpeedScale(this.turnPlayback.totalSteps);
    if (step.action === "move") {
      const movementPath = Array.isArray(execution.result?.path) ? execution.result.path : [];
      await this.enqueueAnimation("move", async () => {
        await this.animateMoveClip(step.unitId, movementPath, speedScale, playbackToken);
      });
      return;
    }

    if (step.action === "attackUnit") {
      const from = execution.actionSummary?.presentation?.from ?? step.presentation?.from ?? null;
      const targetHex = execution.actionSummary?.presentation?.target ?? step.presentation?.target ?? null;
      await this.enqueueAnimation("attack", async () => {
        await this.animateUnitAttackClip({
          attackerId: step.unitId,
          defenderId: step.targetId ?? null,
          attackerFrom: from,
          targetHex,
          attackResult: execution.result,
          speedScale,
          playbackToken,
        });
      });
      return;
    }

    if (step.action === "attackCity") {
      const from = execution.actionSummary?.presentation?.from ?? step.presentation?.from ?? null;
      const cityHex = execution.actionSummary?.presentation?.target ?? step.presentation?.target ?? null;
      await this.enqueueAnimation("attack-city", async () => {
        await this.animateCityAttackClip({
          attackerId: step.unitId,
          cityId: step.targetId ?? null,
          attackerFrom: from,
          cityHex,
          attackResult: execution.result,
          speedScale,
          playbackToken,
        });
      });
      return;
    }

    if (step.action === "foundCity") {
      const foundedCityId = execution.result?.cityId ?? null;
      const foundedCity =
        foundedCityId && this.gameState.cities.find((city) => city.id === foundedCityId)
          ? this.gameState.cities.find((city) => city.id === foundedCityId)
          : null;
      if (foundedCity) {
        await this.enqueueAnimation("found-city", async () => {
          await this.animateFoundCityClip(
            {
              cityId: foundedCity.id,
              q: foundedCity.q,
              r: foundedCity.r,
            },
            speedScale,
            playbackToken
          );
        });
      }
    }
  }

  getEnemyPlaybackSpeedScale(totalSteps) {
    if (totalSteps >= 10) {
      return 0.62;
    }
    if (totalSteps >= 7) {
      return 0.74;
    }
    if (totalSteps >= 4) {
      return 0.86;
    }
    return 1;
  }

  async animateMoveClip(unitId, path, speedScale = 1, playbackToken = null) {
    if (!Array.isArray(path) || path.length < 2) {
      return;
    }
    const startHex = path[0];
    if (!Number.isFinite(startHex?.q) || !Number.isFinite(startHex?.r)) {
      return;
    }

    const startWorld = this.hexToWorld(startHex.q, startHex.r);
    const override = { x: startWorld.x, y: startWorld.y, scale: 1, alpha: 1 };
    this.unitRenderOverrides.set(unitId, override);
    for (let i = 1; i < path.length; i += 1) {
      if (playbackToken !== null && !this.isPlaybackTokenCurrent(playbackToken)) {
        this.unitRenderOverrides.delete(unitId);
        return;
      }
      const nextHex = path[i];
      if (!Number.isFinite(nextHex?.q) || !Number.isFinite(nextHex?.r)) {
        continue;
      }
      const targetWorld = this.hexToWorld(nextHex.q, nextHex.r);
      await this.tweenObjectTo(override, { x: targetWorld.x, y: targetWorld.y }, MOVE_SEGMENT_MS * speedScale);
    }
    this.unitRenderOverrides.delete(unitId);
  }

  async animateUnitAttackClip({
    attackerId,
    defenderId,
    attackerFrom,
    targetHex,
    attackResult,
    speedScale = 1,
    playbackToken = null,
  }) {
    if (!targetHex || !Number.isFinite(targetHex.q) || !Number.isFinite(targetHex.r)) {
      return;
    }

    const attackerOrigin = attackerFrom && Number.isFinite(attackerFrom.q) && Number.isFinite(attackerFrom.r) ? attackerFrom : null;
    const targetWorld = this.hexToWorld(targetHex.q, targetHex.r);
    if (attackerOrigin && this.gameState.units.some((unit) => unit.id === attackerId)) {
      const originWorld = this.hexToWorld(attackerOrigin.q, attackerOrigin.r);
      const override = { x: originWorld.x, y: originWorld.y, scale: 1, alpha: 1 };
      this.unitRenderOverrides.set(attackerId, override);
      const lungePoint = {
        x: originWorld.x + (targetWorld.x - originWorld.x) * 0.34,
        y: originWorld.y + (targetWorld.y - originWorld.y) * 0.34,
      };
      await this.tweenObjectTo(override, lungePoint, ATTACK_ANIMATION_MS * 0.46 * speedScale);
      this.spawnFxBurst(targetHex.q, targetHex.r, { color: 0xf1998f, maxRadius: 28 });
      if (typeof attackResult?.damage === "number" && attackResult.damage > 0) {
        this.spawnFloatingDamage(targetHex.q, targetHex.r, attackResult.damage);
      }
      await this.tweenObjectTo(override, originWorld, ATTACK_ANIMATION_MS * 0.54 * speedScale);
      this.unitRenderOverrides.delete(attackerId);
    } else {
      this.spawnFxBurst(targetHex.q, targetHex.r, { color: 0xf1998f, maxRadius: 30 });
      if (typeof attackResult?.damage === "number" && attackResult.damage > 0) {
        this.spawnFloatingDamage(targetHex.q, targetHex.r, attackResult.damage);
      }
    }

    if (attackResult?.counterattack?.triggered) {
      const counterDamage = attackResult.counterattack.damage ?? 0;
      const counterTarget = attackerOrigin;
      if (counterTarget && Number.isFinite(counterTarget.q) && Number.isFinite(counterTarget.r)) {
        const defender = defenderId ? getUnitById(this.gameState, defenderId) : null;
        if (defender) {
          const defenderOrigin = this.hexToWorld(targetHex.q, targetHex.r);
          const counterTargetWorld = this.hexToWorld(counterTarget.q, counterTarget.r);
          const defenderOverride = { x: defenderOrigin.x, y: defenderOrigin.y, scale: 1, alpha: 1 };
          this.unitRenderOverrides.set(defender.id, defenderOverride);
          const counterLunge = {
            x: defenderOrigin.x + (counterTargetWorld.x - defenderOrigin.x) * 0.24,
            y: defenderOrigin.y + (counterTargetWorld.y - defenderOrigin.y) * 0.24,
          };
          await this.tweenObjectTo(defenderOverride, counterLunge, ATTACK_ANIMATION_MS * 0.26 * speedScale);
          await this.tweenObjectTo(defenderOverride, defenderOrigin, ATTACK_ANIMATION_MS * 0.26 * speedScale);
          this.unitRenderOverrides.delete(defender.id);
        }
        this.spawnFxBurst(counterTarget.q, counterTarget.r, { color: 0xeb8f7f, maxRadius: 22 });
        if (counterDamage > 0) {
          this.spawnFloatingDamage(counterTarget.q, counterTarget.r, counterDamage, "#fbe2d4");
        }
      }
    }

    if (attackResult?.targetDefeated) {
      this.spawnFxBurst(targetHex.q, targetHex.r, { color: 0xffcc7a, maxRadius: 34, duration: 360 });
    }
    if (attackResult?.attackerDefeated && attackerOrigin) {
      this.spawnFxBurst(attackerOrigin.q, attackerOrigin.r, { color: 0xffcc7a, maxRadius: 34, duration: 360 });
    }
    if (attackResult?.targetDefeated || attackResult?.attackerDefeated) {
      this.cameras.main.shake(90, 0.0018);
    }

    if (playbackToken !== null && !this.isPlaybackTokenCurrent(playbackToken)) {
      return;
    }
  }

  async animateCityAttackClip({ attackerId, cityId, attackerFrom, cityHex, attackResult, speedScale = 1, playbackToken = null }) {
    if (!cityHex || !Number.isFinite(cityHex.q) || !Number.isFinite(cityHex.r)) {
      return;
    }

    const attackerOrigin = attackerFrom && Number.isFinite(attackerFrom.q) && Number.isFinite(attackerFrom.r) ? attackerFrom : null;
    const cityWorld = this.hexToWorld(cityHex.q, cityHex.r);
    if (attackerOrigin && this.gameState.units.some((unit) => unit.id === attackerId)) {
      const originWorld = this.hexToWorld(attackerOrigin.q, attackerOrigin.r);
      const override = { x: originWorld.x, y: originWorld.y, scale: 1, alpha: 1 };
      this.unitRenderOverrides.set(attackerId, override);
      const lungePoint = {
        x: originWorld.x + (cityWorld.x - originWorld.x) * 0.36,
        y: originWorld.y + (cityWorld.y - originWorld.y) * 0.36,
      };
      await this.tweenObjectTo(override, lungePoint, ATTACK_ANIMATION_MS * 0.48 * speedScale);
      await this.tweenObjectTo(override, originWorld, ATTACK_ANIMATION_MS * 0.52 * speedScale);
      this.unitRenderOverrides.delete(attackerId);
    }

    if (cityId && this.gameState.cities.some((city) => city.id === cityId)) {
      const cityOverride = { x: cityWorld.x, y: cityWorld.y, scale: 1, alpha: 1 };
      this.cityRenderOverrides.set(cityId, cityOverride);
      await this.tweenObjectTo(cityOverride, { scale: 1.16 }, ATTACK_ANIMATION_MS * 0.36 * speedScale);
      await this.tweenObjectTo(cityOverride, { scale: 1 }, ATTACK_ANIMATION_MS * 0.36 * speedScale);
      this.cityRenderOverrides.delete(cityId);
    }

    this.spawnFxBurst(cityHex.q, cityHex.r, { color: 0xf1998f, maxRadius: 34, duration: 280 });
    if (typeof attackResult?.damage === "number" && attackResult.damage > 0) {
      this.spawnFloatingDamage(cityHex.q, cityHex.r, attackResult.damage);
    }
    if (attackResult?.cityDefeated) {
      this.spawnFxBurst(cityHex.q, cityHex.r, { color: 0xffd076, maxRadius: 40, duration: 420 });
      if (attackResult.outcomeChoice === "capture") {
        this.spawnFxBurst(cityHex.q, cityHex.r, { color: 0x7fd59d, maxRadius: 28, duration: 380 });
      }
      if (attackResult.outcomeChoice === "raze") {
        this.spawnFxBurst(cityHex.q, cityHex.r, { color: 0xd36f63, maxRadius: 36, duration: 420 });
      }
      this.cameras.main.shake(100, 0.0022);
    }

    if (playbackToken !== null && !this.isPlaybackTokenCurrent(playbackToken)) {
      return;
    }
  }

  async animateFoundCityClip({ cityId, q, r }, speedScale = 1, playbackToken = null) {
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      return;
    }
    this.spawnFxBurst(q, r, { color: 0x8dd575, maxRadius: 44, duration: FOUND_CITY_ANIMATION_MS * speedScale });

    const foundedCity = cityId ? this.gameState.cities.find((city) => city.id === cityId) ?? null : null;
    if (!foundedCity) {
      return;
    }

    const center = this.hexToWorld(foundedCity.q, foundedCity.r);
    const cityOverride = { x: center.x, y: center.y, scale: 0.24, alpha: 0.2 };
    this.cityRenderOverrides.set(foundedCity.id, cityOverride);
    await this.tweenObjectTo(cityOverride, { scale: 1, alpha: 1 }, FOUND_CITY_ANIMATION_MS * speedScale);
    this.cityRenderOverrides.delete(foundedCity.id);

    if (playbackToken !== null && !this.isPlaybackTokenCurrent(playbackToken)) {
      return;
    }
  }

  async animateCityOutcomeClip({ q, r, choice }) {
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      return;
    }
    if (choice === "capture") {
      this.spawnFxBurst(q, r, { color: 0x7fd59d, maxRadius: 36, duration: 320 });
      this.spawnFxBurst(q, r, { color: 0xb5f0c4, maxRadius: 26, duration: 260 });
    } else {
      this.spawnFxBurst(q, r, { color: 0xd36f63, maxRadius: 40, duration: 360 });
      this.spawnFxBurst(q, r, { color: 0xffb079, maxRadius: 28, duration: 280 });
    }
    this.cameras.main.shake(80, 0.0016);
    await this.waitForAnimationDelay(220);
  }

  enqueueAnimation(kind, runner) {
    return new Promise((resolve) => {
      this.animationQueue.push({ kind, runner, resolve });
      this.publishState();
      void this.pumpAnimationQueue();
    });
  }

  async pumpAnimationQueue() {
    if (this.animationQueueRunning) {
      return;
    }
    this.animationQueueRunning = true;
    while (this.animationQueue.length > 0) {
      const queued = this.animationQueue.shift();
      if (!queued) {
        continue;
      }
      this.isAnimationBusy = true;
      this.activeAnimationKind = queued.kind;
      this.publishState();
      let ok = true;
      try {
        await queued.runner();
      } catch {
        ok = false;
      }
      this.isAnimationBusy = false;
      this.activeAnimationKind = null;
      queued.resolve(ok);
      this.publishState();
    }
    this.animationQueueRunning = false;
  }

  tweenObjectTo(target, values, durationMs) {
    return new Promise((resolve) => {
      const tween = this.tweens.add({
        targets: target,
        ...values,
        duration: Math.max(20, Math.floor(durationMs)),
        ease: "Sine.easeInOut",
        onComplete: () => {
          resolve(true);
        },
      });
      tween.once("stop", () => resolve(false));
    });
  }

  waitForAnimationDelay(ms, playbackToken = null) {
    if (!Number.isFinite(ms) || ms <= 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      /** @type {Phaser.Time.TimerEvent|undefined} */
      let timer;
      timer = this.time.delayedCall(ms, () => {
        if (timer) {
          this.activeTimers.delete(timer);
        }
        if (playbackToken === null) {
          resolve(true);
          return;
        }
        resolve(this.isPlaybackTokenCurrent(playbackToken));
      });
      this.activeTimers.add(timer);
    });
  }

  spawnFxBurst(q, r, options = {}) {
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      return;
    }
    const world = this.hexToWorld(q, r);
    const duration = Number.isFinite(options.duration) ? options.duration : 300;
    this.fxBursts.push({
      x: world.x,
      y: world.y,
      color: Number.isFinite(options.color) ? options.color : 0xf1998f,
      maxRadius: Number.isFinite(options.maxRadius) ? options.maxRadius : 26,
      minRadius: Number.isFinite(options.minRadius) ? options.minRadius : 8,
      alpha: Number.isFinite(options.alpha) ? options.alpha : 0.9,
      createdAt: this.time.now,
      expiresAt: this.time.now + duration,
    });
  }

  spawnFloatingDamage(q, r, amount, color = "#fff3de") {
    if (!Number.isFinite(q) || !Number.isFinite(r) || !Number.isFinite(amount)) {
      return;
    }
    const center = this.hexToWorld(q, r);
    const id = `fd-${this.floatingDamageNextId}`;
    this.floatingDamageNextId += 1;
    const text = this.add
      .text(center.x, center.y - HEX_SIZE * 0.45, `${amount}`, {
        fontFamily: "Trebuchet MS",
        fontSize: "15px",
        color,
        stroke: "#2a1b10",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.floatingDamage.push({
      id,
      value: amount,
      q,
      r,
      expiresAt: this.time.now + 460,
    });
    this.floatingDamageTextById.set(id, text);
    this.tweens.add({
      targets: text,
      y: center.y - HEX_SIZE * 0.92,
      alpha: 0,
      duration: 460,
      ease: "Sine.easeOut",
      onComplete: () => {
        text.destroy();
        this.floatingDamageTextById.delete(id);
        this.floatingDamage = this.floatingDamage.filter((entry) => entry.id !== id);
      },
    });
  }

  updateTransientVisualState(nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : this.time.now;
    this.fxBursts = this.fxBursts.filter((burst) => now <= burst.expiresAt);
    this.floatingDamage = this.floatingDamage.filter((entry) => now <= entry.expiresAt);
    return (
      this.isAnimationBusy ||
      this.animationQueue.length > 0 ||
      this.unitRenderOverrides.size > 0 ||
      this.cityRenderOverrides.size > 0 ||
      this.fxBursts.length > 0 ||
      this.floatingDamage.length > 0
    );
  }

  clearAnimationArtifacts() {
    this.unitRenderOverrides.clear();
    this.cityRenderOverrides.clear();
    this.fxBursts = [];
    this.floatingDamage = [];
    for (const text of this.floatingDamageTextById.values()) {
      text.destroy();
    }
    this.floatingDamageTextById.clear();
  }

  abortEnemyPlayback() {
    this.enemyTurnPlaybackToken += 1;
    this.enemyTurnActivePlan = null;
    this.turnPlayback = this.createTurnPlaybackState();
    this.animationQueue = [];
    this.animationQueueRunning = false;
    this.isAnimationBusy = false;
    this.activeAnimationKind = null;
  }

  createTurnPlaybackState() {
    return {
      active: false,
      actor: null,
      stepIndex: 0,
      totalSteps: 0,
      message: null,
    };
  }

  getAnimationStatePayload() {
    return {
      busy: this.isAnimationBusy,
      kind: this.activeAnimationKind,
      queueLength: this.animationQueue.length,
    };
  }

  isPlaybackTokenCurrent(playbackToken) {
    return playbackToken === this.enemyTurnPlaybackToken && this.turnPlayback.active && this.gameState.turnState.phase === "enemy";
  }

  resolveUnitRenderPosition(unit) {
    const base = this.hexToWorld(unit.q, unit.r);
    const override = this.unitRenderOverrides.get(unit.id);
    if (!override) {
      return base;
    }
    return {
      x: Number.isFinite(override.x) ? override.x : base.x,
      y: Number.isFinite(override.y) ? override.y : base.y,
    };
  }

  resolveCityRenderPosition(city) {
    const base = this.hexToWorld(city.q, city.r);
    const override = this.cityRenderOverrides.get(city.id);
    if (!override) {
      return base;
    }
    return {
      x: Number.isFinite(override.x) ? override.x : base.x,
      y: Number.isFinite(override.y) ? override.y : base.y,
    };
  }

  renderEffects() {
    this.fxGraphics.clear();
    const now = this.time.now;
    for (const burst of this.fxBursts) {
      const duration = Math.max(1, burst.expiresAt - burst.createdAt);
      const progress = Phaser.Math.Clamp((now - burst.createdAt) / duration, 0, 1);
      const radius = Phaser.Math.Linear(burst.minRadius, burst.maxRadius, progress);
      const alpha = Phaser.Math.Clamp((1 - progress) * burst.alpha, 0, 1);
      this.fxGraphics.lineStyle(2, burst.color, alpha);
      this.fxGraphics.strokeCircle(burst.x, burst.y, radius);
      this.fxGraphics.fillStyle(burst.color, alpha * 0.18);
      this.fxGraphics.fillCircle(burst.x, burst.y, radius * 0.52);
    }
  }

  canPanCamera() {
    return !this.uiModalOpen;
  }

  updateKeyboardCameraPan(deltaMs) {
    if (!this.canPanCamera() || !this.cameraPanKeys || !this.cameras?.main) {
      return false;
    }
    const left = this.cameraPanKeys.left?.isDown || this.cameraPanKeys.a?.isDown;
    const right = this.cameraPanKeys.right?.isDown || this.cameraPanKeys.d?.isDown;
    const up = this.cameraPanKeys.up?.isDown || this.cameraPanKeys.w?.isDown;
    const down = this.cameraPanKeys.down?.isDown || this.cameraPanKeys.s?.isDown;
    const horizontal = (right ? 1 : 0) - (left ? 1 : 0);
    const vertical = (down ? 1 : 0) - (up ? 1 : 0);
    if (horizontal === 0 && vertical === 0) {
      return false;
    }
    const directionLength = Math.hypot(horizontal, vertical);
    if (!directionLength) {
      return false;
    }
    const step = (Math.max(0, deltaMs) / 1000) * CAMERA_KEYBOARD_PAN_SPEED;
    if (step <= 0) {
      return false;
    }
    this.cameras.main.scrollX += (horizontal / directionLength) * step;
    this.cameras.main.scrollY += (vertical / directionLength) * step;
    this.clearCameraFocusFromManualPan();
    return true;
  }

  beginCameraDrag(pointer) {
    this.isRightDraggingCamera = true;
    this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
  }

  endCameraDrag() {
    this.isRightDraggingCamera = false;
    this.cameraDragLastScreenPos = null;
  }

  updateCameraDrag(pointer) {
    if (!this.isRightDraggingCamera || !this.cameras?.main) {
      return false;
    }
    if (!this.cameraDragLastScreenPos) {
      this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
      return false;
    }
    const deltaX = pointer.x - this.cameraDragLastScreenPos.x;
    const deltaY = pointer.y - this.cameraDragLastScreenPos.y;
    this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
    if (deltaX === 0 && deltaY === 0) {
      return false;
    }
    this.cameras.main.scrollX -= deltaX;
    this.cameras.main.scrollY -= deltaY;
    this.clearCameraFocusFromManualPan();
    return true;
  }

  clearCameraFocusFromManualPan() {
    if (this.cameraFocusHex) {
      this.cameraFocusHex = null;
    }
  }

  getCameraScrollPayload() {
    return {
      x: this.cameras?.main?.scrollX ?? 0,
      y: this.cameras?.main?.scrollY ?? 0,
    };
  }

  canAcceptPlayerCommands() {
    return (
      this.gameState.turnState.phase === "player" &&
      this.gameState.match.status === "ongoing" &&
      !this.uiModalOpen &&
      !this.gameState.pendingCityResolution &&
      !this.isAnimationBusy &&
      !this.turnPlayback.active
    );
  }

  selectUnit(unitId) {
    this.gameState.selectedUnitId = unitId;
    this.gameState.selectedCityId = null;
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  selectCity(cityId) {
    this.gameState.selectedCityId = cityId;
    this.gameState.selectedUnitId = null;
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  clearSelection() {
    if (!this.gameState.selectedUnitId && !this.gameState.selectedCityId) {
      return;
    }
    this.gameState.selectedUnitId = null;
    this.gameState.selectedCityId = null;
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  refreshActionHints() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || !this.canAcceptPlayerCommands() || selectedUnit.owner !== "player") {
      this.reachableHexes = [];
      this.reachableLookup = new Set();
      this.reachableCostByKey = new Map();
      this.attackableTargets = [];
      this.attackableLookup = new Set();
      this.attackableCities = [];
      this.attackableCityLookup = new Set();
      this.threatHexes = [];
      this.threatLookup = new Set();
      this.setUiPreview(null);
      return;
    }

    this.reachableHexes = getReachable(selectedUnit.id, this.gameState);
    this.reachableLookup = new Set(this.reachableHexes.map((hex) => axialKey(hex)));
    this.reachableCostByKey = new Map(this.reachableHexes.map((hex) => [axialKey(hex), hex.cost]));
    this.attackableTargets = getAttackableTargets(selectedUnit.id, this.gameState).filter((unit) =>
      this.isUnitVisibleToPlayer(unit)
    );
    this.attackableLookup = new Set(this.attackableTargets.map((unit) => unit.id));
    this.attackableCities = getAttackableCities(selectedUnit.id, this.gameState).filter((city) => this.isCityVisibleToPlayer(city));
    this.attackableCityLookup = new Set(this.attackableCities.map((city) => city.id));
    this.refreshThreatOverlay(selectedUnit);
  }

  evaluateAndPublish() {
    recomputeVisibility(this.gameState);
    evaluateMatchState(this.gameState);
    this.refreshActionHints();
    this.renderAll();
    this.publishState();
  }

  publishState() {
    gameEvents.emit("state-changed", this.getGameStateSnapshot());
  }

  getGameStateSnapshot() {
    const snapshot = cloneGameState(this.gameState);
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    const projectedIncome = this.getProjectedPlayerIncome();
    const projectedNetIncome = this.getProjectedPlayerNetIncome();
    const uiSurface = deriveUiSurface(
      this.gameState,
      selectedUnit,
      selectedCity,
      this.attackableTargets,
      this.attackableCities,
      {
      restartConfirmOpen: this.uiModalOpen,
      pendingCityResolution: this.gameState.pendingCityResolution,
    }
    );
    const uiRuntime = this.getUiRuntimeState();
    const uiTurnAssistant = this.getTurnAssistantState();
    const uiContextPanel = {
      expanded: !!uiRuntime.contextPanelExpanded,
      pinned: !!uiRuntime.contextPanelPinned,
    };
    return {
      ...snapshot,
      projectedIncome,
      projectedNetIncome,
      selectedInfo: this.buildSelectedInfo(selectedUnit, selectedCity),
      contextMenu: this.buildContextMenuPayload(uiSurface, selectedUnit, selectedCity),
      uiPreview: this.buildUiPreviewPayload(),
      uiTurnAssistant,
      uiContextPanel,
      uiNotificationFilter: uiRuntime.notificationFilter ?? "All",
      uiHints: uiSurface.uiHints,
      uiActions: uiSurface.uiActions,
      uiModalOpen: this.uiModalOpen,
      devVisionEnabled: isPlayerDevVisionEnabled(this.gameState),
      animationState: this.getAnimationStatePayload(),
      turnPlayback: structuredClone(this.turnPlayback),
      pauseMenu: {
        open: uiRuntime.pauseMenuOpen,
        restartConfirmOpen: uiRuntime.restartConfirmOpen,
      },
      uiNotifications: uiRuntime.notifications,
      cameraScroll: this.getCameraScrollPayload(),
      cameraFocusHex: this.cameraFocusHex,
      lastCombatEvent: this.lastCombatEvent,
    };
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
    this.renderThreat();
    this.renderReachable();
    this.renderAttackable();
    this.renderPreview();
    this.renderSelection();
    this.renderCities();
    this.renderUnits();
    this.renderEffects();
  }

  renderMap() {
    this.mapGraphics.clear();
    const revealAll = isPlayerDevVisionEnabled(this.gameState);

    for (const tile of this.gameState.map.tiles) {
      const center = this.hexToWorld(tile.q, tile.r);
      const terrainDefinition = TERRAIN[tile.terrainType];
      const visible = revealAll || isHexVisibleToOwner(this.gameState, "player", tile.q, tile.r);
      const explored = revealAll || isHexExploredByOwner(this.gameState, "player", tile.q, tile.r);
      if (!explored) {
        drawHex(
          this.mapGraphics,
          center.x,
          center.y,
          HEX_SIZE,
          COLORS.fogShroudFill,
          0.94,
          COLORS.fogShroudStroke,
          1.2
        );
        continue;
      }
      if (!visible) {
        drawHex(this.mapGraphics, center.x, center.y, HEX_SIZE, terrainDefinition.fillColor, 0.35, COLORS.tileStroke, 1.2);
        drawHex(this.mapGraphics, center.x, center.y, HEX_SIZE, COLORS.fogMemoryFill, 0.46, COLORS.fogMemoryStroke, 1.1);
        continue;
      }
      drawHex(this.mapGraphics, center.x, center.y, HEX_SIZE, terrainDefinition.fillColor, 1, COLORS.tileStroke, 1.2);
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
        0.48,
        COLORS.reachableStroke,
        1.4
      );
    }
  }

  renderAttackable() {
    this.attackableGraphics.clear();
    for (const unit of this.attackableTargets) {
      const center = this.hexToWorld(unit.q, unit.r);
      drawHex(
        this.attackableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.92,
        COLORS.attackableFill,
        0.52,
        COLORS.attackableStroke,
        2
      );
    }

    for (const city of this.attackableCities) {
      const center = this.hexToWorld(city.q, city.r);
      drawHex(
        this.attackableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.9,
        COLORS.attackableFill,
        0.32,
        COLORS.attackableStroke,
        2.2
      );
      this.attackableGraphics.lineStyle(2, COLORS.attackableStroke, 1);
      this.attackableGraphics.strokeRect(center.x - 16, center.y - 16, 32, 32);
    }
  }

  renderThreat() {
    this.threatGraphics.clear();
    for (const hex of this.threatHexes) {
      const center = this.hexToWorld(hex.q, hex.r);
      drawHex(this.threatGraphics, center.x, center.y, HEX_SIZE * 0.84, 0xd36f63, 0.2, 0x9a3a2b, 1);
    }
  }

  renderPreview() {
    this.previewGraphics.clear();
    const preview = this.uiPreview;
    if (!preview || !preview.mode) {
      return;
    }

    if (preview.mode === "move" && typeof preview.q === "number" && typeof preview.r === "number") {
      const center = this.hexToWorld(preview.q, preview.r);
      drawHex(this.previewGraphics, center.x, center.y, HEX_SIZE * 0.97, 0x7ac6db, 0.48, 0x276f86, 2.8);
      return;
    }

    if (
      (preview.mode === "attack-unit" || preview.mode === "attack-city") &&
      typeof preview.q === "number" &&
      typeof preview.r === "number"
    ) {
      const center = this.hexToWorld(preview.q, preview.r);
      drawHex(this.previewGraphics, center.x, center.y, HEX_SIZE * 0.97, 0xf1998f, 0.4, 0xa03e32, 2.8);
      const attacker = getUnitById(this.gameState, preview.attackerId ?? null);
      if (attacker) {
        const attackerCenter = this.hexToWorld(attacker.q, attacker.r);
        this.previewGraphics.lineStyle(2, 0xa03e32, 0.9);
        this.previewGraphics.lineBetween(attackerCenter.x, attackerCenter.y, center.x, center.y);
      }
    }
  }

  renderSelection() {
    this.selectionGraphics.clear();

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (selectedUnit) {
      const unitCenter = this.hexToWorld(selectedUnit.q, selectedUnit.r);
      drawHex(this.selectionGraphics, unitCenter.x, unitCenter.y, HEX_SIZE * 1.02, undefined, 0, COLORS.selectedStroke, 3);
    }

    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId);
    if (selectedCity) {
      const cityCenter = this.hexToWorld(selectedCity.q, selectedCity.r);
      this.selectionGraphics.lineStyle(3, COLORS.selectedStroke, 1);
      this.selectionGraphics.strokeRect(cityCenter.x - 18, cityCenter.y - 18, 36, 36);
    }
  }

  renderCities() {
    this.cityGraphics.clear();
    for (const city of this.gameState.cities) {
      if (!this.isCityVisibleToPlayer(city)) {
        continue;
      }
      const center = this.resolveCityRenderPosition(city);
      const override = this.cityRenderOverrides.get(city.id) ?? null;
      const scale = Math.max(0.2, override?.scale ?? 1);
      const alpha = Phaser.Math.Clamp(override?.alpha ?? 0.95, 0.05, 1);
      const halfSize = 13 * scale;
      const fillColor = city.owner === "enemy" ? COLORS.cityEnemy : city.owner === "purple" ? COLORS.cityPurple : COLORS.cityPlayer;
      this.cityGraphics.fillStyle(fillColor, alpha);
      this.cityGraphics.fillRect(center.x - halfSize, center.y - halfSize, halfSize * 2, halfSize * 2);
      this.cityGraphics.lineStyle(2, COLORS.cityStroke, alpha);
      this.cityGraphics.strokeRect(center.x - halfSize, center.y - halfSize, halfSize * 2, halfSize * 2);

      const hpRatio = Math.max(0, city.health / city.maxHealth);
      const healthY = center.y + 17 * scale;
      this.cityGraphics.fillStyle(0x202020, 0.72 * alpha);
      this.cityGraphics.fillRect(center.x - 14, healthY, 28, 4);
      this.cityGraphics.fillStyle(0xb8df8f, alpha);
      this.cityGraphics.fillRect(center.x - 14, healthY, 28 * hpRatio, 4);
    }
  }

  renderUnits() {
    this.unitGraphics.clear();
    for (const unit of this.gameState.units) {
      if (!this.isUnitVisibleToPlayer(unit)) {
        continue;
      }
      const center = this.resolveUnitRenderPosition(unit);
      const override = this.unitRenderOverrides.get(unit.id) ?? null;
      const scale = Math.max(0.15, override?.scale ?? 1);
      const alpha = Phaser.Math.Clamp(override?.alpha ?? 1, 0.05, 1);
      const fillColor =
        unit.owner === "enemy" ? COLORS.enemyUnit : unit.owner === "purple" ? COLORS.purpleUnit : COLORS.playerUnit;
      const strokeColor =
        unit.owner === "enemy"
          ? COLORS.enemyUnitStroke
          : unit.owner === "purple"
            ? COLORS.purpleUnitStroke
            : COLORS.playerUnitStroke;
      const radius = HEX_SIZE * 0.4 * scale;
      this.unitGraphics.fillStyle(fillColor, alpha);
      this.unitGraphics.fillCircle(center.x, center.y, radius);
      this.unitGraphics.lineStyle(2, strokeColor, alpha);
      this.unitGraphics.strokeCircle(center.x, center.y, radius);

      const hpRatio = Math.max(0, unit.health / unit.maxHealth);
      const healthY = center.y + HEX_SIZE * 0.47 * Math.max(0.7, scale);
      this.unitGraphics.fillStyle(0x202020, 0.7 * alpha);
      this.unitGraphics.fillRect(center.x - 14, healthY, 28, 4);
      this.unitGraphics.fillStyle(0x8dd575, alpha);
      this.unitGraphics.fillRect(center.x - 14, healthY, 28 * hpRatio, 4);
    }
  }

  manualAdvanceTime(ms) {
    this.manualTimeMs += Math.max(0, ms);
  }

  renderGameToText() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    const projectedIncome = this.getProjectedPlayerIncome();
    const projectedNetIncome = this.getProjectedPlayerNetIncome();
    const uiSurface = deriveUiSurface(
      this.gameState,
      selectedUnit,
      selectedCity,
      this.attackableTargets,
      this.attackableCities,
      {
        restartConfirmOpen: this.uiModalOpen,
        pendingCityResolution: this.gameState.pendingCityResolution,
      }
    );
    const terrainSummary = this.gameState.map.tiles.reduce(
      (summary, tile) => {
        summary[tile.terrainType] = (summary[tile.terrainType] ?? 0) + 1;
        return summary;
      },
      /** @type {Record<string, number>} */ ({})
    );
    const uiRuntime = this.getUiRuntimeState();
    const playerEconomy = this.gameState.economy.player;

    const payload = {
      coordinateSystem: "Axial coordinates: q increases down-right, r increases down.",
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
      map: {
        width: this.gameState.map.width,
        height: this.gameState.map.height,
        seed: this.gameState.map.seed,
        terrainHash: this.computeTerrainHash(this.gameState.map.tiles),
        terrainSummary,
        spawnMetadata: this.gameState.map.spawnMetadata,
      },
      match: {
        status: this.gameState.match.status,
        reason: this.gameState.match.reason,
      },
      selectedUnitId: this.gameState.selectedUnitId,
      selectedCityId: this.gameState.selectedCityId,
      selectedUnitMovementRemaining: selectedUnit ? selectedUnit.movementRemaining : null,
      selectedUnitHasActed: selectedUnit ? selectedUnit.hasActed : null,
      reachableHexes: this.reachableHexes.map((hex) => ({ q: hex.q, r: hex.r, cost: hex.cost })),
      attackableTargets: this.attackableTargets.map((unit) => ({ id: unit.id, q: unit.q, r: unit.r })),
      attackableCities: this.attackableCities.map((city) => ({ id: city.id, q: city.q, r: city.r })),
      threatHexes: this.threatHexes.map((hex) => ({ q: hex.q, r: hex.r })),
      uiPreview: this.buildUiPreviewPayload(),
      animationState: this.getAnimationStatePayload(),
      turnPlayback: structuredClone(this.turnPlayback),
      uiTurnAssistant: this.getTurnAssistantState(),
      uiContextPanel: {
        expanded: !!uiRuntime.contextPanelExpanded,
        pinned: !!uiRuntime.contextPanelPinned,
      },
      uiNotificationFilter: uiRuntime.notificationFilter ?? "All",
      units: this.gameState.units.map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        health: unit.health,
        maxHealth: unit.maxHealth,
        attack: unit.attack,
        armor: unit.armor,
        attackRange: unit.attackRange,
        minAttackRange: unit.minAttackRange,
        role: unit.role,
        movementRemaining: unit.movementRemaining,
        maxMovement: unit.maxMovement,
        hasActed: unit.hasActed,
      })),
      cities: this.gameState.cities.map((city) => ({
        id: city.id,
        owner: city.owner,
        q: city.q,
        r: city.r,
        population: city.population,
        focus: city.focus,
        identity: city.identity,
        specialization: city.specialization,
        growthProgress: city.growthProgress,
        health: city.health,
        maxHealth: city.maxHealth,
        productionTab: city.productionTab,
        buildings: [...(city.buildings ?? [])],
        yieldLastTurn: city.yieldLastTurn,
        workedHexes: city.workedHexes.map((hex) => ({ q: hex.q, r: hex.r })),
        queue: city.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
      })),
      pendingCityResolution: this.gameState.pendingCityResolution
        ? {
            cityId: this.gameState.pendingCityResolution.cityId,
            attackerOwner: this.gameState.pendingCityResolution.attackerOwner,
            defenderOwner: this.gameState.pendingCityResolution.defenderOwner,
            choices: [...this.gameState.pendingCityResolution.choices],
          }
        : null,
      research: {
        activeTechId: this.gameState.research.activeTechId,
        progress: this.gameState.research.progress,
        completedTechIds: [...this.gameState.research.completedTechIds],
      },
      economy: {
        researchIncomeThisTurn: this.gameState.economy.researchIncomeThisTurn,
        player: this.gameState.economy.player,
        enemy: this.gameState.economy.enemy,
        purple: this.gameState.economy.purple,
      },
      ai: {
        enemy: {
          personality: this.gameState.ai?.enemy?.personality ?? null,
          lastGoal: this.gameState.ai?.enemy?.lastGoal ?? null,
          lastTurnSummary: this.gameState.ai?.enemy?.lastTurnSummary ?? null,
        },
        purple: {
          personality: this.gameState.ai?.purple?.personality ?? null,
          lastGoal: this.gameState.ai?.purple?.lastGoal ?? null,
          lastTurnSummary: this.gameState.ai?.purple?.lastTurnSummary ?? null,
        },
        byOwner: this.gameState.ai?.byOwner ? structuredClone(this.gameState.ai.byOwner) : null,
      },
      visibility: structuredClone(this.gameState.visibility),
      hudTopLeft: {
        turnLabel: `Turn ${this.gameState.turnState.turn} - ${this.gameState.turnState.phase === "enemy" ? "AI" : "Player"}`,
        devVisionEnabled: isPlayerDevVisionEnabled(this.gameState),
        resources: {
          food: { current: playerEconomy.foodStock, delta: projectedNetIncome.food, grossDelta: projectedIncome.food },
          production: {
            current: playerEconomy.productionStock,
            delta: projectedNetIncome.production,
            grossDelta: projectedIncome.production,
          },
          science: { current: playerEconomy.scienceStock, delta: projectedNetIncome.science, grossDelta: projectedIncome.science },
        },
      },
      selectedInfo: this.buildSelectedInfo(selectedUnit, selectedCity),
      contextMenu: this.buildContextMenuPayload(uiSurface, selectedUnit, selectedCity),
      pauseMenu: {
        open: uiRuntime.pauseMenuOpen,
        restartConfirmOpen: uiRuntime.restartConfirmOpen,
      },
      uiNotifications: uiRuntime.notifications,
      cameraScroll: this.getCameraScrollPayload(),
      cameraFocusHex: this.cameraFocusHex,
      unlocks: {
        units: [...this.gameState.unlocks.units],
      },
      uiHints: uiSurface.uiHints,
      uiActions: uiSurface.uiActions,
      uiModalOpen: this.uiModalOpen,
      devVisionEnabled: isPlayerDevVisionEnabled(this.gameState),
      simulatedTimeMs: this.manualTimeMs,
      lastCombatEvent: this.lastCombatEvent,
    };
    return JSON.stringify(payload);
  }

  getProjectedPlayerIncome() {
    const projected = {
      food: 0,
      production: 0,
      science: 1,
    };
    for (const city of this.gameState.cities) {
      if (city.owner !== "player") {
        continue;
      }
      const cityYield = computeCityYield(city.id, this.gameState);
      projected.food += cityYield.food;
      projected.production += cityYield.production;
      projected.science += cityYield.science;
    }
    return projected;
  }

  getProjectedPlayerNetIncome() {
    const simulation = cloneGameState(this.gameState);
    const before = simulation.economy.player;
    const beforeFood = before.foodStock;
    const beforeProduction = before.productionStock;
    const beforeScience = before.scienceStock;

    processCityTurn(simulation, "player");
    consumeScienceStock(simulation, "player", 1);

    const after = simulation.economy.player;
    return {
      food: after.foodStock - beforeFood,
      production: after.productionStock - beforeProduction,
      science: after.scienceStock - beforeScience,
    };
  }

  buildSelectedInfo(selectedUnit, selectedCity) {
    if (selectedUnit) {
      return {
        kind: "unit",
        id: selectedUnit.id,
        type: selectedUnit.type,
        health: selectedUnit.health,
        maxHealth: selectedUnit.maxHealth,
        movementRemaining: selectedUnit.movementRemaining,
        maxMovement: selectedUnit.maxMovement,
        hasActed: selectedUnit.hasActed,
        attack: selectedUnit.attack,
        armor: selectedUnit.armor,
        minAttackRange: selectedUnit.minAttackRange,
        attackRange: selectedUnit.attackRange,
        role: selectedUnit.role,
      };
    }
    if (selectedCity) {
      return {
        kind: "city",
        id: selectedCity.id,
        owner: selectedCity.owner,
        population: selectedCity.population,
        health: selectedCity.health,
        maxHealth: selectedCity.maxHealth,
        focus: selectedCity.focus,
        identity: selectedCity.identity,
        specialization: selectedCity.specialization,
        productionTab: selectedCity.productionTab,
        buildings: [...(selectedCity.buildings ?? [])],
        yieldLastTurn: selectedCity.yieldLastTurn,
        queue: selectedCity.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
      };
    }
    return { kind: "none" };
  }

  buildContextMenuPayload(uiSurface, selectedUnit, selectedCity) {
    const menuType = uiSurface.uiActions.contextMenuType;
    if (menuType === "city" && selectedCity) {
      return {
        type: "city",
        cityId: selectedCity.id,
        queueMax: uiSurface.uiActions.cityQueueMax,
        queue: selectedCity.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
        cityProductionTab: uiSurface.uiActions.cityProductionTab,
        cityProductionStock: uiSurface.uiActions.cityProductionStock,
        cityLocalProduction: uiSurface.uiActions.cityLocalProduction,
        cityFocusChoices: uiSurface.uiActions.cityFocusChoices,
        canSetCityFocus: uiSurface.uiActions.canSetCityFocus,
        canSetCityProductionTab: uiSurface.uiActions.canSetCityProductionTab,
        canQueueProduction: uiSurface.uiActions.canQueueProduction,
        cityQueueReason: uiSurface.uiActions.cityQueueReason,
        cityQueueSlots: uiSurface.uiActions.cityQueueSlots,
        cityProductionChoices: uiSurface.uiActions.cityProductionChoices,
        cityBuildingChoices: uiSurface.uiActions.cityBuildingChoices,
        disabledActionHints: uiSurface.uiActions.disabledActionHints,
      };
    }
    if (menuType === "unit" && selectedUnit) {
      return {
        type: "unit",
        unitId: selectedUnit.id,
        canFoundCity: uiSurface.uiActions.canFoundCity,
        foundCityReason: uiSurface.uiActions.foundCityReason,
        canSkipUnit: uiSurface.uiActions.canSkipUnit,
        skipUnitReason: uiSurface.uiActions.skipUnitReason,
      };
    }
    return { type: "none" };
  }

  getUiRuntimeState() {
    const defaults = {
      pauseMenuOpen: false,
      restartConfirmOpen: false,
      notifications: [],
      contextPanelExpanded: true,
      contextPanelPinned: false,
      notificationFilter: "All",
    };
    if (!this.scene.isActive("UIScene")) {
      return defaults;
    }
    const uiScene = this.scene.get("UIScene");
    if (!uiScene || typeof uiScene.getRuntimeUiState !== "function") {
      return defaults;
    }
    return uiScene.getRuntimeUiState();
  }

  emitNotification(message, options = {}) {
    if (!message) {
      return;
    }
    const sourceOwner = options.sourceOwner ?? null;
    const focus = options.focus ?? null;
    if (isAiOwner(sourceOwner) && !this.isNotificationFocusVisibleToPlayer(focus)) {
      return;
    }
    gameEvents.emit("ui-toast-requested", {
      message,
      level: options.level ?? "info",
      category: options.category ?? "System",
      focus,
    });
  }

  isNotificationFocusVisibleToPlayer(focus) {
    if (isPlayerDevVisionEnabled(this.gameState)) {
      return true;
    }
    if (!focus || typeof focus !== "object") {
      return false;
    }
    if (Number.isFinite(focus.q) && Number.isFinite(focus.r)) {
      return this.isHexVisibleToPlayer(focus.q, focus.r);
    }
    if (typeof focus.unitId === "string") {
      const unit = getUnitById(this.gameState, focus.unitId);
      if (unit) {
        return this.isUnitVisibleToPlayer(unit);
      }
    }
    if (typeof focus.cityId === "string") {
      const city = this.gameState.cities.find((candidate) => candidate.id === focus.cityId) ?? null;
      if (city) {
        return this.isCityVisibleToPlayer(city);
      }
    }
    return false;
  }

  buildSelectionFocusPayload() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (selectedUnit) {
      return {
        unitId: selectedUnit.id,
        q: selectedUnit.q,
        r: selectedUnit.r,
      };
    }
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    if (selectedCity) {
      return {
        cityId: selectedCity.id,
        q: selectedCity.q,
        r: selectedCity.r,
      };
    }
    return null;
  }

  setUiPreview(nextPreview) {
    const normalized = nextPreview && nextPreview.mode && nextPreview.mode !== "none" ? sanitizePreview(nextPreview) : null;
    if (arePreviewsEqual(this.uiPreview, normalized)) {
      return false;
    }
    this.uiPreview = normalized;
    return true;
  }

  buildUiPreviewPayload() {
    return this.uiPreview ? structuredClone(this.uiPreview) : { mode: "none" };
  }

  buildHoverPreview(selectedUnit, hoveredHex) {
    const hoveredUnit = getUnitAt(this.gameState, hoveredHex.q, hoveredHex.r);
    if (
      hoveredUnit &&
      hoveredUnit.owner !== selectedUnit.owner &&
      this.isUnitVisibleToPlayer(hoveredUnit) &&
      this.attackableLookup.has(hoveredUnit.id)
    ) {
      const prediction = previewAttack(selectedUnit.id, hoveredUnit.id, this.gameState);
      if (!prediction.ok) {
        return null;
      }
      return {
        mode: "attack-unit",
        attackerId: selectedUnit.id,
        targetId: hoveredUnit.id,
        q: hoveredUnit.q,
        r: hoveredUnit.r,
        damage: prediction.damage ?? 0,
        targetRemainingHealth: prediction.targetRemainingHealth ?? hoveredUnit.health,
        counterattack: prediction.counterattack ?? null,
        breakdown: prediction.breakdown ?? null,
      };
    }

    const hoveredCity = getCityAt(this.gameState, hoveredHex.q, hoveredHex.r);
    if (
      hoveredCity &&
      hoveredCity.owner !== selectedUnit.owner &&
      this.isCityVisibleToPlayer(hoveredCity) &&
      this.attackableCityLookup.has(hoveredCity.id)
    ) {
      const prediction = previewCityAttack(selectedUnit.id, hoveredCity.id, this.gameState);
      if (!prediction.ok) {
        return null;
      }
      return {
        mode: "attack-city",
        attackerId: selectedUnit.id,
        cityId: hoveredCity.id,
        q: hoveredCity.q,
        r: hoveredCity.r,
        damage: prediction.damage ?? 0,
        cityRemainingHealth: prediction.cityRemainingHealth ?? hoveredCity.health,
        breakdown: prediction.breakdown ?? null,
      };
    }

    const hoveredKey = axialKey(hoveredHex);
    if (this.reachableLookup.has(hoveredKey)) {
      const moveCost = this.reachableCostByKey.get(hoveredKey) ?? 0;
      return {
        mode: "move",
        unitId: selectedUnit.id,
        q: hoveredHex.q,
        r: hoveredHex.r,
        moveCost,
        movementRemainingAfter: Math.max(0, selectedUnit.movementRemaining - moveCost),
      };
    }

    return null;
  }

  isHexVisibleToPlayer(q, r) {
    if (isPlayerDevVisionEnabled(this.gameState)) {
      return true;
    }
    return isHexVisibleToOwner(this.gameState, "player", q, r);
  }

  isUnitVisibleToPlayer(unit) {
    if (!unit) {
      return false;
    }
    if (unit.owner === "player") {
      return true;
    }
    return this.isHexVisibleToPlayer(unit.q, unit.r);
  }

  isCityVisibleToPlayer(city) {
    if (!city) {
      return false;
    }
    if (city.owner === "player") {
      return true;
    }
    return this.isHexVisibleToPlayer(city.q, city.r);
  }

  getReadyPlayerUnits() {
    return this.gameState.units
      .filter((unit) => unit.owner === "player" && unit.health > 0 && !unit.hasActed && unit.movementRemaining > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getPlayerCitiesWithEmptyQueue() {
    return this.gameState.cities
      .filter((city) => city.owner === "player")
      .filter((city) => (city.queue?.length ?? 0) === 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getNextReadyUnitId() {
    const readyUnits = this.getReadyPlayerUnits();
    if (readyUnits.length === 0) {
      return null;
    }

    const currentId = this.gameState.selectedUnitId;
    const currentIndex = readyUnits.findIndex((unit) => unit.id === currentId);
    if (currentIndex === -1) {
      return readyUnits[0].id;
    }

    const nextIndex = (currentIndex + 1) % readyUnits.length;
    return readyUnits[nextIndex].id;
  }

  getAttentionTargets() {
    const targets = [];
    for (const unit of this.getReadyPlayerUnits()) {
      targets.push({ kind: "unit", id: unit.id });
    }
    for (const city of this.getPlayerCitiesWithEmptyQueue()) {
      targets.push({ kind: "city", id: city.id });
    }
    return targets;
  }

  getNextAttentionTarget() {
    const targets = this.getAttentionTargets();
    if (targets.length === 0) {
      return null;
    }

    const currentSelectionKey = this.gameState.selectedUnitId
      ? `unit:${this.gameState.selectedUnitId}`
      : this.gameState.selectedCityId
        ? `city:${this.gameState.selectedCityId}`
        : null;
    const currentIndex = currentSelectionKey
      ? targets.findIndex((target) => `${target.kind}:${target.id}` === currentSelectionKey)
      : -1;
    if (currentIndex === -1) {
      return targets[0];
    }
    return targets[(currentIndex + 1) % targets.length];
  }

  getTurnAssistantState() {
    if (
      this.gameState.match.status !== "ongoing" ||
      this.gameState.turnState.phase !== "player" ||
      !!this.gameState.pendingCityResolution ||
      this.isAnimationBusy ||
      this.turnPlayback.active
    ) {
      return {
        readyCount: 0,
        nextReadyUnitId: null,
        emptyQueueCityCount: 0,
      };
    }
    const readyUnits = this.getReadyPlayerUnits();
    const idleQueueCities = this.getPlayerCitiesWithEmptyQueue();
    return {
      readyCount: readyUnits.length,
      nextReadyUnitId: this.getNextReadyUnitId(),
      emptyQueueCityCount: idleQueueCities.length,
    };
  }

  refreshThreatOverlay(selectedUnit) {
    const candidateHexes = new Map();
    candidateHexes.set(axialKey(selectedUnit), { q: selectedUnit.q, r: selectedUnit.r });
    for (const hex of this.reachableHexes) {
      candidateHexes.set(axialKey(hex), { q: hex.q, r: hex.r });
    }

    const threatHexes = [];
    const threatLookup = new Set();
    for (const candidate of candidateHexes.values()) {
      if (this.isHexThreatenedByEnemy(candidate)) {
        threatHexes.push(candidate);
        threatLookup.add(axialKey(candidate));
      }
    }
    this.threatHexes = threatHexes;
    this.threatLookup = threatLookup;
  }

  isHexThreatenedByEnemy(hex) {
    for (const enemyUnit of this.gameState.units) {
      if (!AI_OWNERS.includes(enemyUnit.owner) || enemyUnit.health <= 0) {
        continue;
      }
      if (!isPlayerDevVisionEnabled(this.gameState) && !canOwnerSeeUnit(this.gameState, "player", enemyUnit)) {
        continue;
      }
      const minRange = Math.max(1, enemyUnit.minAttackRange ?? 1);
      const maxRange = Math.max(minRange, enemyUnit.attackRange ?? 1);
      const distanceToHex = distance(enemyUnit, hex);
      if (distanceToHex >= minRange && distanceToHex <= maxRange) {
        return true;
      }
    }
    return false;
  }

  resolveNotificationFocus(focus) {
    if (!focus || typeof focus !== "object") {
      return null;
    }
    if (typeof focus.unitId === "string") {
      const targetUnit = getUnitById(this.gameState, focus.unitId);
      if (targetUnit) {
        return { q: targetUnit.q, r: targetUnit.r };
      }
    }
    if (typeof focus.cityId === "string") {
      const targetCity = this.gameState.cities.find((city) => city.id === focus.cityId) ?? null;
      if (targetCity) {
        return { q: targetCity.q, r: targetCity.r };
      }
    }
    if (Number.isFinite(focus.q) && Number.isFinite(focus.r)) {
      const q = Math.round(focus.q);
      const r = Math.round(focus.r);
      if (isInsideMap(this.gameState.map, q, r)) {
        return { q, r };
      }
    }
    return null;
  }

  focusCameraOnHex(q, r) {
    const center = this.hexToWorld(q, r);
    this.cameras.main.centerOn(center.x, center.y);
  }

  computeTerrainHash(tiles) {
    let hash = 2166136261;
    for (const tile of tiles) {
      const token = `${tile.q},${tile.r}:${tile.terrainType};`;
      for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return (hash >>> 0).toString(16);
  }

  // Test-oriented helpers used through window.__hexfallTest
  testGetActionPreviewState() {
    return this.buildUiPreviewPayload();
  }

  testGetAnimationState() {
    return this.getAnimationStatePayload();
  }

  testHoverHex(q, r) {
    if (!isInsideMap(this.gameState.map, q, r)) {
      return false;
    }
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== "player" || !this.canAcceptPlayerCommands()) {
      return false;
    }
    const nextPreview = this.buildHoverPreview(selectedUnit, { q, r });
    this.setUiPreview(nextPreview);
    this.renderAll();
    this.publishState();
    return true;
  }

  testGetTurnAssistantState() {
    return this.getTurnAssistantState();
  }

  testNextReadyUnit() {
    return this.handleNextReadyUnitRequested();
  }

  testSelectUnit(unitId) {
    if (!getUnitById(this.gameState, unitId)) {
      return false;
    }
    this.selectUnit(unitId);
    return true;
  }

  testSelectCity(cityId) {
    if (!this.gameState.cities.find((city) => city.id === cityId)) {
      return false;
    }
    this.selectCity(cityId);
    return true;
  }

  testMoveSelected(q, r) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const result = moveUnit(unitId, { q, r }, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testAttackTarget(targetId) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const attacker = getUnitById(this.gameState, unitId);
    const target = getUnitById(this.gameState, targetId);
    if (!attacker || !target) {
      return false;
    }
    const result = resolveAttack(unitId, targetId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.handleUnitAttackResult(attacker, target, result);
    this.evaluateAndPublish();
    return true;
  }

  testAttackCity(cityId) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const attacker = getUnitById(this.gameState, unitId);
    const city = this.gameState.cities.find((candidate) => candidate.id === cityId);
    if (!attacker || !city) {
      return false;
    }
    const result = resolveCityAttack(unitId, cityId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.recordCityAttackEvent(attacker, city, result);
    this.handleCityAttackResult(result);
    this.evaluateAndPublish();
    return true;
  }

  testChooseCityOutcome(choice) {
    const cityId = this.gameState.pendingCityResolution?.cityId;
    if (!cityId || (choice !== "capture" && choice !== "raze")) {
      return false;
    }
    const result = resolveCityOutcome(cityId, choice, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testFoundCity() {
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      return false;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testCycleCityFocus() {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    const city = this.gameState.cities.find((candidate) => candidate.id === cityId);
    if (!city) {
      return false;
    }
    const focusOrder = ["balanced", "food", "production", "science"];
    const currentIndex = focusOrder.indexOf(city.focus);
    const nextFocus = focusOrder[(currentIndex + 1 + focusOrder.length) % focusOrder.length];
    const result = setCityFocus(
      cityId,
      /** @type {"balanced"|"food"|"production"|"science"} */ (nextFocus),
      this.gameState
    );
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.focus;
  }

  testSetCityFocus(focus) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (focus !== "balanced" && focus !== "food" && focus !== "production" && focus !== "science") {
      return false;
    }
    const result = setCityFocus(cityId, focus, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.focus;
  }

  testEnqueueCityProduction(unitType) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (unitType !== "warrior" && unitType !== "settler" && unitType !== "spearman" && unitType !== "archer") {
      return false;
    }
    const result = enqueueCityQueue(cityId, unitType, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return (result.queue ?? []).map((item) => ({ kind: item.kind, id: item.id }));
  }

  testEnqueueCityBuilding(buildingId) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (buildingId !== "granary" && buildingId !== "workshop" && buildingId !== "monument") {
      return false;
    }
    const result = enqueueCityBuilding(cityId, buildingId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return (result.queue ?? []).map((item) => ({ kind: item.kind, id: item.id }));
  }

  testSetCityProductionTab(tab) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (tab !== "units" && tab !== "buildings") {
      return false;
    }
    const result = setCityProductionTab(cityId, tab, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.tab;
  }

  testRemoveCityQueueAt(index) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    const result = removeCityQueueAt(cityId, index, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return [...(result.queue ?? [])];
  }

  testMoveCityQueue(index, direction) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (direction !== "up" && direction !== "down") {
      return false;
    }

    const result = moveCityQueueItem(cityId, Number(index), direction, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return [...(result.queue ?? [])];
  }

  testCycleResearch() {
    this.handleResearchCycleRequested();
    return this.gameState.research.activeTechId;
  }

  testTriggerUnitAction(actionId) {
    return this.handleUnitActionRequested({ actionId });
  }

  testToggleDevVision() {
    const enabled = togglePlayerDevVision(this.gameState);
    this.evaluateAndPublish();
    return enabled;
  }

  testSetDevVision(enabled) {
    const next = !!enabled;
    if (isPlayerDevVisionEnabled(this.gameState) === next) {
      return next;
    }
    return this.testToggleDevVision();
  }

  testSetAiPersonality(owner, personality) {
    if (!AI_OWNERS.includes(owner)) {
      return false;
    }
    if (personality !== "raider" && personality !== "expansionist" && personality !== "guardian") {
      return false;
    }
    const aiState = ensureAiState(this.gameState, owner);
    aiState.personality = normalizeEnemyPersonality(personality, this.gameState.map.seed, owner);
    this.evaluateAndPublish();
    return aiState.personality;
  }

  testSetEnemyPersonality(personality) {
    return this.testSetAiPersonality("enemy", personality);
  }

  testSetPurplePersonality(personality) {
    return this.testSetAiPersonality("purple", personality);
  }

  testGetAiState(owner = "enemy") {
    if (!AI_OWNERS.includes(owner)) {
      return null;
    }
    return structuredClone(ensureAiState(this.gameState, owner));
  }

  testGetEnemyAiState() {
    return this.testGetAiState("enemy");
  }

  testGetPurpleAiState() {
    return this.testGetAiState("purple");
  }

  testClearAiCityQueue(owner = "enemy", cityId) {
    if (!AI_OWNERS.includes(owner)) {
      return false;
    }
    const targetCity =
      (cityId ? this.gameState.cities.find((city) => city.id === cityId) : this.gameState.cities.find((city) => city.owner === owner)) ??
      null;
    if (!targetCity || targetCity.owner !== owner) {
      return false;
    }
    targetCity.queue = [];
    this.evaluateAndPublish();
    return true;
  }

  testClearEnemyCityQueue(cityId) {
    return this.testClearAiCityQueue("enemy", cityId);
  }

  testSelectResearch(techId) {
    const result = selectResearch(techId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testEndTurnImmediate() {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    beginEnemyTurn(this.gameState);
    this.evaluateAndPublish();
    this.resolveEnemyAndAdvanceTurn();
    return true;
  }

  testRequestEndTurn() {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    this.handleEndTurnRequested();
    return true;
  }

  testSetUnitPosition(unitId, q, r) {
    const unit = getUnitById(this.gameState, unitId);
    if (!unit || !isInsideMap(this.gameState.map, q, r)) {
      return false;
    }

    const tile = getTileAt(this.gameState.map, q, r);
    if (!tile || tile.blocksMovement || getCityAt(this.gameState, q, r)) {
      return false;
    }

    const occupant = getUnitAt(this.gameState, q, r);
    if (occupant && occupant.id !== unitId) {
      return false;
    }

    unit.q = q;
    unit.r = r;
    this.evaluateAndPublish();
    return true;
  }

  testArrangeCombatSkirmish(playerUnitId, enemyUnitId) {
    const playerUnit = getUnitById(this.gameState, playerUnitId);
    const enemyUnit = getUnitById(this.gameState, enemyUnitId);
    if (!playerUnit || !enemyUnit) {
      return false;
    }

    const ignoredUnits = new Set([playerUnitId, enemyUnitId]);
    for (const tile of this.gameState.map.tiles) {
      if (tile.blocksMovement || getCityAt(this.gameState, tile.q, tile.r)) {
        continue;
      }

      const firstOccupant = getUnitAt(this.gameState, tile.q, tile.r);
      if (firstOccupant && !ignoredUnits.has(firstOccupant.id)) {
        continue;
      }

      for (const adjacent of neighbors(tile)) {
        if (!isInsideMap(this.gameState.map, adjacent.q, adjacent.r)) {
          continue;
        }

        const adjacentTile = getTileAt(this.gameState.map, adjacent.q, adjacent.r);
        if (!adjacentTile || adjacentTile.blocksMovement || getCityAt(this.gameState, adjacent.q, adjacent.r)) {
          continue;
        }

        const secondOccupant = getUnitAt(this.gameState, adjacent.q, adjacent.r);
        if (secondOccupant && !ignoredUnits.has(secondOccupant.id)) {
          continue;
        }

        playerUnit.q = tile.q;
        playerUnit.r = tile.r;
        enemyUnit.q = adjacent.q;
        enemyUnit.r = adjacent.r;
        playerUnit.hasActed = false;
        if (playerUnit.movementRemaining < playerUnit.maxMovement) {
          playerUnit.movementRemaining = playerUnit.maxMovement;
        }

        this.evaluateAndPublish();
        return true;
      }
    }

    return false;
  }
}

function normalizeIncomingQueueItem(payload) {
  if (payload?.queueItem && typeof payload.queueItem === "object") {
    const kind = payload.queueItem.kind;
    const id = payload.queueItem.id;
    if ((kind === "unit" || kind === "building") && typeof id === "string" && id) {
      return { kind, id };
    }
  }

  if (typeof payload?.unitType === "string") {
    return { kind: "unit", id: payload.unitType };
  }

  if (typeof payload?.buildingId === "string") {
    return { kind: "building", id: payload.buildingId };
  }

  return null;
}

function sanitizePreview(preview) {
  return structuredClone(preview);
}

function arePreviewsEqual(a, b) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
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

function formatCombatBreakdownSummary(breakdown) {
  if (!breakdown) {
    return "";
  }
  const parts = [
    `base ${breakdown.baseAttack}`,
    `role ${formatSignedNumber(breakdown.roleBonus)}`,
    `terrain atk ${formatSignedNumber(breakdown.terrainAttackBonus)}`,
    `armor -${breakdown.defenderArmor}`,
    `terrain def -${breakdown.terrainDefenseBonus}`,
  ];
  return ` (${parts.join(", ")})`;
}

function formatCounterattackSummary(counterattack) {
  if (!counterattack) {
    return "";
  }
  if (!counterattack.triggered) {
    if (counterattack.reason === "out-of-range") {
      return " No counterattack (out of range).";
    }
    if (counterattack.reason === "target-defeated") {
      return " No counterattack (target defeated).";
    }
    return "";
  }
  return ` Counterattack for ${counterattack.damage ?? 0}.`;
}

function formatSignedNumber(value) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
