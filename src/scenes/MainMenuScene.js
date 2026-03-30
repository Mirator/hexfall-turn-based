import Phaser from "../core/phaserRuntime.js";
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

    this.heroPanel = this.add.rectangle(0, 0, 10, 10, 0x121723, 0.54).setDepth(4);
    this.heroPanel.setStrokeStyle(3, 0xe0c98f, 0.5);

    this.kicker = this.add
      .text(0, 0, "TURN-BASED STRATEGY", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "18px",
        color: "#e8d6a8",
        letterSpacing: 4,
      })
      .setDepth(5)
      .setOrigin(0.5);

    this.title = this.add.text(0, 0, "HEXFALL", {
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "108px",
      fontStyle: "bold",
      color: "#f7e9c3",
      stroke: "#1d1a18",
      strokeThickness: 10,
      shadow: {
        color: "#000000",
        fill: true,
        blur: 14,
        stroke: true,
        offsetX: 0,
        offsetY: 6,
      },
    });
    this.title.setOrigin(0.5).setDepth(6);

    this.subtitle = this.add.text(0, 0, "Build your empire. Outmaneuver rival factions.", {
      fontFamily: "Trebuchet MS, Verdana, sans-serif",
      fontSize: "24px",
      color: "#d7e6f5",
      stroke: "#1e1a16",
      strokeThickness: 4,
      align: "center",
    });
    this.subtitle.setOrigin(0.5).setDepth(6);

    this.footerHint = this.add
      .text(0, 0, "Select an option to begin", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "18px",
        color: "#d0bf98",
      })
      .setDepth(6)
      .setOrigin(0.5);

    this.newGameButton = this.createButton("New Game", () => this.openNewGameScene(), {
      baseFill: 0x2f7f6a,
      hoverFill: 0x3f9780,
      downFill: 0x26695a,
    });
    this.aboutButton = this.createButton("About", () => this.openAboutScene(), {
      baseFill: 0x7f6041,
      hoverFill: 0x966f4a,
      downFill: 0x684e35,
    });

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

  createButton(label, onClick, palette) {
    const rectangle = this.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, palette.baseFill, 1)
      .setDepth(7)
      .setStrokeStyle(3, 0xf0ddbc, 0.95)
      .setInteractive({ useHandCursor: true });
    const sheen = this.add.rectangle(0, 0, BUTTON_WIDTH - 10, 16, 0xffffff, 0.12).setDepth(8).setOrigin(0.5, 0.5);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "29px",
        color: "#f9f2df",
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
