import Phaser from "../core/phaserRuntime.js";
import {
  clampAiFactionCount,
  DEFAULT_AI_FACTION_COUNT,
  DEFAULT_MAP_SIZE,
  MAP_SIZE_PRESETS,
  MAX_AI_FACTIONS,
  MIN_AI_FACTIONS,
  normalizeMapSize,
  resolveMatchConfig,
} from "../core/matchConfig.js";
import { createStartupBackdrop } from "./startupBackdrop.js";

const TITLE_SIZE = "56px";
const LABEL_SIZE = "26px";
const VALUE_SIZE = "34px";
const BUTTON_LABEL_SIZE = "20px";

export class NewGameScene extends Phaser.Scene {
  constructor() {
    super("NewGameScene");

    this.mapSize = DEFAULT_MAP_SIZE;
    this.aiFactionCount = DEFAULT_AI_FACTION_COUNT;
    this.starting = false;
    this.layoutNodes = null;
    this.backdrop = null;
  }

  create() {
    this.starting = false;
    this.mapSize = DEFAULT_MAP_SIZE;
    this.aiFactionCount = DEFAULT_AI_FACTION_COUNT;

    this.backdrop = createStartupBackdrop(this);

    const panel = this.add.rectangle(0, 0, 10, 10, 0x111723, 0.72).setDepth(4);
    panel.setStrokeStyle(4, 0xdcc691, 0.72);

    const title = this.add
      .text(0, 0, "New Campaign", {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: TITLE_SIZE,
        color: "#f2dfb1",
        fontStyle: "bold",
        stroke: "#16140f",
        strokeThickness: 6,
      })
      .setDepth(5)
      .setOrigin(0.5);
    const subtitle = this.add
      .text(0, 0, "Prepare your realm before the first turn.", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "20px",
        color: "#cedced",
      })
      .setDepth(5)
      .setOrigin(0.5);

    const mapLabel = this.createLabel("Map Size", LABEL_SIZE);
    const mapValue = this.createValue("");
    const mapMinus = this.createStepperButton("-", () => this.stepMapSize(-1));
    const mapPlus = this.createStepperButton("+", () => this.stepMapSize(1));

    const aiLabel = this.createLabel("AI Factions", LABEL_SIZE);
    const aiValue = this.createValue("");
    const aiMinus = this.createStepperButton("-", () => this.stepAiFactionCount(-1));
    const aiPlus = this.createStepperButton("+", () => this.stepAiFactionCount(1));

    const startButton = this.createActionButton("Start Match", () => this.startConfiguredMatch(), {
      baseFill: 0x2f7f6a,
      hoverFill: 0x3f9780,
      downFill: 0x26695a,
    });
    const backButton = this.createActionButton("Back", () => this.backToMainMenu(), {
      baseFill: 0x7f6041,
      hoverFill: 0x966f4a,
      downFill: 0x684e35,
    });

