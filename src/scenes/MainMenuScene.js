import Phaser from "../core/phaserRuntime.js";
import { STARTUP_THEME, UI_FONTS, resolveStartupButtonPalette } from "../ui/theme.js";
import { createStartupBackdrop } from "./startupBackdrop.js";

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 62;

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenuScene");

    this.backdrop = null;
    this.heroPanel = null;
    this.kicker = null;
    this.title = null;
    this.subtitle = null;
    this.footerHint = null;
    this.newGameButton = null;
    this.aboutButton = null;
  }

  create() {
    this.backdrop = createStartupBackdrop(this);

    this.heroPanel = this.add.rectangle(0, 0, 10, 10, STARTUP_THEME.panelFill, STARTUP_THEME.panelAlpha).setDepth(4);
    this.heroPanel.setStrokeStyle(3, STARTUP_THEME.panelStroke, STARTUP_THEME.panelStrokeAlpha);

    this.kicker = this.add
      .text(0, 0, "TURN-BASED STRATEGY", {
        fontFamily: UI_FONTS.compact,
        fontSize: "18px",
        color: STARTUP_THEME.hintColor,
        letterSpacing: 4,
      })
      .setDepth(5)
      .setOrigin(0.5);

    this.title = this.add.text(0, 0, "HEXFALL", {
      fontFamily: UI_FONTS.display,
      fontSize: "102px",
      fontStyle: "bold",
      color: STARTUP_THEME.titleColor,
      stroke: "#1d1a18",
      strokeThickness: 8,
      shadow: {
        color: "#000000",
        fill: true,
        blur: 12,
        stroke: true,
        offsetX: 0,
        offsetY: 5,
      },
    });
    this.title.setOrigin(0.5).setDepth(6);

    this.subtitle = this.add.text(0, 0, "Build your empire. Outmaneuver rival factions.", {
      fontFamily: UI_FONTS.heading,
      fontSize: "23px",
      color: STARTUP_THEME.subtitleColor,
      stroke: "#1e1a16",
      strokeThickness: 3,
      align: "center",
    });
    this.subtitle.setOrigin(0.5).setDepth(6);

    this.footerHint = this.add
      .text(0, 0, "Select an option to begin", {
        fontFamily: UI_FONTS.body,
        fontSize: "18px",
        color: STARTUP_THEME.hintColor,
      })
      .setDepth(6)
      .setOrigin(0.5);

    this.newGameButton = this.createButton("New Game", () => this.openNewGameScene(), "primary");
    this.aboutButton = this.createButton("About", () => this.openAboutScene(), "secondary");

    this.tweens.add({
      targets: this.title,
      scaleX: { from: 1, to: 1.015 },
      scaleY: { from: 1, to: 1.015 },
      duration: 2400,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: this.subtitle,
      alpha: { from: 0.8, to: 1 },
      duration: 2200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
      this.backdrop?.destroy();
    });
    this.handleResize(this.scale.gameSize);
  }

  handleResize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;
    const centerX = width / 2;
    const centerY = height / 2;

    this.backdrop?.layout(gameSize);
    this.heroPanel.setSize(Math.max(540, width * 0.5), Math.max(420, height * 0.62));
    this.heroPanel.setPosition(centerX, centerY + 10);
    this.kicker.setPosition(centerX, centerY - height * 0.2);
    this.title.setPosition(centerX, centerY - height * 0.11);
    this.subtitle.setPosition(centerX, centerY + height * 0.01);
    this.setButtonPosition(this.newGameButton, centerX, centerY + height * 0.16);
    this.setButtonPosition(this.aboutButton, centerX, centerY + height * 0.27);
    this.footerHint.setPosition(centerX, centerY + height * 0.38);
  }

  setButtonPosition(button, x, y) {
    if (!button) {
      return;
    }
    button.rectangle.setPosition(x, y);
    button.sheen.setPosition(x, y - BUTTON_HEIGHT * 0.24);
    button.label.setPosition(x, y);
  }

  createButton(label, onClick, variant) {
    const palette = resolveStartupButtonPalette(variant);
    const rectangle = this.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, palette.baseFill, 1)
      .setDepth(7)
      .setStrokeStyle(3, palette.stroke, 0.95)
      .setInteractive({ useHandCursor: true });
    const sheen = this.add.rectangle(0, 0, BUTTON_WIDTH - 10, 16, 0xffffff, 0.12).setDepth(8).setOrigin(0.5, 0.5);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: UI_FONTS.compact,
        fontSize: "29px",
        color: palette.textColor,
        fontStyle: "bold",
      })
      .setDepth(9)
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
    return {
      rectangle,
      sheen,
      label: text,
    };
  }

  openNewGameScene() {
    this.scene.start("NewGameScene");
    return true;
  }

  openAboutScene() {
    this.scene.start("AboutScene");
    return true;
  }

  testOpenNewGame() {
    return this.openNewGameScene();
  }

  testOpenAbout() {
    return this.openAboutScene();
  }

  testGetBootstrapState() {
    return {
      mode: "menu",
      options: ["new-game", "about"],
    };
  }
}
