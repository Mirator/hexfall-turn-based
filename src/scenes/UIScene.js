import Phaser from "../core/phaserRuntime.js";
import { gameEvents } from "../core/eventBus.js";

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 40;
const COMPACT_BREAKPOINT = 900;
const CITY_PANEL_FOCUS_WIDTH = 88;
const CITY_PANEL_TAB_WIDTH = 102;
const CITY_PANEL_ACTION_WIDTH = 92;
const CITY_PANEL_QUEUE_ITEM_WIDTH = 210;
const CITY_PANEL_QUEUE_MOVE_WIDTH = 28;
const CITY_PANEL_QUEUE_REMOVE_WIDTH = 44;
const CITY_PANEL_BUTTON_HEIGHT = 30;
const UNIT_PANEL_ACTION_WIDTH = 160;
const CONTEXT_PANEL_COLLAPSED_HEIGHT = 76;
const CONTEXT_PANEL_EXPANDED_HEIGHT = 286;
const CONTEXT_PANEL_EXPANDED_HEIGHT_COMPACT = 344;
const CONTEXT_PANEL_WIDTH_PADDING = 560;
const FOCUS_MODES = ["balanced", "food", "production", "science"];
const PRODUCTION_TABS = ["units", "buildings"];
const UNIT_PRODUCTION_TYPES = ["warrior", "settler", "spearman", "archer"];
const BUILDING_PRODUCTION_TYPES = ["granary", "workshop", "monument"];
const NOTIFICATION_FILTERS = ["All", "Combat", "City", "Research", "System"];

const FOCUS_LABELS = {
  balanced: "Balanced",
  food: "Food",
  production: "Production",
  science: "Science",
};

const UNIT_LABELS = {
  warrior: "Warrior",
  settler: "Settler",
  spearman: "Spearman",
  archer: "Archer",
};

const BUILDING_LABELS = {
  granary: "Granary",
  workshop: "Workshop",
  monument: "Monument",
};

