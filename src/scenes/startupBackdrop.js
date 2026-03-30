import Phaser from "../core/phaserRuntime.js";

const EMBER_COUNT = 30;

function drawHexOutline(graphics, centerX, centerY, radius, color, alpha) {
  graphics.lineStyle(2, color, alpha);
  graphics.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (i === 0) {
      graphics.moveTo(x, y);
    } else {
      graphics.lineTo(x, y);
    }
  }
  graphics.closePath();
  graphics.strokePath();
}

function drawDecorativeGrid(graphics, width, height) {
  const columns = 10;
  const gap = width / columns;
  graphics.lineStyle(1, 0xd7c089, 0.08);
  for (let i = 0; i <= columns; i += 1) {
    const x = Math.round(i * gap);
    graphics.beginPath();
    graphics.moveTo(x, 0);
    graphics.lineTo(x, height);
    graphics.strokePath();
  }
}

export function createStartupBackdrop(scene) {
  const gradient = scene.add.graphics().setDepth(0);
  const details = scene.add.graphics().setDepth(1);
  const vignette = scene.add.rectangle(0, 0, 10, 10, 0x07070b, 0.44).setOrigin(0, 0).setDepth(2);
  const lightA = scene.add.ellipse(0, 0, 10, 10, 0xd6bb7f, 0.1).setDepth(1);
  const lightB = scene.add.ellipse(0, 0, 10, 10, 0x6a8ba8, 0.12).setDepth(1);
  const lightC = scene.add.ellipse(0, 0, 10, 10, 0x8f5d46, 0.08).setDepth(1);

  const embers = [];
  for (let i = 0; i < EMBER_COUNT; i += 1) {
    const ember = scene.add.circle(0, 0, Phaser.Math.Between(1, 3), 0xf8e6bf, Phaser.Math.FloatBetween(0.12, 0.28)).setDepth(3);
    embers.push(ember);
  }

  const pulseTween = scene.tweens.add({
    targets: [lightA, lightB, lightC],
    alpha: { from: 0.06, to: 0.16 },
    duration: 4600,
    ease: "Sine.easeInOut",
    yoyo: true,
    repeat: -1,
    delay: (_target, index) => index * 500,
  });
  const driftTween = scene.tweens.add({
    targets: lightB,
    x: { from: 0.47, to: 0.54 },
    duration: 6200,
    ease: "Sine.easeInOut",
    repeat: -1,
    yoyo: true,
  });

  const emberTweens = embers.map((ember, index) =>
    scene.tweens.add({
      targets: ember,
      y: `-=${Phaser.Math.Between(16, 44)}`,
      alpha: { from: ember.alpha, to: 0.03 },
      duration: Phaser.Math.Between(3400, 6800),
      ease: "Sine.easeInOut",
      repeat: -1,
      yoyo: true,
      delay: index * 90,
    })
  );

  function layout(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;
    gradient.clear();
    gradient.fillGradientStyle(0x0f1622, 0x26364a, 0x3e2a1c, 0x17141f, 1);
    gradient.fillRect(0, 0, width, height);

    details.clear();
    drawDecorativeGrid(details, width, height);
    drawHexOutline(details, width * 0.18, height * 0.24, Math.max(80, width * 0.07), 0xe8d3a2, 0.1);
    drawHexOutline(details, width * 0.84, height * 0.32, Math.max(108, width * 0.09), 0xe8d3a2, 0.07);
    drawHexOutline(details, width * 0.7, height * 0.8, Math.max(74, width * 0.06), 0xd1ba88, 0.08);
    drawHexOutline(details, width * 0.32, height * 0.77, Math.max(52, width * 0.05), 0xa9bdd1, 0.09);

    vignette.setSize(width, height);
    lightA.setPosition(width * 0.3, height * 0.22);
    lightA.setSize(width * 0.58, height * 0.44);
    lightB.setPosition(width * 0.5, height * 0.58);
    lightB.setSize(width * 0.64, height * 0.54);
    lightC.setPosition(width * 0.82, height * 0.2);
    lightC.setSize(width * 0.45, height * 0.35);

    for (let i = 0; i < embers.length; i += 1) {
      const ember = embers[i];
      ember.setPosition(
        Phaser.Math.Between(Math.floor(width * 0.06), Math.floor(width * 0.94)),
        Phaser.Math.Between(Math.floor(height * 0.08), Math.floor(height * 0.92))
      );
    }
  }

  function destroy() {
    pulseTween.remove();
    driftTween.remove();
    for (const tween of emberTweens) {
      tween.remove();
    }
    gradient.destroy();
    details.destroy();
    vignette.destroy();
    lightA.destroy();
    lightB.destroy();
    lightC.destroy();
    for (const ember of embers) {
      ember.destroy();
    }
  }

  return {
    layout,
    destroy,
  };
}
