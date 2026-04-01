import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 4173;
const URL = `http://${HOST}:${PORT}`;
const ARTIFACT_DIR = "tests/e2e/artifacts";
const PERF_ARTIFACT_PATH = `${ARTIFACT_DIR}/perf.json`;
const PERF_TARGET_BUDGET = { p95Ms: 18, maxMs: 40 };

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

function normalizePerfStats(stats) {
  if (!stats || typeof stats !== "object") {
    return null;
  }
  const frameMs = stats.frameMs ?? {};
  if (!Number.isFinite(frameMs.avg) || !Number.isFinite(frameMs.p50) || !Number.isFinite(frameMs.p95) || !Number.isFinite(frameMs.max)) {
    return null;
  }
  return {
    sampleCount: Number(stats.sampleCount ?? 0),
    estimatedFps: Number(stats.estimatedFps ?? 0),
    frameMs: {
      avg: Number(frameMs.avg),
      p50: Number(frameMs.p50),
      p95: Number(frameMs.p95),
      max: Number(frameMs.max),
    },
    longFrames: {
      over18ms: Number(stats.longFrames?.over18ms ?? 0),
      over40ms: Number(stats.longFrames?.over40ms ?? 0),
    },
    publishCounters: {
      state: Number(stats.publishCounters?.state ?? 0),
      camera: Number(stats.publishCounters?.camera ?? 0),
      preview: Number(stats.publishCounters?.preview ?? 0),
    },
    map: {
      width: Number(stats.map?.width ?? 0),
      height: Number(stats.map?.height ?? 0),
      aiFactionCount: Number(stats.map?.aiFactionCount ?? 0),
    },
  };
}

