import Phaser from "phaser";
import { gameEvents } from "../core/eventBus.js";

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 42;

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    this.turnLabel = this.add
      .text(24, 18, "Turn 1", {
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

    this.endTurnButton = this.add
      .rectangle(100, 32, BUTTON_WIDTH, BUTTON_HEIGHT, 0x355e94, 0.96)
      .setStrokeStyle(2, 0xe9d9b4)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.endTurnButtonText = this.add
      .text(100, 32, "End Turn", {
        fontFamily: "Trebuchet MS",
        fontSize: "20px",
        color: "#fff8e8",
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.endTurnButton.on("pointerover", () => {
      this.endTurnButton.setFillStyle(0x4a76ae, 1);
    });
    this.endTurnButton.on("pointerout", () => {
      this.endTurnButton.setFillStyle(0x355e94, 0.96);
    });
    this.endTurnButton.on("pointerdown", () => {
      gameEvents.emit("end-turn-requested");
    });

    this.scale.on("resize", this.layout, this);
    gameEvents.on("state-changed", this.updateFromState, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      gameEvents.off("state-changed", this.updateFromState, this);
    });

    this.layout(this.scale.gameSize);
  }

  layout(gameSize) {
    const buttonX = gameSize.width - 120;
    const buttonY = 34;

    this.endTurnButton.setPosition(buttonX, buttonY);
    this.endTurnButtonText.setPosition(buttonX, buttonY);
  }

  updateFromState(gameState) {
    const selectedUnit = gameState.units.find((unit) => unit.id === gameState.selectedUnitId);
    const selectedText = selectedUnit
      ? `Selected: ${selectedUnit.id} (${selectedUnit.movementRemaining}/${selectedUnit.maxMovement} MP)`
      : "Selected: none";

    this.turnLabel.setText(`Turn ${gameState.turnState.turn}`);
    this.selectionLabel.setText(selectedText);
  }

  getEndTurnButtonCenter() {
    return { x: this.endTurnButton.x, y: this.endTurnButton.y };
  }
}