const PRODUCTION_TAB_LABELS = {
  units: "Units",
  buildings: "Buildings",
};

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");

    this.latestState = null;
    this.hoverHint = null;
    this.disabledHoverText = null;
    this.pauseMenuOpen = false;
    this.restartConfirmOpen = false;
    this.cityResolutionOpen = false;
    this.modalStateOpen = false;
    this.escapeKey = null;
    this.contextMenuMode = null;
    this.notifications = [];
    this.notificationNextId = 1;
    this.notificationScroll = 0;
    this.notificationVisibleRows = 8;
    this.notificationFilter = "All";
    this.notificationVisibleSlice = [];
    this.contextPanelExpanded = false;
    this.contextPanelPinned = false;
    this.lastContextSelectionKey = null;
    this.disabledTooltipVisible = false;
  }

  create() {
    this.turnLabel = this.createLabel("", 24, 16, "24px", "#2d2415", 10, "#f4ebd7", 3);
    this.foodLabel = this.createLabel("", 24, 48, "18px", "#2d2415", 10);
    this.foodDeltaLabel = this.createLabel("", 24, 50, "15px", "#2f7a41", 10);
    this.productionLabel = this.createLabel("", 24, 74, "18px", "#2d2415", 10);
    this.productionDeltaLabel = this.createLabel("", 24, 76, "15px", "#2f7a41", 10);
    this.scienceLabel = this.createLabel("", 24, 100, "18px", "#2d2415", 10);
    this.scienceDeltaLabel = this.createLabel("", 24, 102, "15px", "#2f7a41", 10);
    this.devVisionLabel = this.createLabel("", 24, 126, "15px", "#5a4224", 10);
    this.playbackPanel = this.add.rectangle(0, 0, 10, 10, 0xe9dcc1, 0.96).setDepth(11).setVisible(false);
    this.playbackPanel.setStrokeStyle(2, 0x7d5a2f, 0.86);
    this.playbackLabel = this.createLabel("", 0, 0, "15px", "#3f2d18", 12).setOrigin(0.5).setVisible(false);

    this.selectedPanel = this.add.rectangle(24, 0, 460, 92, 0xeadcc0, 0.95).setOrigin(0, 0).setDepth(10);
    this.selectedPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.selectedTitle = this.createLabel("Selected", 38, 0, "16px", "#4a3318", 11);
    this.selectedDetails = this.createLabel("No selection", 38, 0, "15px", "#3f2d18", 11);

    this.endTurnButton = this.createButton("End Turn", "endTurn", () => gameEvents.emit("end-turn-requested"));
    this.turnAssistantPanel = this.add.rectangle(0, 0, 220, 64, 0xf0e4cb, 0.95).setDepth(12);
    this.turnAssistantPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.turnAssistantPanel.setInteractive({ useHandCursor: true });
    this.turnAssistantPanel.on("pointerdown", () => gameEvents.emit("next-ready-unit-requested"));
    this.turnAssistantLabel = this.createLabel("Units ready: 0", 0, 0, "16px", "#3f2d18", 13).setOrigin(0.5);
    this.nextUnitButton = this.createButton("Next Unit", "nextUnit", () => gameEvents.emit("next-ready-unit-requested"), {
      width: 130,
      height: 30,
      fontSize: "14px",
      enabledFill: 0x4f6b4a,
      hoverFill: 0x5d8156,
      disabledFill: 0x6f776d,
      stroke: 0xe6dbbf,
    });

    this.contextPanel = this.add.rectangle(0, 0, 10, 10, 0xead7b1, 0.95).setDepth(12).setVisible(false);
    this.contextPanel.setStrokeStyle(2, 0x7d5a2f, 0.9);
    this.contextPanelTitle = this.createLabel("", 0, 0, "16px", "#3d2a14", 13);
    this.contextPanelTitle.setOrigin(0.5);
    this.contextPanelTitle.setVisible(false);
    this.contextPanelExpandButton = this.createButton("^", "context-expand-toggle", () => this.toggleContextPanelExpanded(), {
      width: 36,
      height: 26,
      fontSize: "16px",
      enabledFill: 0x6f6d63,
      hoverFill: 0x848175,
      activeFill: 0x4d7e56,
      stroke: 0xe9d9b4,
    });
    this.contextPanelPinButton = this.createButton("Pin", "context-pin-toggle", () => this.toggleContextPanelPinned(), {
      width: 62,
      height: 26,
      fontSize: "13px",
      enabledFill: 0x6f6d63,
      hoverFill: 0x848175,
      activeFill: 0x2f7a41,
      stroke: 0xe9d9b4,
    });
    this.contextPanelMetaPrimary = this.createLabel("", 0, 0, "14px", "#3f2d18", 13).setOrigin(0.5).setVisible(false);
    this.contextPanelMetaSecondary = this.createLabel("", 0, 0, "13px", "#5a4224", 13).setOrigin(0.5).setVisible(false);

    this.cityFocusButtons = FOCUS_MODES.map((focus) =>
      this.createButton(
        FOCUS_LABELS[focus],
        `city-focus-${focus}`,
        () => gameEvents.emit("city-focus-set-requested", { focus }),
        {
          width: CITY_PANEL_FOCUS_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "14px",
          enabledFill: 0x4f6b4a,
          hoverFill: 0x5d8156,
          activeFill: 0x2f7a41,
          disabledFill: 0x6f776d,
          stroke: 0xe6dbbf,
        }
      )
    );
    this.cityProductionTabButtons = PRODUCTION_TABS.map((tab) =>
      this.createButton(
        PRODUCTION_TAB_LABELS[tab],
        `city-production-tab-${tab}`,
        () => gameEvents.emit("city-production-tab-set-requested", { tab }),
        {
          width: CITY_PANEL_TAB_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "14px",
          enabledFill: 0x6d6d73,
          hoverFill: 0x7f8088,
          activeFill: 0x355e94,
          disabledFill: 0x74757a,
          stroke: 0xe9d9b4,
        }
      )
    );
    this.cityProductionButtons = UNIT_PRODUCTION_TYPES.map((unitType) =>
      this.createButton(
        "--",
        `city-enqueue-${unitType}`,
        () =>
          gameEvents.emit("city-queue-enqueue-requested", {
            unitType,
            queueItem: { kind: "unit", id: unitType },
          }),
        {
          width: CITY_PANEL_ACTION_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "13px",
          enabledFill: 0x355e94,
          hoverFill: 0x4a76ae,
          activeFill: 0x355e94,
          disabledFill: 0x6d747e,
          stroke: 0xe9d9b4,
        }
      )
    );
    this.cityBuildingButtons = BUILDING_PRODUCTION_TYPES.map((buildingId) =>
      this.createButton(
        "--",
        `city-enqueue-building-${buildingId}`,
        () =>
          gameEvents.emit("city-queue-enqueue-requested", {
            buildingId,
            queueItem: { kind: "building", id: buildingId },
          }),
        {
          width: CITY_PANEL_ACTION_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "13px",
          enabledFill: 0x3d6e58,
          hoverFill: 0x4d866b,
          activeFill: 0x3d6e58,
          disabledFill: 0x707a72,
          stroke: 0xe6dbbf,
        }
      )
    );
    this.cityQueueButtons = [0, 1, 2].map((index) =>
      this.createButton(
        `${index + 1}. Empty`,
        `city-queue-slot-${index}`,
        () => {},
        {
          width: CITY_PANEL_QUEUE_ITEM_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "12px",
          enabledFill: 0x5f5a4a,
          hoverFill: 0x6d6755,
          activeFill: 0x5f5a4a,
          disabledFill: 0x7f7568,
          stroke: 0xf2debb,
        }
      )
    );
    this.cityQueueMoveUpButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "^",
        `city-queue-move-up-${index}`,
        () => gameEvents.emit("city-queue-move-requested", { index, direction: "up" }),
        {
          width: CITY_PANEL_QUEUE_MOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "13px",
          enabledFill: 0x44617d,
          hoverFill: 0x537496,
          disabledFill: 0x6b6f75,
          stroke: 0xd9d0bf,
        }
      )
    );
    this.cityQueueMoveDownButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "v",
        `city-queue-move-down-${index}`,
        () => gameEvents.emit("city-queue-move-requested", { index, direction: "down" }),
        {
          width: CITY_PANEL_QUEUE_MOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "13px",
          enabledFill: 0x44617d,
          hoverFill: 0x537496,
          disabledFill: 0x6b6f75,
          stroke: 0xd9d0bf,
        }
      )
    );
    this.cityQueueRemoveButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "X",
        `city-queue-remove-${index}`,
        () => gameEvents.emit("city-queue-remove-requested", { index }),
        {
          width: CITY_PANEL_QUEUE_REMOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "12px",
          enabledFill: 0x7c4e2b,
          hoverFill: 0x956039,
          activeFill: 0x7c4e2b,
          disabledFill: 0x7f7568,
          stroke: 0xf2debb,
        }
      )
    );
    this.unitFoundCityButton = this.createButton("Found City", "unit-found-city", () =>
      gameEvents.emit("unit-action-requested", { actionId: "foundCity" }),
      {
        width: UNIT_PANEL_ACTION_WIDTH,
        height: BUTTON_HEIGHT - 6,
      }
    );
    this.unitSkipButton = this.createButton("Skip Unit", "unit-skip", () =>
      gameEvents.emit("unit-action-requested", { actionId: "skipUnit" }),
      {
        width: UNIT_PANEL_ACTION_WIDTH,
        height: BUTTON_HEIGHT - 6,
      }
    );
    this.setCityControlsVisible(false);
    this.setUnitControlsVisible(false);
    this.setCompositeVisible(this.contextPanelExpandButton, false);
    this.setCompositeVisible(this.contextPanelPinButton, false);
    this.contextPanelMetaPrimary.setVisible(false);
    this.contextPanelMetaSecondary.setVisible(false);

    this.hintPanel = this.add.rectangle(0, 0, 440, 74, 0xf0e4cb, 0.95).setDepth(20).setVisible(false);
    this.hintPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.hintPrimary = this.createLabel("", 0, 0, "16px", "#3f2d18", 21);
    this.hintPrimary.setOrigin(0.5).setVisible(false);
    this.hintSecondary = this.createLabel("", 0, 0, "14px", "#5a4224", 21);
    this.hintSecondary.setOrigin(0.5).setVisible(false);
    this.previewPanel = this.add.rectangle(0, 0, 360, 66, 0xf0e4cb, 0.95).setDepth(22).setVisible(false);
    this.previewPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.previewTitle = this.createLabel("", 0, 0, "15px", "#3f2d18", 23);
    this.previewTitle.setOrigin(0.5).setVisible(false);
    this.previewDetails = this.createLabel("", 0, 0, "13px", "#5a4224", 23);
    this.previewDetails.setOrigin(0.5).setVisible(false);
    this.disabledTooltipPanel = this.add.rectangle(0, 0, 10, 10, 0x2f271c, 0.94).setDepth(31).setVisible(false);
    this.disabledTooltipPanel.setStrokeStyle(1, 0xd7c8a4, 0.95);
    this.disabledTooltipLabel = this.createLabel("", 0, 0, "12px", "#f5e8ca", 32).setVisible(false);

    this.notificationPanel = this.add.rectangle(0, 0, 360, 236, 0xeadcc0, 0.95).setDepth(16);
    this.notificationPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.notificationTitle = this.createLabel("Notifications", 0, 0, "17px", "#4a3318", 17);
    this.notificationFilterButtons = NOTIFICATION_FILTERS.map((filterName) =>
      this.createButton(filterName, `notif-filter-${filterName}`, () => this.setNotificationFilter(filterName), {
        width: filterName === "Research" ? 78 : 66,
        height: 24,
        fontSize: "12px",
        enabledFill: 0x6f6d63,
        hoverFill: 0x848175,
        activeFill: 0x355e94,
        disabledFill: 0x6f6d63,
        stroke: 0xe9d9b4,
      })
    );
    for (const filterButton of this.notificationFilterButtons) {
      filterButton.rectangle.setDepth(18);
      filterButton.label.setDepth(19);
    }
    this.notificationRows = Array.from({ length: 8 }, (_unused, index) => {
      const row = this.createLabel("", 0, 0, "14px", "#3f2d18", 17).setVisible(false);
      row.on("pointerdown", () => this.focusNotificationByRow(index));
      return row;
    });

    this.modalBackdrop = this.add
      .rectangle(0, 0, 10, 10, 0x2a1b10, 0.34)
      .setDepth(39)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.modalBackdrop.on("pointerdown", () => {
      if (this.restartConfirmOpen) {
        this.closeRestartConfirm();
      } else if (this.pauseMenuOpen) {
        this.closePauseMenu();
      }
    });

    this.pausePanel = this.add.rectangle(0, 0, 420, 178, 0xf2e6cc, 0.98).setDepth(40).setVisible(false);
    this.pausePanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.pausePanel.setInteractive();
    this.pausePanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.pauseTitle = this.createLabel("Paused", 0, 0, "34px", "#4a2e12", 41);
    this.pauseTitle.setOrigin(0.5).setVisible(false);
    this.pauseResumeButton = this.createButton("Resume", "pause-resume", () => this.closePauseMenu(), {
      enabledFill: 0x355e94,
      hoverFill: 0x4a76ae,
    });
    this.pauseRestartButton = this.createButton("Restart", "pause-restart", () => this.openRestartConfirm(), {
      enabledFill: 0x7c4e2b,
      hoverFill: 0x956039,
      stroke: 0xf2debb,
    });
    this.pauseResumeButton.rectangle.setDepth(42);
    this.pauseResumeButton.label.setDepth(43);
    this.pauseRestartButton.rectangle.setDepth(42);
    this.pauseRestartButton.label.setDepth(43);
    this.setCompositeVisible(this.pauseResumeButton, false);
    this.setCompositeVisible(this.pauseRestartButton, false);

    this.restartConfirmPanel = this.add.rectangle(0, 0, 420, 150, 0xf2e6cc, 0.98).setDepth(44).setVisible(false);
    this.restartConfirmPanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.restartConfirmPanel.setInteractive();
    this.restartConfirmPanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.restartConfirmTitle = this.createLabel("Restart match?", 0, 0, "30px", "#4a2e12", 45);
    this.restartConfirmTitle.setOrigin(0.5).setVisible(false);
    this.restartConfirmSubtitle = this.createLabel("Current progress will be lost.", 0, 0, "17px", "#4a2e12", 45);
    this.restartConfirmSubtitle.setOrigin(0.5).setVisible(false);
    this.restartConfirmButton = this.createButton("Confirm", "restart-confirm", () => this.confirmRestart(), {
      enabledFill: 0x2f6c3d,
      hoverFill: 0x3f8450,
      disabledFill: 0x617965,
      stroke: 0xe5f0dc,
    });
    this.restartCancelButton = this.createButton("Cancel", "restart-cancel", () => this.closeRestartConfirm(), {
      enabledFill: 0x7c4e2b,
      hoverFill: 0x956039,
      disabledFill: 0x7c7065,
      stroke: 0xf2debb,
    });
    this.restartConfirmButton.rectangle.setDepth(46);
    this.restartConfirmButton.label.setDepth(47);
    this.restartCancelButton.rectangle.setDepth(46);
    this.restartCancelButton.label.setDepth(47);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);

    this.cityOutcomePanel = this.add.rectangle(0, 0, 420, 160, 0xf2e6cc, 0.98).setDepth(48).setVisible(false);
    this.cityOutcomePanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.cityOutcomePanel.setInteractive();
    this.cityOutcomePanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.cityOutcomeTitle = this.createLabel("City conquered", 0, 0, "30px", "#4a2e12", 49);
    this.cityOutcomeTitle.setOrigin(0.5).setVisible(false);
    this.cityOutcomeSubtitle = this.createLabel("Capture it or raze it.", 0, 0, "17px", "#4a2e12", 49);
    this.cityOutcomeSubtitle.setOrigin(0.5).setVisible(false);
    this.cityCaptureButton = this.createButton("Capture", "cityCapture", () =>
      gameEvents.emit("city-outcome-requested", { choice: "capture" })
    );
    this.cityRazeButton = this.createButton("Raze", "cityRaze", () =>
      gameEvents.emit("city-outcome-requested", { choice: "raze" }),
      {
        enabledFill: 0x8a422f,
        hoverFill: 0xa34f38,
        disabledFill: 0x7e6f64,
        stroke: 0xf2debb,
      }
    );
    this.cityCaptureButton.rectangle.setDepth(50);
    this.cityCaptureButton.label.setDepth(51);
    this.cityRazeButton.rectangle.setDepth(50);
    this.cityRazeButton.label.setDepth(51);
    this.setCompositeVisible(this.cityCaptureButton, false);
    this.setCompositeVisible(this.cityRazeButton, false);

    this.resultPanel = this.add.rectangle(0, 0, 460, 170, 0xf2e6cc, 0.98).setDepth(52).setVisible(false);
    this.resultPanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.resultTitle = this.createLabel("", 0, 0, "36px", "#4a2e12", 53);
    this.resultTitle.setOrigin(0.5).setVisible(false);
    this.resultSubtitle = this.createLabel("", 0, 0, "19px", "#4a2e12", 53);
    this.resultSubtitle.setOrigin(0.5).setVisible(false);
    this.resultRestartButton = this.createButton("Restart Match", "resultRestart", () => gameEvents.emit("restart-match-requested"));
    this.resultRestartButton.rectangle.setDepth(54);
    this.resultRestartButton.label.setDepth(55);
    this.setCompositeVisible(this.resultRestartButton, false);

    this.scale.on("resize", this.layout, this);
    this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC) ?? null;
    this.escapeKey?.on("down", this.handleEscapePressed, this);
    this.input.on("wheel", this.handleWheel, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    gameEvents.on("state-changed", this.updateFromState, this);
    gameEvents.on("ui-toast-requested", this.handleNotificationRequested, this);
    gameEvents.on("ui-notifications-reset-requested", this.handleNotificationsReset, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.escapeKey?.off("down", this.handleEscapePressed, this);
      this.input.off("wheel", this.handleWheel, this);
      this.input.off("pointermove", this.handlePointerMove, this);
      gameEvents.off("state-changed", this.updateFromState, this);
      gameEvents.off("ui-toast-requested", this.handleNotificationRequested, this);
      gameEvents.off("ui-notifications-reset-requested", this.handleNotificationsReset, this);
      gameEvents.emit("ui-modal-state-changed", false);
    });

    const worldScene = this.scene.get("WorldScene");
    if (worldScene && typeof worldScene.getGameStateSnapshot === "function") {
      this.updateFromState(worldScene.getGameStateSnapshot());
    }

    this.layout(this.scale.gameSize);
    this.updateNotificationCenter();
  }

  createLabel(text, x, y, size, color, depth, stroke, strokeThickness = 0) {
    const config = {
      fontFamily: "Trebuchet MS",
      fontSize: size,
      color,
      ...(stroke ? { stroke, strokeThickness } : {}),
    };
    return this.add.text(x, y, text, config).setDepth(depth);
  }

  createButton(label, actionId, onClick, options = {}) {
    const resolvedPalette = {
      enabledFill: options.enabledFill ?? 0x355e94,
      hoverFill: options.hoverFill ?? 0x4a76ae,
      activeFill: options.activeFill ?? options.enabledFill ?? 0x355e94,
      warningFill: options.warningFill ?? 0x8a5b2f,
      disabledFill: options.disabledFill ?? 0x6d747e,
      stroke: options.stroke ?? 0xe9d9b4,
      textColor: options.textColor ?? "#fff8e8",
      enabledAlpha: options.enabledAlpha ?? 0.96,
      hoverAlpha: options.hoverAlpha ?? 1,
      activeAlpha: options.activeAlpha ?? 0.98,
      warningAlpha: options.warningAlpha ?? 0.98,
      disabledAlpha: options.disabledAlpha ?? 0.85,
    };

    const width = options.width ?? BUTTON_WIDTH;
    const height = options.height ?? BUTTON_HEIGHT;

    const rectangle = this.add
      .rectangle(0, 0, width, height, resolvedPalette.enabledFill, resolvedPalette.enabledAlpha)
      .setStrokeStyle(2, resolvedPalette.stroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(14);
    const text = this.createLabel(label, 0, 0, options.fontSize ?? "18px", resolvedPalette.textColor, 15).setOrigin(0.5);

    const button = {
      rectangle,
      label: text,
      actionId,
      enabled: true,
      isActive: false,
      warning: false,
      onClick,
      palette: resolvedPalette,
      width,
      height,
    };

    rectangle.on("pointerover", () => this.handleButtonHover(button, true));
    rectangle.on("pointerout", () => this.handleButtonHover(button, false));
    rectangle.on("pointerdown", () => this.handleButtonClick(button));
    return button;
  }

  handleButtonHover(button, isEntering) {
    if (this.isAnyModalOpen() && !this.isModalButton(button.actionId)) {
      return;
    }
    if (button.enabled) {
      if (isEntering) {
        button.rectangle.setFillStyle(button.palette.hoverFill, button.palette.hoverAlpha);
        const focusHint = this.getFocusHoverHint(button.actionId);
        if (focusHint) {
          this.hoverHint = focusHint;
          this.updateContextualHint();
        }
      } else {
        this.applyButtonVisualState(button);
        this.hoverHint = null;
        this.updateContextualHint();
      }
      this.hideDisabledTooltip();
      return;
    }
    if (!isEntering) {
      this.hoverHint = null;
      this.updateContextualHint();
      this.hideDisabledTooltip();
      return;
    }
    const disabledHint = this.getDisabledActionHint(button.actionId);
    if (disabledHint) {
      this.hoverHint = {
        primary: disabledHint,
        secondary: null,
        level: "warning",
      };
      this.updateContextualHint();
      this.showDisabledTooltip(disabledHint);
    }
  }

  handleButtonClick(button) {
    if (this.isAnyModalOpen() && !this.isModalButton(button.actionId)) {
      return;
    }
    if (button.enabled) {
      button.onClick();
      return;
    }
    const hint = this.getDisabledActionHint(button.actionId);
    if (hint) {
      this.handleNotificationRequested({ message: hint, level: "warning" });
    }
  }

  getDisabledActionHint(actionId) {
    if (!this.latestState) {
      return null;
    }
    const actionHints = this.latestState.uiActions?.disabledActionHints ?? {};
    const specificHint = actionHints[actionId];
    if (specificHint) {
      return specificHint;
    }
    const isGameplayAction =
      actionId === "endTurn" ||
      actionId === "nextUnit" ||
      actionId.startsWith("unit-") ||
      actionId.startsWith("city-") ||
      actionId === "context-expand-toggle" ||
      actionId === "context-pin-toggle";
    if (this.latestState.animationState?.busy && isGameplayAction) {
      return "Wait for the current animation to finish.";
    }
    if (actionId === "endTurn") {
      return this.latestState.pendingCityResolution ? "Resolve city outcome first." : "Wait for AI turns to finish.";
    }
    if (actionId === "nextUnit") {
      const readyCount = this.latestState.uiTurnAssistant?.readyCount ?? 0;
      return readyCount > 0 ? null : "No ready units to cycle.";
    }
    if (actionId === "unit-found-city") {
      return this.latestState.uiActions?.foundCityReason ?? "Cannot found a city right now.";
    }
    if (actionId === "unit-skip") {
      return this.latestState.uiActions?.skipUnitReason ?? "Cannot skip this unit right now.";
    }
    if (actionId.startsWith("city-enqueue-")) {
      return actionHints["city-queue-general"] ?? this.latestState.uiActions?.cityQueueReason ?? "Queue is unavailable right now.";
    }
    if (actionId.startsWith("city-production-tab-")) {
      return this.latestState.uiActions?.canSetCityProductionTab
        ? "Production tab is unavailable right now."
        : "Select one of your cities first.";
    }
    if (actionId.startsWith("city-queue-slot-")) {
      return null;
    }
    if (
      actionId.startsWith("city-queue-move-up-") ||
      actionId.startsWith("city-queue-move-down-") ||
      actionId.startsWith("city-queue-remove-")
    ) {
      return actionHints[actionId] ?? "This queue control is unavailable right now.";
    }
    if (actionId.startsWith("city-focus-")) {
      return "Focus cannot be changed right now.";
    }
    if (actionId === "context-expand-toggle") {
      return "No contextual panel to expand.";
    }
    if (actionId === "context-pin-toggle") {
      return "Select a city or unit to pin this panel.";
    }
    return null;
  }

  getFocusHoverHint(actionId) {
    if (!this.latestState || !actionId.startsWith("city-focus-")) {
      return null;
    }
    const focus = actionId.replace("city-focus-", "");
    const focusChoices = this.latestState.uiActions?.cityFocusChoices ?? [];
    const choice = focusChoices.find((entry) => entry.focus === focus);
    if (!choice) {
      return null;
    }
    return {
      primary: `${choice.label}: ${choice.description}`,
      secondary: `Projected local F/P/S ${choice.projectedYield.food}/${choice.projectedYield.production}/${choice.projectedYield.science}`,
      level: "info",
    };
  }

  layout(gameSize) {
    const isCompact = gameSize.width < COMPACT_BREAKPOINT;
    const edgePadding = isCompact ? 10 : 24;
    const menuType = this.latestState?.uiActions?.contextMenuType ?? null;
    const contextVisible = menuType !== null && this.latestState?.match?.status === "ongoing";
    const contextExpanded = contextVisible ? this.contextPanelExpanded : false;

    this.turnLabel.setPosition(edgePadding, 16);
    this.foodLabel.setPosition(edgePadding, 48);
    this.productionLabel.setPosition(edgePadding, 74);
    this.scienceLabel.setPosition(edgePadding, 100);
    this.devVisionLabel.setPosition(edgePadding, 126);
    this.layoutResourceDeltas();
    const playbackWidth = isCompact ? Math.max(220, Math.floor(gameSize.width * 0.58)) : 520;
    const playbackX = gameSize.width / 2;
    const playbackY = isCompact ? 24 : 26;
    this.playbackPanel.setPosition(playbackX, playbackY);
    this.playbackPanel.setSize(playbackWidth, 30);
    this.playbackPanel.setDisplaySize(playbackWidth, 30);
    this.playbackLabel.setPosition(playbackX, playbackY - 1);
    this.playbackLabel.setWordWrapWidth(Math.max(160, playbackWidth - 20), true);

    this.notificationVisibleRows = isCompact ? 5 : this.notificationRows.length;
    const notificationWidth = isCompact ? Math.max(250, Math.floor(gameSize.width * 0.62)) : 380;
    const notificationHeight = Math.max(70, this.notificationPanel.displayHeight || 70);
    const notificationLeft = gameSize.width - edgePadding - notificationWidth;
    this.notificationPanel.setPosition(notificationLeft + notificationWidth / 2, edgePadding + notificationHeight / 2);
    this.notificationPanel.setSize(notificationWidth, notificationHeight);
    this.notificationPanel.setDisplaySize(notificationWidth, notificationHeight);
    this.notificationTitle.setPosition(notificationLeft + 12, edgePadding + 10);

    if (isCompact) {
      this.layoutButtonRow(this.notificationFilterButtons.slice(0, 3), notificationLeft + notificationWidth / 2, edgePadding + 38, 4);
      this.layoutButtonRow(this.notificationFilterButtons.slice(3), notificationLeft + notificationWidth / 2, edgePadding + 64, 6);
    } else {
      this.layoutButtonRow(this.notificationFilterButtons, notificationLeft + notificationWidth / 2, edgePadding + 40, 6);
    }

    const rowStartY = edgePadding + (isCompact ? 94 : 68);
    for (let i = 0; i < this.notificationRows.length; i += 1) {
      const row = this.notificationRows[i];
      row.setPosition(notificationLeft + 12, rowStartY + i * 20);
      if (i >= this.notificationVisibleRows) {
        row.setVisible(false);
      }
    }

    const contextHeight = contextExpanded
      ? isCompact
        ? CONTEXT_PANEL_EXPANDED_HEIGHT_COMPACT
        : CONTEXT_PANEL_EXPANDED_HEIGHT
      : CONTEXT_PANEL_COLLAPSED_HEIGHT;
    const contextWidth = isCompact
      ? gameSize.width - edgePadding * 2
      : Math.max(420, Math.min(780, gameSize.width - CONTEXT_PANEL_WIDTH_PADDING));
    const contextX = gameSize.width / 2;
    const contextY = gameSize.height - contextHeight / 2 - (isCompact ? 8 : 12);
    const contextTop = contextY - contextHeight / 2;
    const activeCityProductionButtons =
      (this.latestState?.uiActions?.cityProductionTab ?? "units") === "buildings"
        ? this.cityBuildingButtons
        : this.cityProductionButtons;
    this.contextPanel.setPosition(contextX, contextY);
    this.contextPanel.setSize(contextWidth, contextHeight);
    this.contextPanelTitle.setPosition(contextX, contextExpanded ? contextY - (isCompact ? 140 : 112) : contextY - 4);
    this.contextPanelMetaPrimary.setPosition(contextX, contextY - (isCompact ? 114 : 88));
    this.contextPanelMetaSecondary.setPosition(contextX, contextY - (isCompact ? 94 : 68));
    this.contextPanelMetaPrimary.setWordWrapWidth(Math.max(120, contextWidth - 18), true);
    this.contextPanelMetaSecondary.setWordWrapWidth(Math.max(120, contextWidth - 18), true);

    const contextButtonY = contextY - contextHeight / 2 + 16;
    const contextExpandX = contextX + contextWidth / 2 - 82;
    const contextPinX = contextX + contextWidth / 2 - 38;
    this.contextPanelExpandButton.rectangle.setPosition(contextExpandX, contextButtonY);
    this.contextPanelExpandButton.label.setPosition(contextExpandX, contextButtonY);
    this.contextPanelPinButton.rectangle.setPosition(contextPinX, contextButtonY);
    this.contextPanelPinButton.label.setPosition(contextPinX, contextButtonY);

    if (contextExpanded) {
      if (isCompact) {
        this.layoutButtonRow(this.cityFocusButtons, contextX, contextY - 56, 6);
        this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY - 24, 8);
        this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 8, 6);
        this.layoutQueueRows(contextX, contextY + 44, 4);
        this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton], contextX, contextY + 30, 10);
      } else {
        this.layoutButtonRow(this.cityFocusButtons, contextX, contextY - 40, 6);
        this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY - 8, 8);
        this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 24, 6);
        this.layoutQueueRows(contextX, contextY + 60, 6);
        this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton], contextX, contextY + 24, 16);
      }
    } else {
      this.layoutButtonRow(this.cityFocusButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY + 36, 8);
      this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow(this.cityQueueButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow(this.cityQueueMoveUpButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow(this.cityQueueMoveDownButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow(this.cityQueueRemoveButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton], contextX, contextY + 36, 16);
    }

    const selectedPanelWidth = isCompact ? Math.max(150, Math.min(230, Math.floor(gameSize.width * 0.5))) : 460;
    const selectedPanelHeight = isCompact ? 88 : 92;
    const selectedPanelY =
      isCompact && contextVisible ? contextTop - selectedPanelHeight - 8 : gameSize.height - selectedPanelHeight - 14;
    this.selectedPanel.setPosition(edgePadding, selectedPanelY);
    this.selectedPanel.setSize(selectedPanelWidth, selectedPanelHeight);
    this.selectedTitle.setPosition(edgePadding + 14, selectedPanelY + 12);
    this.selectedDetails.setPosition(edgePadding + 14, selectedPanelY + 38);
    this.selectedDetails.setWordWrapWidth(Math.max(120, selectedPanelWidth - 24), true);

    const endTurnWidth = isCompact ? 146 : BUTTON_WIDTH;
    this.endTurnButton.width = endTurnWidth;
    this.endTurnButton.rectangle.setSize(endTurnWidth, BUTTON_HEIGHT);
    const endTurnX = gameSize.width - edgePadding - endTurnWidth / 2;
    const endTurnY = gameSize.height - 34;
    this.endTurnButton.rectangle.setPosition(endTurnX, endTurnY);
    this.endTurnButton.label.setPosition(endTurnX, endTurnY);

    const statusWidth = endTurnWidth;
    const statusHeight = isCompact ? 34 : 36;
    const statusY = endTurnY - BUTTON_HEIGHT / 2 - statusHeight / 2 - (isCompact ? 8 : 10);

    this.turnAssistantPanel.setPosition(endTurnX, statusY);
    this.turnAssistantPanel.setSize(statusWidth, statusHeight);
    this.turnAssistantPanel.setDisplaySize(statusWidth, statusHeight);
    this.turnAssistantLabel.setPosition(endTurnX, statusY);

    const hintWidth = isCompact ? gameSize.width - edgePadding * 2 : 440;
    const hintHeight = isCompact ? 82 : 74;
    const hintY = isCompact ? Math.max(178, notificationHeight + edgePadding + hintHeight / 2 + 16) : 56;
    this.hintPanel.setPosition(gameSize.width / 2, hintY);
    this.hintPanel.setSize(hintWidth, hintHeight);
    this.hintPrimary.setPosition(gameSize.width / 2, hintY - 12);
    this.hintSecondary.setPosition(gameSize.width / 2, hintY + 10);
    this.hintPrimary.setWordWrapWidth(Math.max(140, hintWidth - 20), true);
    this.hintSecondary.setWordWrapWidth(Math.max(120, hintWidth - 20), true);

    const previewWidth = isCompact ? Math.max(190, gameSize.width - edgePadding * 2) : 360;
    const previewHeight = 66;
    const previewY = hintY + (isCompact ? 82 : 74);
    this.previewPanel.setPosition(gameSize.width / 2, previewY);
    this.previewPanel.setSize(previewWidth, previewHeight);
    this.previewTitle.setPosition(gameSize.width / 2, previewY - 12);
    this.previewDetails.setPosition(gameSize.width / 2, previewY + 10);
    this.previewTitle.setWordWrapWidth(Math.max(120, previewWidth - 16), true);
    this.previewDetails.setWordWrapWidth(Math.max(120, previewWidth - 16), true);

    this.modalBackdrop.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.modalBackdrop.setSize(gameSize.width + 4, gameSize.height + 4);

    this.pausePanel.setPosition(gameSize.width / 2, gameSize.height / 2 - 26);
    this.pauseTitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 66);
    this.pauseResumeButton.rectangle.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 10);
    this.pauseResumeButton.label.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 10);
    this.pauseRestartButton.rectangle.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 10);
    this.pauseRestartButton.label.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 10);

    this.restartConfirmPanel.setPosition(gameSize.width / 2, gameSize.height / 2 - 30);
    this.restartConfirmTitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 62);
    this.restartConfirmSubtitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 28);
    this.restartCancelButton.rectangle.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 12);
    this.restartCancelButton.label.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 12);
    this.restartConfirmButton.rectangle.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 12);
    this.restartConfirmButton.label.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 12);

    this.cityOutcomePanel.setPosition(gameSize.width / 2, gameSize.height / 2 - 30);
    this.cityOutcomeTitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 64);
    this.cityOutcomeSubtitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 30);
    this.cityCaptureButton.rectangle.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 14);
    this.cityCaptureButton.label.setPosition(gameSize.width / 2 - 90, gameSize.height / 2 + 14);
    this.cityRazeButton.rectangle.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 14);
    this.cityRazeButton.label.setPosition(gameSize.width / 2 + 90, gameSize.height / 2 + 14);

    this.resultPanel.setPosition(gameSize.width / 2, gameSize.height / 2 + 18);
    this.resultTitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 18);
    this.resultSubtitle.setPosition(gameSize.width / 2, gameSize.height / 2 + 22);
    this.resultRestartButton.rectangle.setPosition(gameSize.width / 2, gameSize.height / 2 + 74);
    this.resultRestartButton.label.setPosition(gameSize.width / 2, gameSize.height / 2 + 74);
  }

  layoutButtonRow(buttons, centerX, y, gap) {
    const totalWidth = buttons.reduce((sum, button) => sum + button.width, 0) + Math.max(0, buttons.length - 1) * gap;
    let cursor = centerX - totalWidth / 2;
    for (const button of buttons) {
      const x = cursor + button.width / 2;
      button.rectangle.setPosition(x, y);
      button.label.setPosition(x, y);
      cursor += button.width + gap;
    }
  }

  layoutQueueRows(centerX, startY, gap) {
    const rowGap = CITY_PANEL_BUTTON_HEIGHT + 4;
    for (let i = 0; i < this.cityQueueButtons.length; i += 1) {
      const y = startY + i * rowGap;
      const rowButtons = [
        this.cityQueueButtons[i],
        this.cityQueueMoveUpButtons[i],
        this.cityQueueMoveDownButtons[i],
        this.cityQueueRemoveButtons[i],
      ];
      this.layoutButtonRow(rowButtons, centerX, y, gap);
    }
  }

  updateFromState(gameState) {
    this.latestState = gameState;
    this.hideDisabledTooltip();
    const selectedUnit = gameState.units.find((unit) => unit.id === gameState.selectedUnitId) ?? null;
    const selectedCity = gameState.cities.find((city) => city.id === gameState.selectedCityId) ?? null;
    const hasSelection = !!selectedUnit || !!selectedCity;
    const selectionKey = selectedUnit ? `unit:${selectedUnit.id}` : selectedCity ? `city:${selectedCity.id}` : "none";
    const phaseText = gameState.turnState.phase === "enemy" ? "AI" : "Player";
    const hasPendingCityResolution = !!gameState.pendingCityResolution;
    const animationBusy = !!gameState.animationState?.busy;
    const turnPlayback = gameState.turnPlayback ?? { active: false, stepIndex: 0, totalSteps: 0, message: null };
    const canIssueOrders =
      gameState.turnState.phase === "player" &&
      gameState.match.status === "ongoing" &&
      !hasPendingCityResolution &&
      !animationBusy &&
      !turnPlayback.active;
    const turnAssistant = gameState.uiTurnAssistant ?? { readyCount: 0, nextReadyUnitId: null, emptyQueueCityCount: 0 };
    const pendingQueues = turnAssistant.emptyQueueCityCount ?? 0;
    const pendingOrders = turnAssistant.readyCount + pendingQueues;
    const projected = gameState.projectedNetIncome ?? gameState.projectedIncome ?? { food: 0, production: 0, science: 1 };
    const economy = gameState.economy?.player ?? { foodStock: 0, productionStock: 0, scienceStock: 0 };

    if (!this.contextPanelPinned && selectionKey !== this.lastContextSelectionKey && selectionKey !== "none") {
      this.contextPanelExpanded = true;
    }
    this.lastContextSelectionKey = selectionKey;

    this.turnLabel.setText(`Turn ${gameState.turnState.turn} - ${phaseText}`);
    this.foodLabel.setText(`Food: ${economy.foodStock}`);
    this.foodDeltaLabel.setText(`(${formatSigned(projected.food)})`);
    this.foodDeltaLabel.setColor(getDeltaColor(projected.food));
    this.productionLabel.setText(`Production: ${economy.productionStock}`);
    this.productionDeltaLabel.setText(`(${formatSigned(projected.production)})`);
    this.productionDeltaLabel.setColor(getDeltaColor(projected.production));
    this.scienceLabel.setText(`Science: ${economy.scienceStock}`);
    this.scienceDeltaLabel.setText(`(${formatSigned(projected.science)})`);
    this.scienceDeltaLabel.setColor(getDeltaColor(projected.science));
    this.devVisionLabel.setText(`Dev Vision: ${gameState.devVisionEnabled ? "ON (V)" : "OFF (V)"}`);
    this.devVisionLabel.setColor(gameState.devVisionEnabled ? "#2f7a41" : "#5a4224");
    this.layoutResourceDeltas();

    this.playbackPanel.setVisible(!!turnPlayback.active);
    this.playbackLabel.setVisible(!!turnPlayback.active);
    if (turnPlayback.active) {
      const message = turnPlayback.message ?? `AI action ${turnPlayback.stepIndex}/${Math.max(1, turnPlayback.totalSteps)}`;
      this.playbackLabel.setText(message);
    } else {
      this.playbackLabel.setText("");
    }

    this.selectedPanel.setVisible(hasSelection);
    this.selectedTitle.setVisible(hasSelection);
    this.selectedDetails.setVisible(hasSelection);
    if (hasSelection) {
      this.selectedDetails.setText(this.getSelectedInfoText(selectedUnit, selectedCity));
    }

    this.endTurnButton.label.setText(
      canIssueOrders
        ? "End Turn"
        : hasPendingCityResolution
          ? "Resolve..."
          : turnPlayback.active
            ? "AI..."
            : animationBusy
              ? "Animating..."
              : "AI..."
    );
    this.setButtonEnabled(this.endTurnButton, canIssueOrders);
    this.setButtonWarning(this.endTurnButton, canIssueOrders && pendingOrders > 0);

    this.turnAssistantPanel.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantLabel.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantLabel.setText(`Attention needed (${pendingOrders})`);
    this.setCompositeVisible(this.nextUnitButton, false);
    this.setButtonEnabled(this.nextUnitButton, false);
    if (gameState.match.status === "ongoing" && canIssueOrders && pendingOrders > 0) {
      this.turnAssistantPanel.setInteractive({ useHandCursor: true });
      this.turnAssistantPanel.setFillStyle(0xf0e4cb, 0.97);
      this.turnAssistantPanel.setStrokeStyle(2, 0x7d5a2f, 0.9);
      this.turnAssistantLabel.setColor("#3f2d18");
    } else {
      this.turnAssistantPanel.disableInteractive();
      this.turnAssistantPanel.setFillStyle(0xe6dcc9, 0.95);
      this.turnAssistantPanel.setStrokeStyle(2, 0x8b7a5e, 0.85);
      this.turnAssistantLabel.setColor("#6a5b43");
    }

    this.syncContextMenu(gameState, selectedUnit, selectedCity, canIssueOrders);
    this.syncCityResolutionModal(gameState.pendingCityResolution);
    this.updatePreviewCard(gameState.uiPreview ?? { mode: "none" });
    this.updateContextualHint();
    this.layout(this.scale.gameSize);
    this.updateNotificationCenter();

    const hasResult = gameState.match.status !== "ongoing";
    this.resultPanel.setVisible(hasResult);
    this.resultTitle.setVisible(hasResult);
    this.resultSubtitle.setVisible(hasResult);
    this.setCompositeVisible(this.resultRestartButton, hasResult);
    if (hasResult) {
      this.resultTitle.setText(gameState.match.status === "won" ? "Victory" : "Defeat");
      this.resultSubtitle.setText(
        gameState.match.reason === "elimination" ? "Hostile factions eliminated." : "Your civilization has fallen."
      );
      this.setButtonEnabled(this.resultRestartButton, true);
    }
  }

  syncContextMenu(gameState, selectedUnit, selectedCity, canIssueOrders) {
    const menuType = gameState.uiActions?.contextMenuType ?? null;
    this.contextMenuMode = menuType;
    const visible = menuType !== null && gameState.match.status === "ongoing";
    const expanded = visible ? this.contextPanelExpanded : false;
    this.contextPanel.setVisible(visible);
    this.contextPanelTitle.setVisible(visible);
    this.setCompositeVisible(this.contextPanelExpandButton, visible);
    this.setCompositeVisible(this.contextPanelPinButton, visible);
    this.contextPanelMetaPrimary.setVisible(visible && expanded);
    this.contextPanelMetaSecondary.setVisible(visible && expanded);
    this.setButtonEnabled(this.contextPanelExpandButton, visible);
    this.setButtonEnabled(this.contextPanelPinButton, visible);
    this.setButtonActive(this.contextPanelPinButton, this.contextPanelPinned);
    this.setButtonLabel(this.contextPanelExpandButton, expanded ? "v" : "^");
    this.setButtonLabel(this.contextPanelPinButton, this.contextPanelPinned ? "Unpin" : "Pin");

    if (!visible) {
      this.setCityControlsVisible(false);
      this.setUnitControlsVisible(false);
      this.contextPanelMetaPrimary.setText("");
      this.contextPanelMetaSecondary.setText("");
      return;
    }

    if (menuType === "city" && selectedCity) {
      this.contextPanelTitle.setText(
        `City Commands  Pop ${selectedCity.population}  Queue ${selectedCity.queue.length}/${gameState.uiActions.cityQueueMax}`
      );
      this.setCityControlsVisible(expanded);
      this.setUnitControlsVisible(false);

      if (expanded) {
        const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, science: 0 };
        const productionStock = gameState.uiActions?.cityProductionStock ?? 0;
        const localProduction = gameState.uiActions?.cityLocalProduction ?? 0;
        this.contextPanelMetaPrimary.setText(
          `Focus ${selectedCity.focus} | Local F/P/S ${localYield.food}/${localYield.production}/${localYield.science} | Identity ${selectedCity.identity}`
        );
        this.contextPanelMetaSecondary.setText(
          `Production stock ${productionStock} | Local +${localProduction}/t | Focus changes worked tiles only.`
        );
      }

      const focusChoiceById = new Map((gameState.uiActions?.cityFocusChoices ?? []).map((choice) => [choice.focus, choice]));
      for (let i = 0; i < this.cityFocusButtons.length; i += 1) {
        const focus = FOCUS_MODES[i];
        const button = this.cityFocusButtons[i];
        const choice = focusChoiceById.get(focus);
        this.setButtonLabel(button, choice?.label ?? FOCUS_LABELS[focus]);
        this.setButtonActive(button, selectedCity.focus === focus);
        this.setButtonEnabled(button, canIssueOrders && !!gameState.uiActions?.canSetCityFocus);
      }

      const productionTab = gameState.uiActions?.cityProductionTab ?? "units";
      for (let i = 0; i < this.cityProductionTabButtons.length; i += 1) {
        const tab = PRODUCTION_TABS[i];
        const button = this.cityProductionTabButtons[i];
        this.setButtonActive(button, tab === productionTab);
        this.setButtonEnabled(button, canIssueOrders && !!gameState.uiActions?.canSetCityProductionTab);
      }

      const choiceByType = new Map((gameState.uiActions?.cityProductionChoices ?? []).map((choice) => [choice.type, choice]));
      for (let i = 0; i < this.cityProductionButtons.length; i += 1) {
        const unitType = UNIT_PRODUCTION_TYPES[i];
        const choice = choiceByType.get(unitType);
        const button = this.cityProductionButtons[i];
        this.setButtonLabel(button, formatProductionChoiceLabel(formatUnitLabel(unitType), choice));
        this.setCompositeVisible(button, expanded && productionTab === "units");
        this.setButtonEnabled(button, expanded && productionTab === "units" && canIssueOrders && !!choice?.queueable);
        this.setButtonWarning(button, !button.enabled && !!choice?.stateTag);
        this.applyProductionChoiceVisualState(button, choice);
      }

      const buildingChoiceById = new Map((gameState.uiActions?.cityBuildingChoices ?? []).map((choice) => [choice.id, choice]));
      for (let i = 0; i < this.cityBuildingButtons.length; i += 1) {
        const buildingId = BUILDING_PRODUCTION_TYPES[i];
        const choice = buildingChoiceById.get(buildingId);
        const button = this.cityBuildingButtons[i];
        this.setButtonLabel(button, formatProductionChoiceLabel(formatBuildingLabel(buildingId), choice));
        this.setCompositeVisible(button, expanded && productionTab === "buildings");
        this.setButtonEnabled(button, expanded && productionTab === "buildings" && canIssueOrders && !!choice?.queueable);
        this.setButtonWarning(button, !button.enabled && !!choice?.stateTag);
        this.applyProductionChoiceVisualState(button, choice);
      }

      const queueSlots = gameState.uiActions?.cityQueueSlots ?? [];
      for (let i = 0; i < this.cityQueueButtons.length; i += 1) {
        const slot = queueSlots[i] ?? null;
        const slotButton = this.cityQueueButtons[i];
        const moveUpButton = this.cityQueueMoveUpButtons[i];
        const moveDownButton = this.cityQueueMoveDownButtons[i];
        const removeButton = this.cityQueueRemoveButtons[i];
        const slotStatus = slot?.statusTag ? ` ${slot.statusTag}` : "";
        this.setButtonLabel(slotButton, `${slot?.label ?? `${i + 1}. Empty`}${slotStatus}`);
        this.setCompositeVisible(slotButton, expanded);
        this.setButtonEnabled(slotButton, false);
        this.setButtonWarning(slotButton, false);
        slotButton.label.setColor(slot?.empty ? "#d7c9ae" : "#f5e8ca");
        slotButton.label.setAlpha(slot?.empty ? 0.92 : 1);

        this.setCompositeVisible(moveUpButton, expanded);
        this.setCompositeVisible(moveDownButton, expanded);
        this.setCompositeVisible(removeButton, expanded);
        this.setButtonEnabled(moveUpButton, expanded && canIssueOrders && !!slot?.canMoveUp);
        this.setButtonEnabled(moveDownButton, expanded && canIssueOrders && !!slot?.canMoveDown);
        this.setButtonEnabled(removeButton, expanded && canIssueOrders && !!slot?.canRemove);
      }
      return;
    }

    if (menuType === "unit" && selectedUnit) {
      this.contextPanelTitle.setText(`Unit Commands  ${formatUnitLabel(selectedUnit.type)}`);
      this.setCityControlsVisible(false);
      this.setUnitControlsVisible(expanded);
      if (expanded) {
        const previewSummary = summarizePreview(gameState.uiPreview);
        this.contextPanelMetaPrimary.setText(
          `Move ${selectedUnit.movementRemaining}/${selectedUnit.maxMovement} | Atk ${selectedUnit.attack} | Range ${selectedUnit.minAttackRange}-${selectedUnit.attackRange} | Armor ${selectedUnit.armor}`
        );
        this.contextPanelMetaSecondary.setText(previewSummary || "Hover reachable or attackable hexes for action previews.");
      }
      this.setButtonEnabled(this.unitFoundCityButton, expanded && canIssueOrders && !!gameState.uiActions?.canFoundCity);
      this.setButtonEnabled(this.unitSkipButton, expanded && canIssueOrders && !!gameState.uiActions?.canSkipUnit);
      return;
    }

    this.setCityControlsVisible(false);
    this.setUnitControlsVisible(false);
  }

  setCityControlsVisible(visible) {
    for (const button of this.cityFocusButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityProductionTabButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityProductionButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityBuildingButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueMoveUpButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueMoveDownButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueRemoveButtons) {
      this.setCompositeVisible(button, visible);
    }
  }

  setUnitControlsVisible(visible) {
    this.setCompositeVisible(this.unitFoundCityButton, visible);
    this.setCompositeVisible(this.unitSkipButton, visible);
  }

  getSelectedInfoText(selectedUnit, selectedCity) {
    if (selectedUnit) {
      return `Unit ${formatUnitLabel(selectedUnit.type)} | HP ${selectedUnit.health}/${selectedUnit.maxHealth} | Move ${selectedUnit.movementRemaining}/${selectedUnit.maxMovement} | Attack ${selectedUnit.attack} | ${selectedUnit.hasActed ? "Acted" : "Ready"}`;
    }
    if (selectedCity) {
      const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, science: 0 };
      return `City Pop ${selectedCity.population} | HP ${selectedCity.health}/${selectedCity.maxHealth} | Focus ${selectedCity.focus} | Identity ${selectedCity.identity} | Specialization ${selectedCity.specialization ?? "balanced"} | Yield ${localYield.food}/${localYield.production}/${localYield.science}`;
    }
    return "No unit or city selected.";
  }

  getQueueItemLabel(queueItem) {
    if (!queueItem) {
      return "--";
    }
    if (typeof queueItem === "string") {
      return formatUnitLabel(queueItem);
    }
    if (queueItem.kind === "building") {
      return formatBuildingLabel(queueItem.id);
    }
    return formatUnitLabel(queueItem.id);
  }

  buildCityQueueSummary(_selectedCity, gameState) {
    const queueSlots = gameState.uiActions?.cityQueueSlots ?? [];
    const populatedSlots = queueSlots.filter((slot) => !slot.empty);
    if (populatedSlots.length === 0) {
      return "Queue empty. Add units/buildings from the buttons below.";
    }
    return populatedSlots
      .map((slot) => `${slot.label}${slot.statusTag ? ` [${slot.statusTag}]` : ""}`)
      .join("  |  ");
  }

  updatePreviewCard(uiPreview) {
    const mode = uiPreview?.mode ?? "none";
    const isVisible = mode !== "none" && this.latestState?.match?.status === "ongoing";
    this.previewPanel.setVisible(isVisible);
    this.previewTitle.setVisible(isVisible);
    this.previewDetails.setVisible(isVisible);
    if (!isVisible) {
      return;
    }

    if (mode === "move") {
      this.previewTitle.setText(`Move Preview -> (${uiPreview.q}, ${uiPreview.r})`);
      this.previewDetails.setText(
        `Cost ${uiPreview.moveCost ?? 0} | Remaining movement ${uiPreview.movementRemainingAfter ?? 0}`
      );
      this.previewDetails.setColor("#2f5f74");
      return;
    }

    if (mode === "attack-unit") {
      const counter = uiPreview.counterattack;
      const counterText = counter?.triggered
        ? `Counter ${counter.damage ?? 0}`
        : counter?.reason === "out-of-range"
          ? "No counter (out of range)"
          : "No counter";
      this.previewTitle.setText(`Attack Preview -> ${uiPreview.targetId ?? "target"}`);
      this.previewDetails.setText(`Damage ${uiPreview.damage ?? 0} | ${counterText}`);
      this.previewDetails.setColor("#7b3024");
      return;
    }

    if (mode === "attack-city") {
      this.previewTitle.setText(`City Assault Preview -> ${uiPreview.cityId ?? "city"}`);
      this.previewDetails.setText(`Damage ${uiPreview.damage ?? 0} | City HP after hit ${uiPreview.cityRemainingHealth ?? "?"}`);
      this.previewDetails.setColor("#7b3024");
      return;
    }

    this.previewTitle.setText("");
    this.previewDetails.setText("");
  }

  updateContextualHint() {
    if (!this.latestState) {
      this.setHint(null, null, null);
      return;
    }
    if (this.hoverHint) {
      this.setHint(this.hoverHint.primary ?? null, this.hoverHint.secondary ?? null, this.hoverHint.level ?? "warning");
      return;
    }
    const uiHints = this.latestState.uiHints ?? { primary: null, secondary: null, level: null };
    if (uiHints.level === "warning") {
      this.setHint(uiHints.primary, uiHints.secondary, uiHints.level);
      return;
    }
    this.setHint(null, null, null);
  }

  setHint(primary, secondary, level) {
    const hasPrimary = !!primary;
    this.hintPanel.setVisible(hasPrimary);
    this.hintPrimary.setVisible(hasPrimary);
    this.hintSecondary.setVisible(hasPrimary && !!secondary);
    if (!hasPrimary) {
      return;
    }
    this.hintPrimary.setText(primary);
    this.hintSecondary.setText(secondary ?? "");
    if (level === "warning") {
      this.hintPanel.setFillStyle(0xf5dfd8, 0.95);
      this.hintPanel.setStrokeStyle(2, 0x9a3a2b, 0.9);
      this.hintPrimary.setColor("#6f241a");
      this.hintSecondary.setColor("#7b3024");
    } else {
      this.hintPanel.setFillStyle(0xf0e4cb, 0.95);
      this.hintPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
      this.hintPrimary.setColor("#3f2d18");
      this.hintSecondary.setColor("#5a4224");
    }
  }

  toggleContextPanelExpanded() {
    if (this.contextMenuMode === null || this.latestState?.match?.status !== "ongoing") {
      return false;
    }
    this.contextPanelExpanded = !this.contextPanelExpanded;
    this.updateFromState(this.latestState);
    return this.contextPanelExpanded;
  }

  toggleContextPanelPinned() {
    if (this.contextMenuMode === null || this.latestState?.match?.status !== "ongoing") {
      return false;
    }
    this.contextPanelPinned = !this.contextPanelPinned;
    this.updateFromState(this.latestState);
    return this.contextPanelPinned;
  }

  testSetContextPanelPinned(value) {
    this.contextPanelPinned = !!value;
    if (!this.contextPanelPinned && this.contextMenuMode !== null) {
      this.contextPanelExpanded = true;
    }
    if (this.latestState) {
      this.updateFromState(this.latestState);
    }
    return this.contextPanelPinned;
  }

  setNotificationFilter(filterName) {
    if (!NOTIFICATION_FILTERS.includes(filterName)) {
      return false;
    }
    this.notificationFilter = filterName;
    this.notificationScroll = 0;
    this.updateNotificationCenter();
    if (this.latestState) {
      this.updateFromState(this.latestState);
    }
    return true;
  }

  getFilteredNotifications() {
    if (this.notificationFilter === "All") {
      return this.notifications;
    }
    return this.notifications.filter((entry) => entry.category === this.notificationFilter);
  }

  focusNotificationByRow(rowIndex) {
    const entry = this.notificationVisibleSlice[rowIndex];
    if (!entry) {
      return false;
    }
    if (!entry.focus) {
      return false;
    }
    gameEvents.emit("notification-focus-requested", { focus: entry.focus, id: entry.id });
    return true;
  }

  handleNotificationRequested(payload) {
    const message = typeof payload === "string" ? payload : payload?.message;
    if (!message) {
      return;
    }
    const level = typeof payload === "object" ? payload.level ?? "info" : "info";
    const categoryInput = typeof payload === "object" ? payload.category : null;
    const category = normalizeNotificationCategory(categoryInput, message);
    this.notifications.unshift({
      id: `n-${this.notificationNextId}`,
      level,
      message,
      category,
      focus: typeof payload === "object" ? normalizeNotificationFocus(payload.focus) : null,
      createdAtMs: Date.now(),
    });
    this.notificationNextId += 1;
    this.updateNotificationCenter();
  }

  handleNotificationsReset = () => {
    this.notifications = [];
    this.notificationScroll = 0;
    this.notificationFilter = "All";
    this.updateNotificationCenter();
  };

  updateNotificationCenter() {
    const filtered = this.getFilteredNotifications();
    const visibleCount = this.notificationVisibleRows || this.notificationRows.length;
    const maxScroll = Math.max(0, filtered.length - visibleCount);
    this.notificationScroll = Phaser.Math.Clamp(this.notificationScroll, 0, maxScroll);
    const slice = filtered.slice(this.notificationScroll, this.notificationScroll + visibleCount);
    this.notificationVisibleSlice = slice;
    const shownRows = slice.length;
    const filterHeight = this.scale.width < COMPACT_BREAKPOINT ? 60 : 34;
    const contentHeight = shownRows > 0 ? shownRows * 20 + 14 : 0;
    const panelHeight = 34 + filterHeight + contentHeight;
    const bounds = this.notificationPanel.getBounds();
    this.notificationPanel.setSize(this.notificationPanel.displayWidth, panelHeight);
    this.notificationPanel.setDisplaySize(this.notificationPanel.displayWidth, panelHeight);
    this.notificationPanel.setPosition(bounds.centerX, bounds.top + panelHeight / 2);
    this.notificationTitle.setPosition(bounds.left + 12, bounds.top + 10);

    for (const filterButton of this.notificationFilterButtons) {
      const filterName = filterButton.actionId.replace("notif-filter-", "");
      this.setButtonActive(filterButton, this.notificationFilter === filterName);
      this.setButtonEnabled(filterButton, true);
      filterButton.label.setAlpha(1);
    }

    for (let i = 0; i < this.notificationRows.length; i += 1) {
      const row = this.notificationRows[i];
      if (i >= visibleCount) {
        row.setVisible(false);
        row.disableInteractive();
        continue;
      }
      const entry = slice[i];
      if (!entry) {
        row.setVisible(false);
        row.disableInteractive();
        continue;
      }
      row.setPosition(bounds.left + 12, bounds.top + 34 + filterHeight + i * 20);
      row.setVisible(true);
      const line = `[${entry.category}] ${entry.level === "warning" ? "[Warning]" : "[Info]"} ${entry.message}`;
      row.setText(truncateText(line, Math.max(36, Math.floor((this.notificationPanel.displayWidth - 24) / 7))));
      row.setColor(entry.level === "warning" ? "#7b3024" : "#3f2d18");
      if (entry.focus) {
        row.setInteractive({ useHandCursor: true });
      } else {
        row.disableInteractive();
      }
    }
  }

  handlePointerMove(pointer) {
    if (!this.disabledTooltipVisible || !this.disabledHoverText) {
      return;
    }
    this.updateDisabledTooltipPosition(pointer);
  }

  showDisabledTooltip(message) {
    if (!message) {
      this.hideDisabledTooltip();
      return;
    }
    this.disabledHoverText = message;
    const pointer = this.input.activePointer;
    this.disabledTooltipLabel.setText(message);
    const width = Math.min(320, Math.max(110, this.disabledTooltipLabel.width + 14));
    const height = Math.max(24, this.disabledTooltipLabel.height + 10);
    this.disabledTooltipPanel.setSize(width, height);
    this.disabledTooltipPanel.setDisplaySize(width, height);
    this.disabledTooltipPanel.setVisible(true);
    this.disabledTooltipLabel.setVisible(true);
    this.disabledTooltipVisible = true;
    this.updateDisabledTooltipPosition(pointer);
  }

  hideDisabledTooltip() {
    this.disabledHoverText = null;
    this.disabledTooltipVisible = false;
    this.disabledTooltipPanel.setVisible(false);
    this.disabledTooltipLabel.setVisible(false);
  }

  updateDisabledTooltipPosition(pointer) {
    if (!pointer || !this.disabledTooltipVisible) {
      return;
    }
    const width = this.disabledTooltipPanel.displayWidth || this.disabledTooltipPanel.width;
    const height = this.disabledTooltipPanel.displayHeight || this.disabledTooltipPanel.height;
    const margin = 12;
    const desiredX = pointer.x + margin + width / 2;
    const desiredY = pointer.y - margin - height / 2;
    const x = Phaser.Math.Clamp(desiredX, width / 2 + 4, this.scale.width - width / 2 - 4);
    const y = Phaser.Math.Clamp(desiredY, height / 2 + 4, this.scale.height - height / 2 - 4);
    this.disabledTooltipPanel.setPosition(x, y);
    this.disabledTooltipLabel.setPosition(x - width / 2 + 7, y - height / 2 + 5);
  }

  handleWheel(pointer, _gameObjects, _deltaX, deltaY) {
    if (!this.isPointerInNotificationCenter(pointer)) {
      return;
    }
    const visibleCount = this.notificationVisibleRows || this.notificationRows.length;
    const filtered = this.getFilteredNotifications();
    if (filtered.length <= visibleCount) {
      return;
    }
    const next = this.notificationScroll + (deltaY > 0 ? 1 : -1);
    this.notificationScroll = Phaser.Math.Clamp(next, 0, Math.max(0, filtered.length - visibleCount));
    this.updateNotificationCenter();
  }

  isPointerInNotificationCenter(pointer) {
    const bounds = this.notificationPanel.getBounds();
    return Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
  }

  openPauseMenu() {
    if (this.cityResolutionOpen || this.pauseMenuOpen) {
      return this.pauseMenuOpen;
    }
    this.pauseMenuOpen = true;
    this.pausePanel.setVisible(true);
    this.pauseTitle.setVisible(true);
    this.setCompositeVisible(this.pauseResumeButton, true);
    this.setCompositeVisible(this.pauseRestartButton, true);
    this.setButtonEnabled(this.pauseResumeButton, true);
    this.setButtonEnabled(this.pauseRestartButton, true);
    this.hoverHint = null;
    this.hideDisabledTooltip();
    this.updateContextualHint();
    this.syncModalState();
    return true;
  }

  closePauseMenu() {
    if (!this.pauseMenuOpen) {
      return false;
    }
    this.pauseMenuOpen = false;
    this.pausePanel.setVisible(false);
    this.pauseTitle.setVisible(false);
    this.setCompositeVisible(this.pauseResumeButton, false);
    this.setCompositeVisible(this.pauseRestartButton, false);
    this.closeRestartConfirm();
    this.syncModalState();
    return true;
  }

  openRestartConfirm() {
    if (!this.pauseMenuOpen || this.restartConfirmOpen || this.cityResolutionOpen) {
      return false;
    }
    this.restartConfirmOpen = true;
    this.restartConfirmPanel.setVisible(true);
    this.restartConfirmTitle.setVisible(true);
    this.restartConfirmSubtitle.setVisible(true);
    this.setCompositeVisible(this.restartConfirmButton, true);
    this.setCompositeVisible(this.restartCancelButton, true);
    this.setButtonEnabled(this.restartConfirmButton, true);
    this.setButtonEnabled(this.restartCancelButton, true);
    this.syncModalState();
    return true;
  }

  closeRestartConfirm() {
    if (!this.restartConfirmOpen) {
      return false;
    }
    this.restartConfirmOpen = false;
    this.restartConfirmPanel.setVisible(false);
    this.restartConfirmTitle.setVisible(false);
    this.restartConfirmSubtitle.setVisible(false);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);
    this.syncModalState();
    return true;
  }

  confirmRestart() {
    this.closeRestartConfirm();
    this.closePauseMenu();
    gameEvents.emit("restart-match-requested");
  }

  syncCityResolutionModal(pendingResolution) {
    if (pendingResolution) {
      this.cityResolutionOpen = true;
      this.cityOutcomePanel.setVisible(true);
      this.cityOutcomeTitle.setVisible(true);
      this.cityOutcomeSubtitle.setVisible(true);
      this.setCompositeVisible(this.cityCaptureButton, true);
      this.setCompositeVisible(this.cityRazeButton, true);
      this.setButtonEnabled(this.cityCaptureButton, true);
      this.setButtonEnabled(this.cityRazeButton, true);
    } else if (this.cityResolutionOpen) {
      this.cityResolutionOpen = false;
      this.cityOutcomePanel.setVisible(false);
      this.cityOutcomeTitle.setVisible(false);
      this.cityOutcomeSubtitle.setVisible(false);
      this.setCompositeVisible(this.cityCaptureButton, false);
      this.setCompositeVisible(this.cityRazeButton, false);
    }
    this.syncModalState();
  }

  syncModalState() {
    const nextOpen = this.pauseMenuOpen || this.restartConfirmOpen || this.cityResolutionOpen;
    this.modalBackdrop.setVisible(nextOpen);
    if (nextOpen) {
      this.hideDisabledTooltip();
    }
    if (nextOpen !== this.modalStateOpen) {
      this.modalStateOpen = nextOpen;
      gameEvents.emit("ui-modal-state-changed", nextOpen);
    }
  }

  setButtonEnabled(button, enabled) {
    button.enabled = enabled;
    this.applyButtonVisualState(button);
    button.label.setAlpha(enabled ? 1 : 0.95);
  }

  setButtonActive(button, isActive) {
    button.isActive = isActive;
    this.applyButtonVisualState(button);
  }

  setButtonWarning(button, warning) {
    button.warning = warning;
    this.applyButtonVisualState(button);
  }

  applyButtonVisualState(button) {
    if (!button.enabled) {
      button.rectangle.setFillStyle(button.palette.disabledFill, button.palette.disabledAlpha);
      return;
    }
    if (button.warning) {
      button.rectangle.setFillStyle(button.palette.warningFill, button.palette.warningAlpha);
      return;
    }
    if (button.isActive) {
      button.rectangle.setFillStyle(button.palette.activeFill, button.palette.activeAlpha);
      return;
    }
    button.rectangle.setFillStyle(button.palette.enabledFill, button.palette.enabledAlpha);
  }

  setButtonLabel(button, text) {
    button.label.setText(text);
  }

  applyProductionChoiceVisualState(button, choice) {
    if (!choice) {
      button.label.setAlpha(button.enabled ? 1 : 0.95);
      button.label.setColor(button.palette.textColor);
      return;
    }

    if (!button.enabled) {
      button.label.setAlpha(0.92);
      button.label.setColor("#d7c9ae");
      return;
    }

    if (!choice.affordable) {
      button.label.setAlpha(0.98);
      button.label.setColor("#f4d8a2");
      return;
    }

    button.label.setAlpha(1);
    button.label.setColor(button.palette.textColor);
  }

  setCompositeVisible(button, visible) {
    button.rectangle.setVisible(visible);
    button.label.setVisible(visible);
  }

  handleEscapePressed() {
    if (this.restartConfirmOpen) {
      this.closeRestartConfirm();
      return;
    }
    if (this.pauseMenuOpen) {
      this.closePauseMenu();
      return;
    }
    if (!this.cityResolutionOpen) {
      this.openPauseMenu();
    }
  }

  isModalButton(actionId) {
    return (
      actionId === "pause-resume" ||
      actionId === "pause-restart" ||
      actionId === "restart-confirm" ||
      actionId === "restart-cancel" ||
      actionId === "cityCapture" ||
      actionId === "cityRaze"
    );
  }

  isAnyModalOpen() {
    return this.pauseMenuOpen || this.restartConfirmOpen || this.cityResolutionOpen;
  }

  getEndTurnButtonCenter() {
    return { x: this.endTurnButton.rectangle.x, y: this.endTurnButton.rectangle.y };
  }

  getRuntimeUiState() {
    return {
      pauseMenuOpen: this.pauseMenuOpen,
      restartConfirmOpen: this.restartConfirmOpen,
      notifications: this.notifications.map((entry) => ({ ...entry })),
      notificationFilter: this.notificationFilter,
      contextPanelExpanded: this.contextPanelExpanded,
      contextPanelPinned: this.contextPanelPinned,
    };
  }

  layoutResourceDeltas() {
    this.foodDeltaLabel.setPosition(this.foodLabel.x + this.foodLabel.width + 6, this.foodLabel.y + 2);
    this.productionDeltaLabel.setPosition(this.productionLabel.x + this.productionLabel.width + 6, this.productionLabel.y + 2);
    this.scienceDeltaLabel.setPosition(this.scienceLabel.x + this.scienceLabel.width + 6, this.scienceLabel.y + 2);
  }

  testOpenPauseMenu() {
    return this.openPauseMenu();
  }

  testClosePauseMenu() {
    this.closePauseMenu();
    return !this.pauseMenuOpen;
  }

  testGetPauseMenuState() {
    return {
      open: this.pauseMenuOpen,
      restartConfirmOpen: this.restartConfirmOpen,
      backdropVisible: this.modalBackdrop.visible,
    };
  }

  testOpenRestartConfirm() {
    this.openPauseMenu();
    this.openRestartConfirm();
    return this.restartConfirmOpen;
  }

  testCancelRestartConfirm() {
    this.closeRestartConfirm();
    return this.restartConfirmOpen;
  }

  testConfirmRestartConfirm() {
    this.confirmRestart();
    return this.restartConfirmOpen;
  }

  testGetRestartModalState() {
    return {
      open: this.restartConfirmOpen,
      backdropVisible: this.modalBackdrop.visible,
      confirmVisible: this.restartConfirmButton.rectangle.visible && this.restartConfirmButton.label.visible,
      cancelVisible: this.restartCancelButton.rectangle.visible && this.restartCancelButton.label.visible,
      confirmEnabled: this.restartConfirmButton.enabled,
      cancelEnabled: this.restartCancelButton.enabled,
      confirmDepth: this.restartConfirmButton.rectangle.depth,
      panelDepth: this.restartConfirmPanel.depth,
    };
  }

  testGetCityResolutionModalState() {
    return {
      open: this.cityResolutionOpen,
      backdropVisible: this.modalBackdrop.visible,
      captureVisible: this.cityCaptureButton.rectangle.visible && this.cityCaptureButton.label.visible,
      razeVisible: this.cityRazeButton.rectangle.visible && this.cityRazeButton.label.visible,
      captureEnabled: this.cityCaptureButton.enabled,
      razeEnabled: this.cityRazeButton.enabled,
      captureDepth: this.cityCaptureButton.rectangle.depth,
      panelDepth: this.cityOutcomePanel.depth,
    };
  }

  testGetCityPanelState() {
    return {
      visible: this.contextPanel.visible,
      mode: this.contextMenuMode,
      expanded: this.contextPanelExpanded,
      pinned: this.contextPanelPinned,
      metaPrimary: this.contextPanelMetaPrimary.text,
      metaSecondary: this.contextPanelMetaSecondary.text,
      cityFocusButtons: this.cityFocusButtons.map((button) => ({
        actionId: button.actionId,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        active: button.isActive,
      })),
      cityProductionTabButtons: this.cityProductionTabButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        active: button.isActive,
      })),
      cityProductionButtons: this.cityProductionButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      cityBuildingButtons: this.cityBuildingButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      cityQueueButtons: this.cityQueueButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      cityQueueMoveUpButtons: this.cityQueueMoveUpButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      cityQueueMoveDownButtons: this.cityQueueMoveDownButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      cityQueueRemoveButtons: this.cityQueueRemoveButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      disabledTooltip: {
        visible: this.disabledTooltipPanel.visible && this.disabledTooltipLabel.visible,
        text: this.disabledTooltipLabel.text,
      },
      unitButtons: [this.unitFoundCityButton, this.unitSkipButton].map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
    };
  }

  testGetNotificationCenterState() {
    return {
      count: this.notifications.length,
      scroll: this.notificationScroll,
      filter: this.notificationFilter,
      filteredCount: this.getFilteredNotifications().length,
      entries: this.notifications.slice(0, 20).map((entry) => ({ ...entry })),
    };
  }

  testSetNotificationFilter(filterName) {
    return this.setNotificationFilter(filterName);
  }

  testClickNotificationRow(index) {
    return this.focusNotificationByRow(index);
  }

  testFocusNotification(index) {
    const filtered = this.getFilteredNotifications();
    const entry = filtered[index];
    if (!entry) {
      return false;
    }
    if (!entry.focus) {
      return false;
    }
    gameEvents.emit("notification-focus-requested", { focus: entry.focus, id: entry.id });
    return true;
  }

  testGetContextPanelState() {
    return {
      expanded: this.contextPanelExpanded,
      pinned: this.contextPanelPinned,
      mode: this.contextMenuMode,
    };
  }
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function getDeltaColor(value) {
  if (value > 0) {
    return "#2f7a41";
  }
  if (value < 0) {
    return "#9a3a2b";
  }
  return "#5a4224";
}