    this.layoutNodes = {
      panel,
      title,
      subtitle,
      mapLabel,
      mapValue,
      mapMinus,
      mapPlus,
      aiLabel,
      aiValue,
      aiMinus,
      aiPlus,
      startButton,
      backButton,
    };
    this.updateValueLabels();

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
      this.backdrop?.destroy();
    });
    this.handleResize(this.scale.gameSize);
  }

  createLabel(text, size) {
    return this.add
      .text(0, 0, text, {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: size,
        color: "#e6d6b5",
        fontStyle: "bold",
      })
      .setDepth(5)
      .setOrigin(0.5);
  }

  createValue(text) {
    return this.add
      .text(0, 0, text, {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: VALUE_SIZE,
        color: "#9fd4ff",
        fontStyle: "bold",
      })
      .setDepth(5)
      .setOrigin(0.5);
  }

  createStepperButton(label, onClick) {
    const rectangle = this.add
      .rectangle(0, 0, 58, 46, 0x6d5a3e, 1)
      .setDepth(6)
      .setStrokeStyle(2, 0xf0e0c0, 0.95)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "30px",
        color: "#f6efd9",
        fontStyle: "bold",
      })
      .setDepth(7)
      .setOrigin(0.5);
    rectangle.on("pointerover", () => rectangle.setFillStyle(0x86714f, 1));
    rectangle.on("pointerout", () => rectangle.setFillStyle(0x6d5a3e, 1));
    rectangle.on("pointerdown", () => rectangle.setFillStyle(0x584a33, 1));
    rectangle.on("pointerup", () => {
      rectangle.setFillStyle(0x86714f, 1);
      onClick();
    });
    return { rectangle, label: text };
  }

  createActionButton(label, onClick, palette) {
    const rectangle = this.add
      .rectangle(0, 0, 210, 54, palette.baseFill, 1)
      .setDepth(6)
      .setStrokeStyle(3, 0xf0e0c0, 0.95)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: BUTTON_LABEL_SIZE,
        color: "#f9f2df",
        fontStyle: "bold",
      })
      .setDepth(7)
      .setOrigin(0.5);
    rectangle.on("pointerover", () => {
      rectangle.setFillStyle(palette.hoverFill, 1);
      text.setScale(1.03);
    });
    rectangle.on("pointerout", () => {
      rectangle.setFillStyle(palette.baseFill, 1);
      text.setScale(1);
    });
    rectangle.on("pointerdown", () => rectangle.setFillStyle(palette.downFill, 1));
    rectangle.on("pointerup", () => {
      rectangle.setFillStyle(palette.hoverFill, 1);
      onClick();
    });
    return { rectangle, label: text };
  }

  handleResize(gameSize) {
    if (!this.layoutNodes) {
      return;
    }
    const width = gameSize.width;
    const height = gameSize.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const panelWidth = Math.max(560, Math.min(700, width - 80));
    const panelHeight = Math.max(420, Math.min(500, height - 90));
    const rowGap = 98;

    this.backdrop?.layout(gameSize);
    this.layoutNodes.panel.setSize(panelWidth, panelHeight);
    this.layoutNodes.panel.setPosition(centerX, centerY);

    this.layoutNodes.title.setPosition(centerX, centerY - panelHeight * 0.37);
    this.layoutNodes.subtitle.setPosition(centerX, centerY - panelHeight * 0.26);

    const mapY = centerY - rowGap * 0.26;
    const aiY = mapY + rowGap;
    const stepperOffsetX = 130;
    this.layoutNodes.mapLabel.setPosition(centerX, mapY - 26);
    this.layoutNodes.mapValue.setPosition(centerX, mapY + 18);
    this.setCompositePosition(this.layoutNodes.mapMinus, centerX - stepperOffsetX, mapY + 18);
    this.setCompositePosition(this.layoutNodes.mapPlus, centerX + stepperOffsetX, mapY + 18);

    this.layoutNodes.aiLabel.setPosition(centerX, aiY - 26);
    this.layoutNodes.aiValue.setPosition(centerX, aiY + 18);
    this.setCompositePosition(this.layoutNodes.aiMinus, centerX - stepperOffsetX, aiY + 18);
    this.setCompositePosition(this.layoutNodes.aiPlus, centerX + stepperOffsetX, aiY + 18);

    const buttonY = centerY + panelHeight * 0.33;
    this.setCompositePosition(this.layoutNodes.backButton, centerX - 116, buttonY);
    this.setCompositePosition(this.layoutNodes.startButton, centerX + 116, buttonY);
  }

  setCompositePosition(composite, x, y) {
    if (!composite) {
      return;
    }
    composite.rectangle.setPosition(x, y);
    composite.label.setPosition(x, y);
  }

  updateValueLabels() {
    if (!this.layoutNodes) {
      return;
    }
    this.layoutNodes.mapValue.setText(`${this.mapSize} x ${this.mapSize}`);
    this.layoutNodes.aiValue.setText(String(this.aiFactionCount));
  }

  stepMapSize(direction) {
    const currentIndex = MAP_SIZE_PRESETS.indexOf(this.mapSize);
    const safeIndex = currentIndex >= 0 ? currentIndex : MAP_SIZE_PRESETS.indexOf(DEFAULT_MAP_SIZE);
    const nextIndex = Math.max(0, Math.min(MAP_SIZE_PRESETS.length - 1, safeIndex + direction));
    this.mapSize = MAP_SIZE_PRESETS[nextIndex];
    this.updateValueLabels();
    return this.mapSize;
  }

  setMapSize(size) {
    this.mapSize = normalizeMapSize(size);
    this.updateValueLabels();
    return this.mapSize;
  }

  stepAiFactionCount(direction) {
    this.aiFactionCount = clampAiFactionCount(this.aiFactionCount + direction);
    this.updateValueLabels();
    return this.aiFactionCount;
  }

  setAiFactionCount(count) {
    this.aiFactionCount = clampAiFactionCount(count);
    this.updateValueLabels();
    return this.aiFactionCount;
  }

  startConfiguredMatch() {
    if (this.starting) {
      return false;
    }
    this.starting = true;
    const matchConfig = resolveMatchConfig({
      mapWidth: this.mapSize,
      mapHeight: this.mapSize,
      aiFactionCount: this.aiFactionCount,
    });
    this.scene.start("WorldScene", { matchConfig });
    this.scene.launch("UIScene");
    return true;
  }

  backToMainMenu() {
    if (this.starting) {
      return false;
    }
    this.scene.start("MainMenuScene");
    return true;
  }

  testSetMapSize(size) {
    return this.setMapSize(size);
  }

  testSetAiFactionCount(count) {
    return this.setAiFactionCount(count);
  }

  testStartMatch() {
    return this.startConfiguredMatch();
  }

  testBackToMenu() {
    return this.backToMainMenu();
  }

  testGetBootstrapState() {
    return {
      mode: "new-game",
      mapSize: this.mapSize,
      mapWidth: this.mapSize,
      mapHeight: this.mapSize,
      aiFactionCount: this.aiFactionCount,
      mapSizePresets: [...MAP_SIZE_PRESETS],
      aiMin: MIN_AI_FACTIONS,
      aiMax: MAX_AI_FACTIONS,
    };
  }
}
