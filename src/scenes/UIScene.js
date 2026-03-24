import Phaser from "../core/phaserRuntime.js";
import { gameEvents } from "../core/eventBus.js";

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 40;
const CITY_PANEL_FOCUS_WIDTH = 88;
const CITY_PANEL_ACTION_WIDTH = 58;
const CITY_PANEL_BUTTON_HEIGHT = 30;
const CITY_PANEL_QUEUE_MAX = 3;
const FOCUS_MODES = ["balanced", "food", "production", "science"];
const PRODUCTION_TYPES = ["warrior", "settler", "spearman"];

const FOCUS_LABELS = {
  balanced: "Balanced",
  food: "Food",
  production: "Prod",
  science: "Sci",
};

const UNIT_SHORT_LABELS = {
  warrior: "War",
  settler: "Set",
  spearman: "Sp",
};

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");

    this.latestState = null;
    this.hoverHint = null;
    this.restartConfirmOpen = false;
    this.cityResolutionOpen = false;
    this.modalStateOpen = false;
    this.toastTimer = null;
    this.escapeKey = null;
    this.cityPanelVisible = false;
  }

  create() {
    this.turnLabel = this.add
      .text(24, 18, "Turn 1 - Player", {
        fontFamily: "Trebuchet MS",
        fontSize: "24px",
        color: "#2d2415",
        stroke: "#f4ebd7",
        strokeThickness: 3,
      })
      .setDepth(10);

    this.selectionChip = this.createChip("Selection: none");
    this.researchChip = this.createChip("Research: none");
    this.economyChip = this.createChip("Economy: F0 P0 S0");

    this.endTurnButton = this.createButton("End Turn", "endTurn", () => gameEvents.emit("end-turn-requested"));
    this.foundCityButton = this.createButton("Found City", "foundCity", () => gameEvents.emit("found-city-requested"));
    this.restartButton = this.createButton("Restart", "restart", () => this.openRestartConfirm());

    this.cityPanel = this.add.rectangle(0, 0, 10, 10, 0xead7b1, 0.95).setDepth(12).setVisible(false);
    this.cityPanel.setStrokeStyle(2, 0x7d5a2f, 0.9);
    this.cityPanelTitle = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "15px",
        color: "#3d2a14",
      })
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false);

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
    for (const button of this.cityFocusButtons) {
      button.rectangle.setDepth(14);
      button.label.setDepth(15);
    }

    this.cityProductionButtons = PRODUCTION_TYPES.map((unitType) =>
      this.createButton(
        "--",
        `city-enqueue-${unitType}`,
        () => gameEvents.emit("city-queue-enqueue-requested", { unitType }),
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
    for (const button of this.cityProductionButtons) {
      button.rectangle.setDepth(14);
      button.label.setDepth(15);
    }

    this.cityQueueButtons = [0, 1, 2].map((index) =>
      this.createButton(
        `${index + 1}:--`,
        `city-queue-slot-${index}`,
        () => gameEvents.emit("city-queue-remove-requested", { index }),
        {
          width: CITY_PANEL_ACTION_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "13px",
          enabledFill: 0x7c4e2b,
          hoverFill: 0x956039,
          activeFill: 0x7c4e2b,
          disabledFill: 0x7f7568,
          stroke: 0xf2debb,
        }
      )
    );
    for (const button of this.cityQueueButtons) {
      button.rectangle.setDepth(14);
      button.label.setDepth(15);
    }

    this.setCityPanelVisible(false);

    this.hintPanel = this.add.rectangle(0, 0, 380, 74, 0xf0e4cb, 0.95).setDepth(20).setVisible(false);
    this.hintPanel.setStrokeStyle(2, 0x7d5a2f, 0.8);
    this.hintPrimary = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "16px",
        color: "#3f2d18",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);
    this.hintSecondary = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "14px",
        color: "#5a4224",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);

    this.toastPanel = this.add.rectangle(0, 0, 420, 44, 0x3a2f1f, 0.88).setDepth(30).setVisible(false);
    this.toastText = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "16px",
        color: "#f8efd8",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setVisible(false);

    this.modalBackdrop = this.add
      .rectangle(0, 0, 10, 10, 0x2a1b10, 0.34)
      .setDepth(39)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.modalBackdrop.on("pointerdown", () => {
      if (this.restartConfirmOpen) {
        this.closeRestartConfirm();
      }
    });

    this.restartConfirmPanel = this.add.rectangle(0, 0, 420, 150, 0xf2e6cc, 0.98).setDepth(40).setVisible(false);
    this.restartConfirmPanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.restartConfirmPanel.setInteractive();
    this.restartConfirmPanel.on("pointerdown", (_pointer, _x, _y, event) => {
      event.stopPropagation();
    });
    this.restartConfirmTitle = this.add
      .text(0, 0, "Restart match?", {
        fontFamily: "Trebuchet MS",
        fontSize: "30px",
        color: "#4a2e12",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(41)
      .setVisible(false);
    this.restartConfirmSubtitle = this.add
      .text(0, 0, "Current progress will be lost.", {
        fontFamily: "Trebuchet MS",
        fontSize: "17px",
        color: "#4a2e12",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(41)
      .setVisible(false);
    this.restartConfirmButton = this.createButton("Confirm", "restartConfirm", () => this.confirmRestart(), {
      enabledFill: 0x2f6c3d,
      hoverFill: 0x3f8450,
      disabledFill: 0x617965,
      stroke: 0xe5f0dc,
    });
    this.restartCancelButton = this.createButton("Cancel", "restartCancel", () => this.closeRestartConfirm(), {
      enabledFill: 0x7c4e2b,
      hoverFill: 0x956039,
      disabledFill: 0x7c7065,
      stroke: 0xf2debb,
    });
    this.restartConfirmButton.rectangle.setDepth(43);
    this.restartConfirmButton.label.setDepth(44);
    this.restartCancelButton.rectangle.setDepth(43);
    this.restartCancelButton.label.setDepth(44);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);

    this.cityOutcomePanel = this.add.rectangle(0, 0, 420, 160, 0xf2e6cc, 0.98).setDepth(45).setVisible(false);
    this.cityOutcomePanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.cityOutcomePanel.setInteractive();
    this.cityOutcomePanel.on("pointerdown", (_pointer, _x, _y, event) => {
      event.stopPropagation();
    });
    this.cityOutcomeTitle = this.add
      .text(0, 0, "City conquered", {
        fontFamily: "Trebuchet MS",
        fontSize: "30px",
        color: "#4a2e12",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setVisible(false);
    this.cityOutcomeSubtitle = this.add
      .text(0, 0, "Capture it or raze it.", {
        fontFamily: "Trebuchet MS",
        fontSize: "17px",
        color: "#4a2e12",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setVisible(false);
    this.cityCaptureButton = this.createButton("Capture", "cityCapture", () =>
      gameEvents.emit("city-outcome-requested", { choice: "capture" })
    );
    this.cityRazeButton = this.createButton(
      "Raze",
      "cityRaze",
      () => gameEvents.emit("city-outcome-requested", { choice: "raze" }),
      {
        enabledFill: 0x8a422f,
        hoverFill: 0xa34f38,
        disabledFill: 0x7e6f64,
        stroke: 0xf2debb,
      }
    );
    this.cityCaptureButton.rectangle.setDepth(47);
    this.cityCaptureButton.label.setDepth(48);
    this.cityRazeButton.rectangle.setDepth(47);
    this.cityRazeButton.label.setDepth(48);
    this.setCompositeVisible(this.cityCaptureButton, false);
    this.setCompositeVisible(this.cityRazeButton, false);

    this.resultPanel = this.add.rectangle(0, 0, 460, 170, 0xf2e6cc, 0.98).setDepth(50).setVisible(false);
    this.resultPanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.resultTitle = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "36px",
        color: "#4a2e12",
        align: "center",
      })
      .setDepth(51)
      .setOrigin(0.5)
      .setVisible(false);
    this.resultSubtitle = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "19px",
        color: "#4a2e12",
        align: "center",
      })
      .setDepth(51)
      .setOrigin(0.5)
      .setVisible(false);
    this.resultRestartButton = this.createButton("Restart Match", "resultRestart", () => gameEvents.emit("restart-match-requested"));
    this.resultRestartButton.rectangle.setDepth(52);
    this.resultRestartButton.label.setDepth(53);
    this.setCompositeVisible(this.resultRestartButton, false);

    this.scale.on("resize", this.layout, this);
    this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC) ?? null;
    this.escapeKey?.on("down", this.handleEscapePressed, this);
    gameEvents.on("state-changed", this.updateFromState, this);
    gameEvents.on("ui-toast-requested", this.handleToastRequested, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.escapeKey?.off("down", this.handleEscapePressed, this);
      gameEvents.off("state-changed", this.updateFromState, this);
      gameEvents.off("ui-toast-requested", this.handleToastRequested, this);
      gameEvents.emit("ui-modal-state-changed", false);
      if (this.toastTimer) {
        this.toastTimer.remove(false);
        this.toastTimer = null;
      }
    });

    const worldScene = this.scene.get("WorldScene");
    if (worldScene && typeof worldScene.getGameStateSnapshot === "function") {
      this.updateFromState(worldScene.getGameStateSnapshot());
    }

    this.layout(this.scale.gameSize);
  }

  createChip(text) {
    return this.add
      .text(24, 0, text, {
        fontFamily: "Trebuchet MS",
        fontSize: "15px",
        color: "#2d2415",
        backgroundColor: "#eadcc0",
        padding: { left: 7, right: 7, top: 4, bottom: 4 },
      })
      .setDepth(10);
  }

  createButton(label, actionId, onClick, options = {}) {
    const resolvedPalette = {
      enabledFill: options.enabledFill ?? 0x355e94,
      hoverFill: options.hoverFill ?? 0x4a76ae,
      activeFill: options.activeFill ?? options.enabledFill ?? 0x355e94,
      disabledFill: options.disabledFill ?? 0x6d747e,
      stroke: options.stroke ?? 0xe9d9b4,
      textColor: options.textColor ?? "#fff8e8",
      enabledAlpha: options.enabledAlpha ?? 0.96,
      hoverAlpha: options.hoverAlpha ?? 1,
      activeAlpha: options.activeAlpha ?? 0.98,
      disabledAlpha: options.disabledAlpha ?? 0.85,
    };

    const width = options.width ?? BUTTON_WIDTH;
    const height = options.height ?? BUTTON_HEIGHT;

    const rectangle = this.add
      .rectangle(0, 0, width, height, resolvedPalette.enabledFill, resolvedPalette.enabledAlpha)
      .setStrokeStyle(2, resolvedPalette.stroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "Trebuchet MS",
        fontSize: options.fontSize ?? "18px",
        color: resolvedPalette.textColor,
      })
      .setOrigin(0.5)
      .setDepth(11);

    const button = {
      rectangle,
      label: text,
      actionId,
      enabled: true,
      isActive: false,
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
      } else {
        this.applyButtonVisualState(button);
      }
      return;
    }

    if (!isEntering) {
      this.hoverHint = null;
      this.updateContextualHint();
      return;
    }

    const disabledHint = this.getDisabledActionHint(button.actionId);
    if (disabledHint) {
      this.hoverHint = disabledHint;
      this.updateContextualHint();
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
      this.handleToastRequested({ message: hint, level: "warning" });
    }
  }

  getDisabledActionHint(actionId) {
    if (!this.latestState) {
      return null;
    }

    const canIssueOrders =
      this.latestState.turnState?.phase === "player" &&
      this.latestState.match?.status === "ongoing" &&
      !this.latestState.pendingCityResolution;
    const selectedCity = this.latestState.cities?.find((city) => city.id === this.latestState.selectedCityId) ?? null;

    if (actionId === "foundCity") {
      return this.latestState.uiActions?.foundCityReason ?? "Cannot found a city right now.";
    }
    if (actionId === "endTurn") {
      if (this.latestState.pendingCityResolution) {
        return "Resolve city outcome first.";
      }
      return "Wait for the enemy turn to finish.";
    }
    if (actionId.startsWith("city-focus-")) {
      if (!selectedCity || selectedCity.owner !== "player") {
        return "Select one of your cities to set focus.";
      }
      if (!canIssueOrders) {
        return "You can set focus on your turn only.";
      }
      return "Focus cannot be changed right now.";
    }
    if (actionId.startsWith("city-enqueue-")) {
      if (!selectedCity || selectedCity.owner !== "player") {
        return "Select one of your cities to manage production.";
      }
      if (!canIssueOrders) {
        return "You can manage queue on your turn only.";
      }
      return this.latestState.uiActions?.cityQueueReason ?? "Queue is unavailable right now.";
    }
    if (actionId.startsWith("city-queue-slot-")) {
      if (!selectedCity || selectedCity.owner !== "player") {
        return "Select one of your cities to manage production.";
      }
      if (!canIssueOrders) {
        return "You can manage queue on your turn only.";
      }
      const rawIndex = actionId.slice("city-queue-slot-".length);
      const index = Number(rawIndex);
      if (!Number.isInteger(index) || index < 0 || index >= selectedCity.queue.length) {
        return "This queue slot is empty.";
      }
      return "Cannot remove this queue item right now.";
    }
    return null;
  }

  layout(gameSize) {
    const buttonX = gameSize.width - 120;
    this.selectionChip.setPosition(24, 52);
    this.researchChip.setPosition(24, 82);
    this.economyChip.setPosition(24, 112);

    this.endTurnButton.rectangle.setPosition(buttonX, 30);
    this.endTurnButton.label.setPosition(buttonX, 30);

    this.foundCityButton.rectangle.setPosition(buttonX, 78);
    this.foundCityButton.label.setPosition(buttonX, 78);

    this.restartButton.rectangle.setPosition(buttonX, 126);
    this.restartButton.label.setPosition(buttonX, 126);

    const panelWidth = Math.max(372, Math.min(gameSize.width - 12, 760));
    const panelHeight = 118;
    const panelX = gameSize.width / 2;
    const panelY = gameSize.height - panelHeight / 2 - 10;
    this.cityPanel.setPosition(panelX, panelY);
    this.cityPanel.setSize(panelWidth, panelHeight);
    this.cityPanelTitle.setPosition(panelX, panelY - 42);

    const focusRowY = panelY - 14;
    this.layoutButtonRow(this.cityFocusButtons, panelX, focusRowY, 6);

    const queueRowY = panelY + 24;
    const queueRowButtons = [...this.cityProductionButtons, ...this.cityQueueButtons];
    this.layoutButtonRow(queueRowButtons, panelX, queueRowY, 4);

    this.hintPanel.setPosition(gameSize.width / 2, 56);
    this.hintPrimary.setPosition(gameSize.width / 2, 44);
    this.hintSecondary.setPosition(gameSize.width / 2, 66);

    this.toastPanel.setPosition(gameSize.width / 2, gameSize.height - 30);
    this.toastText.setPosition(gameSize.width / 2, gameSize.height - 30);

    this.modalBackdrop.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.modalBackdrop.setSize(gameSize.width + 4, gameSize.height + 4);

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

  updateFromState(gameState) {
    this.latestState = gameState;
    const selectedUnit = gameState.units.find((unit) => unit.id === gameState.selectedUnitId);
    const selectedCity = gameState.cities.find((city) => city.id === gameState.selectedCityId);
    const phaseText = gameState.turnState.phase === "enemy" ? "Enemy" : "Player";
    const hasPendingCityResolution = !!gameState.pendingCityResolution;
    const canIssueOrders = gameState.turnState.phase === "player" && gameState.match.status === "ongoing" && !hasPendingCityResolution;
    const canFoundCity = !!gameState.uiActions?.canFoundCity && canIssueOrders;

    this.turnLabel.setText(`Turn ${gameState.turnState.turn} - ${phaseText}`);
    this.selectionChip.setText(this.getSelectionChipText(selectedUnit, selectedCity));
    this.researchChip.setText(this.getResearchChipText(gameState));
    this.economyChip.setText(this.getEconomyChipText(gameState));

    this.endTurnButton.label.setText(canIssueOrders ? "End Turn" : hasPendingCityResolution ? "Resolve..." : "Enemy...");
    this.setButtonEnabled(this.endTurnButton, canIssueOrders);
    this.setButtonEnabled(this.foundCityButton, canFoundCity);
    this.setButtonEnabled(this.restartButton, !!gameState.uiActions?.canRestart && !hasPendingCityResolution);

    this.syncCityCommandPanel(gameState, selectedCity, canIssueOrders);
    this.syncCityResolutionModal(gameState.pendingCityResolution);
    this.updateContextualHint();

    const hasResult = gameState.match.status !== "ongoing";
    this.resultPanel.setVisible(hasResult);
    this.resultTitle.setVisible(hasResult);
    this.resultSubtitle.setVisible(hasResult);
    this.setCompositeVisible(this.resultRestartButton, hasResult);

    if (hasResult) {
      const title = gameState.match.status === "won" ? "Victory" : "Defeat";
      const subtitle =
        gameState.match.reason === "elimination" ? "Enemy forces eliminated." : "Your civilization has fallen.";
      this.resultTitle.setText(title);
      this.resultSubtitle.setText(subtitle);
      this.setButtonEnabled(this.resultRestartButton, true);
    }
  }

  syncCityCommandPanel(gameState, selectedCity, canIssueOrders) {
    const panelVisible = !!selectedCity && selectedCity.owner === "player" && gameState.match.status === "ongoing";
    this.cityPanelVisible = panelVisible;
    this.setCityPanelVisible(panelVisible);
    if (!panelVisible || !selectedCity) {
      return;
    }

    const queueMax = gameState.uiActions?.cityQueueMax ?? CITY_PANEL_QUEUE_MAX;
    const queueLength = selectedCity.queue.length;
    this.cityPanelTitle.setText(`City Commands  Pop ${selectedCity.population}  Queue ${queueLength}/${queueMax}`);

    for (let i = 0; i < this.cityFocusButtons.length; i += 1) {
      const focus = FOCUS_MODES[i];
      const button = this.cityFocusButtons[i];
      this.setButtonActive(button, selectedCity.focus === focus);
      this.setButtonEnabled(button, canIssueOrders && !!gameState.uiActions?.canSetCityFocus);
    }

    const byType = new Map((gameState.uiActions?.cityProductionChoices ?? []).map((choice) => [choice.type, choice]));
    const canQueueProduction = canIssueOrders && !!gameState.uiActions?.canQueueProduction;
    for (let i = 0; i < this.cityProductionButtons.length; i += 1) {
      const button = this.cityProductionButtons[i];
      const unitType = PRODUCTION_TYPES[i];
      const choice = byType.get(unitType);
      const isUnlocked = !!choice?.unlocked;
      const affordable = !!choice?.affordable;
      const costText = choice ? `${choice.cost}` : "--";
      const lockSuffix = isUnlocked ? "" : "X";
      this.setButtonLabel(button, `${UNIT_SHORT_LABELS[unitType]}${lockSuffix}${costText}`);
      this.setButtonEnabled(button, canQueueProduction && isUnlocked);
      if (button.enabled) {
        button.label.setAlpha(affordable ? 1 : 0.9);
      }
    }

    for (let i = 0; i < this.cityQueueButtons.length; i += 1) {
      const button = this.cityQueueButtons[i];
      const queueItem = selectedCity.queue[i] ?? null;
      const label = queueItem ? `${i + 1}:${UNIT_SHORT_LABELS[queueItem]}` : `${i + 1}:--`;
      this.setButtonLabel(button, label);
      this.setButtonEnabled(button, canIssueOrders && !!queueItem);
    }
  }

  setCityPanelVisible(visible) {
    this.cityPanel.setVisible(visible);
    this.cityPanelTitle.setVisible(visible);
    for (const button of this.cityFocusButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityProductionButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueButtons) {
      this.setCompositeVisible(button, visible);
    }
  }

  getSelectionChipText(selectedUnit, selectedCity) {
    if (selectedUnit) {
      return `Unit: ${selectedUnit.type} ${selectedUnit.health}/${selectedUnit.maxHealth} HP`;
    }
    if (selectedCity) {
      const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, science: 0 };
      return `City: Pop ${selectedCity.population} | HP ${selectedCity.health}/${selectedCity.maxHealth} | ${selectedCity.focus} | F/P/S ${localYield.food}/${localYield.production}/${localYield.science} | ${selectedCity.identity}`;
    }
    return "Selection: none";
  }

  getResearchChipText(gameState) {
    const activeTechLabel = gameState.research.activeTechId ?? "none";
    return `Research: ${activeTechLabel} (${gameState.research.progress})`;
  }

  getEconomyChipText(gameState) {
    const playerEconomy = gameState.economy?.player ?? {
      foodStock: 0,
      productionStock: 0,
      scienceStock: 0,
    };
    const income = gameState.economy?.researchIncomeThisTurn ?? 0;
    return `Economy: F${playerEconomy.foodStock} P${playerEconomy.productionStock} S${playerEconomy.scienceStock} (+${income} sci)`;
  }

  updateContextualHint() {
    if (!this.latestState) {
      this.setHint(null, null, null);
      return;
    }

    if (this.hoverHint) {
      this.setHint(this.hoverHint, null, "warning");
      return;
    }

    const uiHints = this.latestState.uiHints ?? { primary: null, secondary: null, level: null };
    this.setHint(uiHints.primary, uiHints.secondary, uiHints.level);
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

  handleToastRequested(payload) {
    const message = typeof payload === "string" ? payload : payload?.message;
    if (!message) {
      return;
    }

    const level = typeof payload === "object" ? payload.level : "info";
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }

    this.toastText.setText(message);
    this.toastPanel.setVisible(true);
    this.toastText.setVisible(true);
    if (level === "warning") {
      this.toastPanel.setFillStyle(0x6f241a, 0.9);
    } else {
      this.toastPanel.setFillStyle(0x2f3d22, 0.88);
    }

    this.toastTimer = this.time.delayedCall(1700, () => {
      this.toastPanel.setVisible(false);
      this.toastText.setVisible(false);
      this.toastTimer = null;
    });
  }

  openRestartConfirm() {
    if (!this.latestState?.uiActions?.canRestart || this.restartConfirmOpen || this.cityResolutionOpen) {
      return;
    }
    this.restartConfirmOpen = true;
    this.restartConfirmPanel.setVisible(true);
    this.restartConfirmTitle.setVisible(true);
    this.restartConfirmSubtitle.setVisible(true);
    this.setCompositeVisible(this.restartConfirmButton, true);
    this.setCompositeVisible(this.restartCancelButton, true);
    this.setButtonEnabled(this.restartConfirmButton, true);
    this.setButtonEnabled(this.restartCancelButton, true);
    this.hoverHint = null;
    this.updateContextualHint();
    this.syncModalState();
  }

  closeRestartConfirm() {
    if (!this.restartConfirmOpen) {
      return;
    }
    this.restartConfirmOpen = false;
    this.restartConfirmPanel.setVisible(false);
    this.restartConfirmTitle.setVisible(false);
    this.restartConfirmSubtitle.setVisible(false);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);
    this.hoverHint = null;
    this.updateContextualHint();
    this.syncModalState();
  }

  confirmRestart() {
    this.closeRestartConfirm();
    gameEvents.emit("restart-match-requested");
  }

  syncCityResolutionModal(pendingResolution) {
    if (pendingResolution) {
      this.cityResolutionOpen = true;
      this.cityOutcomeTitle.setText("City conquered");
      this.cityOutcomeSubtitle.setText("Capture to keep it, or Raze to destroy it.");
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
    const nextOpen = this.restartConfirmOpen || this.cityResolutionOpen;
    this.modalBackdrop.setVisible(nextOpen);
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

  applyButtonVisualState(button) {
    if (!button.enabled) {
      button.rectangle.setFillStyle(button.palette.disabledFill, button.palette.disabledAlpha);
      return;
    }
    if (button.isActive) {
      button.rectangle.setFillStyle(button.palette.activeFill, button.palette.activeAlpha);
      return;
    }
    button.rectangle.setFillStyle(button.palette.enabledFill, button.palette.enabledAlpha);
  }

  setButtonLabel(button, label) {
    button.label.setText(label);
  }

  setCompositeVisible(button, visible) {
    button.rectangle.setVisible(visible);
    button.label.setVisible(visible);
  }

  getEndTurnButtonCenter() {
    return { x: this.endTurnButton.rectangle.x, y: this.endTurnButton.rectangle.y };
  }

  handleEscapePressed() {
    if (this.restartConfirmOpen) {
      this.closeRestartConfirm();
    }
  }

  isModalButton(actionId) {
    return (
      actionId === "restartConfirm" ||
      actionId === "restartCancel" ||
      actionId === "cityCapture" ||
      actionId === "cityRaze"
    );
  }

  isAnyModalOpen() {
    return this.restartConfirmOpen || this.cityResolutionOpen;
  }

  testOpenRestartConfirm() {
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
      visible: this.cityPanelVisible,
      focusButtons: this.cityFocusButtons.map((button) => ({
        actionId: button.actionId,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        active: button.isActive,
      })),
      productionButtons: this.cityProductionButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
      queueButtons: this.cityQueueButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
    };
  }
}