async function run() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const viteCliPath = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteCliPath, "--host", HOST, "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  let browser = null;
  let cleanedUp = false;

  const forceKillPid = (pid) => {
    if (!pid) {
      return;
    }
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      // Best-effort cleanup only.
    }
  };

  const forceKillHeadlessBrowsers = () => {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/IM", "chrome-headless-shell.exe", "/T", "/F"], { stdio: "ignore" });
        return;
      }
      spawnSync("pkill", ["-f", "chrome-headless-shell"], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup only.
    }
  };

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Best-effort cleanup only.
      } finally {
        browser = null;
      }
    }
    forceKillHeadlessBrowsers();

    if (server.pid) {
      try {
        server.kill("SIGTERM");
      } catch {
        // Best-effort cleanup only.
      }
      await delay(250);
      if (!server.killed) {
        forceKillPid(server.pid);
      }
    }
  };

  const onSignal = (signal) => {
    cleanup()
      .catch(() => {
        // Best-effort cleanup only.
      })
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  try {
    await waitForServer(URL);

    browser = await chromium.launch({
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    });
    const page = await browser.newPage();
    const consoleErrors = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(String(error));
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.waitForSelector("#unsupported-viewport-banner", { state: "visible" });
    const unsupportedBannerText = await page.locator("#unsupported-viewport-banner").innerText();
    assert.ok(unsupportedBannerText.includes("768"), "unsupported banner should include minimum supported width");

    const unsupportedSnapshot = await page.evaluate(() => ({
      mode: window.__hexfallTest.getState().mode,
      canvasCount: document.querySelectorAll("canvas").length,
      bannerVisible: !document.getElementById("unsupported-viewport-banner")?.hidden,
    }));
    assert.equal(unsupportedSnapshot.mode, "unsupported", "phone viewport should remain unsupported");
    assert.equal(unsupportedSnapshot.canvasCount, 0, "phone viewport should not initialize gameplay canvas");
    assert.equal(unsupportedSnapshot.bannerVisible, true, "unsupported banner should be visible on phone viewport");

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForFunction(() => document.getElementById("unsupported-viewport-banner")?.hidden === true);
    await page.waitForSelector("canvas", { state: "visible" });
    await page.waitForFunction(() => window.__hexfallTest.getState()?.mode === "menu");
    await page.waitForTimeout(700);
    const tabletBootstrapState = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(tabletBootstrapState.mode, "menu", "tablet viewport should land on the startup menu");

    const openedAbout = await page.evaluate(() => window.__hexfallTest.openMainMenuAbout());
    assert.equal(openedAbout, true, "about flow failed: open-about-failed");
    await page.waitForFunction(() => window.__hexfallTest.getState()?.mode === "about");

    const closedAbout = await page.evaluate(() => window.__hexfallTest.closeAboutToMainMenu());
    assert.equal(closedAbout, true, "about flow failed: close-about-failed");
    await page.waitForFunction(() => window.__hexfallTest.getState()?.mode === "menu");

    const openedNewGame = await page.evaluate(() => window.__hexfallTest.openMainMenuNewGame());
    assert.equal(openedNewGame, true, "startup flow failed: open-new-game-failed");
    await page.waitForFunction(() => window.__hexfallTest.getState()?.mode === "new-game");

    const startupConfigResult = await page.evaluate(() => {
      const mapSize = window.__hexfallTest.setStartupNewGameMapSize(16);
      const aiCount = window.__hexfallTest.setStartupNewGameAiFactionCount(2);
      if (mapSize !== 16 || aiCount !== 2) {
        return { ok: false, reason: "new-game-config-controls-failed" };
      }
      const configuredState = window.__hexfallTest.getStartupNewGameState();
      if (!configuredState || configuredState.mapSize !== 16 || configuredState.aiFactionCount !== 2) {
        return { ok: false, reason: "new-game-config-state-invalid" };
      }
      if (!window.__hexfallTest.startStartupNewGame()) {
        return { ok: false, reason: "start-new-game-failed" };
      }
      return { ok: true };
    });
    assert.equal(startupConfigResult.ok, true, `startup flow failed: ${startupConfigResult.reason}`);

    await page.waitForFunction(() => {
      const state = window.__hexfallTest.getState();
      return (
        state?.mode !== "loading" &&
        state?.mode !== "unsupported" &&
        state?.mode !== "menu" &&
        state?.mode !== "new-game" &&
        state?.mode !== "about"
      );
    });
    const tabletGameplayState = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(tabletGameplayState.turn, 1, "tablet viewport should enter active gameplay after startup flow");
    assert.equal(tabletGameplayState.match?.status, "ongoing", "tablet viewport should enter normal match flow");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(220);

    const initialState = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(initialState.turn, 1, "initial turn should be 1");
    assert.equal(initialState.match.status, "ongoing", "match should begin ongoing");
    assert.equal(initialState.uiActions.canRestart, true, "new game action should be available during gameplay");
    assert.equal(initialState.map.width, 16, "map width should be 16");
    assert.equal(initialState.map.height, 16, "map height should be 16");
    assert.equal(initialState.matchConfig?.mapWidth, 16, "match config should report map width 16");
    assert.equal(initialState.matchConfig?.mapHeight, 16, "match config should report map height 16");
    assert.equal(initialState.matchConfig?.aiFactionCount, 2, "match config should default to two AI factions");
    assert.deepEqual(initialState.factions?.aiOwners ?? [], ["enemy", "purple"], "default AI roster should remain enemy + purple");
    assert.equal(initialState.factions?.allOwners?.length, 3, "all owners should include player plus two AI owners");
    const initialPlayerSettlers = initialState.units.filter((unit) => unit.owner === "player" && unit.type === "settler");
    const initialEnemySettlers = initialState.units.filter((unit) => unit.owner === "enemy" && unit.type === "settler");
    const initialPurpleSettlers = initialState.units.filter((unit) => unit.owner === "purple" && unit.type === "settler");
    assert.equal(initialPlayerSettlers.length, 1, "player should start with one settler");
    assert.equal(initialEnemySettlers.length, 1, "enemy should start with one settler");
    assert.equal(initialPurpleSettlers.length, 1, "purple should start with one settler");
    assert.equal(initialState.units.some((unit) => unit.type === "warrior"), false, "no warriors at match start");
    assert.equal(initialState.contextMenu?.type, "none", "context menu should be hidden before selection");
    assert.equal(initialState.uiPreview?.mode ?? "none", "none", "preview should be empty without hover selection");
    assert.equal(initialState.uiNotificationFilter, "All", "notification filter should default to All");
    assert.ok(initialState.uiTurnAssistant, "turn assistant payload should exist");
    assert.ok(Number.isFinite(initialState.uiTurnAssistant.readyUnits), "turn assistant should expose readyUnits breakdown");
    assert.ok(Number.isFinite(initialState.uiTurnAssistant.emptyQueues), "turn assistant should expose emptyQueues breakdown");
    assert.ok(initialState.uiTurnForecast, "turn forecast payload should exist");
    assert.equal(initialState.uiStatsPanelOpen, false, "stats drawer should default closed");
    assert.ok(initialState.uiStats, "stats payload should be present");
    assert.ok(initialState.mapWorldBounds, "map world bounds payload should exist");
    assert.ok(initialState.cameraViewportWorld, "camera viewport payload should exist");
      assert.ok(initialState.hudTopLeft?.resources?.food, "top-left food resource display should exist");
      assert.ok(initialState.hudTopLeft?.resources?.production, "top-left production resource display should exist");
      assert.ok(initialState.hudTopLeft?.resources?.science, "top-left science resource display should exist");
      assert.equal(
        Object.keys(initialState.research?.progressByTech ?? {}).length,
        14,
        "research tree should expose 14-tech progress map"
      );
      assert.ok(initialState.research?.boostProgressByTech?.writing, "research payload should expose boost progress details");
      assert.ok(
        !("scienceStock" in (initialState.economy?.player ?? {})),
        "player economy should no longer expose science stockpile field"
      );
      assert.equal(initialState.devVisionEnabled, false, "dev vision should default to off");
      assert.ok(initialState.ai?.enemy?.personality, "enemy AI personality payload should exist");
      assert.ok(initialState.ai?.purple?.personality, "purple AI personality payload should exist");
    assert.ok(initialState.visibility?.byOwner?.player, "player visibility payload should exist");

    const playerVisibleSet = new Set(initialState.visibility.byOwner.player.visibleHexes ?? []);
    const playerExploredCount = initialState.visibility.byOwner.player.exploredHexes?.length ?? 0;
    const totalHexCount = initialState.map.width * initialState.map.height;
    assert.ok(playerVisibleSet.size > 0, "player should see at least one tile");
    assert.ok(playerVisibleSet.size < totalHexCount, "fog should hide parts of the map initially");
    assert.ok(playerExploredCount >= playerVisibleSet.size, "explored tiles should include currently visible tiles");

    const hostileHiddenCount = initialState.units.filter((unit) => unit.owner !== "player").filter((unit) => !playerVisibleSet.has(`${unit.q},${unit.r}`)).length;
    assert.ok(hostileHiddenCount >= 1, "at least one hostile unit should start hidden by fog");
    const spriteLayerCounts = await page.evaluate(() => window.__hexfallTest.getSpriteLayerCounts());
    assert.ok((spriteLayerCounts?.terrain ?? 0) > 0, "terrain sprite layer should be populated");
    assert.ok((spriteLayerCounts?.units ?? 0) >= 1, "unit sprite layer should be populated");
    assert.ok((spriteLayerCounts?.cities ?? 0) >= 0, "city sprite layer payload should exist");

    const enemyVisibleBeforeDev = [...(initialState.visibility.byOwner.enemy.visibleHexes ?? [])];
    await page.keyboard.press("KeyV");
    await page.waitForTimeout(90);
    const withDevVision = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(withDevVision.devVisionEnabled, true, "V should toggle dev vision on");
    assert.deepEqual(
      withDevVision.visibility?.byOwner?.enemy?.visibleHexes ?? [],
      enemyVisibleBeforeDev,
      "player dev reveal should not alter AI fog visibility"
    );
    const spriteLayerCountsWithDevVision = await page.evaluate(() => window.__hexfallTest.getSpriteLayerCounts());
    const unitSamples = spriteLayerCountsWithDevVision?.unitSamples ?? [];
    assert.ok(unitSamples.length >= 3, "unit sprite diagnostics should include visible faction samples");
    assert.ok(
      unitSamples.every(
        (sample) =>
          sample &&
          Number.isFinite(sample.displayWidth) &&
          Number.isFinite(sample.displayHeight) &&
          Math.abs(sample.displayWidth - 40) < 0.01 &&
          Math.abs(sample.displayHeight - 40) < 0.01
      ),
      "unit sprites should render with 40x40 base display size"
    );
    assert.ok(
      unitSamples.every((sample) => /^unit-(warrior|settler|spearman|archer)$/.test(String(sample.textureKey ?? ""))),
      "shared unit textures should resolve to type-only keys"
    );
    const tintByOwner = new Map();
    for (const sample of unitSamples) {
      if (!sample?.owner || !Number.isFinite(sample.tint) || tintByOwner.has(sample.owner)) {
        continue;
      }
      tintByOwner.set(sample.owner, sample.tint >>> 0);
    }
    const knownOwnersWithTint = ["player", "enemy", "purple"].filter((owner) => tintByOwner.has(owner));
    assert.ok(knownOwnersWithTint.length >= 2, "at least two factions should expose tinted sprite samples");
    const uniqueTintCount = new Set(knownOwnersWithTint.map((owner) => tintByOwner.get(owner))).size;
    assert.ok(uniqueTintCount >= 2, "different factions should use different runtime unit tints");
    await page.keyboard.press("KeyV");
    await page.waitForTimeout(90);
    const withoutDevVision = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(withoutDevVision.devVisionEnabled, false, "V should toggle dev vision off");

    const expandedRosterResult = await page.evaluate(async () => {
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const getState = () => window.__hexfallTest.getState();

      if (!window.__hexfallTest.openPauseMenu() || !window.__hexfallTest.openRestartConfirm()) {
        return { ok: false, reason: "new-game-modal-open-failed" };
      }
      if (!window.__hexfallTest.setNewGameMapSize(24) || window.__hexfallTest.setNewGameAiFactionCount(6) !== 6) {
        return { ok: false, reason: "new-game-config-controls-failed" };
      }
      const configuredModal = window.__hexfallTest.getRestartModalState();
      if (!configuredModal?.open || configuredModal.mapSize !== 24 || configuredModal.aiFactionCount !== 6) {
        return { ok: false, reason: "new-game-config-state-invalid" };
      }

      if (!window.__hexfallTest.confirmRestartConfirm()) {
        return { ok: false, reason: "new-game-confirm-failed" };
      }

      let expandedState = null;
      for (let i = 0; i < 70; i += 1) {
        await pause(40);
        const state = getState();
        if (state.map?.width === 24 && state.map?.height === 24 && (state.factions?.aiOwners?.length ?? 0) === 6) {
          expandedState = state;
          break;
        }
      }
      if (!expandedState) {
        return { ok: false, reason: "expanded-roster-state-timeout" };
      }

      const allOwners = expandedState.factions?.allOwners ?? [];
      for (const owner of allOwners) {
        if (!expandedState.ai?.byOwner?.[owner] && owner !== expandedState.factions?.playerOwner) {
          return { ok: false, reason: `missing-ai-by-owner-${owner}` };
        }
        if (!expandedState.economy?.byOwner?.[owner]) {
          return { ok: false, reason: `missing-economy-by-owner-${owner}` };
        }
        if (!expandedState.visibility?.byOwner?.[owner]) {
          return { ok: false, reason: `missing-visibility-by-owner-${owner}` };
        }
      }
      const aiSettlers = expandedState.units.filter(
        (unit) => expandedState.factions.aiOwners.includes(unit.owner) && unit.type === "settler"
      );
      if (aiSettlers.length !== expandedState.factions.aiOwners.length) {
        return { ok: false, reason: "expanded-roster-settler-count-invalid" };
      }

      if (!window.__hexfallTest.openPauseMenu() || !window.__hexfallTest.openRestartConfirm()) {
        return { ok: false, reason: "reset-to-default-open-failed" };
      }
      if (!window.__hexfallTest.setNewGameMapSize(16) || window.__hexfallTest.setNewGameAiFactionCount(2) !== 2) {
        return { ok: false, reason: "reset-to-default-config-failed" };
      }
      if (!window.__hexfallTest.confirmRestartConfirm()) {
        return { ok: false, reason: "reset-to-default-confirm-failed" };
      }

      for (let i = 0; i < 70; i += 1) {
        await pause(40);
        const state = getState();
        if (state.map?.width === 16 && state.map?.height === 16 && (state.factions?.aiOwners?.length ?? 0) === 2) {
          return { ok: true };
        }
      }
      return { ok: false, reason: "reset-to-default-timeout" };
    });
    assert.equal(expandedRosterResult.ok, true, `expanded roster scenario failed: ${expandedRosterResult.reason}`);

    const scenarioResult = await page.evaluate(async () => {
      const getState = () => window.__hexfallTest.getState();
      const getUnit = (state, owner, type) => state.units.find((unit) => unit.owner === owner && unit.type === type);
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const initial = getState();
      const playerSettler = getUnit(initial, "player", "settler");
      if (!playerSettler) {
        return { ok: false, reason: "missing-player-settler" };
      }
      const polishInitial = window.__hexfallTest.getHudPolishState();
      if (!polishInitial?.forecast?.visible || !String(polishInitial?.forecast?.linePrimary ?? "").includes("Net:")) {
        return { ok: false, reason: "turn-forecast-card-missing" };
      }
      if (polishInitial?.stats?.open) {
        return { ok: false, reason: "stats-panel-should-start-hidden" };
      }
      if (window.__hexfallTest.toggleStatsPanel() !== true) {
        return { ok: false, reason: "stats-panel-toggle-open-failed" };
      }
      const polishStatsOpen = window.__hexfallTest.getHudPolishState();
      if (!polishStatsOpen?.stats?.open || !Number.isFinite(polishStatsOpen?.stats?.payload?.cities)) {
        return { ok: false, reason: "stats-panel-open-payload-invalid" };
      }
      if (window.__hexfallTest.toggleStatsPanel() !== false || window.__hexfallTest.getHudPolishState()?.stats?.open) {
        return { ok: false, reason: "stats-panel-toggle-close-failed" };
      }
      const techTreeInitial = window.__hexfallTest.getTechTreeModalState();
      if (techTreeInitial?.open) {
        return { ok: false, reason: "tech-tree-modal-should-start-hidden" };
      }
      if (window.__hexfallTest.toggleTechTreeModal() !== true) {
        return { ok: false, reason: "tech-tree-modal-toggle-open-failed" };
      }
      const techTreeOpen = window.__hexfallTest.getTechTreeModalState();
      const graphNodes = techTreeOpen?.graph?.nodes ?? [];
      const graphEdges = techTreeOpen?.graph?.edges ?? [];
      const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
      const hasEdge = (from, to) => graphEdges.some((edge) => edge?.from === from && edge?.to === to);
      if (
        !techTreeOpen?.open ||
        !Number.isFinite(techTreeOpen?.summary?.sciencePerTurn) ||
        !Array.isArray(techTreeOpen?.rows) ||
        techTreeOpen.rows.length !== 14 ||
        techTreeOpen.rows.some((row, index) => row?.id !== [
          "pottery",
          "mining",
          "writing",
          "bronzeWorking",
          "archery",
          "masonry",
          "engineering",
          "mathematics",
          "education",
          "civilService",
          "machinery",
          "astronomy",
          "chemistry",
          "scientificMethod",
        ][index])
      ) {
        return { ok: false, reason: "tech-tree-modal-open-payload-invalid" };
      }
      if (!Array.isArray(graphNodes) || graphNodes.length !== 14 || !Array.isArray(graphEdges) || graphEdges.length === 0) {
        return { ok: false, reason: "tech-tree-graph-missing-nodes-or-edges" };
      }
      if (!hasEdge("pottery", "writing") || !hasEdge("education", "chemistry")) {
        return { ok: false, reason: "tech-tree-graph-missing-known-edge" };
      }
      const writingNode = graphNodeById.get("writing");
      const potteryNode = graphNodeById.get("pottery");
      const chemistryNode = graphNodeById.get("chemistry");
      const educationNode = graphNodeById.get("education");
      if (
        !writingNode ||
        !potteryNode ||
        !chemistryNode ||
        !educationNode ||
        writingNode.lane !== 1 ||
        chemistryNode.lane !== 3 ||
        !(potteryNode.x < writingNode.x) ||
        !(educationNode.x < chemistryNode.x)
      ) {
        return { ok: false, reason: "tech-tree-graph-lane-or-depth-order-invalid" };
      }
      if (!Number.isFinite(techTreeOpen?.graph?.contentWidth) || !Number.isFinite(techTreeOpen?.graph?.viewport?.width)) {
        return { ok: false, reason: "tech-tree-graph-viewport-missing" };
      }
      const scrollBefore = Number(techTreeOpen?.graph?.scrollX ?? 0);
      const scrolled = Number(window.__hexfallTest.scrollTechTreeGraph(240));
      const techTreeAfterScroll = window.__hexfallTest.getTechTreeModalState();
      const scrollAfter = Number(techTreeAfterScroll?.graph?.scrollX ?? 0);
      if (!Number.isFinite(scrolled) || !Number.isFinite(scrollAfter) || scrollAfter < scrollBefore) {
        return { ok: false, reason: "tech-tree-graph-scroll-failed" };
      }
      if (window.__hexfallTest.requestEndTurn()) {
        return { ok: false, reason: "tech-tree-modal-should-block-end-turn" };
      }
      if (window.__hexfallTest.toggleTechTreeModal() !== false || window.__hexfallTest.getTechTreeModalState()?.open) {
        return { ok: false, reason: "tech-tree-modal-toggle-close-failed" };
      }
      if (!polishInitial?.minimap?.visible || (polishInitial?.minimap?.viewportBoundarySegments ?? 0) < 6) {
        return { ok: false, reason: "minimap-or-viewport-outline-not-visible" };
      }
      const viewport = getState().cameraViewportWorld ?? { width: window.innerWidth, height: window.innerHeight };
      const isInside = (bounds) =>
        bounds &&
        Number.isFinite(bounds.x) &&
        Number.isFinite(bounds.y) &&
        Number.isFinite(bounds.width) &&
        Number.isFinite(bounds.height) &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y + bounds.height <= viewport.height;
      if (!isInside(polishInitial?.forecast?.bounds) || !isInside(polishInitial?.minimap?.bounds)) {
        return { ok: false, reason: "new-hud-panels-overflow-viewport" };
      }
      const focusBeforeMinimap = getState().cameraFocusHex;
      if (!window.__hexfallTest.clickMinimapNormalized(0.72, 0.68)) {
        return { ok: false, reason: "minimap-click-focus-failed" };
      }
      await pause(80);
      const focusAfterMinimap = getState().cameraFocusHex;
      if (!focusAfterMinimap) {
        return { ok: false, reason: "minimap-click-did-not-update-camera-focus" };
      }
      if (
        focusBeforeMinimap &&
        focusAfterMinimap.q === focusBeforeMinimap.q &&
        focusAfterMinimap.r === focusBeforeMinimap.r
      ) {
        return { ok: false, reason: "minimap-click-did-not-change-focus-target" };
      }
      const validateMinimapFootprint = (label) => {
        const minimap = window.__hexfallTest.getHudPolishState()?.minimap;
        if (!minimap?.visible) {
          return { ok: false, reason: `${label}-minimap-not-visible` };
        }
        const bounds = minimap.bounds;
        const footprint = minimap.viewportFootprint;
        if (!bounds || !footprint) {
          return { ok: false, reason: `${label}-missing-minimap-footprint` };
        }
        if ((minimap.viewportBoundarySegments ?? 0) < 6) {
          return { ok: false, reason: `${label}-viewport-outline-segments-too-low` };
        }
        if (
          footprint.x < bounds.x - 0.5 ||
          footprint.y < bounds.y - 0.5 ||
          footprint.x + footprint.width > bounds.x + bounds.width + 0.5 ||
          footprint.y + footprint.height > bounds.y + bounds.height + 0.5
        ) {
          return { ok: false, reason: `${label}-viewport-footprint-outside-minimap-bounds` };
        }
        const coverage = (footprint.width * footprint.height) / Math.max(1, bounds.width * bounds.height);
        if (coverage < 0.02) {
          return { ok: false, reason: `${label}-viewport-footprint-collapsed` };
        }
        if (coverage > 0.88) {
          return { ok: false, reason: `${label}-viewport-footprint-inflated` };
        }
        return { ok: true, coverage };
      };

      const mapWidth = getState().map?.width ?? 0;
      const mapHeight = getState().map?.height ?? 0;
      const footprintSamples = [];
      const focusTargets = [
        { label: "center", q: Math.floor((mapWidth - 1) / 2), r: Math.floor((mapHeight - 1) / 2) },
        { label: "top-right", q: mapWidth - 1, r: 0 },
        { label: "bottom-left", q: 0, r: mapHeight - 1 },
      ];
      for (const target of focusTargets) {
        if (!window.__hexfallTest.focusMinimapHex(target.q, target.r)) {
          return { ok: false, reason: `${target.label}-minimap-focus-request-failed` };
        }
        await pause(120);
        const footprintValidation = validateMinimapFootprint(target.label);
        if (!footprintValidation.ok) {
          return footprintValidation;
        }
        footprintSamples.push(footprintValidation.coverage);
      }

      if (!window.__hexfallTest.focusMinimapHex(mapWidth + 8, mapHeight + 8)) {
        return { ok: false, reason: "map-edge-clamp-focus-request-failed" };
      }
      await pause(120);
      const clampedFocus = getState().cameraFocusHex;
      if (!clampedFocus || clampedFocus.q !== mapWidth - 1 || clampedFocus.r !== mapHeight - 1) {
        return { ok: false, reason: "map-edge-clamp-focus-invalid" };
      }
      const clampedValidation = validateMinimapFootprint("edge-clamp");
      if (!clampedValidation.ok) {
        return clampedValidation;
      }
      footprintSamples.push(clampedValidation.coverage);
      const minCoverage = Math.min(...footprintSamples);
      const maxCoverage = Math.max(...footprintSamples);
      if (maxCoverage - minCoverage > 0.75) {
        return { ok: false, reason: "minimap-viewport-coverage-variance-too-high" };
      }

      // Top HUD controls + Pause + New Game modal sanity check.
      const topHudControls = window.__hexfallTest.getTopHudControlsState();
      if (
        !topHudControls?.techTreeVisible ||
        !topHudControls?.statsVisible ||
        !topHudControls?.menuVisible ||
        String(topHudControls?.techTreeLabel ?? "") !== "Tech Tree" ||
        String(topHudControls?.statsLabel ?? "") !== "Stats" ||
        String(topHudControls?.menuLabel ?? "") !== "Menu" ||
        topHudControls?.hasHudSfxButton !== false
      ) {
        return { ok: false, reason: "top-hud-controls-invalid-for-menu-sfx-rework" };
      }
      if (
        Math.abs(Number(topHudControls?.techTreeWidth ?? 0) - Number(topHudControls?.statsWidth ?? 0)) > 0.1 ||
        Math.abs(Number(topHudControls?.statsWidth ?? 0) - Number(topHudControls?.menuWidth ?? 0)) > 0.1
      ) {
        return { ok: false, reason: "top-hud-controls-width-mismatch" };
      }
      const techTreeCenterX = Number(topHudControls?.techTreeBounds?.x) + Number(topHudControls?.techTreeBounds?.width) / 2;
      const statsCenterX = Number(topHudControls?.statsBounds?.x) + Number(topHudControls?.statsBounds?.width) / 2;
      const menuCenterX = Number(topHudControls?.menuBounds?.x) + Number(topHudControls?.menuBounds?.width) / 2;
      if (
        !Number.isFinite(techTreeCenterX) ||
        !Number.isFinite(statsCenterX) ||
        !Number.isFinite(menuCenterX) ||
        !(techTreeCenterX < statsCenterX && statsCenterX < menuCenterX)
      ) {
        return { ok: false, reason: "top-hud-button-order-invalid" };
      }
      const statsTop = Number(topHudControls?.statsBounds?.y);
      const techTreeTop = Number(topHudControls?.techTreeBounds?.y);
      const menuTop = Number(topHudControls?.menuBounds?.y);
      const devVisionTop = Number(topHudControls?.devVisionBounds?.y);
      const devVisionHeight = Number(topHudControls?.devVisionBounds?.height);
      const devVisionBottom = devVisionTop + devVisionHeight;
      if (
        !Number.isFinite(techTreeTop) ||
        !Number.isFinite(statsTop) ||
        !Number.isFinite(menuTop) ||
        !Number.isFinite(devVisionBottom) ||
        Math.abs(techTreeTop - statsTop) > 0.5 ||
        Math.abs(statsTop - menuTop) > 0.5 ||
        devVisionBottom > Math.min(techTreeTop, statsTop, menuTop) - 1
      ) {
        return { ok: false, reason: "dev-vision-overlaps-top-hud-buttons" };
      }
      if (!window.__hexfallTest.setNotificationFilter("Combat")) {
        return { ok: false, reason: "notification-filter-combat-empty-state-failed" };
      }
      const combatFeed = window.__hexfallTest.getNotificationCenterState();
      if (
        (combatFeed?.filteredCount ?? -1) !== 0 ||
        !combatFeed?.emptyStateVisible ||
        !String(combatFeed?.emptyStateText ?? "").toLowerCase().includes("no combat") ||
        Number(combatFeed?.panelHeight ?? 0) < 120
      ) {
        return { ok: false, reason: "notification-empty-state-not-visible" };
      }
      window.__hexfallTest.setNotificationFilter("All");

      const pauseOpened = window.__hexfallTest.openHudMenu();
      const pauseMenu = window.__hexfallTest.getPauseMenuState();
      if (
        !pauseOpened ||
        !pauseMenu?.open ||
        !pauseMenu?.settingsVisible ||
        !pauseMenu?.sfxVisible ||
        !pauseMenu?.sfxEnabled ||
        !String(pauseMenu?.sfxLabel ?? "").includes("SFX")
      ) {
        return { ok: false, reason: "pause-menu-broken" };
      }

      const openedConfirm = window.__hexfallTest.openRestartConfirm();
      const restartModal = window.__hexfallTest.getRestartModalState();
      if (
        !openedConfirm ||
        !restartModal?.open ||
        !restartModal?.confirmVisible ||
        !restartModal?.cancelVisible ||
        restartModal.confirmDepth <= restartModal.panelDepth
      ) {
        return { ok: false, reason: "new-game-modal-broken" };
      }
      window.__hexfallTest.cancelRestartConfirm();
      if (window.__hexfallTest.getRestartModalState()?.open) {
        return { ok: false, reason: "new-game-modal-did-not-close" };
      }
      window.__hexfallTest.closePauseMenu();
      if (window.__hexfallTest.getPauseMenuState()?.open) {
        return { ok: false, reason: "pause-menu-did-not-close" };
      }
      const initialSfxState = window.__hexfallTest.getSfxState();
      if (!initialSfxState || initialSfxState.muted !== false || !String(initialSfxState.label ?? "").includes("SFX")) {
        return { ok: false, reason: "initial-sfx-state-invalid" };
      }
      const mutedSfx = window.__hexfallTest.toggleSfxMute();
      if (mutedSfx !== true) {
        return { ok: false, reason: "failed-to-mute-sfx" };
      }
      const unmutedSfx = window.__hexfallTest.toggleSfxMute();
      if (unmutedSfx !== false) {
        return { ok: false, reason: "failed-to-unmute-sfx" };
      }

      // Found player city.
      window.__hexfallTest.selectUnit(playerSettler.id);
      const selectedSettlerState = getState();
      const reachablePreviewHex = selectedSettlerState.reachableHexes.find((hex) => (hex.cost ?? 0) > 0);
      if (!reachablePreviewHex) {
        return { ok: false, reason: "missing-reachable-hex-for-preview" };
      }
      if (!window.__hexfallTest.hoverHex(reachablePreviewHex.q, reachablePreviewHex.r)) {
        return { ok: false, reason: "hover-hex-hook-failed" };
      }
      const movePreview = window.__hexfallTest.getActionPreviewState();
      if (
        movePreview?.mode !== "move" ||
        movePreview.q !== reachablePreviewHex.q ||
        movePreview.r !== reachablePreviewHex.r
      ) {
        return { ok: false, reason: "move-preview-missing-or-invalid" };
      }

      const turnAssistantBeforeFound = window.__hexfallTest.getTurnAssistantState();
      if (!turnAssistantBeforeFound || turnAssistantBeforeFound.readyCount < 1) {
        return { ok: false, reason: "turn-assistant-ready-count-invalid" };
      }
      if (!Number.isFinite(turnAssistantBeforeFound.readyUnits) || !Number.isFinite(turnAssistantBeforeFound.emptyQueues)) {
        return { ok: false, reason: "turn-assistant-breakdown-fields-missing" };
      }
      if (!window.__hexfallTest.focusAttention("ready")) {
        return { ok: false, reason: "focus-attention-ready-failed" };
      }
      const focusedReadyState = getState();
      if (!focusedReadyState.selectedUnitId) {
        return { ok: false, reason: "focus-attention-ready-did-not-select-unit" };
      }
      if (!window.__hexfallTest.nextReadyUnit()) {
        return { ok: false, reason: "next-ready-unit-action-failed" };
      }

      const founded = window.__hexfallTest.triggerUnitAction("foundCity");
      if (!founded) {
        return { ok: false, reason: "player-founding-failed" };
      }
      if (getState().cities.filter((city) => city.owner === "player").length !== 1) {
        return { ok: false, reason: "player-city-missing" };
      }
      const cityPanel = window.__hexfallTest.getCityPanelState();
      if (!cityPanel?.visible || cityPanel.mode !== "city") {
        return { ok: false, reason: "city-panel-not-visible-after-founding" };
      }
      if (!cityPanel.expanded) {
        return { ok: false, reason: "city-panel-should-auto-expand-on-selection" };
      }
      for (let i = 0; i < 40; i += 1) {
        if (!getState().animationState?.busy) {
          break;
        }
        await pause(40);
      }
      if (!window.__hexfallTest.focusAttention("queue")) {
        return { ok: false, reason: "focus-attention-queue-failed" };
      }
      const focusedQueueState = getState();
      if (!focusedQueueState.selectedCityId) {
        return { ok: false, reason: "focus-attention-queue-did-not-select-city" };
      }
      const pinned = window.__hexfallTest.setContextPanelPinned(true);
      const pinnedState = window.__hexfallTest.getCityPanelState();
      if (!pinned || !pinnedState?.pinned) {
        return { ok: false, reason: "context-panel-pin-failed" };
      }

      if (!window.__hexfallTest.setNotificationFilter("City")) {
        return { ok: false, reason: "notification-filter-city-failed" };
      }
      const cityFeed = window.__hexfallTest.getNotificationCenterState();
      if ((cityFeed?.filteredCount ?? 0) < 1) {
        return { ok: false, reason: "notification-city-filter-empty" };
      }
      if (!(cityFeed?.entries ?? []).every((entry) => Object.prototype.hasOwnProperty.call(entry, "unread"))) {
        return { ok: false, reason: "notification-unread-metadata-missing" };
      }
      const hasNotificationCardMetadata = (cityFeed?.visibleRows ?? []).some(
        (row) => row.kind === "entry" && typeof row.category === "string" && typeof row.focusable === "boolean"
      );
      if (!hasNotificationCardMetadata) {
        return { ok: false, reason: "notification-card-metadata-missing" };
      }
      if (!window.__hexfallTest.focusNotification(0)) {
        return { ok: false, reason: "notification-focus-failed" };
      }
      const focusState = getState();
      if (!focusState.cameraFocusHex) {
        return { ok: false, reason: "camera-focus-payload-missing-after-notification-focus" };
      }

      const cycledResearch = window.__hexfallTest.cycleResearch();
      if (!cycledResearch) {
        return { ok: false, reason: "research-cycle-for-nonfocus-notification-failed" };
      }
      if (!window.__hexfallTest.setNotificationFilter("Research")) {
        return { ok: false, reason: "notification-filter-research-failed" };
      }
      const researchFeedBefore = window.__hexfallTest.getNotificationCenterState();
      if ((researchFeedBefore?.filteredCount ?? 0) < 1) {
        return { ok: false, reason: "notification-research-filter-empty" };
      }
      const noMapFocusWarningBefore = (researchFeedBefore?.entries ?? []).filter((entry) =>
        String(entry.message ?? "").includes("This notification has no map focus target.")
      ).length;
      const clickedNonFocusRow = window.__hexfallTest.clickNotificationRow(0);
      if (clickedNonFocusRow !== false) {
        return { ok: false, reason: "non-focus-notification-row-should-not-trigger-focus" };
      }
      const researchFeedAfter = window.__hexfallTest.getNotificationCenterState();
      const noMapFocusWarningAfter = (researchFeedAfter?.entries ?? []).filter((entry) =>
        String(entry.message ?? "").includes("This notification has no map focus target.")
      ).length;
      if (noMapFocusWarningAfter !== noMapFocusWarningBefore) {
        return { ok: false, reason: "non-focus-notification-click-created-warning" };
      }
      window.__hexfallTest.setNotificationFilter("All");

      // Tabs + typed queue flow.
      const switchedToBuildings = window.__hexfallTest.setCityProductionTab("buildings");
      if (switchedToBuildings !== "buildings") {
        return { ok: false, reason: "city-tab-switch-buildings-failed" };
      }

      const queueAfterBuildingAdd = window.__hexfallTest.enqueueCityBuilding("granary");
      if (!Array.isArray(queueAfterBuildingAdd) || queueAfterBuildingAdd.length < 1) {
        return { ok: false, reason: "queue-building-enqueue-failed" };
      }
      if (!queueAfterBuildingAdd.some((entry) => entry.kind === "building" && entry.id === "granary")) {
        return { ok: false, reason: "queue-building-item-missing" };
      }

      const switchedToUnits = window.__hexfallTest.setCityProductionTab("units");
      if (switchedToUnits !== "units") {
        return { ok: false, reason: "city-tab-switch-units-failed" };
      }

      const queueAfterUnitAdd = window.__hexfallTest.enqueueCityProduction("warrior");
      if (!Array.isArray(queueAfterUnitAdd) || queueAfterUnitAdd.length < 2) {
        return { ok: false, reason: "queue-unit-enqueue-failed" };
      }
      if (!window.__hexfallTest.showCityActionTooltip("city-enqueue-warrior")) {
        return { ok: false, reason: "city-action-tooltip-show-failed" };
      }
      const hoverPanel = window.__hexfallTest.getCityPanelState();
      const hoverText = hoverPanel?.disabledTooltip?.text ?? "";
      if (
        !hoverPanel?.disabledTooltip?.visible ||
        !String(hoverText).includes("Production Cost") ||
        !String(hoverText).includes("Estimated Turns")
      ) {
        return { ok: false, reason: "city-action-tooltip-missing-cost-eta" };
      }
      window.__hexfallTest.hideCityActionTooltip();
      const firstChoiceHover = getState().uiActions?.cityProductionChoices?.[0]?.hoverText ?? "";
      if (!String(firstChoiceHover).includes("Production Cost") || !String(firstChoiceHover).includes("Estimated Turns")) {
        return { ok: false, reason: "production-hover-text-missing-cost-eta" };
      }
      const cityPanelAfterQueue = window.__hexfallTest.getCityPanelState();
      const firstProductionLabel = cityPanelAfterQueue?.cityProductionButtons?.[0]?.label ?? "";
      if (!String(firstProductionLabel).includes("Cost")) {
        return { ok: false, reason: "production-cost-eta-label-not-visible" };
      }
      const visibleProductionButtons = (cityPanelAfterQueue?.cityProductionButtons ?? []).filter((button) => button.visible);
      if (visibleProductionButtons.length !== 4) {
        return { ok: false, reason: "expected-four-visible-unit-production-buttons" };
      }
      const productionX = visibleProductionButtons.map((button) => button.x).filter(Number.isFinite);
      const productionY = visibleProductionButtons.map((button) => button.y).filter(Number.isFinite);
      if (productionX.length !== visibleProductionButtons.length || productionY.length !== visibleProductionButtons.length) {
        return { ok: false, reason: "production-button-position-data-missing" };
      }
      if (new Set(productionY.map((value) => Math.round(value))).size !== 1) {
        return { ok: false, reason: "production-buttons-should-share-row-y" };
      }
      for (let i = 1; i < productionX.length; i += 1) {
        if (productionX[i] <= productionX[i - 1]) {
          return { ok: false, reason: "production-buttons-should-be-horizontal" };
        }
      }
      const queueRail = cityPanelAfterQueue?.cityQueueRail;
      if (!queueRail?.visible) {
        return { ok: false, reason: "right-rail-city-queue-not-visible" };
      }
      if (
        typeof queueRail.y !== "number" ||
        typeof cityPanelAfterQueue?.notificationPanel?.y !== "number" ||
        typeof cityPanelAfterQueue?.turnAssistant?.y !== "number" ||
        queueRail.y <= cityPanelAfterQueue.notificationPanel.y ||
        queueRail.y >= cityPanelAfterQueue.turnAssistant.y
      ) {
        return { ok: false, reason: "right-rail-city-queue-not-between-notifications-and-attention" };
      }
      const assistant = cityPanelAfterQueue?.turnAssistant;
      const readyLeft = Number(assistant?.readyX) - Number(assistant?.readyWidth) / 2;
      const queueRight = Number(assistant?.queueX) + Number(assistant?.queueWidth) / 2;
      if (
        !Number.isFinite(readyLeft) ||
        !Number.isFinite(queueRight) ||
        !Number.isFinite(assistant?.left) ||
        !Number.isFinite(assistant?.right) ||
        readyLeft < assistant.left - 0.5 ||
        queueRight > assistant.right + 0.5
      ) {
        return { ok: false, reason: "attention-chips-overflow-panel" };
      }
      if (!String(queueRail.detailsPrimary ?? "").includes("Population")) {
        return { ok: false, reason: "right-rail-city-queue-missing-city-details" };
      }
      const queueSlotButtons = cityPanelAfterQueue?.cityQueueButtons ?? [];
      const queueSlotX = queueSlotButtons.map((button) => button.x).filter(Number.isFinite);
      const queueSlotY = queueSlotButtons.map((button) => button.y).filter(Number.isFinite);
      if (queueSlotX.length !== 3 || queueSlotY.length !== 3) {
        return { ok: false, reason: "queue-slot-position-data-missing" };
      }
      if (new Set(queueSlotX.map((value) => Math.round(value))).size !== 1) {
        return { ok: false, reason: "queue-slots-should-share-column-x" };
      }
      const moveUpLabels = (cityPanelAfterQueue?.cityQueueMoveUpButtons ?? []).map((button) => String(button.label ?? "").trim());
      const moveDownLabels = (cityPanelAfterQueue?.cityQueueMoveDownButtons ?? []).map((button) => String(button.label ?? "").trim());
      const removeLabels = (cityPanelAfterQueue?.cityQueueRemoveButtons ?? []).map((button) => String(button.label ?? "").trim());
      if (moveUpLabels.some((label) => label !== "^") || moveDownLabels.some((label) => label !== "v") || removeLabels.some((label) => label !== "x")) {
        return { ok: false, reason: "queue-control-icons-invalid" };
      }
      const controlWidths = [
        ...(cityPanelAfterQueue?.cityQueueMoveUpButtons ?? []).map((button) => button.width),
        ...(cityPanelAfterQueue?.cityQueueMoveDownButtons ?? []).map((button) => button.width),
        ...(cityPanelAfterQueue?.cityQueueRemoveButtons ?? []).map((button) => button.width),
      ].filter(Number.isFinite);
      if (controlWidths.some((width) => width < 22)) {
        return { ok: false, reason: "queue-controls-too-small" };
      }
      for (let i = 1; i < queueSlotY.length; i += 1) {
        if (queueSlotY[i] <= queueSlotY[i - 1]) {
          return { ok: false, reason: "queue-slots-should-be-vertical" };
        }
      }
      let queueFillState = queueAfterUnitAdd;
      let queueFillSafety = 0;
      while (Array.isArray(queueFillState) && queueFillState.length < 3 && queueFillSafety < 4) {
        queueFillState = window.__hexfallTest.enqueueCityProduction("warrior");
        queueFillSafety += 1;
      }
      const overfillAttempt = window.__hexfallTest.enqueueCityProduction("warrior");
      if (overfillAttempt !== false) {
        return { ok: false, reason: "queue-overfill-should-fail" };
      }
      const overfillHint = getState().uiActions?.disabledActionHints?.["city-enqueue-warrior"] ?? "";
      if (!String(overfillHint).toLowerCase().includes("queue is full")) {
        return { ok: false, reason: "missing-unavailable-reason-for-overfill" };
      }
      if (!window.__hexfallTest.showCityActionTooltip("city-enqueue-warrior")) {
        return { ok: false, reason: "city-action-tooltip-show-unavailable-failed" };
      }
      const unavailablePanel = window.__hexfallTest.getCityPanelState();
      if (!String(unavailablePanel?.disabledTooltip?.text ?? "").toLowerCase().includes("queue is full")) {
        return { ok: false, reason: "city-action-tooltip-missing-unavailable-reason" };
      }
      window.__hexfallTest.hideCityActionTooltip();

      const queueAfterMove = window.__hexfallTest.moveCityQueue(2, "up");
      if (!Array.isArray(queueAfterMove) || queueAfterMove.length !== 3) {
        return { ok: false, reason: "queue-move-up-failed" };
      }
      const queueAfterRemove = window.__hexfallTest.removeCityQueueAt(1);
      if (!Array.isArray(queueAfterRemove) || queueAfterRemove.length < 1 || queueAfterRemove.length > 2) {
        return { ok: false, reason: "queue-remove-failed" };
      }
      const notificationsAfterCityOps = window.__hexfallTest.getNotificationCenterState();
      const noisyCityProductionMessageFound = (notificationsAfterCityOps?.entries ?? []).some((entry) => {
        const text = String(entry?.message ?? "").toLowerCase();
        return (
          text.includes("production tab:") ||
          text.includes("added to queue") ||
          text.includes("queue item moved") ||
          text.includes("queue item removed")
        );
      });
      if (noisyCityProductionMessageFound) {
        return { ok: false, reason: "city-production-notifications-should-be-high-level" };
      }

      // Research path to archery unlock.
      const researchBeforePath = getState().research;
      if (!researchBeforePath || !Number.isFinite(researchBeforePath.sciencePerTurn)) {
        return { ok: false, reason: "missing-research-science-per-turn-payload" };
      }
      if (!researchBeforePath.boostProgressByTech?.archery || !researchBeforePath.boostProgressByTech?.writing) {
        return { ok: false, reason: "missing-research-boost-progress-payload" };
      }
      const selectedBronze = window.__hexfallTest.selectResearch("bronzeWorking");
      if (!selectedBronze) {
        return { ok: false, reason: "bronzeworking-selection-failed" };
      }

      // Wait for any outstanding player-side animation (for example city founding) to finish.
      for (let i = 0; i < 40; i += 1) {
        if (!getState().animationState?.busy) {
          break;
        }
        await pause(40);
      }
      if (getState().animationState?.busy) {
        return { ok: false, reason: "animation-lock-not-cleared-before-endturn-request" };
      }

      // Real enemy playback path: request end-turn and verify timeline state transitions.
      const beforeEnemyPlaybackState = getState();
      const aiOwnersBeforePlayback = new Set(beforeEnemyPlaybackState.factions?.aiOwners ?? []);
      const aiCityIdsBeforePlayback = new Set(
        (beforeEnemyPlaybackState.cities ?? [])
          .filter((city) => aiOwnersBeforePlayback.has(city.owner))
          .map((city) => city.id)
      );
      const requestedAnimatedTurn = window.__hexfallTest.requestEndTurn();
      if (!requestedAnimatedTurn) {
        return { ok: false, reason: "end-turn-request-failed-after-found" };
      }

      let playbackObserved = false;
      let stepAdvanced = false;
      let maxObservedStep = 0;
      let maxObservedFx = 0;
      const observedPlaybackActors = new Set();
      const observedPlaybackMessages = new Set();
      for (let i = 0; i < 60; i += 1) {
        await pause(70);
        const frameState = getState();
        if (frameState.turnPlayback?.active) {
          playbackObserved = true;
          if (frameState.turnPlayback?.actor) {
            observedPlaybackActors.add(frameState.turnPlayback.actor);
          }
          const stepIndex = frameState.turnPlayback?.stepIndex ?? 0;
          if (stepIndex > maxObservedStep) {
            maxObservedStep = stepIndex;
            if (stepIndex > 0) {
              stepAdvanced = true;
            }
          }
          const playbackMessage = String(frameState.turnPlayback?.message ?? "");
          if (playbackMessage) {
            observedPlaybackMessages.add(playbackMessage);
          }
          const frameFx = Number(frameState.spriteLayers?.fx ?? 0);
          if (Number.isFinite(frameFx) && frameFx > maxObservedFx) {
            maxObservedFx = frameFx;
          }
        }
        if (playbackObserved && frameState.phase === "player" && !frameState.turnPlayback?.active) {
          break;
        }
      }

      const afterEnemyOpen = getState();
      if (!playbackObserved) {
        return { ok: false, reason: "enemy-playback-never-became-active" };
      }
      if (!stepAdvanced && (afterEnemyOpen.ai?.enemy?.lastTurnSummary?.actions?.length ?? 0) > 0) {
        return { ok: false, reason: "enemy-playback-step-index-never-advanced" };
      }
      if (afterEnemyOpen.phase !== "player") {
        return { ok: false, reason: "enemy-playback-did-not-return-player-phase" };
      }
      if (afterEnemyOpen.turnPlayback?.active) {
        return { ok: false, reason: "enemy-playback-stuck-active" };
      }
      if (!afterEnemyOpen.ai?.enemy?.lastTurnSummary || !afterEnemyOpen.ai?.purple?.lastTurnSummary) {
        return { ok: false, reason: "missing-one-or-more-ai-turn-summaries" };
      }
      if (afterEnemyOpen.ai.enemy.lastTurnSummary.turn !== 1 || afterEnemyOpen.ai.purple.lastTurnSummary.turn !== 1) {
        return { ok: false, reason: "ai-turn-summaries-have-unexpected-turn-number" };
      }
      if (!observedPlaybackActors.has("enemy") || !observedPlaybackActors.has("purple")) {
        return { ok: false, reason: "playback-did-not-observe-both-ai-actors" };
      }

      // Enemy and purple should both auto-found on first AI phase.
      if (afterEnemyOpen.cities.filter((city) => city.owner === "enemy").length < 1) {
        return { ok: false, reason: "enemy-did-not-auto-found" };
      }
      if (afterEnemyOpen.units.some((unit) => unit.owner === "enemy" && unit.type === "settler")) {
        return { ok: false, reason: "enemy-settler-should-be-consumed" };
      }
      if (afterEnemyOpen.cities.filter((city) => city.owner === "purple").length < 1) {
        return { ok: false, reason: "purple-did-not-auto-found" };
      }
      if (afterEnemyOpen.units.some((unit) => unit.owner === "purple" && unit.type === "settler")) {
        return { ok: false, reason: "purple-settler-should-be-consumed" };
      }
      const aiOwnersAfterPlayback = new Set(afterEnemyOpen.factions?.aiOwners ?? []);
      const aiFoundedCitiesThisPlayback = (afterEnemyOpen.cities ?? []).filter(
        (city) => aiOwnersAfterPlayback.has(city.owner) && !aiCityIdsBeforePlayback.has(city.id)
      );
      const playerVisibleHexesAfterPlayback = new Set(afterEnemyOpen.visibility?.byOwner?.player?.visibleHexes ?? []);
      const hiddenFoundedAiCities = aiFoundedCitiesThisPlayback.filter(
        (city) => !playerVisibleHexesAfterPlayback.has(`${city.q},${city.r}`)
      );
      const hiddenFoundedAiOwners = [...new Set(hiddenFoundedAiCities.map((city) => city.owner))];
      const notificationsAfterEnemyPlayback = window.__hexfallTest.getNotificationCenterState();
      const notificationMessagesAfterEnemyPlayback = (notificationsAfterEnemyPlayback?.entries ?? []).map((entry) =>
        String(entry?.message ?? "")
      );
      const playbackMessagesSeen = [...observedPlaybackMessages];
      for (const hiddenOwner of hiddenFoundedAiOwners) {
        const ownerLabel = hiddenOwner.charAt(0).toUpperCase() + hiddenOwner.slice(1);
        const hiddenFoundingNotificationLeaked = notificationMessagesAfterEnemyPlayback.some(
          (message) => message === `${ownerLabel} founded a city.`
        );
        if (hiddenFoundingNotificationLeaked) {
          return { ok: false, reason: `hidden-${hiddenOwner}-city-founding-notification-leaked` };
        }
        const hiddenFoundingPlaybackDetailLeaked = playbackMessagesSeen.some(
          (message) => message.includes(`${ownerLabel} action`) && message.includes("founds a city")
        );
        if (hiddenFoundingPlaybackDetailLeaked) {
          return { ok: false, reason: `hidden-${hiddenOwner}-city-founding-playback-message-leaked` };
        }
      }
      if (hiddenFoundedAiCities.length === 2 && maxObservedFx > 0) {
        return { ok: false, reason: "hidden-ai-founding-should-not-produce-fx" };
      }

      // AI personality payload + forced override hook.
      if (!afterEnemyOpen.ai?.enemy?.personality) {
        return { ok: false, reason: "missing-ai-personality-payload" };
      }
      if (!afterEnemyOpen.ai?.purple?.personality) {
        return { ok: false, reason: "missing-purple-ai-personality-payload" };
      }
      const forcedRaider = window.__hexfallTest.setEnemyPersonality("raider");
      const aiAfterRaider = window.__hexfallTest.getEnemyAiState();
      if (forcedRaider !== "raider" || aiAfterRaider?.personality !== "raider") {
        return { ok: false, reason: "failed-to-force-raider-personality" };
      }
      const forcedGuardian = window.__hexfallTest.setEnemyPersonality("guardian");
      const aiAfterGuardian = window.__hexfallTest.getEnemyAiState();
      if (forcedGuardian !== "guardian" || aiAfterGuardian?.personality !== "guardian") {
        return { ok: false, reason: "failed-to-force-guardian-personality" };
      }
      const forcedPurpleRaider = window.__hexfallTest.setAiPersonality("purple", "raider");
      const purpleAiAfterRaider = window.__hexfallTest.getAiState("purple");
      if (forcedPurpleRaider !== "raider" || purpleAiAfterRaider?.personality !== "raider") {
        return { ok: false, reason: "failed-to-force-purple-raider-personality" };
      }

      // Advance several turns to validate research progression payloads with the expanded tree.
      let turnLoops = 0;
      let blockedAdvanceAttempts = 0;
      while (turnLoops < 8) {
        const state = getState();
        const activeTech = state.research?.currentTechId ?? state.research?.activeTechId ?? null;
        if (activeTech && state.research?.sciencePerTurn > 0 && state.research?.turnsRemaining !== null) {
          if (!Number.isFinite(state.research.turnsRemaining) || state.research.turnsRemaining < 0) {
            return { ok: false, reason: "invalid-research-turns-remaining-payload" };
          }
        }
        const playerCityForScienceBreakdown = state.cities.find((city) => city.owner === "player") ?? null;
        if (
          playerCityForScienceBreakdown &&
          !state.research?.cityScienceById?.[playerCityForScienceBreakdown.id]
        ) {
          return { ok: false, reason: "missing-city-science-breakdown-payload" };
        }
        if (!state.research?.completedTechIds?.includes("bronzeWorking")) {
          window.__hexfallTest.selectResearch("bronzeWorking");
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          blockedAdvanceAttempts += 1;
          if (
            blockedAdvanceAttempts < 20 &&
            (state.animationState?.busy || state.turnPlayback?.active || state.phase !== "player" || state.uiModalOpen)
          ) {
            await pause(60);
            continue;
          }
          return { ok: false, reason: "failed-to-advance-for-archery" };
        }
        blockedAdvanceAttempts = 0;
        turnLoops += 1;
      }

      const withResearchProgress = getState();
      if (
        !withResearchProgress.research.completedTechIds.includes("bronzeWorking") &&
        (withResearchProgress.research.progressByTech?.bronzeWorking ?? 0) <= 0
      ) {
        return { ok: false, reason: "bronze-working-progress-not-advancing" };
      }

      const enemyCityForAi = withResearchProgress.cities.find((city) => city.owner === "enemy");
      if (!enemyCityForAi) {
        return { ok: false, reason: "missing-enemy-city-for-ai-personality-check" };
      }
      if (!window.__hexfallTest.clearEnemyCityQueue(enemyCityForAi.id)) {
        return { ok: false, reason: "failed-to-clear-enemy-queue-before-raider-check" };
      }
      window.__hexfallTest.setEnemyPersonality("raider");
      if (!window.__hexfallTest.endTurnImmediate()) {
        return { ok: false, reason: "failed-enemy-turn-for-raider-check" };
      }
      const raiderSummary = window.__hexfallTest.getEnemyAiState()?.lastTurnSummary ?? null;
      if (!raiderSummary) {
        return { ok: false, reason: "missing-raider-ai-summary" };
      }
      const raiderRefill = raiderSummary.queueRefills?.[0]?.item ?? null;

      if (!window.__hexfallTest.clearEnemyCityQueue(enemyCityForAi.id)) {
        return { ok: false, reason: "failed-to-clear-enemy-queue-before-guardian-check" };
      }
      window.__hexfallTest.setEnemyPersonality("guardian");
      if (!window.__hexfallTest.endTurnImmediate()) {
        return { ok: false, reason: "failed-enemy-turn-for-guardian-check" };
      }
      const guardianSummary = window.__hexfallTest.getEnemyAiState()?.lastTurnSummary ?? null;
      if (!guardianSummary) {
        return { ok: false, reason: "missing-guardian-ai-summary" };
      }
      const guardianRefill = guardianSummary.queueRefills?.[0]?.item ?? null;
      if (!raiderRefill && !guardianRefill) {
        return { ok: false, reason: "missing-personality-queue-refill-data" };
      }

      const combatSetupState = getState();
      const playerCityAssaultUnit =
        combatSetupState.units.find((unit) => unit.owner === "player" && unit.type === "archer") ??
        combatSetupState.units.find((unit) => unit.owner === "player" && unit.type === "warrior") ??
        combatSetupState.units.find((unit) => unit.owner === "player" && unit.type === "spearman");
      const supportAssaultUnit =
        combatSetupState.units.find((unit) => unit.owner === "player" && (unit.type === "warrior" || unit.type === "spearman")) ??
        playerCityAssaultUnit;
      const hostileCity = combatSetupState.cities.find((city) => city.owner !== "player");
      if (!playerCityAssaultUnit || !supportAssaultUnit || !hostileCity) {
        return { ok: false, reason: "missing-player-assault-unit-or-hostile-city" };
      }
      const hostileCityId = hostileCity.id;
      const cityAssaultUnitId = supportAssaultUnit.id;

      // Attack preview against a hostile city.
      const occupiedByOtherUnit = (state, movingUnitId, q, r) =>
        state.units.some((unit) => unit.id !== movingUnitId && unit.q === q && unit.r === r);
      const isBlockedByCity = (state, q, r) => state.cities.some((city) => city.q === q && city.r === r);
      const inBounds = (state, q, r) => q >= 0 && q < state.map.width && r >= 0 && r < state.map.height;
      const minPreviewRange = Math.max(1, playerCityAssaultUnit.minAttackRange ?? 1);
      const maxPreviewRange = Math.max(minPreviewRange, playerCityAssaultUnit.attackRange ?? 1);
      const previewCandidateHexes = [];
      for (let q = 0; q < combatSetupState.map.width; q += 1) {
        for (let r = 0; r < combatSetupState.map.height; r += 1) {
          if (!inBounds(combatSetupState, q, r) || isBlockedByCity(combatSetupState, q, r)) {
            continue;
          }
          if (occupiedByOtherUnit(combatSetupState, playerCityAssaultUnit.id, q, r)) {
            continue;
          }
          const dist = Math.max(
            Math.abs(q - hostileCity.q),
            Math.abs(r - hostileCity.r),
            Math.abs(q + r - hostileCity.q - hostileCity.r)
          );
          if (dist < minPreviewRange || dist > maxPreviewRange) {
            continue;
          }
          previewCandidateHexes.push({ q, r });
        }
      }
      previewCandidateHexes.sort((a, b) => a.q - b.q || a.r - b.r);
      let cityAttackPreview = null;
      for (const hex of previewCandidateHexes) {
        if (!window.__hexfallTest.setUnitPosition(playerCityAssaultUnit.id, hex.q, hex.r)) {
          continue;
        }
        window.__hexfallTest.selectUnit(playerCityAssaultUnit.id);
        if (!window.__hexfallTest.hoverHex(hostileCity.q, hostileCity.r)) {
          continue;
        }
        cityAttackPreview = window.__hexfallTest.getActionPreviewState();
        if (cityAttackPreview?.mode === "attack-city" && cityAttackPreview.cityId === hostileCity.id) {
          break;
        }
      }
      if (cityAttackPreview?.mode !== "attack-city" || cityAttackPreview.cityId !== hostileCity.id) {
        return { ok: false, reason: "missing-city-attack-preview" };
      }
      if (!window.__hexfallTest.attackCity(hostileCity.id)) {
        return { ok: false, reason: "city-attack-failed-after-preview" };
      }
      const cityAttackState = getState();
      if (!cityAttackState.lastCombatEvent || cityAttackState.lastCombatEvent.type !== "city") {
        return { ok: false, reason: "missing-city-combat-breakdown-payload" };
      }

      // Unit context + invalid action warning notification.
      window.__hexfallTest.selectUnit(cityAssaultUnitId);
      const unitPanel = window.__hexfallTest.getCityPanelState();
      if (!unitPanel?.visible || unitPanel.mode !== "unit") {
        return { ok: false, reason: "unit-context-panel-not-visible" };
      }
      if (!unitPanel.expanded || !unitPanel.pinned) {
        return { ok: false, reason: "context-panel-pin-should-persist-across-selection" };
      }
      window.__hexfallTest.triggerUnitAction("foundCity");
      const notificationState = window.__hexfallTest.getNotificationCenterState();
      const hasFoundingWarning = (notificationState?.entries ?? []).some((entry) =>
        String(entry.message ?? "").includes("Only settlers can found a city")
      );
      if (!hasFoundingWarning) {
        return { ok: false, reason: "missing-invalid-found-city-notification" };
      }

      // Attack enemy city until resolution is pending.
      let pendingLoops = 0;
      while (pendingLoops < 7) {
        const state = getState();
        const attacker =
          state.units.find((unit) => unit.id === cityAssaultUnitId) ??
          state.units.find((unit) => unit.owner === "player" && (unit.type === "warrior" || unit.type === "spearman")) ??
          null;
        const targetCity = state.cities.find((city) => city.id === hostileCityId) ?? state.cities.find((city) => city.owner !== "player");
        if (!attacker || !targetCity) {
          return { ok: false, reason: "attacker-or-city-missing-before-resolution" };
        }
        if (state.pendingCityResolution) {
          break;
        }
        if (attacker.hasActed || attacker.movementRemaining <= 0) {
          if (!window.__hexfallTest.endTurnImmediate()) {
            return { ok: false, reason: "failed-to-refresh-warrior-before-city-attack" };
          }
          pendingLoops += 1;
          continue;
        }

        const minRange = Math.max(1, attacker.minAttackRange ?? 1);
        const maxRange = Math.max(minRange, attacker.attackRange ?? 1);
        const candidateHexes = [];
        for (let q = 0; q < state.map.width; q += 1) {
          for (let r = 0; r < state.map.height; r += 1) {
            const dist = Math.max(Math.abs(q - targetCity.q), Math.abs(r - targetCity.r), Math.abs(q + r - targetCity.q - targetCity.r));
            if (dist < minRange || dist > maxRange) {
              continue;
            }
            if (isBlockedByCity(state, q, r)) {
              continue;
            }
            if (occupiedByOtherUnit(state, attacker.id, q, r)) {
              continue;
            }
            candidateHexes.push({ q, r });
          }
        }
        candidateHexes.sort((a, b) => a.q - b.q || a.r - b.r);

        let positioned = false;
        for (const hex of candidateHexes) {
          if (window.__hexfallTest.setUnitPosition(attacker.id, hex.q, hex.r)) {
            positioned = true;
            break;
          }
        }
        if (!positioned) {
          return { ok: false, reason: "failed-to-position-warrior-for-city-attack" };
        }

        window.__hexfallTest.selectUnit(attacker.id);
        const attackedCity = window.__hexfallTest.attackCity(targetCity.id);
        if (!attackedCity) {
          return { ok: false, reason: "city-attack-failed" };
        }

        const postAttack = getState();
        if (postAttack.pendingCityResolution) {
          break;
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-refresh-turn-between-city-attacks" };
        }
        pendingLoops += 1;
      }

      const withPending = getState();
      if (!withPending.pendingCityResolution) {
        return { ok: false, reason: "city-resolution-never-opened" };
      }
      const pendingCityId = withPending.pendingCityResolution.cityId;
      const cityModal = window.__hexfallTest.getCityResolutionModalState();
      if (
        !cityModal?.open ||
        !cityModal.captureVisible ||
        !cityModal.razeVisible ||
        cityModal.captureDepth <= cityModal.panelDepth
      ) {
        return { ok: false, reason: "city-resolution-modal-not-visible" };
      }

      // Resolve by capturing the city to keep the player in a dominant position.
      const resolved = window.__hexfallTest.chooseCityOutcome("capture");
      if (!resolved) {
        return { ok: false, reason: "city-resolution-capture-failed" };
      }
      const afterResolution = getState();
      if (afterResolution.pendingCityResolution) {
        return { ok: false, reason: "city-resolution-did-not-close" };
      }
      const capturedCity = afterResolution.cities.find((city) => city.id === pendingCityId);
      if (!capturedCity || capturedCity.owner !== "player") {
        return { ok: false, reason: "hostile-city-was-not-captured" };
      }

      const finalState = getState();
      if (finalState.match.status === "lost") {
        return { ok: false, reason: "unexpected-loss-after-city-resolution", finalState };
      }

      return { ok: true, finalState };
    });
    assert.equal(scenarioResult.ok, true, `scenario failed: ${scenarioResult.reason}`);
    const finalState = scenarioResult.finalState;
    assert.ok(finalState, "final state should be available");
    assert.notEqual(finalState.match.status, "lost", "scenario should not end in defeat");

    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible" });
    await canvas.click({ position: { x: 260, y: 220 } });

    const cameraStateBeforeKeyboard = await page.evaluate(() => window.__hexfallTest.getState());
    assert.ok(cameraStateBeforeKeyboard.cameraFocusHex, "camera should be focused before manual pan checks");
    const keyboardBefore = cameraStateBeforeKeyboard.cameraScroll;
    assert.ok(keyboardBefore, "camera scroll payload should exist before keyboard pan");

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(160);
    await page.keyboard.up("ArrowRight");

    const cameraStateAfterKeyboard = await page.evaluate(() => window.__hexfallTest.getState());
    assert.ok(
      cameraStateAfterKeyboard.cameraScroll.x !== keyboardBefore.x ||
        cameraStateAfterKeyboard.cameraScroll.y !== keyboardBefore.y,
      "keyboard camera pan should move camera scroll"
    );
    assert.equal(cameraStateAfterKeyboard.cameraFocusHex, null, "manual keyboard pan should clear camera focus target");

    const dragBefore = cameraStateAfterKeyboard.cameraScroll;
    const canvasBounds = await canvas.boundingBox();
    assert.ok(canvasBounds, "canvas bounds should be available for right-drag test");
    const dragStartX = canvasBounds.x + Math.floor(canvasBounds.width * 0.6);
    const dragStartY = canvasBounds.y + Math.floor(canvasBounds.height * 0.5);
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(dragStartX + 90, dragStartY + 42, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(80);

    const cameraStateAfterDrag = await page.evaluate(() => window.__hexfallTest.getState());
    assert.ok(
      cameraStateAfterDrag.cameraScroll.x !== dragBefore.x || cameraStateAfterDrag.cameraScroll.y !== dragBefore.y,
      "right-drag camera pan should move camera scroll"
    );

    const perfBeforeStress = normalizePerfStats(await page.evaluate(() => window.__hexfallTest.getPerfStats()));
    assert.ok(perfBeforeStress, "perf probe failed: initial perf telemetry unavailable");

    const stressSetup = await page.evaluate(async () => {
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const getState = () => window.__hexfallTest.getState();
      if (!window.__hexfallTest.openPauseMenu() || !window.__hexfallTest.openRestartConfirm()) {
        return { ok: false, reason: "stress-setup-open-modal-failed" };
      }
      if (!window.__hexfallTest.setNewGameMapSize(24) || window.__hexfallTest.setNewGameAiFactionCount(6) !== 6) {
        return { ok: false, reason: "stress-setup-config-controls-failed" };
      }
      if (!window.__hexfallTest.confirmRestartConfirm()) {
        return { ok: false, reason: "stress-setup-confirm-failed" };
      }
      for (let i = 0; i < 90; i += 1) {
        await pause(40);
        const state = getState();
        if (state.map?.width === 24 && state.map?.height === 24 && (state.factions?.aiOwners?.length ?? 0) === 6) {
          return { ok: true, mapWidth: 24, mapHeight: 24, aiFactionCount: 6 };
        }
      }
      return { ok: false, reason: "stress-setup-timeout" };
    });

    const stressPanKeys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "KeyD", "KeyS", "KeyA", "KeyW"];
    for (const key of stressPanKeys) {
      await page.keyboard.down(key);
      await page.waitForTimeout(180);
      await page.keyboard.up(key);
      await page.waitForTimeout(30);
    }

    const stressBounds = await canvas.boundingBox();
    assert.ok(stressBounds, "canvas bounds should be available for perf drag probe");
    const stressStartX = stressBounds.x + Math.floor(stressBounds.width * 0.52);
    const stressStartY = stressBounds.y + Math.floor(stressBounds.height * 0.48);
    for (let i = 0; i < 6; i += 1) {
      const deltaX = i % 2 === 0 ? 180 : -180;
      const deltaY = i % 2 === 0 ? 84 : -84;
      await page.mouse.move(stressStartX, stressStartY);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(stressStartX + deltaX, stressStartY + deltaY, { steps: 10 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(55);
    }

    const stressTurnResult = await page.evaluate(async () => {
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const getState = () => window.__hexfallTest.getState();
      const startTurn = getState()?.turn ?? 0;
      if (!window.__hexfallTest.requestEndTurn()) {
        return { ok: false, reason: "stress-turn-request-failed", startTurn };
      }
      for (let i = 0; i < 160; i += 1) {
        await pause(70);
        const state = getState();
        if (state?.phase === "player" && !state?.turnPlayback?.active && (state?.turn ?? 0) > startTurn) {
          return { ok: true, startTurn, endTurn: state.turn };
        }
      }
      return { ok: false, reason: "stress-turn-timeout", startTurn, endTurn: getState()?.turn ?? startTurn };
    });

    const perfAfterStress = normalizePerfStats(await page.evaluate(() => window.__hexfallTest.getPerfStats()));
    assert.ok(perfAfterStress, "perf probe failed: final perf telemetry unavailable");

    const perfArtifact = {
      generatedAt: new Date().toISOString(),
      targetBudgetMs: PERF_TARGET_BUDGET,
      setup: {
        stressSetup,
        stressTurnResult,
      },
      perf: {
        beforeStress: perfBeforeStress,
        afterStress: perfAfterStress,
        publishDelta: {
          state: perfAfterStress.publishCounters.state - perfBeforeStress.publishCounters.state,
          camera: perfAfterStress.publishCounters.camera - perfBeforeStress.publishCounters.camera,
          preview: perfAfterStress.publishCounters.preview - perfBeforeStress.publishCounters.preview,
        },
        budgetCheck: {
          p95WithinTarget: perfAfterStress.frameMs.p95 <= PERF_TARGET_BUDGET.p95Ms,
          maxWithinTarget: perfAfterStress.frameMs.max <= PERF_TARGET_BUDGET.maxMs,
        },
      },
      summary: {
        fps: perfAfterStress.estimatedFps,
        frameAvgMs: perfAfterStress.frameMs.avg,
        frameP95Ms: perfAfterStress.frameMs.p95,
        frameMaxMs: perfAfterStress.frameMs.max,
        longFramesOver18ms: perfAfterStress.longFrames.over18ms,
        longFramesOver40ms: perfAfterStress.longFrames.over40ms,
      },
    };
    writeFileSync(PERF_ARTIFACT_PATH, `${JSON.stringify(perfArtifact, null, 2)}\n`, "utf8");
    console.log(
      `Perf probe summary: FPS ${perfAfterStress.estimatedFps}, p95 ${perfAfterStress.frameMs.p95}ms (target <= ${PERF_TARGET_BUDGET.p95Ms}ms), max ${perfAfterStress.frameMs.max}ms (target <= ${PERF_TARGET_BUDGET.maxMs}ms)`
    );

    await canvas.screenshot({ path: `${ARTIFACT_DIR}/smoke.png` });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(250);
    await page.locator("canvas").screenshot({ path: `${ARTIFACT_DIR}/smoke-tablet.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(180);

    assert.equal(consoleErrors.length, 0, `console errors found:\n${consoleErrors.join("\n")}`);

    console.log("E2E smoke test passed.");
  } finally {
    await cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
