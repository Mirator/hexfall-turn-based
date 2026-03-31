import Phaser from "../core/phaserRuntime.js";
import { STARTUP_THEME, UI_FONTS, resolveStartupButtonPalette } from "../ui/theme.js";
import { createStartupBackdrop } from "./startupBackdrop.js";

export class AboutScene extends Phaser.Scene {
  constructor() {
    super("AboutScene");

    this.layoutNodes = null;
    this.backdrop = null;
  }

  create() {
    this.backdrop = createStartupBackdrop(this);

    const panel = this.add.rectangle(0, 0, 10, 10, STARTUP_THEME.panelFill, STARTUP_THEME.panelAlpha).setDepth(4);
    panel.setStrokeStyle(4, STARTUP_THEME.panelStroke, STARTUP_THEME.panelStrokeAlpha);

    const title = this.add
      .text(0, 0, "About Hexfall", {
        fontFamily: UI_FONTS.display,
        fontSize: "54px",
        color: STARTUP_THEME.titleColor,
        fontStyle: "bold",
        stroke: "#16140f",
        strokeThickness: 6,
      })
      .setDepth(5)
      .setOrigin(0.5);

    const body = this.add
      .text(0, 0, "", {
        fontFamily: UI_FONTS.body,
        fontSize: "21px",
        color: STARTUP_THEME.bodyColor,
        align: "left",
        lineSpacing: 7,
      })
      .setDepth(5)
      .setOrigin(0.5, 0);
    body.setText(
      [
        "Hexfall is a lightweight civilization-style strategy prototype.",
        "",
        "Every match starts with asymmetrical terrain and rival factions.",
        "Expand wisely, secure resources, and outmaneuver enemy empires.",
        "",
        "Core controls:",
        "- Left click to select units, move, and attack",
        "- End Turn to resolve AI actions",
        "- F to found a city with a settler",
        "- Esc for pause and New Game",
        "- V to toggle dev vision",
      ].join("\n")
    );

    const backButton = this.createButton("Back", () => this.backToMenu());

    this.layoutNodes = { panel, title, body, backButton };
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
      this.backdrop?.destroy();
    });
    this.handleResize(this.scale.gameSize);
  }

  createButton(label, onClick) {
    const palette = resolveStartupButtonPalette("secondary");
    const rectangle = this.add
      .rectangle(0, 0, 208, 54, palette.baseFill, 1)
      .setDepth(6)
      .setStrokeStyle(3, palette.stroke, 0.95)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: UI_FONTS.compact,
        fontSize: "24px",
        color: palette.textColor,
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
    const panelWidth = Math.max(600, Math.min(820, width - 90));
    const panelHeight = Math.max(470, Math.min(600, height - 80));

    this.backdrop?.layout(gameSize);
    this.layoutNodes.panel.setSize(panelWidth, panelHeight);
    this.layoutNodes.panel.setPosition(centerX, centerY);
    this.layoutNodes.title.setPosition(centerX, centerY - panelHeight * 0.37);
    this.layoutNodes.body.setPosition(centerX, centerY - panelHeight * 0.23);
    this.layoutNodes.body.setWordWrapWidth(panelWidth - 120);
    this.layoutNodes.backButton.rectangle.setPosition(centerX, centerY + panelHeight * 0.39);
    this.layoutNodes.backButton.label.setPosition(centerX, centerY + panelHeight * 0.39);
  }

  backToMenu() {
    this.scene.start("MainMenuScene");
    return true;
  }

  testBackToMenu() {
    return this.backToMenu();
  }

  testGetBootstrapState() {
    return {
      mode: "about",
    };
  }
}
