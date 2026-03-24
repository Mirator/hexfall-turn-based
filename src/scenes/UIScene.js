import Phaser from "../core/phaserRuntime.js";
import { gameEvents } from "../core/eventBus.js";

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 40;

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    this.turnLabel = this.add
      .text(24, 16, "Turn 1 - Player", {
        fontFamily: "Trebuchet MS",
        fontSize: "24px",
        color: "#2d2415",
        stroke: "#f4ebd7",
        strokeThickness: 3,
      })
      .setDepth(10);

    this.selectionLabel = this.add
      .text(24, 48, "Selected: none", {
        fontFamily: "Trebuchet MS",
        fontSize: "18px",
        color: "#2d2415",
      })
      .setDepth(10);

    this.researchLabel = this.add
      .text(24, 74, "Research: none", {
        fontFamily: "Trebuchet MS",
        fontSize: "16px",
        color: "#2d2415",
        backgroundColor: "#eadcc0",
        padding: { left: 7, right: 7, top: 4, bottom: 4 },
      })
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.researchLabel.on("pointerdown", () => {
      gameEvents.emit("research-cycle-requested");
    });

    this.cityLabel = this.add
      .text(24, 108, "City: none", {
        fontFamily: "Trebuchet MS",
        fontSize: "16px",
        color: "#2d2415",
      })
      .setDepth(10);

    this.endTurnButton = this.createButton("End Turn", () => gameEvents.emit("end-turn-requested"));
    this.foundCityButton = this.createButton("Found City", () => gameEvents.emit("found-city-requested"));
    this.queueButton = this.createButton("Cycle Queue", () => gameEvents.emit("city-queue-cycle-requested"));

    this.resultPanel = this.add.rectangle(0, 0, 460, 170, 0xf2e6cc, 0.98).setDepth(40).setVisible(false);
    this.resultPanel.setStrokeStyle(3, 0x6e4a22, 1);
    this.resultTitle = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "36px",
        color: "#4a2e12",
        align: "center",
      })
      .setDepth(41)
      .setOrigin(0.5)
      .setVisible(false);
    this.resultSubtitle = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS",
        fontSize: "19px",
        color: "#4a2e12",
        align: "center",
      })
      .setDepth(41)
      .setOrigin(0.5)
      .setVisible(false);
    this.restartButton = this.createButton("Restart Match", () => gameEvents.emit("restart-match-requested"));
    this.restartButton.setDepth(42).setVisible(false);
    this.restartButton.label.setDepth(43).setVisible(false);

    this.scale.on("resize", this.layout, this);
    gameEvents.on("state-changed", this.updateFromState, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      gameEvents.off("state-changed", this.updateFromState, this);
    });

    this.layout(this.scale.gameSize);
  }

  createButton(label, onClick) {
    const rectangle = this.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 0x355e94, 0.96)
      .setStrokeStyle(2, 0xe9d9b4)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "Trebuchet MS",
        fontSize: "18px",
        color: "#fff8e8",
      })
      .setOrigin(0.5)
      .setDepth(11);

    rectangle.on("pointerover", () => {
      if (rectangle.input?.enabled) {
        rectangle.setFillStyle(0x4a76ae, 1);
      }
    });
    rectangle.on("pointerout", () => {
      rectangle.setFillStyle(rectangle.input?.enabled ? 0x355e94 : 0x6d747e, rectangle.input?.enabled ? 0.96 : 0.85);
    });
    rectangle.on("pointerdown", () => {
      if (rectangle.input?.enabled) {
        onClick();
      }
    });

    rectangle.label = text;
    return rectangle;
  }

  layout(gameSize) {
    const buttonX = gameSize.width - 120;
    this.endTurnButton.setPosition(buttonX, 30);
    this.endTurnButton.label.setPosition(buttonX, 30);

    this.foundCityButton.setPosition(buttonX, 78);
    this.foundCityButton.label.setPosition(buttonX, 78);

    this.queueButton.setPosition(buttonX, 126);
    this.queueButton.label.setPosition(buttonX, 126);

    this.resultPanel.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.resultTitle.setPosition(gameSize.width / 2, gameSize.height / 2 - 36);
    this.resultSubtitle.setPosition(gameSize.width / 2, gameSize.height / 2 + 4);
    this.restartButton.setPosition(gameSize.width / 2, gameSize.height / 2 + 56);
    this.restartButton.label.setPosition(gameSize.width / 2, gameSize.height / 2 + 56);
  }

  updateFromState(gameState) {
    const selectedUnit = gameState.units.find((unit) => unit.id === gameState.selectedUnitId);
    const selectedCity = gameState.cities.find((city) => city.id === gameState.selectedCityId);
    const selectedText = selectedUnit
      ? `Selected: ${selectedUnit.id} ${selectedUnit.type} (${selectedUnit.health}/${selectedUnit.maxHealth} HP)`
      : selectedCity
        ? `Selected: ${selectedCity.id} city`
        : "Selected: none";
    const phaseText = gameState.turnState.phase === "enemy" ? "Enemy" : "Player";
    const canIssueOrders = gameState.turnState.phase === "player" && gameState.match.status === "ongoing";

    this.turnLabel.setText(`Turn ${gameState.turnState.turn} - ${phaseText}`);
    this.selectionLabel.setText(selectedText);
    this.cityLabel.setText(
      selectedCity
        ? `City Queue: ${selectedCity.queue.join(", ")} (${selectedCity.storedProduction} prod)`
        : "City: none"
    );

    const activeTechLabel = gameState.research.activeTechId ? gameState.research.activeTechId : "none";
    this.researchLabel.setText(
      `Research: ${activeTechLabel} (${gameState.research.progress}) | Unlocked: ${gameState.unlocks.units.join(", ")}`
    );

    this.endTurnButton.label.setText(canIssueOrders ? "End Turn" : "Enemy...");
    this.setButtonEnabled(this.endTurnButton, canIssueOrders);
    this.setButtonEnabled(this.foundCityButton, canIssueOrders && !!selectedUnit && selectedUnit.type === "settler");
    this.setButtonEnabled(this.queueButton, canIssueOrders && !!selectedCity);

    const hasResult = gameState.match.status !== "ongoing";
    this.resultPanel.setVisible(hasResult);
    this.resultTitle.setVisible(hasResult);
    this.resultSubtitle.setVisible(hasResult);
    this.restartButton.setVisible(hasResult);
    this.restartButton.label.setVisible(hasResult);

    if (hasResult) {
      const title = gameState.match.status === "won" ? "Victory" : "Defeat";
      const subtitle =
        gameState.match.reason === "hold-turns"
          ? "You endured long enough to win."
          : gameState.match.reason === "elimination"
            ? "Enemy forces eliminated."
            : "Your civilization has fallen.";
      this.resultTitle.setText(title);
      this.resultSubtitle.setText(subtitle);
      this.setButtonEnabled(this.restartButton, true);
    }
  }

  setButtonEnabled(button, enabled) {
    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.setFillStyle(0x355e94, 0.96);
      button.label.setAlpha(1);
      return;
    }
    button.disableInteractive();
    button.setFillStyle(0x6d747e, 0.85);
    button.label.setAlpha(0.85);
  }

  getEndTurnButtonCenter() {
    return { x: this.endTurnButton.x, y: this.endTurnButton.y };
  }
}