function formatUnitLabel(type) {
  return UNIT_LABELS[type] ?? capitalizeLabel(type);
}

function formatBuildingLabel(type) {
  return BUILDING_LABELS[type] ?? capitalizeLabel(type);
}

function formatProductionChoiceLabel(baseLabel, choice) {
  const cost = choice?.cost ?? 0;
  const eta = choice?.etaTurns ?? 0;
  const compactTag = abbreviateStateTag(choice?.stateTag ?? null);
  if (compactTag) {
    return `${baseLabel} ${cost}/${eta}t ${compactTag}`;
  }
  return `${baseLabel} ${cost}/${eta}t`;
}

function abbreviateStateTag(stateTag) {
  if (!stateTag) {
    return "";
  }
  if (stateTag === "Locked") {
    return "Lk";
  }
  if (stateTag === "Built") {
    return "Bd";
  }
  if (stateTag === "Queued") {
    return "Qd";
  }
  if (stateTag === "Queue Full") {
    return "Full";
  }
  return stateTag;
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeNotificationCategory(input, message = "") {
  const normalizedInput = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (normalizedInput === "combat") {
    return "Combat";
  }
  if (normalizedInput === "city") {
    return "City";
  }
  if (normalizedInput === "research") {
    return "Research";
  }
  if (normalizedInput === "system") {
    return "System";
  }

  const text = message.toLowerCase();
  if (text.includes("research") || text.includes("tech")) {
    return "Research";
  }
  if (text.includes("city") || text.includes("queue") || text.includes("focus")) {
    return "City";
  }
  if (text.includes("attack") || text.includes("captured") || text.includes("razed") || text.includes("combat")) {
    return "Combat";
  }
  return "System";
}

function normalizeNotificationFocus(focus) {
  if (!focus || typeof focus !== "object") {
    return null;
  }
  const normalized = {};
  if (typeof focus.unitId === "string") {
    normalized.unitId = focus.unitId;
  }
  if (typeof focus.cityId === "string") {
    normalized.cityId = focus.cityId;
  }
  if (Number.isFinite(focus.q)) {
    normalized.q = Math.round(focus.q);
  }
  if (Number.isFinite(focus.r)) {
    normalized.r = Math.round(focus.r);
  }
  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
}

function summarizePreview(uiPreview) {
  const mode = uiPreview?.mode ?? "none";
  if (mode === "move") {
    return `Move preview -> cost ${uiPreview.moveCost ?? 0}, remaining ${uiPreview.movementRemainingAfter ?? 0}.`;
  }
  if (mode === "attack-unit") {
    const counter = uiPreview.counterattack;
    if (counter?.triggered) {
      return `Attack preview -> ${uiPreview.damage ?? 0} damage, counter ${counter.damage ?? 0}.`;
    }
    return `Attack preview -> ${uiPreview.damage ?? 0} damage, no counter.`;
  }
  if (mode === "attack-city") {
    return `City assault preview -> ${uiPreview.damage ?? 0} damage, city HP after hit ${uiPreview.cityRemainingHealth ?? "?"}.`;
  }
  return "";
}

function truncateText(value, maxChars) {
  if (typeof value !== "string" || value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
