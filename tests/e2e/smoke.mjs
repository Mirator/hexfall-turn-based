import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 4173;
const URL = `http://${HOST}:${PORT}`;
const ARTIFACT_DIR = "tests/e2e/artifacts";

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

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.waitForTimeout(700);

    const initialState = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(initialState.turn, 1, "initial turn should be 1");
    assert.equal(initialState.match.status, "ongoing", "match should begin ongoing");
    assert.equal(initialState.uiActions.canRestart, true, "restart should be available during gameplay");
    assert.equal(initialState.map.width, 16, "map width should be 16");
    assert.equal(initialState.map.height, 16, "map height should be 16");
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
    assert.ok(initialState.hudTopLeft?.resources?.food, "top-left food resource display should exist");
    assert.ok(initialState.hudTopLeft?.resources?.production, "top-left production resource display should exist");
    assert.ok(initialState.hudTopLeft?.resources?.science, "top-left science resource display should exist");
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

    const enemyVisibleBeforeDev = [...(initialState.visibility.byOwner.enemy.visibleHexes ?? [])];
    await page.keyboard.press("KeyV");
    const withDevVision = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(withDevVision.devVisionEnabled, true, "V should toggle dev vision on");
    assert.deepEqual(
      withDevVision.visibility?.byOwner?.enemy?.visibleHexes ?? [],
      enemyVisibleBeforeDev,
      "player dev reveal should not alter AI fog visibility"
    );
    await page.keyboard.press("KeyV");
    const withoutDevVision = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(withoutDevVision.devVisionEnabled, false, "V should toggle dev vision off");

    const scenarioResult = await page.evaluate(async () => {
      const getState = () => window.__hexfallTest.getState();
      const getUnit = (state, owner, type) => state.units.find((unit) => unit.owner === owner && unit.type === type);
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const initial = getState();
      const playerSettler = getUnit(initial, "player", "settler");
      if (!playerSettler) {
        return { ok: false, reason: "missing-player-settler" };
      }

      // Pause + restart modal sanity check.
      const pauseOpened = window.__hexfallTest.openPauseMenu();
      const pauseMenu = window.__hexfallTest.getPauseMenuState();
      if (!pauseOpened || !pauseMenu?.open) {
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
        return { ok: false, reason: "restart-modal-broken" };
      }
      window.__hexfallTest.cancelRestartConfirm();
      if (window.__hexfallTest.getRestartModalState()?.open) {
        return { ok: false, reason: "restart-modal-did-not-close" };
      }
      window.__hexfallTest.closePauseMenu();
      if (window.__hexfallTest.getPauseMenuState()?.open) {
        return { ok: false, reason: "pause-menu-did-not-close" };
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
      if (new Set(productionX.map((value) => Math.round(value))).size !== 1) {
        return { ok: false, reason: "production-buttons-should-share-column-x" };
      }
      for (let i = 1; i < productionY.length; i += 1) {
        if (productionY[i] <= productionY[i - 1]) {
          return { ok: false, reason: "production-buttons-should-be-vertical" };
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
      if (!String(queueRail.detailsPrimary ?? "").includes("Population")) {
        return { ok: false, reason: "right-rail-city-queue-missing-city-details" };
      }
      const queueSlotY = cityPanelAfterQueue?.cityQueueButtons?.map((button) => button.y).filter(Number.isFinite) ?? [];
      if (queueSlotY.length !== 3 || new Set(queueSlotY.map((value) => Math.round(value))).size !== 1) {
        return { ok: false, reason: "queue-slots-should-be-horizontal" };
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
      const requestedAnimatedTurn = window.__hexfallTest.requestEndTurn();
      if (!requestedAnimatedTurn) {
        return { ok: false, reason: "end-turn-request-failed-after-found" };
      }

      let playbackObserved = false;
      let stepAdvanced = false;
      let maxObservedStep = 0;
      const observedPlaybackActors = new Set();
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

      // Advance until player gets a warrior from city production.
      let turnLoops = 0;
      while (turnLoops < 14) {
        const state = getState();
        const completed = new Set(state.research.completedTechIds);
        if (completed.has("bronzeWorking") && !state.research.completedTechIds.includes("archery")) {
          window.__hexfallTest.selectResearch("archery");
        }
        if (completed.has("archery")) {
          break;
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-advance-for-archery" };
        }
        turnLoops += 1;
      }

      const withArchery = getState();
      if (!withArchery.research.completedTechIds.includes("archery")) {
        return { ok: false, reason: "archery-not-completed" };
      }

      const enemyCityForAi = withArchery.cities.find((city) => city.owner === "enemy");
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
      if (raiderRefill && guardianRefill && raiderRefill === guardianRefill) {
        return { ok: false, reason: "personality-queue-decisions-did-not-differ" };
      }

      const postPersonalityState = getState();
      const playerCity = postPersonalityState.cities.find((city) => city.owner === "player");
      if (!playerCity) {
        return { ok: false, reason: "missing-player-city-for-archer-production" };
      }

      if (!window.__hexfallTest.selectCity(playerCity.id)) {
        return { ok: false, reason: "failed-to-select-player-city" };
      }

      const queuedArcher = window.__hexfallTest.enqueueCityProduction("archer");
      if (!Array.isArray(queuedArcher)) {
        return { ok: false, reason: "failed-to-queue-archer" };
      }

      let produceArcherLoops = 0;
      while (produceArcherLoops < 10) {
        const state = getState();
        if (getUnit(state, "player", "archer")) {
          break;
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-advance-for-archer-production" };
        }
        produceArcherLoops += 1;
      }

      let withArcher = getState();
      let playerArcher = getUnit(withArcher, "player", "archer");
      if (playerArcher && (playerArcher.hasActed || playerArcher.movementRemaining <= 0)) {
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-refresh-archer-turn" };
        }
        withArcher = getState();
        playerArcher = getUnit(withArcher, "player", "archer");
      }

      const playerCityAssaultUnit =
        withArcher.units.find((unit) => unit.owner === "player" && unit.type === "warrior") ??
        withArcher.units.find((unit) => unit.owner === "player" && unit.type === "spearman") ??
        withArcher.units.find((unit) => unit.owner === "player" && unit.type === "archer");
      const hostileCity = withArcher.cities.find((city) => city.owner !== "player");
      if (!playerArcher || !playerCityAssaultUnit || !hostileCity) {
        return { ok: false, reason: "missing-archer-assault-unit-or-hostile-city" };
      }
      const hostileCityId = hostileCity.id;
      const cityAssaultUnitId = playerCityAssaultUnit.id;

      // Ranged attack at distance 2.
      const occupiedByOtherUnit = (state, movingUnitId, q, r) =>
        state.units.some((unit) => unit.id !== movingUnitId && unit.q === q && unit.r === r);
      const isBlockedByCity = (state, q, r) => state.cities.some((city) => city.q === q && city.r === r);
      const inBounds = (state, q, r) => q >= 0 && q < state.map.width && r >= 0 && r < state.map.height;

      const ringDistanceTwoOffsets = [
        { dq: 2, dr: 0 },
        { dq: 2, dr: -1 },
        { dq: 2, dr: -2 },
        { dq: 1, dr: -2 },
        { dq: 0, dr: -2 },
        { dq: -1, dr: -1 },
        { dq: -2, dr: 0 },
        { dq: -2, dr: 1 },
        { dq: -2, dr: 2 },
        { dq: -1, dr: 2 },
        { dq: 0, dr: 2 },
        { dq: 1, dr: 1 },
      ];
      const rangedHexes = ringDistanceTwoOffsets
        .map((offset) => ({ q: hostileCity.q + offset.dq, r: hostileCity.r + offset.dr }))
        .filter((hex) => inBounds(withArcher, hex.q, hex.r))
        .filter((hex) => !isBlockedByCity(withArcher, hex.q, hex.r))
        .filter((hex) => !occupiedByOtherUnit(withArcher, playerArcher.id, hex.q, hex.r))
        .sort((a, b) => a.q - b.q || a.r - b.r);
      let cityAttackPreview = null;
      for (const hex of rangedHexes) {
        if (!window.__hexfallTest.setUnitPosition(playerArcher.id, hex.q, hex.r)) {
          continue;
        }
        window.__hexfallTest.selectUnit(playerArcher.id);
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
        return { ok: false, reason: "archer-ranged-city-attack-failed" };
      }
      const rangedAttackState = getState();
      if (!rangedAttackState.lastCombatEvent || rangedAttackState.lastCombatEvent.type !== "city") {
        return { ok: false, reason: "missing-ranged-combat-breakdown-payload" };
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

    await canvas.screenshot({ path: `${ARTIFACT_DIR}/smoke.png` });

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
