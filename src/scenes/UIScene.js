import Phaser from "../core/phaserRuntime.js";
import { gameEvents } from "../core/eventBus.js";
import { HEX_SIZE } from "../core/constants.js";
import { axialToWorld, worldToAxial } from "../core/hexGrid.js";
import { TECH_ORDER, TECH_TREE } from "../core/techTree.js";
import { HUD_THEME, UI_FONTS, resolveButtonPalette } from "../ui/theme.js";

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 40;
const TABLET_LAYOUT_BREAKPOINT = 900;
const SQRT_3 = Math.sqrt(3);
const MINIMAP_HEX_CORNERS = Array.from({ length: 6 }, (_, index) => {
  const angle = Phaser.Math.DegToRad(60 * index - 30);
  return { x: Math.cos(angle), y: Math.sin(angle) };
});
const AXIAL_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const DIRECTION_TO_EDGE_INDEX = [0, 5, 4, 3, 2, 1];
const CITY_PANEL_TAB_WIDTH = 102;
const CITY_PANEL_ACTION_WIDTH = 100;
const CITY_PANEL_QUEUE_ITEM_WIDTH = 126;
const CITY_PANEL_QUEUE_MOVE_WIDTH = 32;
const CITY_PANEL_QUEUE_REMOVE_WIDTH = 32;
const CITY_PANEL_BUTTON_HEIGHT = 32;
const UNIT_PANEL_ACTION_WIDTH = 108;
const NEW_GAME_MODAL_WIDTH = 460;
const NEW_GAME_MODAL_HEIGHT = 286;
const NEW_GAME_MAP_PRESETS = [16, 20, 24];
const NEW_GAME_AI_MIN = 1;
const NEW_GAME_AI_MAX = 6;
const TECH_TREE_MODAL_WIDTH_MIN = 560;
const TECH_TREE_MODAL_WIDTH_MAX = 1120;
const TECH_TREE_MODAL_HEIGHT_MIN = 420;
const TECH_TREE_MODAL_HEIGHT_MAX = 760;
const TECH_TREE_MODAL_CONTENT_PADDING = 16;
const TECH_TREE_GRAPH_VIEWPORT_MIN_HEIGHT = 220;
const TECH_TREE_GRAPH_LANE_HEIGHT = 96;
const TECH_TREE_GRAPH_NODE_WIDTH = 168;
const TECH_TREE_GRAPH_NODE_HEIGHT = 58;
const TECH_TREE_GRAPH_NODE_SLOT_WIDTH = TECH_TREE_GRAPH_NODE_WIDTH + 22;
const TECH_TREE_GRAPH_DEPTH_GAP = 56;
const TECH_TREE_GRAPH_PADDING_LEFT = 72;
const TECH_TREE_GRAPH_PADDING_RIGHT = 34;
const TECH_TREE_GRAPH_PADDING_TOP = 14;
const TECH_TREE_GRAPH_PADDING_BOTTOM = 14;
const TECH_TREE_GRAPH_CONNECTOR_COLOR = 0x756851;
const TECH_TREE_GRAPH_CONNECTOR_ALPHA = 0.72;
const TECH_TREE_GRAPH_CONNECTOR_WIDTH = 2;
const CONTEXT_PANEL_COLLAPSED_HEIGHT = 76;
const CONTEXT_PANEL_EXPANDED_HEIGHT_CITY = 250;
const CONTEXT_PANEL_EXPANDED_HEIGHT_CITY_TABLET = 300;
const CONTEXT_PANEL_EXPANDED_HEIGHT_UNIT = 188;
const CONTEXT_PANEL_EXPANDED_HEIGHT_UNIT_TABLET = 232;
const CONTEXT_PANEL_MIN_WIDTH_CITY = 420;
const CONTEXT_PANEL_MIN_WIDTH_UNIT = 340;
const CONTEXT_PANEL_WIDTH_PADDING = 560;
const RIGHT_RAIL_QUEUE_PANEL_HEIGHT = 236;
const RIGHT_RAIL_QUEUE_PANEL_HEIGHT_TABLET = 208;
const RIGHT_RAIL_QUEUE_PANEL_MIN_HEIGHT = 140;
const RIGHT_RAIL_QUEUE_SLOT_OUTER_PADDING = 14;
const RIGHT_RAIL_QUEUE_SLOT_ROW_GAP = 6;
const RIGHT_RAIL_QUEUE_SLOT_INNER_GAP = 6;
const NOTIFICATION_ROW_HEIGHT = 46;
const NOTIFICATION_HEADER_HEIGHT = 40;
const NOTIFICATION_ROW_INSET = 8;
const FORECAST_PANEL_HEIGHT = 74;
const FORECAST_PANEL_HEIGHT_TABLET = 66;
const STATS_PANEL_HEIGHT = 120;
const STATS_PANEL_HEIGHT_TABLET = 108;
const MINIMAP_PANEL_WIDTH = 220;
const MINIMAP_PANEL_HEIGHT = 166;
const MINIMAP_PANEL_WIDTH_TABLET = 186;
const MINIMAP_PANEL_HEIGHT_TABLET = 146;
const MINIMAP_INSET = 10;
const MINIMAP_TITLE_HEIGHT = 24;
const MINIMAP_CAPTION_HEIGHT = 14;
const PRODUCTION_TABS = ["units", "buildings"];
const UNIT_PRODUCTION_TYPES = ["warrior", "settler", "spearman", "archer"];
const BUILDING_PRODUCTION_TYPES = ["granary", "workshop", "monument", "campus", "library", "university", "researchLab"];
const NOTIFICATION_FILTERS = ["All", "Combat", "City", "Research", "System"];
const UI_SFX_ACTIONS = new Set([
  "endTurn",
  "pause-resume",
  "pause-restart",
  "pause-sfx",
  "restart-confirm",
  "restart-cancel",
  "resultRestart",
]);

const SEMANTIC_COLORS = HUD_THEME.semanticColors;
const PANEL_STROKE_WIDTH = HUD_THEME.panelStrokeWidth;
const BUTTON_STROKE_WIDTH = HUD_THEME.buttonStrokeWidth;
const DELTA_NEGATIVE_TEXT_COLOR = "#b3261e";
const DELTA_TOOLTIP_DEFAULT_TEXT_COLOR = "#f5e8ca";

const UNIT_LABELS = {
  warrior: "Warrior",
  settler: "Settler",
  spearman: "Spearman",
  archer: "Archer",
};

const BUILDING_LABELS = {
  granary: "Granary",
  workshop: "Workshop",
  monument: "Monument",
  campus: "Campus",
  library: "Library",
  university: "University",
  researchLab: "Research Lab",
};

const PRODUCTION_TAB_LABELS = {
  units: "Units",
  buildings: "Buildings",
};

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");

    this.latestState = null;
    this.hoverHint = null;
    this.disabledHoverText = null;
    this.resourceDeltaBreakdowns = {
      food: null,
      production: null,
      gold: null,
    };
    this.pauseMenuOpen = false;
    this.restartConfirmOpen = false;
    this.techTreeModalOpen = false;
    this.newGameMapSize = NEW_GAME_MAP_PRESETS[0];
    this.newGameAiFactionCount = NEW_GAME_AI_MIN + 1;
    this.cityResolutionOpen = false;
    this.modalStateOpen = false;
    this.escapeKey = null;
    this.contextMenuMode = null;
    this.notifications = [];
    this.notificationNextId = 1;
    this.notificationScroll = 0;
    this.notificationVisibleRows = 8;
    this.notificationFilter = "All";
    this.notificationVisibleSlice = [];
    this.notificationVisibleDisplaySlice = [];
    this.notificationUnreadCount = 0;
    this.currentTurn = 0;
    this.statsPanelOpen = false;
    this.latestStatsPayload = {
      cities: 0,
      units: 0,
      readyUnits: 0,
      techCompleted: 0,
      activeTech: null,
      exploredPercent: 0,
    };
    this.latestTechTreeModalPayload = {
      open: false,
      summary: {
        sciencePerTurn: 0,
        baseSciencePerTurn: 0,
        globalModifierTotal: 0,
        completedTech: 0,
        totalTech: TECH_ORDER.length,
        currentTechId: null,
        currentTechName: "None",
        turnsRemaining: null,
        cityScienceBreakdown: [],
      },
      rows: [],
      graph: {
        viewport: { x: 0, y: 0, width: 0, height: 0 },
        contentWidth: 0,
        contentHeight: 0,
        scrollX: 0,
        nodes: [],
        edges: [],
      },
    };
    this.techTreeGraphViewportBounds = { x: 0, y: 0, width: 0, height: 0 };
    this.techTreeGraphContentWidth = 0;
    this.techTreeGraphContentHeight = 0;
    this.techTreeGraphScrollX = 0;
    this.techTreeGraphMaxScrollX = 0;
    this.techTreeGraphDragging = false;
    this.techTreeGraphDragPointerId = null;
    this.techTreeGraphDragStartX = 0;
    this.techTreeGraphDragStartScrollX = 0;
    this.techTreeGraphNodeObjects = [];
    this.contextPanelExpanded = false;
    this.contextPanelPinned = false;
    this.lastContextSelectionKey = null;
    this.disabledTooltipVisible = false;
    this.notificationRows = [];
    this.minimapContentBounds = { x: 0, y: 0, width: 1, height: 1 };
    this.minimapVisible = false;
    this.minimapTerrainKey = "";
    this.minimapViewportKey = "";
    this.minimapViewportBoundarySegments = 0;
    this.minimapViewportFootprint = null;
    this.turnAssistantPulseTween = null;
    this.lastLayoutKey = "";
    this.uiSfxMuted = false;
    this.uiSfxContext = null;
    this.uiSfxMasterGain = null;
    this.uiSfxUnlocked = false;
  }

  create() {
    this.topHudPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelBg, 0.95).setOrigin(0, 0).setDepth(9);
    this.topHudPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.9);
    this.turnLabel = this.createLabel("", 24, 16, "26px", "#22170d", 10, "#f7eedf", 3);
    this.turnLabel.setFontFamily(UI_FONTS.heading);
    this.turnLabel.setLetterSpacing(0.4);
    this.foodLabel = this.createLabel("", 24, 48, "19px", "#22170d", 10);
    this.foodDeltaLabel = this.createLabel("", 24, 50, "16px", SEMANTIC_COLORS.textPositive, 10);
    this.productionLabel = this.createLabel("", 24, 76, "19px", "#22170d", 10);
    this.productionDeltaLabel = this.createLabel("", 24, 78, "16px", SEMANTIC_COLORS.textPositive, 10);
    this.scienceLabel = this.createLabel("", 24, 104, "19px", "#22170d", 10);
    this.scienceDeltaLabel = this.createLabel("", 24, 106, "16px", SEMANTIC_COLORS.textPositive, 10);
    this.configureResourceDeltaHover(this.foodDeltaLabel, "food");
    this.configureResourceDeltaHover(this.productionDeltaLabel, "production");
    this.configureResourceDeltaHover(this.scienceDeltaLabel, "gold");
    this.devVisionLabel = this.createLabel("", 24, 132, "16px", "#46331e", 10);
    this.menuButton = this.createButton("Menu", "open-menu", () => this.openPauseMenu(), {
      variant: "chip",
      width: 88,
      height: 24,
      fontSize: "11px",
    });
    this.statsToggleButton = this.createButton("Stats", "toggle-stats", () => this.toggleStatsPanel(), {
      variant: "chip",
      width: 88,
      height: 24,
      fontSize: "11px",
    });
    this.techTreeButton = this.createButton("Tech Tree", "toggle-tech-tree", () => this.toggleTechTreeModal(), {
      variant: "chip",
      width: 88,
      height: 24,
      fontSize: "11px",
    });
    this.menuButton.rectangle.setDepth(10);
    this.menuButton.label.setDepth(11);
    this.statsToggleButton.rectangle.setDepth(10);
    this.statsToggleButton.label.setDepth(11);
    this.techTreeButton.rectangle.setDepth(10);
    this.techTreeButton.label.setDepth(11);
    this.playbackPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.96).setDepth(11).setVisible(false);
    this.playbackPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.88);
    this.playbackLabel = this.createLabel("", 0, 0, "15px", "#3b2a16", 12).setOrigin(0.5).setVisible(false);
    this.forecastPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.95).setOrigin(0, 0).setDepth(10);
    this.forecastPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.88);
    this.forecastTitle = this.createLabel("Next Turn", 0, 0, "14px", "#3b2a16", 11);
    this.forecastTitle.setFontFamily(UI_FONTS.heading);
    this.forecastLinePrimary = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textStrong, 11);
    this.forecastLineSecondary = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textMuted, 11);
    this.forecastLineTertiary = this.createLabel("", 0, 0, "11px", SEMANTIC_COLORS.textMuted, 11);
    this.statsPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelSoftBg, 0.96).setOrigin(0, 0).setDepth(10).setVisible(false);
    this.statsPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.86);
    this.statsTitle = this.createLabel("Progress Stats", 0, 0, "14px", "#3b2a16", 11).setVisible(false);
    this.statsTitle.setFontFamily(UI_FONTS.heading);
    this.statsCitiesLabel = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textStrong, 11).setVisible(false);
    this.statsUnitsLabel = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textStrong, 11).setVisible(false);
    this.statsTechLabel = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textInfo, 11).setVisible(false);
    this.statsExploreLabel = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textPositive, 11).setVisible(false);
    this.minimapPanel = this.add
      .rectangle(0, 0, MINIMAP_PANEL_WIDTH, MINIMAP_PANEL_HEIGHT, SEMANTIC_COLORS.panelSoftBg, 0.97)
      .setOrigin(0, 0)
      .setDepth(16);
    this.minimapPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.86);
    this.minimapInsetPanel = this.add
      .rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelDarkBg, 0.62)
      .setOrigin(0, 0)
      .setDepth(16)
      .setVisible(false);
    this.minimapInsetPanel.setStrokeStyle(1, 0xcfc1a2, 0.54);
    this.minimapTitle = this.createLabel("Minimap", 0, 0, "14px", "#3b2a16", 17);
    this.minimapTitle.setFontFamily(UI_FONTS.heading);
    this.minimapCaption = this.createLabel("Click to focus", 0, 0, "11px", SEMANTIC_COLORS.textMuted, 17).setVisible(false);
    this.minimapCaption.setFontFamily(UI_FONTS.compact);
    this.minimapGraphics = this.add.graphics().setDepth(17);
    this.minimapMarkerGraphics = this.add.graphics().setDepth(17);
    this.minimapViewportGraphics = this.add.graphics().setDepth(18);
    this.minimapViewportFrame = this.add.rectangle(0, 0, 12, 12).setDepth(18).setOrigin(0, 0).setVisible(false);
    this.minimapViewportFrame.setStrokeStyle(2, SEMANTIC_COLORS.accentBlue, 0.92);
    this.minimapViewportFrame.setFillStyle(SEMANTIC_COLORS.accentBlue, 0.14);
    this.minimapHitArea = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(18)
      .setInteractive({ useHandCursor: true });
    this.minimapHitArea.on("pointerdown", (pointer) => this.handleMinimapPointerDown(pointer));

    this.selectedPanel = this.add.rectangle(24, 0, 460, 92, SEMANTIC_COLORS.panelBg, 0.96).setOrigin(0, 0).setDepth(10);
    this.selectedPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.86);
    this.selectedTitle = this.createLabel("Selected", 38, 0, "16px", "#442f19", 11);
    this.selectedTitle.setFontFamily(UI_FONTS.heading);
    this.selectedDetails = this.createLabel("No selection", 38, 0, "15px", "#3b2a16", 11);

    this.endTurnButton = this.createButton("End Turn", "endTurn", () => gameEvents.emit("end-turn-requested"), { variant: "warning" });
    this.turnAssistantPanel = this.add.rectangle(0, 0, 220, 72, SEMANTIC_COLORS.panelBg, 0.95).setDepth(12);
    this.turnAssistantPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.88);
    this.turnAssistantAccent = this.add.rectangle(0, 0, 10, 6, SEMANTIC_COLORS.accentAmber, 0.86).setDepth(13);
    this.turnAssistantStatusDot = this.add.circle(0, 0, 4, SEMANTIC_COLORS.accentAmber, 0.94).setDepth(13);
    this.turnAssistantLabel = this.createLabel("Attention", 0, 0, "14px", SEMANTIC_COLORS.textStrong, 13).setOrigin(0.5);
    this.turnAssistantLabel.setFontFamily(UI_FONTS.heading);
    this.turnAssistantSecondaryLabel = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textMuted, 13).setOrigin(0.5);
    this.attentionReadyButton = this.createButton("Units 0", "attention-ready", () => gameEvents.emit("attention-ready-unit-requested"), {
      variant: "success",
      width: 94,
      height: 24,
      fontSize: "12px",
    });
    this.attentionQueueButton = this.createButton("Queues 0", "attention-queue", () => gameEvents.emit("attention-empty-queue-requested"), {
      variant: "warning",
      width: 94,
      height: 24,
      fontSize: "12px",
    });
    this.attentionReadyButton.rectangle.setDepth(14);
    this.attentionReadyButton.label.setDepth(15);
    this.attentionQueueButton.rectangle.setDepth(14);
    this.attentionQueueButton.label.setDepth(15);
    this.nextUnitButton = this.createButton("Next Unit", "nextUnit", () => gameEvents.emit("next-ready-unit-requested"), {
      variant: "success",
      width: 130,
      height: 30,
      fontSize: "14px",
    });

    this.contextPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.95).setDepth(12).setVisible(false);
    this.contextPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.9);
    this.contextPanelTitle = this.createLabel("", 0, 0, "16px", "#3d2a14", 13);
    this.contextPanelTitle.setFontFamily(UI_FONTS.heading);
    this.contextPanelTitle.setOrigin(0.5);
    this.contextPanelTitle.setVisible(false);
    this.contextPanelExpandButton = this.createButton("^", "context-expand-toggle", () => this.toggleContextPanelExpanded(), {
      variant: "secondary",
      width: 36,
      height: 26,
      fontSize: "16px",
    });
    this.contextPanelPinButton = this.createButton("Pin", "context-pin-toggle", () => this.toggleContextPanelPinned(), {
      variant: "secondary",
      width: 62,
      height: 26,
      fontSize: "13px",
    });
    this.contextPanelMetaPrimary = this.createLabel("", 0, 0, "14px", "#3f2d18", 13).setOrigin(0.5).setVisible(false);
    this.contextPanelMetaSecondary = this.createLabel("", 0, 0, "13px", "#5a4224", 13).setOrigin(0.5).setVisible(false);
    this.contextPanelDisabledReason = this.createLabel("", 0, 0, "13px", "#7b3024", 13).setOrigin(0.5).setVisible(false);

    this.cityProductionTabButtons = PRODUCTION_TABS.map((tab) =>
      this.createButton(
        PRODUCTION_TAB_LABELS[tab],
        `city-production-tab-${tab}`,
        () => gameEvents.emit("city-production-tab-set-requested", { tab }),
        {
          variant: "chip",
          width: CITY_PANEL_TAB_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "14px",
        }
      )
    );
    this.cityProductionButtons = UNIT_PRODUCTION_TYPES.map((unitType) =>
      this.createButton(
        "--",
        `city-enqueue-${unitType}`,
        () =>
          gameEvents.emit("city-queue-enqueue-requested", {
            unitType,
            queueItem: { kind: "unit", id: unitType },
          }),
        {
          variant: "primary",
          width: CITY_PANEL_ACTION_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "11px",
        }
      )
    );
    this.cityBuildingButtons = BUILDING_PRODUCTION_TYPES.map((buildingId) =>
      this.createButton(
        "--",
        `city-enqueue-building-${buildingId}`,
        () =>
          gameEvents.emit("city-queue-enqueue-requested", {
            buildingId,
            queueItem: { kind: "building", id: buildingId },
          }),
        {
          variant: "success",
          width: CITY_PANEL_ACTION_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "11px",
        }
      )
    );
    for (const productionButton of [...this.cityProductionButtons, ...this.cityBuildingButtons]) {
      productionButton.label.setWordWrapWidth(Math.max(48, productionButton.width - 8), true);
      productionButton.label.setAlign("center");
      productionButton.label.setLineSpacing(-1);
    }
    this.cityQueueButtons = [0, 1, 2].map((index) =>
      this.createButton(
        `${index + 1}: --`,
        `city-queue-slot-${index}`,
        () => {},
        {
          variant: "secondary",
          width: CITY_PANEL_QUEUE_ITEM_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "10px",
        }
      )
    );
    this.cityQueueMoveUpButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "^",
        `city-queue-move-up-${index}`,
        () => gameEvents.emit("city-queue-move-requested", { index, direction: "up" }),
        {
          variant: "primary",
          width: CITY_PANEL_QUEUE_MOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "11px",
        }
      )
    );
    this.cityQueueMoveDownButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "v",
        `city-queue-move-down-${index}`,
        () => gameEvents.emit("city-queue-move-requested", { index, direction: "down" }),
        {
          variant: "primary",
          width: CITY_PANEL_QUEUE_MOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "11px",
        }
      )
    );
    this.cityQueueRemoveButtons = [0, 1, 2].map((index) =>
      this.createButton(
        "x",
        `city-queue-remove-${index}`,
        () => gameEvents.emit("city-queue-remove-requested", { index }),
        {
          variant: "danger",
          width: CITY_PANEL_QUEUE_REMOVE_WIDTH,
          height: CITY_PANEL_BUTTON_HEIGHT,
          fontSize: "11px",
        }
      )
    );
    for (const queueButton of this.cityQueueButtons) {
      queueButton.rectangle.setDepth(18);
      queueButton.label.setDepth(19);
      queueButton.label.setWordWrapWidth(Math.max(38, queueButton.width - 6), true);
      queueButton.label.setAlign("center");
      queueButton.label.setLineSpacing(-1);
    }
    for (const controlButton of [...this.cityQueueMoveUpButtons, ...this.cityQueueMoveDownButtons, ...this.cityQueueRemoveButtons]) {
      controlButton.rectangle.setDepth(18);
      controlButton.label.setDepth(19);
    }
    this.unitFoundCityButton = this.createButton("Found City", "unit-found-city", () =>
      gameEvents.emit("unit-action-requested", { actionId: "foundCity" }),
      {
        variant: "primary",
        width: UNIT_PANEL_ACTION_WIDTH,
        height: BUTTON_HEIGHT - 6,
      }
    );
    this.unitSkipButton = this.createButton("Skip Unit", "unit-skip", () =>
      gameEvents.emit("unit-action-requested", { actionId: "skipUnit" }),
      {
        variant: "secondary",
        width: UNIT_PANEL_ACTION_WIDTH,
        height: BUTTON_HEIGHT - 6,
      }
    );
    this.unitDiplomacyButton = this.createButton("Diplomacy", "unit-diplomacy-toggle", () =>
      gameEvents.emit("unit-action-requested", { actionId: "toggleDiplomacy" }),
      {
        variant: "warning",
        width: UNIT_PANEL_ACTION_WIDTH,
        height: BUTTON_HEIGHT - 6,
        fontSize: "13px",
      }
    );
    this.setCityControlsVisible(false);
    this.setUnitControlsVisible(false);
    this.turnAssistantSecondaryLabel.setVisible(false);
    this.setCompositeVisible(this.attentionReadyButton, true);
    this.setCompositeVisible(this.attentionQueueButton, true);
    this.setSfxMuted(false);
    this.setButtonActive(this.statsToggleButton, false);
    this.setCompositeVisible(this.contextPanelExpandButton, false);
    this.setCompositeVisible(this.contextPanelPinButton, false);
    this.contextPanelMetaPrimary.setVisible(false);
    this.contextPanelMetaSecondary.setVisible(false);
    this.contextPanelDisabledReason.setVisible(false);
    this.setStatsPanelVisible(false);

    this.hintPanel = this.add.rectangle(0, 0, 440, 74, SEMANTIC_COLORS.panelElevatedBg, 0.95).setDepth(20).setVisible(false);
    this.hintPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.84);
    this.hintPrimary = this.createLabel("", 0, 0, "16px", "#3b2a16", 21);
    this.hintPrimary.setOrigin(0.5).setVisible(false);
    this.hintSecondary = this.createLabel("", 0, 0, "14px", "#5d4b34", 21);
    this.hintSecondary.setOrigin(0.5).setVisible(false);
    this.previewPanel = this.add.rectangle(0, 0, 360, 66, SEMANTIC_COLORS.panelElevatedBg, 0.95).setDepth(22).setVisible(false);
    this.previewPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.84);
    this.previewTitle = this.createLabel("", 0, 0, "15px", "#3b2a16", 23);
    this.previewTitle.setOrigin(0.5).setVisible(false);
    this.previewDetails = this.createLabel("", 0, 0, "13px", "#5d4b34", 23);
    this.previewDetails.setOrigin(0.5).setVisible(false);
    this.disabledTooltipPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelDarkBg, 0.94).setDepth(31).setVisible(false);
    this.disabledTooltipPanel.setStrokeStyle(1, 0xe3d4b2, 0.95);
    this.disabledTooltipLabel = this.createLabel("", 0, 0, "12px", DELTA_TOOLTIP_DEFAULT_TEXT_COLOR, 32).setVisible(false);

    this.notificationPanel = this.add.rectangle(0, 0, 360, 236, SEMANTIC_COLORS.panelSoftBg, 0.97).setDepth(16);
    this.notificationPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.9);
    this.notificationAccent = this.add.rectangle(0, 0, 10, 4, SEMANTIC_COLORS.accentBlue, 0.88).setOrigin(0, 0).setDepth(17);
    this.notificationTitle = this.createLabel("Notifications", 0, 0, "18px", "#2a1d11", 17);
    this.notificationTitle.setFontFamily(UI_FONTS.heading);
    this.notificationSubtitle = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textStrong, 17);
    this.notificationSubtitle.setFontFamily(UI_FONTS.compact);
    this.notificationEmptyLabel = this.createLabel("No notifications yet.", 0, 0, "13px", SEMANTIC_COLORS.textStrong, 18).setVisible(false);
    this.notificationEmptyLabel.setOrigin(0.5);
    this.notificationEmptyLabel.setFontFamily(UI_FONTS.compact);
    this.notificationFilterButtons = NOTIFICATION_FILTERS.map((filterName) =>
      this.createButton(filterName, `notif-filter-${filterName}`, () => this.setNotificationFilter(filterName), {
        variant: "chip",
        width: filterName === "Research" ? 70 : filterName === "Combat" ? 64 : 56,
        height: 25,
        fontSize: "11px",
      })
    );
    for (const filterButton of this.notificationFilterButtons) {
      filterButton.rectangle.setDepth(18);
      filterButton.label.setDepth(19);
    }
    this.notificationRows = Array.from({ length: 8 }, (_unused, index) => this.createNotificationRow(index));

    this.cityQueueRailPanel = this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.95).setDepth(16).setVisible(false);
    this.cityQueueRailPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.84);
    this.cityQueueRailTitle = this.createLabel("City Queue", 0, 0, "17px", "#422d18", 17).setVisible(false);
    this.cityQueueRailTitle.setFontFamily(UI_FONTS.heading);
    this.cityQueueRailDetailsPrimary = this.createLabel("", 0, 0, "13px", "#3b2a16", 17).setVisible(false);
    this.cityQueueRailDetailsSecondary = this.createLabel("", 0, 0, "13px", "#5d4b34", 17).setVisible(false);
    this.cityQueueRailDetailsTertiary = this.createLabel("", 0, 0, "12px", "#5d4b34", 17).setVisible(false);
    this.cityQueueRushBuyButton = this.createButton("Rush Buy", "city-rush-buy", () => gameEvents.emit("city-queue-rush-buy-requested"), {
      variant: "warning",
      width: 128,
      height: 26,
      fontSize: "12px",
    });
    this.cityQueueRushBuyButton.rectangle.setDepth(18);
    this.cityQueueRushBuyButton.label.setDepth(19);
    this.setCompositeVisible(this.cityQueueRushBuyButton, false);

    this.techTreeModalPanel = this.add
      .rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.98)
      .setDepth(40)
      .setVisible(false)
      .setInteractive();
    this.techTreeModalPanel.setStrokeStyle(3, SEMANTIC_COLORS.panelBorder, 1);
    this.techTreeModalPanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.techTreeModalTitle = this.createLabel("Technology Overview", 0, 0, "27px", "#472f17", 41).setOrigin(0.5).setVisible(false);
    this.techTreeModalTitle.setFontFamily(UI_FONTS.display);
    this.techTreeModalSubtitle = this.createLabel("Read-only science and research summary", 0, 0, "13px", "#5d4b34", 41)
      .setOrigin(0.5)
      .setVisible(false);
    this.techTreeSummaryScienceLabel = this.createLabel("", 0, 0, "13px", "#3b2a16", 41).setVisible(false);
    this.techTreeSummaryCurrentLabel = this.createLabel("", 0, 0, "13px", "#3b2a16", 41).setVisible(false);
    this.techTreeSummaryCitiesLabel = this.createLabel("", 0, 0, "12px", "#5d4b34", 41).setVisible(false);
    this.techTreeSummaryLegendLabel = this.createLabel("", 0, 0, "11px", "#6a5a45", 41).setVisible(false);
    this.techTreeGraphViewportPanel = this.add
      .rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelSoftBg, 0.88)
      .setOrigin(0, 0)
      .setDepth(41)
      .setVisible(false);
    this.techTreeGraphViewportPanel.setStrokeStyle(1, SEMANTIC_COLORS.panelBorder, 0.75);
    this.techTreeGraphLaneBands = [0, 1, 2].map(() =>
      this.add.rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelBg, 0.34).setOrigin(0, 0).setDepth(41).setVisible(false)
    );
    this.techTreeLaneLabels = [1, 2, 3].map((era) =>
      this.createLabel(`Era ${era}`, 0, 0, "11px", "#5d4b34", 42).setVisible(false)
    );
    for (const laneLabel of this.techTreeLaneLabels) {
      laneLabel.setFontFamily(UI_FONTS.compact);
    }
    this.techTreeGraphHitArea = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(42)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.techTreeGraphHitArea.on("pointerdown", (pointer, _x, _y, event) => {
      event.stopPropagation();
      if (!this.techTreeModalOpen) {
        return;
      }
      this.techTreeGraphDragging = true;
      this.techTreeGraphDragPointerId = pointer.id;
      this.techTreeGraphDragStartX = pointer.x;
      this.techTreeGraphDragStartScrollX = this.techTreeGraphScrollX;
    });
    this.techTreeGraphHitArea.on("pointerup", (pointer, _x, _y, event) => {
      event.stopPropagation();
      if (this.techTreeGraphDragPointerId === pointer.id || this.techTreeGraphDragPointerId === null) {
        this.stopTechTreeGraphDrag();
      }
    });
    this.techTreeGraphContainer = this.add.container(0, 0).setDepth(41).setVisible(false);
    this.techTreeGraphEdges = this.add.graphics().setDepth(41).setVisible(false);
    this.techTreeGraphContainer.add(this.techTreeGraphEdges);
    this.techTreeGraphMaskShape = this.add.graphics().setDepth(0).setVisible(false);
    this.techTreeGraphMask = this.techTreeGraphMaskShape.createGeometryMask();
    this.techTreeGraphContainer.setMask(this.techTreeGraphMask);
    this.techTreeCloseButton = this.createButton("Close", "tech-tree-close", () => this.closeTechTreeModal(), {
      variant: "chip",
      width: 86,
      height: 26,
      fontSize: "11px",
    });
    this.techTreeCloseButton.rectangle.setDepth(42);
    this.techTreeCloseButton.label.setDepth(43);
    this.setCompositeVisible(this.techTreeCloseButton, false);

    this.modalBackdrop = this.add
      .rectangle(0, 0, 10, 10, 0x2a1b10, 0.34)
      .setDepth(39)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.modalBackdrop.on("pointerdown", () => {
      if (this.techTreeModalOpen) {
        this.closeTechTreeModal();
      } else if (this.restartConfirmOpen) {
        this.closeRestartConfirm();
      } else if (this.pauseMenuOpen) {
        this.closePauseMenu();
      }
    });

    this.pausePanel = this.add.rectangle(0, 0, 420, 216, SEMANTIC_COLORS.panelElevatedBg, 0.98).setDepth(40).setVisible(false);
    this.pausePanel.setStrokeStyle(3, SEMANTIC_COLORS.panelBorder, 1);
    this.pausePanel.setInteractive();
    this.pausePanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.pauseTitle = this.createLabel("Paused", 0, 0, "34px", "#472f17", 41);
    this.pauseTitle.setFontFamily(UI_FONTS.display);
    this.pauseTitle.setOrigin(0.5).setVisible(false);
    this.pauseResumeButton = this.createButton("Resume", "pause-resume", () => this.closePauseMenu(), { variant: "primary" });
    this.pauseRestartButton = this.createButton("New Game", "pause-restart", () => this.openRestartConfirm(), { variant: "warning" });
    this.pauseSettingsLabel = this.createLabel("Settings", 0, 0, "14px", "#5d4b34", 42).setOrigin(0.5).setVisible(false);
    this.pauseSettingsLabel.setFontFamily(UI_FONTS.heading);
    this.pauseSfxButton = this.createButton("SFX ON", "pause-sfx", () => this.toggleSfxMuted(), {
      variant: "chip",
      width: 132,
      height: 28,
      fontSize: "12px",
    });
    this.pauseResumeButton.rectangle.setDepth(42);
    this.pauseResumeButton.label.setDepth(43);
    this.pauseRestartButton.rectangle.setDepth(42);
    this.pauseRestartButton.label.setDepth(43);
    this.pauseSfxButton.rectangle.setDepth(42);
    this.pauseSfxButton.label.setDepth(43);
    this.setCompositeVisible(this.pauseResumeButton, false);
    this.setCompositeVisible(this.pauseRestartButton, false);
    this.setCompositeVisible(this.pauseSfxButton, false);

    this.restartConfirmPanel = this.add
      .rectangle(0, 0, NEW_GAME_MODAL_WIDTH, NEW_GAME_MODAL_HEIGHT, SEMANTIC_COLORS.panelElevatedBg, 0.98)
      .setDepth(44)
      .setVisible(false);
    this.restartConfirmPanel.setStrokeStyle(3, SEMANTIC_COLORS.panelBorder, 1);
    this.restartConfirmPanel.setInteractive();
    this.restartConfirmPanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.restartConfirmTitle = this.createLabel("New Game", 0, 0, "30px", "#472f17", 45);
    this.restartConfirmTitle.setFontFamily(UI_FONTS.display);
    this.restartConfirmTitle.setOrigin(0.5).setVisible(false);
    this.restartConfirmSubtitle = this.createLabel("Configure map size and enemy factions.", 0, 0, "16px", "#472f17", 45);
    this.restartConfirmSubtitle.setOrigin(0.5).setVisible(false);
    this.newGameMapPresetButtons = NEW_GAME_MAP_PRESETS.map((size) =>
      this.createButton(`${size}x${size}`, `new-game-map-${size}`, () => this.setNewGameMapSize(size), {
        variant: "primary",
        width: 92,
        height: 30,
        fontSize: "13px",
      })
    );
    this.newGameAiLabel = this.createLabel("Enemies", 0, 0, "15px", "#472f17", 45).setOrigin(0.5).setVisible(false);
    this.newGameAiValueLabel = this.createLabel("2", 0, 0, "20px", "#2a1d11", 45).setOrigin(0.5).setVisible(false);
    this.newGameAiMinusButton = this.createButton("-", "new-game-ai-minus", () => this.adjustNewGameAiCount(-1), {
      variant: "chip",
      width: 36,
      height: 30,
      fontSize: "20px",
    });
    this.newGameAiPlusButton = this.createButton("+", "new-game-ai-plus", () => this.adjustNewGameAiCount(1), {
      variant: "chip",
      width: 36,
      height: 30,
      fontSize: "20px",
    });
    this.restartConfirmButton = this.createButton("Start New Game", "restart-confirm", () => this.confirmRestart(), { variant: "success" });
    this.restartCancelButton = this.createButton("Cancel", "restart-cancel", () => this.closeRestartConfirm(), { variant: "warning" });
    this.restartConfirmButton.rectangle.setDepth(46);
    this.restartConfirmButton.label.setDepth(47);
    this.restartCancelButton.rectangle.setDepth(46);
    this.restartCancelButton.label.setDepth(47);
    this.newGameAiMinusButton.rectangle.setDepth(46);
    this.newGameAiMinusButton.label.setDepth(47);
    this.newGameAiPlusButton.rectangle.setDepth(46);
    this.newGameAiPlusButton.label.setDepth(47);
    for (const button of this.newGameMapPresetButtons) {
      button.rectangle.setDepth(46);
      button.label.setDepth(47);
      this.setCompositeVisible(button, false);
    }
    this.newGameAiLabel.setDepth(46);
    this.newGameAiValueLabel.setDepth(46);
    this.newGameAiLabel.setVisible(false);
    this.newGameAiValueLabel.setVisible(false);
    this.setCompositeVisible(this.newGameAiMinusButton, false);
    this.setCompositeVisible(this.newGameAiPlusButton, false);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);

    this.cityOutcomePanel = this.add.rectangle(0, 0, 420, 160, SEMANTIC_COLORS.panelElevatedBg, 0.98).setDepth(48).setVisible(false);
    this.cityOutcomePanel.setStrokeStyle(3, SEMANTIC_COLORS.panelBorder, 1);
    this.cityOutcomePanel.setInteractive();
    this.cityOutcomePanel.on("pointerdown", (_pointer, _x, _y, event) => event.stopPropagation());
    this.cityOutcomeTitle = this.createLabel("City conquered", 0, 0, "30px", "#472f17", 49);
    this.cityOutcomeTitle.setFontFamily(UI_FONTS.display);
    this.cityOutcomeTitle.setOrigin(0.5).setVisible(false);
    this.cityOutcomeSubtitle = this.createLabel("Capture it or raze it.", 0, 0, "17px", "#472f17", 49);
    this.cityOutcomeSubtitle.setOrigin(0.5).setVisible(false);
    this.cityCaptureButton = this.createButton(
      "Capture",
      "cityCapture",
      () => gameEvents.emit("city-outcome-requested", { choice: "capture" }),
      { variant: "success" }
    );
    this.cityRazeButton = this.createButton("Raze", "cityRaze", () =>
      gameEvents.emit("city-outcome-requested", { choice: "raze" }),
      { variant: "danger" }
    );
    this.cityCaptureButton.rectangle.setDepth(50);
    this.cityCaptureButton.label.setDepth(51);
    this.cityRazeButton.rectangle.setDepth(50);
    this.cityRazeButton.label.setDepth(51);
    this.setCompositeVisible(this.cityCaptureButton, false);
    this.setCompositeVisible(this.cityRazeButton, false);

    this.resultPanel = this.add.rectangle(0, 0, 460, 170, SEMANTIC_COLORS.panelElevatedBg, 0.98).setDepth(52).setVisible(false);
    this.resultPanel.setStrokeStyle(3, SEMANTIC_COLORS.panelBorder, 1);
    this.resultTitle = this.createLabel("", 0, 0, "36px", "#472f17", 53);
    this.resultTitle.setFontFamily(UI_FONTS.display);
    this.resultTitle.setOrigin(0.5).setVisible(false);
    this.resultSubtitle = this.createLabel("", 0, 0, "19px", "#472f17", 53);
    this.resultSubtitle.setOrigin(0.5).setVisible(false);
    this.resultRestartButton = this.createButton("New Game", "resultRestart", () => this.openRestartConfirm(), { variant: "warning" });
    this.resultRestartButton.rectangle.setDepth(54);
    this.resultRestartButton.label.setDepth(55);
    this.setCompositeVisible(this.resultRestartButton, false);

    this.scale.on("resize", this.layout, this);
    this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC) ?? null;
    this.escapeKey?.on("down", this.handleEscapePressed, this);
    this.input.on("wheel", this.handleWheel, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    gameEvents.on("state-changed", this.updateFromState, this);
    gameEvents.on("camera-changed", this.handleCameraChanged, this);
    gameEvents.on("preview-changed", this.handlePreviewChanged, this);
    gameEvents.on("ui-toast-requested", this.handleNotificationRequested, this);
    gameEvents.on("ui-notifications-reset-requested", this.handleNotificationsReset, this);
    gameEvents.on("ui-sfx-requested", this.handleUiSfxRequested, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layout, this);
      this.escapeKey?.off("down", this.handleEscapePressed, this);
      this.input.off("wheel", this.handleWheel, this);
      this.input.off("pointermove", this.handlePointerMove, this);
      this.input.off("pointerup", this.handlePointerUp, this);
      gameEvents.off("state-changed", this.updateFromState, this);
      gameEvents.off("camera-changed", this.handleCameraChanged, this);
      gameEvents.off("preview-changed", this.handlePreviewChanged, this);
      gameEvents.off("ui-toast-requested", this.handleNotificationRequested, this);
      gameEvents.off("ui-notifications-reset-requested", this.handleNotificationsReset, this);
      gameEvents.off("ui-sfx-requested", this.handleUiSfxRequested, this);
      this.setTurnAssistantPulse(false);
      gameEvents.emit("ui-modal-state-changed", false);
    });

    const worldScene = this.scene.get("WorldScene");
    if (worldScene && typeof worldScene.getGameStateSnapshot === "function") {
      this.updateFromState(worldScene.getGameStateSnapshot());
    }

    this.layout(this.scale.gameSize);
    this.refreshNewGameConfigUi();
    this.updateNotificationCenter();
  }

  createLabel(text, x, y, size, color, depth, stroke, strokeThickness = 0) {
    const config = {
      fontFamily: UI_FONTS.body,
      fontSize: normalizeFontSize(size, 13),
      color,
      ...(stroke ? { stroke, strokeThickness } : {}),
    };
    return this.add.text(x, y, text, config).setDepth(depth);
  }

  configureResourceDeltaHover(label, resourceKey) {
    if (!label) {
      return;
    }
    label.setInteractive({ useHandCursor: true });
    label.on("pointerover", (pointer) => this.handleResourceDeltaHover(resourceKey, true, pointer));
    label.on("pointerout", () => this.handleResourceDeltaHover(resourceKey, false));
  }

  refreshLabelHitArea(label) {
    const hitArea = label?.input?.hitArea;
    if (!hitArea || typeof hitArea.setTo !== "function") {
      return;
    }
    hitArea.setTo(0, 0, Math.max(1, label.width), Math.max(1, label.height));
  }

  handleResourceDeltaHover(resourceKey, isEntering, pointer) {
    if (!isEntering) {
      this.hoverHint = null;
      this.updateContextualHint();
      this.hideDisabledTooltip();
      return;
    }
    const breakdown = this.resourceDeltaBreakdowns?.[resourceKey] ?? null;
    if (!breakdown || !breakdown.tooltip) {
      return;
    }
    this.hoverHint = {
      primary: truncateText(breakdown.hint, 160),
      secondary: null,
      level: "info",
    };
    this.updateContextualHint();
    this.showDisabledTooltip(breakdown.tooltip, { textColor: breakdown.textColor });
    if (pointer) {
      this.updateDisabledTooltipPosition(pointer);
    }
  }

  createButton(label, actionId, onClick, options = {}) {
    const variant = typeof options.variant === "string" ? options.variant : "primary";
    const paletteOverrides = Object.fromEntries(
      Object.entries({
        enabledFill: options.enabledFill,
        hoverFill: options.hoverFill,
        activeFill: options.activeFill,
        warningFill: options.warningFill,
        disabledFill: options.disabledFill,
        stroke: options.stroke,
        textColor: options.textColor,
        enabledAlpha: options.enabledAlpha,
        hoverAlpha: options.hoverAlpha,
        activeAlpha: options.activeAlpha,
        warningAlpha: options.warningAlpha,
        disabledAlpha: options.disabledAlpha,
      }).filter(([, value]) => value !== undefined)
    );
    const resolvedPalette = resolveButtonPalette(variant, paletteOverrides);

    const width = options.width ?? BUTTON_WIDTH;
    const height = options.height ?? BUTTON_HEIGHT;
    const strokeWidth = options.strokeWidth ?? BUTTON_STROKE_WIDTH;

    const rectangle = this.add
      .rectangle(0, 0, width, height, resolvedPalette.enabledFill, resolvedPalette.enabledAlpha)
      .setStrokeStyle(strokeWidth, resolvedPalette.stroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(14);
    const text = this.createLabel(label, 0, 0, options.fontSize ?? "18px", resolvedPalette.textColor, 15).setOrigin(0.5);
    text.setFontFamily(UI_FONTS.compact);
    text.setLetterSpacing(0.2);

    const button = {
      rectangle,
      label: text,
      defaultLabel: label,
      actionId,
      enabled: true,
      isActive: false,
      warning: false,
      onClick,
      palette: resolvedPalette,
      variant,
      width,
      height,
    };

    rectangle.on("pointerover", () => this.handleButtonHover(button, true));
    rectangle.on("pointerout", () => this.handleButtonHover(button, false));
    rectangle.on("pointerdown", () => this.handleButtonClick(button));
    return button;
  }

  createNotificationRow(index) {
    const panel = this.add
      .rectangle(0, 0, 10, 10, SEMANTIC_COLORS.panelElevatedBg, 0.8)
      .setOrigin(0, 0)
      .setDepth(17)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    panel.setStrokeStyle(1, SEMANTIC_COLORS.panelBorder, 0.68);
    const stripe = this.add.rectangle(0, 0, 3, 10, SEMANTIC_COLORS.panelBorder, 0.8).setOrigin(0, 0).setDepth(18).setVisible(false);
    const badge = this.add.rectangle(0, 0, 10, 10, 0x62635f, 0.9).setOrigin(0, 0).setDepth(18).setVisible(false);
    const badgeLabel = this.createLabel("", 0, 0, "10px", "#f8f0dd", 19).setVisible(false);
    const header = this.createLabel("", 0, 0, "12px", SEMANTIC_COLORS.textMuted, 19).setVisible(false);
    const message = this.createLabel("", 0, 0, "14px", SEMANTIC_COLORS.textStrong, 19).setVisible(false);
    const unreadDot = this.add.circle(0, 0, 3, SEMANTIC_COLORS.accentBlue, 0.92).setDepth(19).setVisible(false);
    const jump = this.createLabel("Focus", 0, 0, "11px", SEMANTIC_COLORS.textInfo, 19).setVisible(false);
    const entry = { panel, stripe, badge, badgeLabel, header, message, unreadDot, jump };
    const clickHandler = () => this.focusNotificationByRow(index);
    panel.on("pointerdown", clickHandler);
    header.on("pointerdown", clickHandler);
    message.on("pointerdown", clickHandler);
    jump.on("pointerdown", clickHandler);
    return entry;
  }

  setNotificationRowVisible(row, visible) {
    row.panel.setVisible(visible);
    row.stripe.setVisible(visible);
    row.badge.setVisible(visible);
    row.badgeLabel.setVisible(visible);
    row.header.setVisible(visible);
    row.message.setVisible(visible);
    row.unreadDot.setVisible(false);
    row.jump.setVisible(false);
  }

  animatePanelVisibility(panel, labels, visible) {
    const targets = [panel, ...labels];
    const currentlyVisible = panel.visible;
    if (visible && currentlyVisible && panel.alpha >= 0.98) {
      for (const label of labels) {
        label.setVisible(true);
      }
      return;
    }
    if (!visible && !currentlyVisible) {
      return;
    }
    if (visible) {
      panel.setVisible(true);
      for (const label of labels) {
        label.setVisible(true);
      }
      this.tweens.killTweensOf(targets);
      for (const target of targets) {
        target.setAlpha(0);
      }
      this.tweens.add({
        targets,
        alpha: 1,
        duration: 120,
        ease: "Quad.Out",
      });
      return;
    }
    this.tweens.killTweensOf(targets);
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 90,
      ease: "Quad.Out",
      onComplete: () => {
        panel.setVisible(false);
        for (const label of labels) {
          label.setVisible(false);
        }
      },
    });
  }

  handleButtonHover(button, isEntering) {
    if (this.isAnyModalOpen() && !this.isModalButton(button.actionId)) {
      return;
    }
    const productionHoverText = this.getProductionHoverText(button.actionId);
    if (button.enabled) {
      if (isEntering) {
        button.rectangle.setFillStyle(button.palette.hoverFill, button.palette.hoverAlpha);
        this.animateButtonHover(button, true);
        if (productionHoverText) {
          this.hoverHint = {
            primary: truncateText(productionHoverText.replace(/\n/g, " | "), 160),
            secondary: null,
            level: "info",
          };
          this.updateContextualHint();
          this.showDisabledTooltip(productionHoverText);
          return;
        }
      } else {
        this.applyButtonVisualState(button);
        this.animateButtonHover(button, false);
        this.hoverHint = null;
        this.updateContextualHint();
      }
      this.hideDisabledTooltip();
      return;
    }
    if (!isEntering) {
      this.hoverHint = null;
      this.updateContextualHint();
      this.hideDisabledTooltip();
      return;
    }
    if (productionHoverText) {
      this.hoverHint = {
        primary: truncateText(productionHoverText.replace(/\n/g, " | "), 160),
        secondary: null,
        level: "warning",
      };
      this.updateContextualHint();
      this.showDisabledTooltip(productionHoverText);
      return;
    }
    const disabledHint = this.getDisabledActionHint(button.actionId);
    if (disabledHint) {
      this.hoverHint = {
        primary: disabledHint,
        secondary: null,
        level: "warning",
      };
      this.updateContextualHint();
      this.showDisabledTooltip(disabledHint);
    }
  }

  handleButtonClick(button) {
    if (this.isAnyModalOpen() && !this.isModalButton(button.actionId)) {
      return;
    }
    this.animateButtonPress(button);
    if (button.enabled) {
      button.onClick();
      this.playUiSfx(UI_SFX_ACTIONS.has(button.actionId) ? "confirm" : "select");
      return;
    }
    const hint = this.getDisabledActionHint(button.actionId);
    if (hint) {
      this.handleNotificationRequested({ message: hint, level: "warning" });
    }
    this.playUiSfx("warning");
  }

  animateButtonHover(button, isEntering) {
    const scale = isEntering ? HUD_THEME.buttonHoverScale : 1;
    this.tweens.killTweensOf(button.rectangle);
    this.tweens.killTweensOf(button.label);
    this.tweens.add({
      targets: button.rectangle,
      scaleX: scale,
      scaleY: scale,
      duration: 80,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: button.label,
      scaleX: scale,
      scaleY: scale,
      duration: 80,
      ease: "Quad.Out",
    });
  }

  animateButtonPress(button) {
    this.tweens.killTweensOf(button.rectangle);
    this.tweens.killTweensOf(button.label);
    this.tweens.add({
      targets: [button.rectangle, button.label],
      scaleX: HUD_THEME.buttonPressScale,
      scaleY: HUD_THEME.buttonPressScale,
      yoyo: true,
      duration: 55,
      ease: "Quad.Out",
    });
  }

  handleUiSfxRequested = (payload) => {
    const kind = typeof payload === "string" ? payload : payload?.kind;
    this.playUiSfx(kind);
  };

  ensureUiSfxContext() {
    if (this.uiSfxContext && this.uiSfxMasterGain) {
      return true;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return false;
    }
    try {
      this.uiSfxContext = new Context();
      this.uiSfxMasterGain = this.uiSfxContext.createGain();
      this.uiSfxMasterGain.gain.value = 0.06;
      this.uiSfxMasterGain.connect(this.uiSfxContext.destination);
      return true;
    } catch {
      this.uiSfxContext = null;
      this.uiSfxMasterGain = null;
      return false;
    }
  }

  playUiSfx(kind) {
    if (!kind || this.uiSfxMuted) {
      return;
    }
    if (!this.ensureUiSfxContext() || !this.uiSfxContext || !this.uiSfxMasterGain) {
      return;
    }
    const context = this.uiSfxContext;
    if (context.state === "suspended") {
      void context.resume();
    }
    const profile = resolveUiSfxProfile(kind);
    if (!profile) {
      return;
    }
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, profile.frequency * profile.frequencyDrop), now + profile.duration);
    gain.gain.setValueAtTime(profile.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain);
    gain.connect(this.uiSfxMasterGain);
    oscillator.start(now);
    oscillator.stop(now + profile.duration);
  }

  setSfxMuted(muted) {
    this.uiSfxMuted = !!muted;
    if (this.pauseSfxButton) {
      this.setButtonActive(this.pauseSfxButton, !this.uiSfxMuted);
      this.setButtonLabel(this.pauseSfxButton, this.uiSfxMuted ? "SFX OFF" : "SFX ON");
    }
    return this.uiSfxMuted;
  }

  toggleSfxMuted() {
    const nextMuted = !this.uiSfxMuted;
    this.setSfxMuted(nextMuted);
    this.playUiSfx(nextMuted ? "warning" : "confirm");
    return this.uiSfxMuted;
  }

  setStatsPanelVisible(visible) {
    this.statsPanelOpen = !!visible;
    const show = this.statsPanelOpen;
    this.statsPanel.setVisible(show);
    this.statsTitle.setVisible(show);
    this.statsCitiesLabel.setVisible(show);
    this.statsUnitsLabel.setVisible(show);
    this.statsTechLabel.setVisible(show);
    this.statsExploreLabel.setVisible(show);
    this.setButtonActive(this.statsToggleButton, show);
    if (this.latestState) {
      this.layout(this.scale.gameSize);
    }
  }

  toggleStatsPanel() {
    this.setStatsPanelVisible(!this.statsPanelOpen);
    this.playUiSfx(this.statsPanelOpen ? "confirm" : "select");
    return this.statsPanelOpen;
  }

  setTechTreeModalVisible(visible) {
    this.techTreeModalOpen = !!visible;
    const show = this.techTreeModalOpen;
    this.techTreeModalPanel.setVisible(show);
    this.techTreeModalTitle.setVisible(show);
    this.techTreeModalSubtitle.setVisible(show);
    this.techTreeSummaryScienceLabel.setVisible(show);
    this.techTreeSummaryCurrentLabel.setVisible(show);
    this.techTreeSummaryCitiesLabel.setVisible(show);
    this.techTreeSummaryLegendLabel.setVisible(show);
    this.techTreeGraphViewportPanel.setVisible(show);
    this.techTreeGraphHitArea.setVisible(show);
    this.techTreeGraphContainer.setVisible(show);
    this.techTreeGraphEdges.setVisible(show);
    for (const laneBand of this.techTreeGraphLaneBands) {
      laneBand.setVisible(show);
    }
    for (const laneLabel of this.techTreeLaneLabels) {
      laneLabel.setVisible(show);
    }
    this.setCompositeVisible(this.techTreeCloseButton, show);
    this.setButtonActive(this.techTreeButton, show);
    this.latestTechTreeModalPayload.open = show;
    if (show) {
      this.updateTechTreeModalPayload(this.latestState);
    } else {
      this.stopTechTreeGraphDrag();
      this.clearTechTreeGraphNodes();
      this.techTreeGraphEdges.clear();
    }
    if (this.latestState) {
      this.layout(this.scale.gameSize);
    }
    this.syncModalState();
  }

  toggleTechTreeModal() {
    this.setTechTreeModalVisible(!this.techTreeModalOpen);
    this.playUiSfx(this.techTreeModalOpen ? "confirm" : "select");
    return this.techTreeModalOpen;
  }

  closeTechTreeModal() {
    if (!this.techTreeModalOpen) {
      return false;
    }
    this.setTechTreeModalVisible(false);
    return true;
  }

  getDisabledActionHint(actionId) {
    if (!this.latestState) {
      return null;
    }
    const actionHints = this.latestState.uiActions?.disabledActionHints ?? {};
    const specificHint = actionHints[actionId];
    if (specificHint) {
      return specificHint;
    }
    const isGameplayAction =
      actionId === "endTurn" ||
      actionId === "nextUnit" ||
      actionId === "attention-ready" ||
      actionId === "attention-queue" ||
      actionId.startsWith("unit-") ||
      actionId.startsWith("city-") ||
      actionId === "context-expand-toggle" ||
      actionId === "context-pin-toggle";
    if (this.latestState.animationState?.busy && isGameplayAction) {
      return "Wait for the current animation to finish.";
    }
    if (actionId === "endTurn") {
      return this.latestState.pendingCityResolution ? "Resolve city outcome first." : "Wait for AI turns to finish.";
    }
    if (actionId === "nextUnit") {
      const readyCount = this.latestState.uiTurnAssistant?.readyCount ?? 0;
      return readyCount > 0 ? null : "No ready units to cycle.";
    }
    if (actionId === "attention-ready") {
      const readyUnits = this.latestState.uiTurnAssistant?.readyUnits ?? this.latestState.uiTurnAssistant?.readyCount ?? 0;
      return readyUnits > 0 ? null : "No ready units right now.";
    }
    if (actionId === "attention-queue") {
      const emptyQueues =
        this.latestState.uiTurnAssistant?.emptyQueues ?? this.latestState.uiTurnAssistant?.emptyQueueCityCount ?? 0;
      return emptyQueues > 0 ? null : "No empty city queues right now.";
    }
    if (actionId === "unit-found-city") {
      return this.latestState.uiActions?.foundCityReason ?? "Cannot found a city right now.";
    }
    if (actionId === "unit-skip") {
      return this.latestState.uiActions?.skipUnitReason ?? "Cannot skip this unit right now.";
    }
    if (actionId === "unit-diplomacy-toggle") {
      return this.latestState.uiActions?.diplomacyActionReason ?? "Diplomacy is unavailable right now.";
    }
    if (actionId.startsWith("city-enqueue-")) {
      return actionHints["city-queue-general"] ?? this.latestState.uiActions?.cityQueueReason ?? "Queue is unavailable right now.";
    }
    if (actionId.startsWith("city-production-tab-")) {
      return this.latestState.uiActions?.canSetCityProductionTab
        ? "Production tab is unavailable right now."
        : "Select one of your cities first.";
    }
    if (actionId.startsWith("city-queue-slot-")) {
      return null;
    }
    if (actionId === "city-rush-buy") {
      return (
        actionHints["city-rush-buy"] ??
        this.latestState.uiActions?.cityRushBuyReason ??
        "Rush-buy is unavailable right now."
      );
    }
    if (
      actionId.startsWith("city-queue-move-up-") ||
      actionId.startsWith("city-queue-move-down-") ||
      actionId.startsWith("city-queue-remove-")
    ) {
      return actionHints[actionId] ?? "This queue control is unavailable right now.";
    }
    if (actionId === "context-expand-toggle") {
      return "No contextual panel to expand.";
    }
    if (actionId === "context-pin-toggle") {
      return "Select a city or unit to pin this panel.";
    }
    return null;
  }

  getProductionHoverText(actionId) {
    if (!this.latestState) {
      return null;
    }
    if (actionId.startsWith("city-enqueue-building-")) {
      const buildingId = actionId.replace("city-enqueue-building-", "");
      const choice = (this.latestState.uiActions?.cityBuildingChoices ?? []).find((entry) => entry.id === buildingId);
      return choice?.hoverText ?? null;
    }
    if (actionId.startsWith("city-enqueue-")) {
      const unitType = actionId.replace("city-enqueue-", "");
      const choice = (this.latestState.uiActions?.cityProductionChoices ?? []).find((entry) => entry.type === unitType);
      return choice?.hoverText ?? null;
    }
    return null;
  }

  layout(gameSize) {
    const isTabletLayout = gameSize.width < TABLET_LAYOUT_BREAKPOINT;
    const edgePadding = isTabletLayout ? 12 : 20;
    const menuType = this.latestState?.uiActions?.contextMenuType ?? null;
    const selectedCity = this.latestState?.cities?.find((city) => city.id === this.latestState?.selectedCityId) ?? null;
    const isCityMenu = menuType === "city";
    const isUnitMenu = menuType === "unit";
    const contextVisible = menuType !== null && this.latestState?.match?.status === "ongoing";
    const contextExpanded = contextVisible ? this.contextPanelExpanded : false;
    const showCityQueueRail = this.shouldShowCityQueueRail(this.latestState, menuType, selectedCity);

    const hudTop = isTabletLayout ? 12 : 16;
    const hudLeft = edgePadding + 12;
    const hudLineGap = isTabletLayout ? 24 : 27;
    const turnPreferredFontSize = isTabletLayout ? 21 : 25;
    this.turnLabel.setFontSize(turnPreferredFontSize);
    this.foodLabel.setFontSize(isTabletLayout ? 17 : 19);
    this.productionLabel.setFontSize(isTabletLayout ? 17 : 19);
    this.scienceLabel.setFontSize(isTabletLayout ? 17 : 19);
    this.devVisionLabel.setFontSize(isTabletLayout ? 15 : 16);
    this.foodDeltaLabel.setFontSize(isTabletLayout ? 14 : 16);
    this.productionDeltaLabel.setFontSize(isTabletLayout ? 14 : 16);
    this.scienceDeltaLabel.setFontSize(isTabletLayout ? 14 : 16);
    this.foodLabel.setPosition(hudLeft, hudTop + 8 + hudLineGap);
    this.productionLabel.setPosition(hudLeft, hudTop + 8 + hudLineGap * 2);
    this.scienceLabel.setPosition(hudLeft, hudTop + 8 + hudLineGap * 3);
    this.devVisionLabel.setPosition(hudLeft, hudTop + 8 + hudLineGap * 4);
    const hudPanelWidth = isTabletLayout ? 244 : 286;
    const hudPanelHeight = isTabletLayout ? 156 : 180;
    this.topHudPanel.setPosition(edgePadding, hudTop);
    this.topHudPanel.setSize(hudPanelWidth, hudPanelHeight);
    this.fitTextSizeToWidth(this.turnLabel, turnPreferredFontSize, isTabletLayout ? 17 : 19, hudPanelWidth - 24);
    this.turnLabel.setPosition(hudLeft, hudTop + 6);
    const menuX = edgePadding + hudPanelWidth - this.menuButton.width / 2 - 8;
    const menuY = hudTop + hudPanelHeight - this.menuButton.height / 2 - 8;
    this.menuButton.rectangle.setPosition(menuX, menuY);
    this.menuButton.label.setPosition(this.menuButton.rectangle.x, this.menuButton.rectangle.y);
    const statsX = menuX - this.menuButton.width / 2 - this.statsToggleButton.width / 2 - 6;
    this.statsToggleButton.rectangle.setPosition(statsX, menuY);
    this.statsToggleButton.label.setPosition(statsX, menuY);
    const techTreeX = statsX - this.statsToggleButton.width / 2 - this.techTreeButton.width / 2 - 6;
    this.techTreeButton.rectangle.setPosition(techTreeX, menuY);
    this.techTreeButton.label.setPosition(techTreeX, menuY);
    const forecastWidth = isTabletLayout ? 248 : 300;
    const forecastHeight = isTabletLayout ? FORECAST_PANEL_HEIGHT_TABLET : FORECAST_PANEL_HEIGHT;
    const forecastLeft = edgePadding;
    const forecastTop = hudTop + hudPanelHeight + 8;
    const forecastPosition = this.clampPanelTopLeft(forecastLeft, forecastTop, forecastWidth, forecastHeight, edgePadding);
    this.forecastPanel.setPosition(forecastPosition.x, forecastPosition.y);
    this.forecastPanel.setSize(forecastWidth, forecastHeight);
    this.forecastPanel.setDisplaySize(forecastWidth, forecastHeight);
    this.forecastTitle.setPosition(forecastPosition.x + 10, forecastPosition.y + 8);
    this.forecastLinePrimary.setPosition(forecastPosition.x + 10, forecastPosition.y + 26);
    this.forecastLineSecondary.setPosition(forecastPosition.x + 10, forecastPosition.y + 42);
    this.forecastLineTertiary.setPosition(forecastPosition.x + 10, forecastPosition.y + (isTabletLayout ? 56 : 58));
    const statsWidth = forecastWidth;
    const statsHeight = isTabletLayout ? STATS_PANEL_HEIGHT_TABLET : STATS_PANEL_HEIGHT;
    const statsTop = forecastPosition.y + forecastHeight + 6;
    const statsPosition = this.clampPanelTopLeft(forecastPosition.x, statsTop, statsWidth, statsHeight, edgePadding);
    this.statsPanel.setPosition(statsPosition.x, statsPosition.y);
    this.statsPanel.setSize(statsWidth, statsHeight);
    this.statsPanel.setDisplaySize(statsWidth, statsHeight);
    this.statsTitle.setPosition(statsPosition.x + 10, statsPosition.y + 8);
    this.statsCitiesLabel.setPosition(statsPosition.x + 10, statsPosition.y + 28);
    this.statsUnitsLabel.setPosition(statsPosition.x + 10, statsPosition.y + 46);
    this.statsTechLabel.setPosition(statsPosition.x + 10, statsPosition.y + 64);
    this.statsExploreLabel.setPosition(statsPosition.x + 10, statsPosition.y + 82);
    if (this.statsPanelOpen && statsPosition.y + statsHeight > this.scale.height - edgePadding) {
      this.setStatsPanelVisible(false);
    }
    this.layoutResourceDeltas();
    const playbackWidth = isTabletLayout ? Math.max(220, Math.floor(gameSize.width * 0.58)) : 520;
    const playbackX = gameSize.width / 2;
    const playbackY = isTabletLayout ? 24 : 26;
    this.playbackPanel.setPosition(playbackX, playbackY);
    this.playbackPanel.setSize(playbackWidth, 30);
    this.playbackPanel.setDisplaySize(playbackWidth, 30);
    this.playbackLabel.setPosition(playbackX, playbackY - 1);
    this.playbackLabel.setWordWrapWidth(Math.max(160, playbackWidth - 20), true);

    this.notificationVisibleRows = isTabletLayout ? 4 : 5;
    const notificationWidth = isTabletLayout ? Math.max(268, Math.floor(gameSize.width * 0.6)) : 356;
    const displayNotificationRows = this.getDisplayNotifications();
    const visibleNotificationCount = Math.max(1, Math.min(this.notificationVisibleRows, displayNotificationRows.length || 1));
    const notificationFilterHeight = isTabletLayout ? 60 : 34;
    const notificationContentHeight = visibleNotificationCount > 0 ? visibleNotificationCount * NOTIFICATION_ROW_HEIGHT + 14 : 0;
    const notificationHeight = NOTIFICATION_HEADER_HEIGHT + notificationFilterHeight + notificationContentHeight;
    const notificationLeft = gameSize.width - edgePadding - notificationWidth;
    this.notificationPanel.setPosition(notificationLeft + notificationWidth / 2, edgePadding + notificationHeight / 2);
    this.notificationPanel.setSize(notificationWidth, notificationHeight);
    this.notificationPanel.setDisplaySize(notificationWidth, notificationHeight);
    this.notificationAccent.setPosition(notificationLeft + 6, edgePadding + 6);
    this.notificationAccent.setSize(notificationWidth - 12, 4);
    this.notificationTitle.setPosition(notificationLeft + 12, edgePadding + 9);
    this.notificationSubtitle.setPosition(notificationLeft + 12, edgePadding + 26);
    const filterTop = edgePadding + NOTIFICATION_HEADER_HEIGHT;
    const filterGap = isTabletLayout ? 6 : 4;

    if (isTabletLayout) {
      const firstRow = this.notificationFilterButtons.slice(0, 3);
      const secondRow = this.notificationFilterButtons.slice(3);
      this.fitButtonRowWidths(firstRow, notificationWidth - 24, 58, 86, filterGap);
      this.fitButtonRowWidths(secondRow, notificationWidth - 24, 58, 86, filterGap);
      this.layoutButtonRow(firstRow, notificationLeft + notificationWidth / 2, filterTop + 16, filterGap);
      this.layoutButtonRow(secondRow, notificationLeft + notificationWidth / 2, filterTop + 42, filterGap);
    } else {
      this.fitButtonRowWidths(this.notificationFilterButtons, notificationWidth - 18, 50, 80, filterGap);
      this.layoutButtonRow(this.notificationFilterButtons, notificationLeft + notificationWidth / 2, filterTop + 13, filterGap);
    }

    const rowStartY = edgePadding + NOTIFICATION_HEADER_HEIGHT + notificationFilterHeight + 2;
    for (let i = 0; i < this.notificationRows.length; i += 1) {
      const row = this.notificationRows[i];
      const rowTop = rowStartY + i * NOTIFICATION_ROW_HEIGHT;
      row.panel.setPosition(notificationLeft + NOTIFICATION_ROW_INSET, rowTop);
      row.panel.setSize(notificationWidth - NOTIFICATION_ROW_INSET * 2, NOTIFICATION_ROW_HEIGHT - 4);
      row.stripe.setPosition(notificationLeft + NOTIFICATION_ROW_INSET, rowTop);
      row.stripe.setSize(3, NOTIFICATION_ROW_HEIGHT - 4);
      row.badge.setPosition(notificationLeft + 16, rowTop + 8);
      row.header.setPosition(notificationLeft + 78, rowTop + 7);
      row.message.setPosition(notificationLeft + 20, rowTop + 24);
      row.unreadDot.setPosition(notificationLeft + notificationWidth - 62, rowTop + 14);
      row.jump.setPosition(notificationLeft + notificationWidth - 48, rowTop + 7);
      row.badgeLabel.setPosition(row.badge.x + 5, row.badge.y + 2);
      if (i >= this.notificationVisibleRows) {
        this.setNotificationRowVisible(row, false);
      }
    }

    const contextHeight = contextExpanded
      ? isTabletLayout
        ? isCityMenu
          ? CONTEXT_PANEL_EXPANDED_HEIGHT_CITY_TABLET
          : CONTEXT_PANEL_EXPANDED_HEIGHT_UNIT_TABLET
        : isCityMenu
          ? CONTEXT_PANEL_EXPANDED_HEIGHT_CITY
          : CONTEXT_PANEL_EXPANDED_HEIGHT_UNIT
      : CONTEXT_PANEL_COLLAPSED_HEIGHT;
    const contextWidth = isTabletLayout
      ? gameSize.width - edgePadding * 2
      : Math.max(
          isUnitMenu ? CONTEXT_PANEL_MIN_WIDTH_UNIT : CONTEXT_PANEL_MIN_WIDTH_CITY,
          Math.min(780, gameSize.width - CONTEXT_PANEL_WIDTH_PADDING)
        );
    const contextX = gameSize.width / 2;
    const contextY = gameSize.height - contextHeight / 2 - (isTabletLayout ? 10 : 14);
    const contextTop = contextY - contextHeight / 2;
    const titleOffset = contextExpanded ? (isTabletLayout ? (isCityMenu ? 124 : 90) : isCityMenu ? 96 : 58) : 4;
    const metaPrimaryOffset = isTabletLayout ? (isCityMenu ? 96 : 62) : isCityMenu ? 70 : 34;
    const metaSecondaryOffset = isTabletLayout ? (isCityMenu ? 78 : 42) : isCityMenu ? 52 : 14;
    const disabledReasonOffset = isTabletLayout ? (isCityMenu ? -112 : -96) : isCityMenu ? -92 : -72;
    const activeCityProductionButtons =
      (this.latestState?.uiActions?.cityProductionTab ?? "units") === "buildings"
        ? this.cityBuildingButtons
        : this.cityProductionButtons;
    this.contextPanel.setPosition(contextX, contextY);
    this.contextPanel.setSize(contextWidth, contextHeight);
    this.contextPanelTitle.setPosition(contextX, contextY - titleOffset);
    this.contextPanelMetaPrimary.setPosition(contextX, contextY - metaPrimaryOffset);
    this.contextPanelMetaSecondary.setPosition(contextX, contextY - metaSecondaryOffset);
    this.contextPanelDisabledReason.setPosition(contextX, contextY - disabledReasonOffset);
    this.contextPanelMetaPrimary.setWordWrapWidth(Math.max(120, contextWidth - 18), true);
    this.contextPanelMetaSecondary.setWordWrapWidth(Math.max(120, contextWidth - 18), true);
    this.contextPanelDisabledReason.setWordWrapWidth(Math.max(120, contextWidth - 20), true);

    const contextButtonY = contextY - contextHeight / 2 + 16;
    const contextExpandX = contextX + contextWidth / 2 - 82;
    const contextPinX = contextX + contextWidth / 2 - 38;
    this.contextPanelExpandButton.rectangle.setPosition(contextExpandX, contextButtonY);
    this.contextPanelExpandButton.label.setPosition(contextExpandX, contextButtonY);
    this.contextPanelPinButton.rectangle.setPosition(contextPinX, contextButtonY);
    this.contextPanelPinButton.label.setPosition(contextPinX, contextButtonY);

    if (contextExpanded) {
      if (isTabletLayout) {
        this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY - 10, 8);
        this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 24, 6);
        this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton, this.unitDiplomacyButton], contextX, contextY + 30, 8);
      } else {
        this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY + 4, 8);
        this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 36, 6);
        this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton, this.unitDiplomacyButton], contextX, contextY + 24, 10);
      }
    } else {
      this.layoutButtonRow(this.cityProductionTabButtons, contextX, contextY + 36, 8);
      this.layoutButtonRow(activeCityProductionButtons, contextX, contextY + 36, 6);
      this.layoutButtonRow([this.unitFoundCityButton, this.unitSkipButton, this.unitDiplomacyButton], contextX, contextY + 36, 10);
    }

    const selectedPanelWidth = isTabletLayout ? Math.max(154, Math.min(236, Math.floor(gameSize.width * 0.5))) : 432;
    const selectedPanelHeight = isTabletLayout ? 88 : 92;
    const selectedPanelY =
      isTabletLayout && contextVisible ? contextTop - selectedPanelHeight - 8 : gameSize.height - selectedPanelHeight - 14;
    this.selectedPanel.setPosition(edgePadding, selectedPanelY);
    this.selectedPanel.setSize(selectedPanelWidth, selectedPanelHeight);
    this.selectedTitle.setPosition(edgePadding + 14, selectedPanelY + 12);
    this.selectedDetails.setPosition(edgePadding + 14, selectedPanelY + 38);
    this.selectedDetails.setWordWrapWidth(Math.max(120, selectedPanelWidth - 24), true);
    const minimapWidth = isTabletLayout ? MINIMAP_PANEL_WIDTH_TABLET : MINIMAP_PANEL_WIDTH;
    const minimapHeight = isTabletLayout ? MINIMAP_PANEL_HEIGHT_TABLET : MINIMAP_PANEL_HEIGHT;
    const minimapTopCandidate = this.statsPanelOpen
      ? this.statsPanel.y + this.statsPanel.displayHeight + 8
      : this.forecastPanel.y + this.forecastPanel.displayHeight + 8;
    const minimapBottomAnchor = selectedPanelY - 10;
    const minimapTop = Math.max(minimapTopCandidate, minimapBottomAnchor - minimapHeight);
    const minimapHasRoom = minimapTop + minimapHeight <= minimapBottomAnchor;
    const minimapPosition = this.clampPanelTopLeft(edgePadding, minimapTop, minimapWidth, minimapHeight, edgePadding);
    this.minimapPanel.setPosition(minimapPosition.x, minimapPosition.y);
    this.minimapPanel.setSize(minimapWidth, minimapHeight);
    this.minimapPanel.setDisplaySize(minimapWidth, minimapHeight);
    this.minimapTitle.setPosition(minimapPosition.x + 10, minimapPosition.y + 8);
    this.minimapCaption.setPosition(minimapPosition.x + minimapWidth - 10, minimapPosition.y + minimapHeight - 14);
    this.minimapCaption.setOrigin(1, 0);
    this.minimapContentBounds = {
      x: minimapPosition.x + MINIMAP_INSET,
      y: minimapPosition.y + MINIMAP_TITLE_HEIGHT,
      width: Math.max(32, minimapWidth - MINIMAP_INSET * 2),
      height: Math.max(32, minimapHeight - MINIMAP_TITLE_HEIGHT - MINIMAP_CAPTION_HEIGHT - 6),
    };
    this.minimapInsetPanel.setPosition(this.minimapContentBounds.x, this.minimapContentBounds.y);
    this.minimapInsetPanel.setSize(this.minimapContentBounds.width, this.minimapContentBounds.height);
    this.minimapInsetPanel.setDisplaySize(this.minimapContentBounds.width, this.minimapContentBounds.height);
    this.minimapHitArea.setPosition(this.minimapContentBounds.x, this.minimapContentBounds.y);
    this.minimapHitArea.setSize(this.minimapContentBounds.width, this.minimapContentBounds.height);
    this.minimapHitArea.setDisplaySize(this.minimapContentBounds.width, this.minimapContentBounds.height);
    this.minimapVisible = minimapHasRoom && this.latestState?.match?.status === "ongoing";
    this.minimapPanel.setVisible(this.minimapVisible);
    this.minimapInsetPanel.setVisible(this.minimapVisible);
    this.minimapTitle.setVisible(this.minimapVisible);
    this.minimapCaption.setVisible(this.minimapVisible);
    this.minimapHitArea.setVisible(this.minimapVisible);
    this.minimapViewportFrame.setVisible(this.minimapVisible);
    if (this.minimapVisible) {
      this.minimapHitArea.setInteractive({ useHandCursor: true });
    } else {
      this.minimapHitArea.disableInteractive();
    }

    const endTurnWidth = isTabletLayout ? 146 : 172;
    this.endTurnButton.width = endTurnWidth;
    this.endTurnButton.rectangle.setSize(endTurnWidth, BUTTON_HEIGHT);
    this.endTurnButton.rectangle.setDisplaySize(endTurnWidth, BUTTON_HEIGHT);
    const bottomSafePadding = isTabletLayout ? 18 : 24;
    const endTurnX = gameSize.width - edgePadding - endTurnWidth / 2;
    const minEndTurnY = edgePadding + (isTabletLayout ? 92 : 104);
    const endTurnY = Math.max(minEndTurnY, gameSize.height - bottomSafePadding - BUTTON_HEIGHT / 2);
    this.endTurnButton.rectangle.setPosition(endTurnX, endTurnY);
    this.endTurnButton.label.setPosition(endTurnX, endTurnY);

    const statusWidth = endTurnWidth;
    const statusHeight = isTabletLayout ? 72 : 74;
    const statusY = endTurnY - BUTTON_HEIGHT / 2 - statusHeight / 2 - (isTabletLayout ? 10 : 12);

    this.turnAssistantPanel.setPosition(endTurnX, statusY);
    this.turnAssistantPanel.setSize(statusWidth, statusHeight);
    this.turnAssistantPanel.setDisplaySize(statusWidth, statusHeight);
    this.turnAssistantAccent.setPosition(endTurnX, statusY - statusHeight / 2 + 4);
    this.turnAssistantAccent.setSize(statusWidth - 10, 4);
    this.turnAssistantStatusDot.setPosition(endTurnX - statusWidth / 2 + 10, statusY - statusHeight / 2 + 11);
    this.turnAssistantLabel.setPosition(endTurnX, statusY - statusHeight / 2 + 11);
    this.turnAssistantSecondaryLabel.setPosition(endTurnX, statusY + statusHeight / 2 - 12);
    const chipGap = isTabletLayout ? 4 : 6;
    const chipInset = isTabletLayout ? 6 : 8;
    const chipHeight = isTabletLayout ? 22 : 24;
    const chipWidth = Math.max(56, Math.floor((statusWidth - chipInset * 2 - chipGap) / 2));
    this.resizeButton(this.attentionReadyButton, chipWidth, chipHeight);
    this.resizeButton(this.attentionQueueButton, chipWidth, chipHeight);
    this.attentionReadyButton.label.setFontSize(chipWidth < 74 ? 11 : 12);
    this.attentionQueueButton.label.setFontSize(chipWidth < 74 ? 11 : 12);
    const chipY = statusY + 6;
    const chipTotal = this.attentionReadyButton.width + this.attentionQueueButton.width + chipGap;
    const chipLeft = endTurnX - chipTotal / 2;
    const readyX = chipLeft + this.attentionReadyButton.width / 2;
    const queueX = readyX + this.attentionReadyButton.width / 2 + chipGap + this.attentionQueueButton.width / 2;
    this.attentionReadyButton.rectangle.setPosition(readyX, chipY);
    this.attentionReadyButton.label.setPosition(readyX, chipY);
    this.attentionQueueButton.rectangle.setPosition(queueX, chipY);
    this.attentionQueueButton.label.setPosition(queueX, chipY);

    this.layoutCityQueueRail({
      isTabletLayout,
      edgePadding,
      notificationLeft,
      notificationWidth,
      statusY,
      statusHeight,
      selectedCity,
      visible: showCityQueueRail,
    });

    const hintWidth = isTabletLayout ? gameSize.width - edgePadding * 2 : 420;
    const hintHeight = isTabletLayout ? 82 : 72;
    const hintY = isTabletLayout ? Math.max(178, notificationHeight + edgePadding + hintHeight / 2 + 16) : 56;
    this.hintPanel.setPosition(gameSize.width / 2, hintY);
    this.hintPanel.setSize(hintWidth, hintHeight);
    this.hintPrimary.setPosition(gameSize.width / 2, hintY - 12);
    this.hintSecondary.setPosition(gameSize.width / 2, hintY + 10);
    this.hintPrimary.setWordWrapWidth(Math.max(140, hintWidth - 20), true);
    this.hintSecondary.setWordWrapWidth(Math.max(120, hintWidth - 20), true);

    const previewWidth = isTabletLayout ? Math.max(198, gameSize.width - edgePadding * 2) : 344;
    const previewHeight = 66;
    const previewY = hintY + (isTabletLayout ? 82 : 74);
    this.previewPanel.setPosition(gameSize.width / 2, previewY);
    this.previewPanel.setSize(previewWidth, previewHeight);
    this.previewTitle.setPosition(gameSize.width / 2, previewY - 12);
    this.previewDetails.setPosition(gameSize.width / 2, previewY + 10);
    this.previewTitle.setWordWrapWidth(Math.max(120, previewWidth - 16), true);
    this.previewDetails.setWordWrapWidth(Math.max(120, previewWidth - 16), true);

    this.modalBackdrop.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.modalBackdrop.setSize(gameSize.width + 4, gameSize.height + 4);

    const techTreeModalWidth = Phaser.Math.Clamp(gameSize.width - edgePadding * 2, TECH_TREE_MODAL_WIDTH_MIN, TECH_TREE_MODAL_WIDTH_MAX);
    const techTreeModalHeight = Phaser.Math.Clamp(
      gameSize.height - edgePadding * 2,
      TECH_TREE_MODAL_HEIGHT_MIN,
      TECH_TREE_MODAL_HEIGHT_MAX
    );
    const techTreeCenterX = gameSize.width / 2;
    const techTreeCenterY = gameSize.height / 2;
    const techTreeLeft = techTreeCenterX - techTreeModalWidth / 2;
    const techTreeTop = techTreeCenterY - techTreeModalHeight / 2;
    this.techTreeModalPanel.setPosition(techTreeCenterX, techTreeCenterY);
    this.techTreeModalPanel.setSize(techTreeModalWidth, techTreeModalHeight);
    this.techTreeModalTitle.setPosition(techTreeCenterX, techTreeTop + 34);
    this.techTreeModalSubtitle.setPosition(techTreeCenterX, techTreeTop + 56);
    this.techTreeCloseButton.rectangle.setPosition(techTreeLeft + techTreeModalWidth - 56, techTreeTop + 34);
    this.techTreeCloseButton.label.setPosition(this.techTreeCloseButton.rectangle.x, this.techTreeCloseButton.rectangle.y);
    const summaryLeft = techTreeLeft + TECH_TREE_MODAL_CONTENT_PADDING;
    const summaryTop = techTreeTop + 80;
    const summaryWidth = techTreeModalWidth - TECH_TREE_MODAL_CONTENT_PADDING * 2;
    this.techTreeSummaryScienceLabel.setPosition(summaryLeft, summaryTop);
    this.techTreeSummaryCurrentLabel.setPosition(summaryLeft, summaryTop + 18);
    this.techTreeSummaryCitiesLabel.setPosition(summaryLeft, summaryTop + 36);
    this.techTreeSummaryLegendLabel.setPosition(summaryLeft, summaryTop + 54);
    this.techTreeSummaryScienceLabel.setWordWrapWidth(summaryWidth, true);
    this.techTreeSummaryCurrentLabel.setWordWrapWidth(summaryWidth, true);
    this.techTreeSummaryCitiesLabel.setWordWrapWidth(summaryWidth, true);
    this.techTreeSummaryLegendLabel.setWordWrapWidth(summaryWidth, true);
    const graphTop = summaryTop + 74;
    const graphBottomPadding = 14;
    const graphHeight = Math.max(
      TECH_TREE_GRAPH_VIEWPORT_MIN_HEIGHT,
      techTreeModalHeight - (graphTop - techTreeTop) - graphBottomPadding
    );
    this.techTreeGraphViewportBounds = {
      x: summaryLeft,
      y: graphTop,
      width: summaryWidth,
      height: graphHeight,
    };
    this.techTreeGraphViewportPanel.setPosition(this.techTreeGraphViewportBounds.x, this.techTreeGraphViewportBounds.y);
    this.techTreeGraphViewportPanel.setSize(this.techTreeGraphViewportBounds.width, this.techTreeGraphViewportBounds.height);
    this.techTreeGraphHitArea.setPosition(this.techTreeGraphViewportBounds.x, this.techTreeGraphViewportBounds.y);
    this.techTreeGraphHitArea.setSize(this.techTreeGraphViewportBounds.width, this.techTreeGraphViewportBounds.height);
    const laneBandHeight = this.techTreeGraphViewportBounds.height / 3;
    for (let laneIndex = 0; laneIndex < this.techTreeGraphLaneBands.length; laneIndex += 1) {
      const laneBand = this.techTreeGraphLaneBands[laneIndex];
      laneBand.setPosition(this.techTreeGraphViewportBounds.x, this.techTreeGraphViewportBounds.y + laneIndex * laneBandHeight);
      laneBand.setSize(this.techTreeGraphViewportBounds.width, laneBandHeight);
    }
    for (let laneIndex = 0; laneIndex < this.techTreeLaneLabels.length; laneIndex += 1) {
      const laneLabel = this.techTreeLaneLabels[laneIndex];
      laneLabel.setPosition(
        this.techTreeGraphViewportBounds.x + 8,
        this.techTreeGraphViewportBounds.y + laneIndex * laneBandHeight + 5
      );
    }
    this.techTreeGraphMaskShape.clear();
    this.techTreeGraphMaskShape.fillStyle(0xffffff, 1);
    this.techTreeGraphMaskShape.fillRect(
      this.techTreeGraphViewportBounds.x,
      this.techTreeGraphViewportBounds.y,
      this.techTreeGraphViewportBounds.width,
      this.techTreeGraphViewportBounds.height
    );
    this.applyTechTreeGraphScroll(this.techTreeGraphScrollX, { updatePayload: false });
    this.renderTechTreeGraph(this.latestTechTreeModalPayload);

    const pauseCenterX = gameSize.width / 2;
    const pauseCenterY = gameSize.height / 2 - 20;
    this.pausePanel.setPosition(pauseCenterX, pauseCenterY);
    this.pauseTitle.setPosition(pauseCenterX, pauseCenterY - 78);
    this.pauseResumeButton.rectangle.setPosition(pauseCenterX - 90, pauseCenterY - 4);
    this.pauseResumeButton.label.setPosition(pauseCenterX - 90, pauseCenterY - 4);
    this.pauseRestartButton.rectangle.setPosition(pauseCenterX + 90, pauseCenterY - 4);
    this.pauseRestartButton.label.setPosition(pauseCenterX + 90, pauseCenterY - 4);
    this.pauseSettingsLabel.setPosition(pauseCenterX, pauseCenterY + 36);
    this.pauseSfxButton.rectangle.setPosition(pauseCenterX, pauseCenterY + 64);
    this.pauseSfxButton.label.setPosition(pauseCenterX, pauseCenterY + 64);

    const newGameCenterX = gameSize.width / 2;
    const newGameCenterY = gameSize.height / 2 - 24;
    this.restartConfirmPanel.setPosition(newGameCenterX, newGameCenterY);
    this.restartConfirmTitle.setPosition(newGameCenterX, newGameCenterY - 100);
    this.restartConfirmSubtitle.setPosition(newGameCenterX, newGameCenterY - 70);
    this.layoutButtonRow(this.newGameMapPresetButtons, newGameCenterX, newGameCenterY - 28, 8);
    this.newGameAiLabel.setPosition(newGameCenterX - 66, newGameCenterY + 12);
    this.newGameAiMinusButton.rectangle.setPosition(newGameCenterX - 8, newGameCenterY + 14);
    this.newGameAiMinusButton.label.setPosition(newGameCenterX - 8, newGameCenterY + 14);
    this.newGameAiValueLabel.setPosition(newGameCenterX + 26, newGameCenterY + 12);
    this.newGameAiPlusButton.rectangle.setPosition(newGameCenterX + 60, newGameCenterY + 14);
    this.newGameAiPlusButton.label.setPosition(newGameCenterX + 60, newGameCenterY + 14);
    this.restartCancelButton.rectangle.setPosition(newGameCenterX - 98, newGameCenterY + 74);
    this.restartCancelButton.label.setPosition(newGameCenterX - 98, newGameCenterY + 74);
    this.restartConfirmButton.rectangle.setPosition(newGameCenterX + 98, newGameCenterY + 74);
    this.restartConfirmButton.label.setPosition(newGameCenterX + 98, newGameCenterY + 74);

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
    this.minimapTerrainKey = "";
    this.minimapViewportKey = "";
    this.renderMinimap();
  }

  clampPanelTopLeft(x, y, width, height, edgePadding = 6) {
    return {
      x: Phaser.Math.Clamp(x, edgePadding, this.scale.width - edgePadding - width),
      y: Phaser.Math.Clamp(y, edgePadding, this.scale.height - edgePadding - height),
    };
  }

  handleCameraChanged(cameraPatch) {
    if (!this.latestState || !cameraPatch) {
      return;
    }
    if (cameraPatch.cameraScroll) {
      this.latestState.cameraScroll = cameraPatch.cameraScroll;
    }
    if (cameraPatch.cameraViewportWorld) {
      this.latestState.cameraViewportWorld = cameraPatch.cameraViewportWorld;
    }
    if (cameraPatch.mapWorldBounds) {
      this.latestState.mapWorldBounds = cameraPatch.mapWorldBounds;
    }
    if (Object.prototype.hasOwnProperty.call(cameraPatch, "cameraFocusHex")) {
      this.latestState.cameraFocusHex = cameraPatch.cameraFocusHex;
    }
    this.renderMinimapViewportFrame();
  }

  handlePreviewChanged(previewPatch) {
    if (!this.latestState || !previewPatch) {
      return;
    }
    this.latestState.uiPreview = previewPatch.uiPreview ?? { mode: "none" };
    this.updatePreviewCard(this.latestState.uiPreview);
  }

  handleMinimapPointerDown(pointer) {
    if (!this.minimapVisible || !this.latestState || this.isAnyModalOpen()) {
      return false;
    }
    const mapWidth = Math.max(1, Number(this.latestState.map?.width ?? 0));
    const mapHeight = Math.max(1, Number(this.latestState.map?.height ?? 0));
    const projection = this.getMinimapProjectionState(mapWidth, mapHeight);
    const projected = worldToAxial(pointer.x, pointer.y, projection.hexRadius, projection.minimapOriginX, projection.minimapOriginY);
    let q = Phaser.Math.Clamp(Math.round(projected.q), 0, mapWidth - 1);
    let r = Phaser.Math.Clamp(Math.round(projected.r), 0, mapHeight - 1);
    const primaryCenter = this.projectHexToMinimap(q, r, projection);
    const isPrimaryHit = this.isPointInsideHex(pointer.x, pointer.y, primaryCenter.x, primaryCenter.y, projection.hexRadius * 0.92);
    if (!isPrimaryHit) {
      const fallback = this.findNearestMinimapHex(pointer.x, pointer.y, mapWidth, mapHeight, projection, q, r);
      q = fallback.q;
      r = fallback.r;
    }
    gameEvents.emit("minimap-focus-requested", { q, r });
    this.playUiSfx("select");
    return true;
  }

  renderMinimap() {
    if (!this.latestState || !this.minimapVisible) {
      this.minimapGraphics.clear();
      this.minimapMarkerGraphics.clear();
      this.minimapViewportGraphics.clear();
      this.minimapTerrainKey = "";
      this.minimapViewportKey = "";
      this.minimapViewportBoundarySegments = 0;
      this.minimapViewportFootprint = null;
      this.minimapViewportFrame.setVisible(false);
      return;
    }
    this.minimapMarkerGraphics.clear();
    const map = this.latestState.map;
    if (!map || !Array.isArray(map.tiles) || map.tiles.length === 0) {
      this.minimapGraphics.clear();
      this.minimapMarkerGraphics.clear();
      this.minimapViewportGraphics.clear();
      this.minimapTerrainKey = "";
      this.minimapViewportKey = "";
      this.minimapViewportBoundarySegments = 0;
      this.minimapViewportFootprint = null;
      this.minimapViewportFrame.setVisible(false);
      return;
    }
    const bounds = this.minimapContentBounds;
    const mapWidth = Math.max(1, map.width ?? 1);
    const mapHeight = Math.max(1, map.height ?? 1);
    const projection = this.getMinimapProjectionState(mapWidth, mapHeight, bounds);
    const playerVisibility = this.latestState.visibility?.byOwner?.player ?? { visibleHexes: [], exploredHexes: [] };
    const visibleSet = new Set(playerVisibility.visibleHexes ?? []);
    const exploredSet = new Set(playerVisibility.exploredHexes ?? []);
    const terrainKey = `${this.latestState.meta?.mapRevision ?? map.width}:${this.latestState.meta?.visibilityRevision ?? exploredSet.size}:${
      this.latestState.devVisionEnabled ? 1 : 0
    }:${Math.round(projection.hexRadius * 100)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`;
    const tileRadius = Math.max(1, projection.hexRadius * 0.88);

    if (terrainKey !== this.minimapTerrainKey) {
      this.minimapGraphics.clear();
      this.minimapGraphics.fillStyle(SEMANTIC_COLORS.minimapFog, 0.82);
      this.minimapGraphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      for (const tile of map.tiles) {
        const q = Phaser.Math.Clamp(Math.round(tile.q), 0, mapWidth - 1);
        const r = Phaser.Math.Clamp(Math.round(tile.r), 0, mapHeight - 1);
        const key = `${q},${r}`;
        const color = resolveMinimapTileColor(tile.terrainType, exploredSet.has(key), visibleSet.has(key));
        const center = this.projectHexToMinimap(q, r, projection);
        this.minimapGraphics.lineStyle(1, 0x2c2924, 0.14);
        this.minimapGraphics.fillStyle(color, 0.9);
        this.drawMinimapHex(this.minimapGraphics, center.x, center.y, tileRadius);
      }
      this.minimapGraphics.lineStyle(1, 0xd8c9ab, 0.36);
      this.minimapGraphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      this.minimapTerrainKey = terrainKey;
    }

    for (const city of this.latestState.cities ?? []) {
      const key = `${city.q},${city.r}`;
      if (!exploredSet.has(key) && !this.latestState.devVisionEnabled) {
        continue;
      }
      const center = this.projectHexToMinimap(city.q, city.r, projection);
      this.minimapMarkerGraphics.fillStyle(resolveMinimapOwnerColor(city.owner), 0.72);
      this.minimapMarkerGraphics.fillCircle(center.x, center.y, Math.max(1.2, projection.hexRadius * 0.3));
    }

    for (const unit of this.latestState.units ?? []) {
      const key = `${unit.q},${unit.r}`;
      if (!visibleSet.has(key) && !this.latestState.devVisionEnabled) {
        continue;
      }
      const center = this.projectHexToMinimap(unit.q, unit.r, projection);
      this.minimapMarkerGraphics.fillStyle(resolveMinimapOwnerColor(unit.owner), 0.62);
      const markerSize = Math.max(1, projection.hexRadius * 0.26);
      this.minimapMarkerGraphics.fillRect(
        center.x - markerSize / 2,
        center.y - markerSize / 2,
        markerSize,
        markerSize
      );
    }

    this.renderMinimapViewportFrame();
  }

  renderMinimapViewportFrame() {
    if (!this.minimapVisible || !this.latestState) {
      this.minimapViewportGraphics.clear();
      this.minimapViewportBoundarySegments = 0;
      this.minimapViewportFootprint = null;
      this.minimapViewportKey = "";
      this.minimapViewportFrame.setVisible(false);
      return;
    }
    const mapWidth = Math.max(1, this.latestState.map?.width ?? 1);
    const mapHeight = Math.max(1, this.latestState.map?.height ?? 1);
    const projection = this.getMinimapProjectionState(mapWidth, mapHeight);
    const focusHex = this.latestState.cameraFocusHex;
    const hasFocusTarget = !!focusHex && Number.isFinite(focusHex.q) && Number.isFinite(focusHex.r);
    const viewportKey = this.buildMinimapViewportCacheKey(projection, hasFocusTarget);
    if (viewportKey === this.minimapViewportKey) {
      return;
    }

    const viewportHexes = this.getViewportMinimapHexes(mapWidth, mapHeight, projection);
    const boundarySegments = this.buildViewportBoundarySegments(viewportHexes, projection);
    const frame = this.projectCameraFrameToMinimap(boundarySegments, viewportHexes, projection);
    this.minimapViewportGraphics.clear();
    if (boundarySegments.length === 0 || !frame) {
      this.minimapViewportBoundarySegments = 0;
      this.minimapViewportFootprint = null;
      this.minimapViewportKey = viewportKey;
      this.minimapViewportGraphics.clear();
      this.minimapViewportFrame.setVisible(false);
      return;
    }

    const viewportColor = hasFocusTarget ? 0x7f9fc2 : 0xb7ac95;
    this.minimapViewportGraphics.lineStyle(hasFocusTarget ? 1.3 : 1, viewportColor, hasFocusTarget ? 0.72 : 0.52);
    for (const segment of boundarySegments) {
      this.minimapViewportGraphics.lineBetween(segment.startX, segment.startY, segment.endX, segment.endY);
    }
    this.minimapViewportBoundarySegments = boundarySegments.length;
    this.minimapViewportFootprint = frame;
    this.minimapViewportKey = viewportKey;
    this.minimapViewportFrame.setVisible(false);
  }

  getViewportMinimapHexes(mapWidth, mapHeight, projection) {
    const viewport = this.latestState?.cameraViewportWorld;
    if (
      !viewport ||
      !Number.isFinite(viewport.left) ||
      !Number.isFinite(viewport.top) ||
      !Number.isFinite(viewport.right) ||
      !Number.isFinite(viewport.bottom)
    ) {
      return [];
    }
    const visibleHexes = [];

    for (let r = 0; r < mapHeight; r += 1) {
      for (let q = 0; q < mapWidth; q += 1) {
        const world = axialToWorld({ q, r }, HEX_SIZE, projection.worldOriginX, projection.worldOriginY);
        if (!this.isHexIntersectingViewport(world.x, world.y, viewport, projection.worldHalfHexWidth)) {
          continue;
        }
        const minimap = this.projectHexToMinimap(q, r, projection);
        visibleHexes.push({ q, r, key: `${q},${r}`, x: minimap.x, y: minimap.y });
      }
    }
    return visibleHexes;
  }

  buildViewportBoundarySegments(viewportHexes, projection) {
    if (!Array.isArray(viewportHexes) || viewportHexes.length === 0) {
      return [];
    }
    const visibleKeySet = new Set(viewportHexes.map((hex) => hex.key));
    const segmentByKey = new Map();
    const edgeRadius = Math.max(1, projection.hexRadius * 0.86);
    for (const hex of viewportHexes) {
      for (let directionIndex = 0; directionIndex < AXIAL_DIRECTIONS.length; directionIndex += 1) {
        const direction = AXIAL_DIRECTIONS[directionIndex];
        const neighborKey = `${hex.q + direction.q},${hex.r + direction.r}`;
        if (visibleKeySet.has(neighborKey)) {
          continue;
        }
        const edgeIndex = DIRECTION_TO_EDGE_INDEX[directionIndex];
        const nextEdgeIndex = (edgeIndex + 1) % MINIMAP_HEX_CORNERS.length;
        const startX = hex.x + MINIMAP_HEX_CORNERS[edgeIndex].x * edgeRadius;
        const startY = hex.y + MINIMAP_HEX_CORNERS[edgeIndex].y * edgeRadius;
        const endX = hex.x + MINIMAP_HEX_CORNERS[nextEdgeIndex].x * edgeRadius;
        const endY = hex.y + MINIMAP_HEX_CORNERS[nextEdgeIndex].y * edgeRadius;
        const canonicalKey = this.buildCanonicalSegmentKey(startX, startY, endX, endY);
        segmentByKey.set(canonicalKey, { startX, startY, endX, endY });
      }
    }
    return [...segmentByKey.values()];
  }

  projectCameraFrameToMinimap(boundarySegments, viewportHexes, projection) {
    if ((!Array.isArray(boundarySegments) || boundarySegments.length === 0) && (!Array.isArray(viewportHexes) || viewportHexes.length === 0)) {
      return null;
    }
    const bounds = projection.bounds;
    let frameLeft = Number.POSITIVE_INFINITY;
    let frameTop = Number.POSITIVE_INFINITY;
    let frameRight = Number.NEGATIVE_INFINITY;
    let frameBottom = Number.NEGATIVE_INFINITY;
    if (Array.isArray(boundarySegments) && boundarySegments.length > 0) {
      for (const segment of boundarySegments) {
        frameLeft = Math.min(frameLeft, segment.startX, segment.endX);
        frameTop = Math.min(frameTop, segment.startY, segment.endY);
        frameRight = Math.max(frameRight, segment.startX, segment.endX);
        frameBottom = Math.max(frameBottom, segment.startY, segment.endY);
      }
    } else {
      const halfFrameHexWidth = projection.halfHexWidth * 0.65;
      const halfFrameHexHeight = projection.hexRadius * 0.65;
      for (const hex of viewportHexes) {
        frameLeft = Math.min(frameLeft, hex.x - halfFrameHexWidth);
        frameTop = Math.min(frameTop, hex.y - halfFrameHexHeight);
        frameRight = Math.max(frameRight, hex.x + halfFrameHexWidth);
        frameBottom = Math.max(frameBottom, hex.y + halfFrameHexHeight);
      }
    }
    if (!Number.isFinite(frameLeft) || !Number.isFinite(frameTop) || !Number.isFinite(frameRight) || !Number.isFinite(frameBottom)) {
      return null;
    }
    const x = Phaser.Math.Clamp(frameLeft, bounds.x, bounds.x + bounds.width - 2);
    const y = Phaser.Math.Clamp(frameTop, bounds.y, bounds.y + bounds.height - 2);
    const clampedRight = Phaser.Math.Clamp(frameRight, x + 2, bounds.x + bounds.width);
    const clampedBottom = Phaser.Math.Clamp(frameBottom, y + 2, bounds.y + bounds.height);
    const width = Math.max(2, clampedRight - x);
    const height = Math.max(2, clampedBottom - y);
    return { x, y, width, height };
  }

  buildMinimapViewportCacheKey(projection, hasFocusTarget) {
    const viewport = this.latestState?.cameraViewportWorld;
    const mapWorldBounds = this.latestState?.mapWorldBounds;
    const mapRevision = this.latestState?.meta?.mapRevision ?? 0;
    const viewportKey = viewport
      ? `${Math.round(viewport.left * 10)}:${Math.round(viewport.top * 10)}:${Math.round(viewport.right * 10)}:${Math.round(viewport.bottom * 10)}`
      : "noviewport";
    const worldKey = mapWorldBounds
      ? `${Math.round(mapWorldBounds.left * 10)}:${Math.round(mapWorldBounds.top * 10)}:${Math.round(mapWorldBounds.right * 10)}:${Math.round(mapWorldBounds.bottom * 10)}`
      : "nomapbounds";
    const bounds = projection.bounds;
    return [
      mapRevision,
      projection.mapWidth,
      projection.mapHeight,
      Math.round(projection.hexRadius * 1000),
      Math.round(bounds.x),
      Math.round(bounds.y),
      Math.round(bounds.width),
      Math.round(bounds.height),
      viewportKey,
      worldKey,
      hasFocusTarget ? 1 : 0,
    ].join("|");
  }

  getMinimapProjectionState(mapWidth, mapHeight, bounds = this.minimapContentBounds) {
    const widthFactor = SQRT_3 * (mapWidth + (mapHeight - 1) * 0.5);
    const heightFactor = mapHeight * 1.5 + 0.5;
    const hexRadius = Math.max(1, Math.min(bounds.width / Math.max(1, widthFactor), bounds.height / Math.max(1, heightFactor)));
    const drawWidth = widthFactor * hexRadius;
    const drawHeight = heightFactor * hexRadius;
    const drawLeft = bounds.x + (bounds.width - drawWidth) / 2;
    const drawTop = bounds.y + (bounds.height - drawHeight) / 2;
    const mapWorldBounds = this.latestState?.mapWorldBounds;
    const worldHalfHexWidth = (SQRT_3 * HEX_SIZE) / 2;
    const worldOriginX = Number.isFinite(mapWorldBounds?.left) ? mapWorldBounds.left + worldHalfHexWidth : worldHalfHexWidth;
    const worldOriginY = Number.isFinite(mapWorldBounds?.top) ? mapWorldBounds.top + HEX_SIZE : HEX_SIZE;
    return {
      bounds,
      mapWidth,
      mapHeight,
      hexRadius,
      halfHexWidth: SQRT_3 * 0.5 * hexRadius,
      minimapOriginX: drawLeft + SQRT_3 * 0.5 * hexRadius,
      minimapOriginY: drawTop + hexRadius,
      worldHalfHexWidth,
      worldOriginX,
      worldOriginY,
    };
  }

  isHexIntersectingViewport(centerX, centerY, viewport, worldHalfHexWidth) {
    const boundsOverlap =
      centerX + worldHalfHexWidth >= viewport.left &&
      centerX - worldHalfHexWidth <= viewport.right &&
      centerY + HEX_SIZE >= viewport.top &&
      centerY - HEX_SIZE <= viewport.bottom;
    if (!boundsOverlap) {
      return false;
    }
    if (centerX >= viewport.left && centerX <= viewport.right && centerY >= viewport.top && centerY <= viewport.bottom) {
      return true;
    }
    for (const corner of MINIMAP_HEX_CORNERS) {
      const cornerX = centerX + corner.x * HEX_SIZE;
      const cornerY = centerY + corner.y * HEX_SIZE;
      if (cornerX >= viewport.left && cornerX <= viewport.right && cornerY >= viewport.top && cornerY <= viewport.bottom) {
        return true;
      }
    }
    const viewportCorners = [
      [viewport.left, viewport.top],
      [viewport.right, viewport.top],
      [viewport.right, viewport.bottom],
      [viewport.left, viewport.bottom],
    ];
    for (const [x, y] of viewportCorners) {
      if (this.isPointInsideHex(x, y, centerX, centerY, HEX_SIZE)) {
        return true;
      }
    }
    const hexPoints = MINIMAP_HEX_CORNERS.map((corner) => ({
      x: centerX + corner.x * HEX_SIZE,
      y: centerY + corner.y * HEX_SIZE,
    }));
    const rectEdges = [
      { startX: viewport.left, startY: viewport.top, endX: viewport.right, endY: viewport.top },
      { startX: viewport.right, startY: viewport.top, endX: viewport.right, endY: viewport.bottom },
      { startX: viewport.right, startY: viewport.bottom, endX: viewport.left, endY: viewport.bottom },
      { startX: viewport.left, startY: viewport.bottom, endX: viewport.left, endY: viewport.top },
    ];
    for (let i = 0; i < hexPoints.length; i += 1) {
      const start = hexPoints[i];
      const end = hexPoints[(i + 1) % hexPoints.length];
      for (const rectEdge of rectEdges) {
        if (this.segmentsIntersect(start.x, start.y, end.x, end.y, rectEdge.startX, rectEdge.startY, rectEdge.endX, rectEdge.endY)) {
          return true;
        }
      }
    }
    return false;
  }

  isPointInsideHex(pointX, pointY, centerX, centerY, radius) {
    let hasPositive = false;
    let hasNegative = false;
    for (let i = 0; i < MINIMAP_HEX_CORNERS.length; i += 1) {
      const current = MINIMAP_HEX_CORNERS[i];
      const next = MINIMAP_HEX_CORNERS[(i + 1) % MINIMAP_HEX_CORNERS.length];
      const ax = centerX + current.x * radius;
      const ay = centerY + current.y * radius;
      const bx = centerX + next.x * radius;
      const by = centerY + next.y * radius;
      const cross = (bx - ax) * (pointY - ay) - (by - ay) * (pointX - ax);
      if (cross > 0) {
        hasPositive = true;
      } else if (cross < 0) {
        hasNegative = true;
      }
      if (hasPositive && hasNegative) {
        return false;
      }
    }
    return true;
  }

  findNearestMinimapHex(pointX, pointY, mapWidth, mapHeight, projection, hintQ = 0, hintR = 0) {
    let q = Phaser.Math.Clamp(Math.round(hintQ), 0, mapWidth - 1);
    let r = Phaser.Math.Clamp(Math.round(hintR), 0, mapHeight - 1);
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let row = 0; row < mapHeight; row += 1) {
      for (let col = 0; col < mapWidth; col += 1) {
        const center = this.projectHexToMinimap(col, row, projection);
        const dx = pointX - center.x;
        const dy = pointY - center.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          q = col;
          r = row;
        }
      }
    }
    return { q, r };
  }

  buildCanonicalSegmentKey(startX, startY, endX, endY) {
    const sx = Math.round(startX * 10);
    const sy = Math.round(startY * 10);
    const ex = Math.round(endX * 10);
    const ey = Math.round(endY * 10);
    if (sx < ex || (sx === ex && sy <= ey)) {
      return `${sx}:${sy}:${ex}:${ey}`;
    }
    return `${ex}:${ey}:${sx}:${sy}`;
  }

  segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const orientation = (px, py, qx, qy, rx, ry) => {
      const value = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
      if (Math.abs(value) <= 0.0001) {
        return 0;
      }
      return value > 0 ? 1 : 2;
    };
    const onSegment = (px, py, qx, qy, rx, ry) =>
      qx >= Math.min(px, rx) - 0.0001 &&
      qx <= Math.max(px, rx) + 0.0001 &&
      qy >= Math.min(py, ry) - 0.0001 &&
      qy <= Math.max(py, ry) + 0.0001;

    const o1 = orientation(ax, ay, bx, by, cx, cy);
    const o2 = orientation(ax, ay, bx, by, dx, dy);
    const o3 = orientation(cx, cy, dx, dy, ax, ay);
    const o4 = orientation(cx, cy, dx, dy, bx, by);

    if (o1 !== o2 && o3 !== o4) {
      return true;
    }
    if (o1 === 0 && onSegment(ax, ay, cx, cy, bx, by)) {
      return true;
    }
    if (o2 === 0 && onSegment(ax, ay, dx, dy, bx, by)) {
      return true;
    }
    if (o3 === 0 && onSegment(cx, cy, ax, ay, dx, dy)) {
      return true;
    }
    if (o4 === 0 && onSegment(cx, cy, bx, by, dx, dy)) {
      return true;
    }
    return false;
  }

  projectHexToMinimap(q, r, projection) {
    return axialToWorld({ q, r }, projection.hexRadius, projection.minimapOriginX, projection.minimapOriginY);
  }

  drawMinimapHex(graphics, centerX, centerY, radius) {
    graphics.beginPath();
    graphics.moveTo(centerX + MINIMAP_HEX_CORNERS[0].x * radius, centerY + MINIMAP_HEX_CORNERS[0].y * radius);
    for (let i = 1; i < MINIMAP_HEX_CORNERS.length; i += 1) {
      graphics.lineTo(centerX + MINIMAP_HEX_CORNERS[i].x * radius, centerY + MINIMAP_HEX_CORNERS[i].y * radius);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
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

  fitButtonRowWidths(buttons, availableWidth, minWidth, maxWidth, gap) {
    if (!buttons.length) {
      return;
    }
    const usableWidth = Math.max(minWidth * buttons.length, availableWidth - Math.max(0, buttons.length - 1) * gap);
    const width = Phaser.Math.Clamp(Math.floor(usableWidth / buttons.length), minWidth, maxWidth);
    for (const button of buttons) {
      this.resizeButton(button, width, button.height);
      this.setTextWithinWidth(button.label, button.defaultLabel ?? button.label.text, Math.max(30, width - 10));
    }
  }

  fitTextSizeToWidth(label, preferredSize, minSize, maxWidth) {
    let fontSize = preferredSize;
    label.setFontSize(fontSize);
    while (fontSize > minSize && label.width > maxWidth) {
      fontSize -= 1;
      label.setFontSize(fontSize);
    }
  }

  setTextWithinWidth(label, value, maxWidth) {
    const source = typeof value === "string" ? value : String(value ?? "");
    label.setText(source);
    if (!Number.isFinite(maxWidth) || maxWidth <= 0 || label.width <= maxWidth || source.length <= 3) {
      return source;
    }
    let low = 1;
    let high = source.length;
    let best = "...";
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const prefix = source.slice(0, mid).trimEnd();
      const candidate = `${prefix}...`;
      label.setText(candidate);
      if (label.width <= maxWidth) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    label.setText(best);
    return best;
  }

  layoutQueueVerticalStack(centerX, startY, innerGap, rowGap) {
    const clusters = this.cityQueueButtons.map((_, index) => [
      this.cityQueueMoveUpButtons[index],
      this.cityQueueButtons[index],
      this.cityQueueMoveDownButtons[index],
      this.cityQueueRemoveButtons[index],
    ]);
    for (let i = 0; i < clusters.length; i += 1) {
      const y = startY + i * (CITY_PANEL_BUTTON_HEIGHT + rowGap);
      this.layoutButtonRow(clusters[i], centerX, y, innerGap);
    }
  }

  resizeQueueRailControls(panelWidth, isTabletLayout) {
    const controlWidth = isTabletLayout ? 22 : 24;
    const clusterWidthTarget = Math.max(132, panelWidth - RIGHT_RAIL_QUEUE_SLOT_OUTER_PADDING * 2);
    const slotWidth = Math.max(108, clusterWidthTarget - controlWidth * 3 - RIGHT_RAIL_QUEUE_SLOT_INNER_GAP * 3);
    const controlHeight = CITY_PANEL_BUTTON_HEIGHT;
    const slotHeight = CITY_PANEL_BUTTON_HEIGHT;

    for (let i = 0; i < this.cityQueueButtons.length; i += 1) {
      this.resizeButton(this.cityQueueButtons[i], slotWidth, slotHeight);
      this.resizeButton(this.cityQueueMoveUpButtons[i], controlWidth, controlHeight);
      this.resizeButton(this.cityQueueMoveDownButtons[i], controlWidth, controlHeight);
      this.resizeButton(this.cityQueueRemoveButtons[i], controlWidth, controlHeight);
      this.cityQueueButtons[i].label.setWordWrapWidth(Math.max(82, slotWidth - 8), true);
    }

    return {
      innerGap: RIGHT_RAIL_QUEUE_SLOT_INNER_GAP,
      rowGap: RIGHT_RAIL_QUEUE_SLOT_ROW_GAP,
    };
  }

  resizeButton(button, width, height) {
    button.width = width;
    button.height = height;
    button.rectangle.setSize(width, height);
    button.rectangle.setDisplaySize(width, height);
  }

  shouldShowCityQueueRail(gameState, menuType, selectedCity) {
    if (!gameState) {
      return false;
    }
    return menuType === "city" && !!selectedCity && gameState.match?.status === "ongoing";
  }

  setCityQueueRailVisible(visible) {
    this.cityQueueRailPanel.setVisible(visible);
    this.cityQueueRailTitle.setVisible(visible);
    this.setCompositeVisible(this.cityQueueRushBuyButton, visible);
    if (!visible) {
      this.cityQueueRailDetailsPrimary.setVisible(false);
      this.cityQueueRailDetailsSecondary.setVisible(false);
      this.cityQueueRailDetailsTertiary.setVisible(false);
      this.setButtonEnabled(this.cityQueueRushBuyButton, false);
      this.setButtonWarning(this.cityQueueRushBuyButton, false);
      this.setButtonLabel(this.cityQueueRushBuyButton, "Rush Buy");
    }
  }

  layoutCityQueueRail({ isTabletLayout, edgePadding, notificationLeft, notificationWidth, statusY, statusHeight, selectedCity, visible }) {
    if (!visible || !selectedCity || !this.latestState) {
      this.setCityQueueRailVisible(false);
      return;
    }

    const notificationBottom = this.notificationPanel.getBounds().bottom;
    const queueTop = notificationBottom + (isTabletLayout ? 8 : 10);
    const queueBottomLimit = statusY - statusHeight / 2 - (isTabletLayout ? 8 : 10);
    const availableHeight = queueBottomLimit - queueTop;
    if (availableHeight < RIGHT_RAIL_QUEUE_PANEL_MIN_HEIGHT) {
      this.setCityQueueRailVisible(false);
      return;
    }

    const preferredHeight = isTabletLayout ? RIGHT_RAIL_QUEUE_PANEL_HEIGHT_TABLET : RIGHT_RAIL_QUEUE_PANEL_HEIGHT;
    const panelHeight = Math.min(preferredHeight, availableHeight);
    const panelCenterX = notificationLeft + notificationWidth / 2;
    const panelCenterY = queueTop + panelHeight / 2;
    this.cityQueueRailPanel.setPosition(panelCenterX, panelCenterY);
    this.cityQueueRailPanel.setSize(notificationWidth, panelHeight);
    this.cityQueueRailPanel.setDisplaySize(notificationWidth, panelHeight);
    this.cityQueueRailTitle.setPosition(notificationLeft + 12, queueTop + 10);
    this.setCityQueueRailVisible(true);
    const rushBuyButtonX = notificationLeft + notificationWidth - this.cityQueueRushBuyButton.width / 2 - 10;
    const rushBuyButtonY = queueTop + 17;
    this.cityQueueRushBuyButton.rectangle.setPosition(rushBuyButtonX, rushBuyButtonY);
    this.cityQueueRushBuyButton.label.setPosition(rushBuyButtonX, rushBuyButtonY);
    const canIssueOrders =
      this.latestState.turnState?.phase === "player" &&
      this.latestState.match?.status === "ongoing" &&
      !this.latestState.pendingCityResolution &&
      !this.latestState.turnPlayback?.active &&
      !this.latestState.animationState?.busy;
    const canRushBuy = !!this.latestState.uiActions?.canRushBuyCityQueueFront;
    const rushBuyCost = Math.max(0, Number(this.latestState.uiActions?.cityRushBuyCost ?? 0));
    this.setButtonLabel(this.cityQueueRushBuyButton, canRushBuy ? `Rush Buy (${rushBuyCost}g)` : "Rush Buy");
    this.setButtonEnabled(this.cityQueueRushBuyButton, canIssueOrders && canRushBuy);
    this.setButtonWarning(this.cityQueueRushBuyButton, !canRushBuy);
    const queueControlLayout = this.resizeQueueRailControls(notificationWidth, isTabletLayout);

    const lineWrap = Math.max(120, notificationWidth - 22);
    this.cityQueueRailDetailsPrimary.setWordWrapWidth(lineWrap, true);
    this.cityQueueRailDetailsSecondary.setWordWrapWidth(lineWrap, true);
    this.cityQueueRailDetailsTertiary.setWordWrapWidth(lineWrap, true);

    const details = this.buildCityQueueRailDetails(selectedCity, this.latestState);
    this.cityQueueRailDetailsPrimary.setText(details.primary);
    this.cityQueueRailDetailsSecondary.setText(details.secondary);
    this.cityQueueRailDetailsTertiary.setText(details.tertiary);

    let visibleDetailCount = isTabletLayout
      ? panelHeight >= 154
        ? 1
        : 0
      : panelHeight >= 190
        ? 3
        : panelHeight >= 172
          ? 2
          : panelHeight >= 154
            ? 1
            : 0;
    const detailLabels = [this.cityQueueRailDetailsPrimary, this.cityQueueRailDetailsSecondary, this.cityQueueRailDetailsTertiary];

    let queueStackStartY = queueTop + 44;
    const queueContentBottomLimit = queueTop + panelHeight - 10;
    const queueSlotCount = this.cityQueueButtons.length;
    while (visibleDetailCount >= 0) {
      for (let i = 0; i < detailLabels.length; i += 1) {
        const label = detailLabels[i];
        const show = i < visibleDetailCount;
        label.setVisible(show);
        if (show) {
          label.setPosition(notificationLeft + 12, queueTop + 34 + i * 18);
        }
      }
      const visibleDetails = detailLabels.filter((label) => label.visible);
      const detailBottom =
        visibleDetails.length > 0 ? Math.max(...visibleDetails.map((label) => label.getBounds().bottom)) : queueTop + 24;
      queueStackStartY = detailBottom + CITY_PANEL_BUTTON_HEIGHT / 2 + 8;
      const queueBottomY =
        queueStackStartY +
        (queueSlotCount - 1) * (CITY_PANEL_BUTTON_HEIGHT + queueControlLayout.rowGap) +
        CITY_PANEL_BUTTON_HEIGHT / 2;
      if (queueBottomY <= queueContentBottomLimit || visibleDetailCount === 0) {
        break;
      }
      visibleDetailCount -= 1;
    }

    this.layoutQueueVerticalStack(panelCenterX, queueStackStartY, queueControlLayout.innerGap, queueControlLayout.rowGap);

    if (panelCenterX + notificationWidth / 2 > this.scale.width - edgePadding) {
      const correctedX = this.scale.width - edgePadding - notificationWidth / 2;
      this.cityQueueRailPanel.setPosition(correctedX, panelCenterY);
      this.cityQueueRailTitle.setPosition(correctedX - notificationWidth / 2 + 12, this.cityQueueRailTitle.y);
      this.cityQueueRailDetailsPrimary.setPosition(correctedX - notificationWidth / 2 + 12, this.cityQueueRailDetailsPrimary.y);
      this.cityQueueRailDetailsSecondary.setPosition(correctedX - notificationWidth / 2 + 12, this.cityQueueRailDetailsSecondary.y);
      this.cityQueueRailDetailsTertiary.setPosition(correctedX - notificationWidth / 2 + 12, this.cityQueueRailDetailsTertiary.y);
      this.cityQueueRushBuyButton.rectangle.setPosition(correctedX + notificationWidth / 2 - this.cityQueueRushBuyButton.width / 2 - 10, rushBuyButtonY);
      this.cityQueueRushBuyButton.label.setPosition(
        this.cityQueueRushBuyButton.rectangle.x,
        this.cityQueueRushBuyButton.rectangle.y
      );
      this.layoutQueueVerticalStack(correctedX, queueStackStartY, queueControlLayout.innerGap, queueControlLayout.rowGap);
    }
  }

  updateFromState(gameState) {
    const previousTurn = this.currentTurn;
    const previousUnread = this.notificationUnreadCount;
    this.latestState = gameState;
    if (!this.restartConfirmOpen) {
      this.syncNewGameConfigFromState();
    }
    this.currentTurn = Math.max(0, Number(gameState.turnState?.turn ?? 0));
    if (previousTurn > 0 && this.currentTurn < previousTurn) {
      this.setStatsPanelVisible(false);
    }
    if (previousTurn > 0 && this.currentTurn !== previousTurn) {
      for (const entry of this.notifications) {
        if ((entry.turn ?? 0) < this.currentTurn) {
          entry.unread = false;
        }
      }
    }
    this.hideDisabledTooltip();
    const selectedUnit = gameState.units.find((unit) => unit.id === gameState.selectedUnitId) ?? null;
    const selectedCity = gameState.cities.find((city) => city.id === gameState.selectedCityId) ?? null;
    const hasSelection = !!selectedUnit || !!selectedCity;
    const selectionKey = selectedUnit ? `unit:${selectedUnit.id}` : selectedCity ? `city:${selectedCity.id}` : "none";
    const phaseText = gameState.turnState.phase === "enemy" ? "AI" : "Player";
    const hasPendingCityResolution = !!gameState.pendingCityResolution;
    const animationBusy = !!gameState.animationState?.busy;
    const turnPlayback = gameState.turnPlayback ?? { active: false, stepIndex: 0, totalSteps: 0, message: null };
    const canIssueOrders =
      gameState.turnState.phase === "player" &&
      gameState.match.status === "ongoing" &&
      !hasPendingCityResolution &&
      !animationBusy &&
      !turnPlayback.active;
    const turnAssistant = gameState.uiTurnAssistant ?? { readyCount: 0, nextReadyUnitId: null, emptyQueueCityCount: 0 };
    const readyUnits = turnAssistant.readyUnits ?? turnAssistant.readyCount ?? 0;
    const pendingQueues = turnAssistant.emptyQueues ?? turnAssistant.emptyQueueCityCount ?? 0;
    const pendingOrders = readyUnits + pendingQueues;
    const projected = gameState.projectedNetIncome ?? gameState.projectedIncome ?? { food: 0, production: 0, gold: 0, science: 0 };
    const economy = gameState.economy?.player ?? { goldBalance: 0, goldNetLastTurn: 0 };
    const foodResource = gameState.hudTopLeft?.resources?.food ?? { current: projected.food ?? 0, delta: projected.food ?? 0 };
    const productionResource = gameState.hudTopLeft?.resources?.production ?? {
      current: projected.production ?? 0,
      delta: projected.production ?? 0,
    };
    const goldResource = gameState.hudTopLeft?.resources?.gold ?? {
      current: economy.goldBalance ?? 0,
      delta: projected.gold ?? economy.goldNetLastTurn ?? 0,
    };
    const foodCurrent = Number.isFinite(foodResource.current) ? foodResource.current : 0;
    const foodDelta = Number.isFinite(foodResource.delta) ? foodResource.delta : projected.food ?? 0;
    const productionCurrent = Number.isFinite(productionResource.current) ? productionResource.current : 0;
    const productionDelta = Number.isFinite(productionResource.delta) ? productionResource.delta : projected.production ?? 0;
    const goldCurrent = Number.isFinite(goldResource.current) ? goldResource.current : economy.goldBalance ?? 0;
    const goldDelta = Number.isFinite(goldResource.delta) ? goldResource.delta : projected.gold ?? economy.goldNetLastTurn ?? 0;
    const foodGrossDelta = Number.isFinite(foodResource.grossDelta) ? foodResource.grossDelta : projected.food ?? foodDelta;
    const productionGrossDelta = Number.isFinite(productionResource.grossDelta)
      ? productionResource.grossDelta
      : projected.production ?? productionDelta;
    const goldGrossDelta = Number.isFinite(goldResource.grossDelta) ? goldResource.grossDelta : projected.gold ?? goldDelta;
    const foodAdjustments = foodDelta - foodGrossDelta;
    const productionAdjustments = productionDelta - productionGrossDelta;
    const goldAdjustments = goldDelta - goldGrossDelta;
    const goldIncomeLastTurn = Number.isFinite(economy.goldIncomeLastTurn) ? economy.goldIncomeLastTurn : 0;
    const goldUpkeepLastTurn = Number.isFinite(economy.goldUpkeepLastTurn) ? economy.goldUpkeepLastTurn : 0;
    const goldNetLastTurn = Number.isFinite(economy.goldNetLastTurn)
      ? economy.goldNetLastTurn
      : goldIncomeLastTurn - goldUpkeepLastTurn;
    this.resourceDeltaBreakdowns = {
      food: {
        hint: `Food delta ${formatSigned(foodDelta)} = gross ${formatSigned(foodGrossDelta)} + adjustments ${formatSigned(foodAdjustments)}`,
        tooltip: `Net food delta = gross food + adjustments\nGross food (worked tiles): ${formatSigned(
          foodGrossDelta
        )}\nAdjustments: ${formatSigned(foodAdjustments)}\nNet food delta: ${formatSigned(foodDelta)}`,
        textColor: getDeltaColor(foodDelta),
      },
      production: {
        hint: `Production delta ${formatSigned(productionDelta)} = gross ${formatSigned(productionGrossDelta)} + adjustments ${formatSigned(productionAdjustments)}`,
        tooltip: `Net production delta = gross production + adjustments\nGross production (worked tiles): ${formatSigned(
          productionGrossDelta
        )}\nAdjustments: ${formatSigned(productionAdjustments)}\nNet production delta: ${formatSigned(productionDelta)}`,
        textColor: getDeltaColor(productionDelta),
      },
      gold: {
        hint: `Gold delta ${formatSigned(goldDelta)} = gross ${formatSigned(goldGrossDelta)} + adjustments ${formatSigned(goldAdjustments)}`,
        tooltip: `Projected net gold = gross gold + adjustments\nGross gold (worked tiles): ${formatSigned(
          goldGrossDelta
        )}\nAdjustments (upkeep/penalties): ${formatSigned(goldAdjustments)}\nProjected net gold: ${formatSigned(
          goldDelta
        )}\nLast resolved turn: income ${formatSigned(goldIncomeLastTurn)} - upkeep ${formatMetric(
          goldUpkeepLastTurn
        )} = ${formatSigned(goldNetLastTurn)}`,
        textColor: getDeltaColor(goldDelta),
      },
    };

    if (!this.contextPanelPinned && selectionKey !== this.lastContextSelectionKey && selectionKey !== "none") {
      this.contextPanelExpanded = true;
    }
    this.lastContextSelectionKey = selectionKey;

    this.turnLabel.setText(`Turn ${gameState.turnState.turn} - ${phaseText}`);
    const turnPreferredFontSize = this.scale.width < TABLET_LAYOUT_BREAKPOINT ? 21 : 25;
    const turnMinFontSize = this.scale.width < TABLET_LAYOUT_BREAKPOINT ? 17 : 19;
    const turnMaxWidth = Math.max(140, this.topHudPanel.displayWidth - 24);
    this.fitTextSizeToWidth(this.turnLabel, turnPreferredFontSize, turnMinFontSize, turnMaxWidth);
    this.foodLabel.setText(`Food: ${formatMetric(foodCurrent)}`);
    this.foodDeltaLabel.setText(`(${formatSigned(foodDelta)})`);
    this.foodDeltaLabel.setColor(getDeltaColor(foodDelta));
    this.productionLabel.setText(`Production: ${formatMetric(productionCurrent)}`);
    this.productionDeltaLabel.setText(`(${formatSigned(productionDelta)})`);
    this.productionDeltaLabel.setColor(getDeltaColor(productionDelta));
    this.scienceLabel.setText(`Gold: ${formatMetric(goldCurrent)}`);
    this.scienceDeltaLabel.setText(`(${formatSigned(goldDelta)})`);
    this.scienceDeltaLabel.setColor(getDeltaColor(goldDelta));
    this.devVisionLabel.setText(`Dev Vision: ${gameState.devVisionEnabled ? "ON (V)" : "OFF (V)"}`);
    this.devVisionLabel.setColor(gameState.devVisionEnabled ? "#2f7a41" : "#5a4224");
    this.setSfxMuted(this.uiSfxMuted);
    const forecastStatus = hasPendingCityResolution
      ? "Resolve pending city outcome"
      : turnPlayback.active
        ? "AI playback in progress"
        : pendingOrders > 0
          ? `${pendingOrders} actions still waiting`
          : "Ready to end turn";
    this.forecastLinePrimary.setText(
      `Net: F ${formatSigned(projected.food)} | P ${formatSigned(projected.production)} | G ${formatSigned(projected.gold ?? 0)}`
    );
    this.forecastLineSecondary.setText(`Pending: Units ${readyUnits}, Queues ${pendingQueues}`);
    this.forecastLineTertiary.setText(`Status: ${forecastStatus}`);
    const forecastWarning = pendingOrders > 0 || projected.food < 0 || projected.production < 0 || (projected.gold ?? 0) < 0;
    this.forecastPanel.setFillStyle(forecastWarning ? 0xf2e1c8 : SEMANTIC_COLORS.panelElevatedBg, 0.95);
    this.forecastPanel.setStrokeStyle(PANEL_STROKE_WIDTH, forecastWarning ? 0x8f3a2a : SEMANTIC_COLORS.panelBorder, 0.86);
    this.forecastLineTertiary.setColor(
      hasPendingCityResolution || pendingOrders > 0
        ? SEMANTIC_COLORS.textWarning
        : canIssueOrders
          ? SEMANTIC_COLORS.textPositive
          : SEMANTIC_COLORS.textMuted
    );
    const playerOwner = gameState.factions?.playerOwner ?? "player";
    const playerCities = gameState.cities.filter((city) => city.owner === playerOwner).length;
    const playerUnits = gameState.units.filter((unit) => unit.owner === playerOwner).length;
    const completedTech = gameState.research?.completedTechIds?.length ?? 0;
    const activeTech = gameState.research?.currentTechId ?? gameState.research?.activeTechId ?? "None";
    const turnsRemaining = gameState.research?.turnsRemaining ?? null;
    const activeBoost = activeTech && activeTech !== "None" ? gameState.research?.boostProgressByTech?.[activeTech] ?? null : null;
    const boostLabel =
      activeBoost && Number.isFinite(activeBoost.target) && activeBoost.target > 0
        ? `Boost ${activeBoost.current}/${activeBoost.target}${activeBoost.met ? " ready" : ""}`
        : "Boost n/a";
    const exploredHexes = gameState.visibility?.byOwner?.[playerOwner]?.exploredHexes?.length ?? 0;
    const totalHexes = Math.max(1, (gameState.map?.width ?? 1) * (gameState.map?.height ?? 1));
    const exploredPercent = Math.round((exploredHexes / totalHexes) * 100);
    this.latestStatsPayload = {
      cities: playerCities,
      units: playerUnits,
      readyUnits,
      techCompleted: completedTech,
      activeTech,
      exploredPercent,
    };
    this.statsCitiesLabel.setText(`Cities: ${playerCities}`);
    this.statsUnitsLabel.setText(`Units: ${playerUnits} (Ready ${readyUnits})`);
    this.statsTechLabel.setText(
      `Tech: ${completedTech} complete | Active ${capitalizeLabel(activeTech)}${
        Number.isFinite(turnsRemaining) ? ` (${turnsRemaining} turns)` : ""
      } | ${boostLabel}`
    );
    this.statsExploreLabel.setText(`Explored: ${exploredPercent}%`);
    this.updateTechTreeModalPayload(gameState);
    this.layoutResourceDeltas();

    this.playbackPanel.setVisible(!!turnPlayback.active);
    this.playbackLabel.setVisible(!!turnPlayback.active);
    if (turnPlayback.active) {
      const message = turnPlayback.message ?? `AI action ${turnPlayback.stepIndex}/${Math.max(1, turnPlayback.totalSteps)}`;
      this.playbackLabel.setText(message);
    } else {
      this.playbackLabel.setText("");
    }

    this.selectedPanel.setVisible(hasSelection);
    this.selectedTitle.setVisible(hasSelection);
    this.selectedDetails.setVisible(hasSelection);
    if (hasSelection) {
      this.selectedDetails.setText(this.getSelectedInfoText(selectedUnit, selectedCity));
    }

    this.endTurnButton.label.setText(
      canIssueOrders
        ? "End Turn"
        : hasPendingCityResolution
          ? "Resolve..."
          : turnPlayback.active
            ? "AI..."
            : animationBusy
              ? "Animating..."
              : "AI..."
    );
    this.setButtonEnabled(this.endTurnButton, canIssueOrders);
    this.setButtonWarning(this.endTurnButton, canIssueOrders && pendingOrders > 0);

    this.turnAssistantPanel.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantAccent.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantStatusDot.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantLabel.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantSecondaryLabel.setVisible(gameState.match.status === "ongoing");
    this.turnAssistantLabel.setText("Attention");
    this.turnAssistantSecondaryLabel.setText(
      pendingOrders > 0 ? `${pendingOrders} actions waiting` : canIssueOrders ? "All clear" : "Waiting..."
    );
    this.setButtonLabel(this.attentionReadyButton, `Units ${readyUnits}`);
    this.setButtonLabel(this.attentionQueueButton, `Queues ${pendingQueues}`);
    this.setCompositeVisible(this.attentionReadyButton, gameState.match.status === "ongoing");
    this.setCompositeVisible(this.attentionQueueButton, gameState.match.status === "ongoing");
    this.setButtonEnabled(this.attentionReadyButton, gameState.match.status === "ongoing" && canIssueOrders && readyUnits > 0);
    this.setButtonEnabled(this.attentionQueueButton, gameState.match.status === "ongoing" && canIssueOrders && pendingQueues > 0);
    this.setButtonWarning(this.attentionReadyButton, canIssueOrders && readyUnits > 0);
    this.setButtonWarning(this.attentionQueueButton, canIssueOrders && pendingQueues > 0);
    this.setCompositeVisible(this.nextUnitButton, false);
    this.setButtonEnabled(this.nextUnitButton, false);
    if (gameState.match.status === "ongoing" && canIssueOrders && pendingOrders > 0) {
      this.turnAssistantPanel.setFillStyle(SEMANTIC_COLORS.panelActiveBg, 0.98);
      this.turnAssistantPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.95);
      this.turnAssistantAccent.setFillStyle(SEMANTIC_COLORS.accentAmber, 0.9);
      this.turnAssistantStatusDot.setFillStyle(SEMANTIC_COLORS.accentAmber, 0.95);
      this.turnAssistantLabel.setColor(SEMANTIC_COLORS.textStrong);
      this.turnAssistantSecondaryLabel.setColor(SEMANTIC_COLORS.textMuted);
      this.setTurnAssistantPulse(false);
    } else {
      this.turnAssistantPanel.setFillStyle(SEMANTIC_COLORS.panelSoftBg, 0.95);
      this.turnAssistantPanel.setStrokeStyle(PANEL_STROKE_WIDTH, 0x8b7a5e, 0.85);
      if (gameState.match.status === "ongoing" && canIssueOrders) {
        this.turnAssistantAccent.setFillStyle(SEMANTIC_COLORS.accentGreen, 0.86);
        this.turnAssistantStatusDot.setFillStyle(SEMANTIC_COLORS.accentGreen, 0.94);
        this.turnAssistantLabel.setColor("#5b4b35");
        this.turnAssistantSecondaryLabel.setColor("#6e5d45");
      } else {
        this.turnAssistantAccent.setFillStyle(SEMANTIC_COLORS.accentBlue, 0.76);
        this.turnAssistantStatusDot.setFillStyle(SEMANTIC_COLORS.accentBlue, 0.82);
        this.turnAssistantLabel.setColor("#64533d");
        this.turnAssistantSecondaryLabel.setColor("#786650");
      }
      this.setTurnAssistantPulse(false);
    }

    this.syncContextMenu(gameState, selectedUnit, selectedCity, canIssueOrders);
    this.syncCityResolutionModal(gameState.pendingCityResolution);
    this.updatePreviewCard(gameState.uiPreview ?? { mode: "none" });
    this.updateContextualHint();
    const nextLayoutKey = this.buildLayoutStateKey(gameState);
    const layoutChanged = nextLayoutKey !== this.lastLayoutKey;
    if (layoutChanged) {
      this.layout(this.scale.gameSize);
      this.lastLayoutKey = nextLayoutKey;
    } else {
      this.renderMinimap();
    }
    if (this.minimapVisible) {
      const focusHex = gameState.cameraFocusHex;
      this.minimapCaption.setText(
        focusHex && Number.isFinite(focusHex.q) && Number.isFinite(focusHex.r)
          ? `Focus ${Math.round(focusHex.q)},${Math.round(focusHex.r)}`
          : "Click to focus"
      );
    }

    const turnChanged = previousTurn > 0 && this.currentTurn !== previousTurn;
    if (turnChanged || layoutChanged || previousUnread !== this.notificationUnreadCount) {
      this.updateNotificationCenter();
    }

    const hasResult = gameState.match.status !== "ongoing";
    this.resultPanel.setVisible(hasResult);
    this.resultTitle.setVisible(hasResult);
    this.resultSubtitle.setVisible(hasResult);
    this.setCompositeVisible(this.resultRestartButton, hasResult);
    if (hasResult) {
      this.resultTitle.setText(gameState.match.status === "won" ? "Victory" : "Defeat");
      this.resultSubtitle.setText(
        gameState.match.reason === "elimination" ? "Hostile factions eliminated." : "Your civilization has fallen."
      );
      this.setButtonEnabled(this.resultRestartButton, true);
    }
  }

  updateTechTreeModalPayload(gameState) {
    if (!gameState) {
      return;
    }
    const payload = buildTechTreeModalPayload(gameState);
    const summary = payload.summary;
    this.techTreeSummaryScienceLabel.setText(
      `Science/Turn ${formatMetric(summary.sciencePerTurn)} | Base ${formatMetric(summary.baseSciencePerTurn)} | Global +${formatMetric(
        summary.globalModifierTotal * 100
      )}%`
    );
    this.techTreeSummaryCurrentLabel.setText(
      summary.currentTechId
        ? `Progress ${summary.completedTech}/${summary.totalTech} | Active ${summary.currentTechName}${
            Number.isFinite(summary.turnsRemaining) ? ` (${summary.turnsRemaining} turns)` : ""
          }`
        : `Progress ${summary.completedTech}/${summary.totalTech} | No active research`
    );
    this.techTreeSummaryCitiesLabel.setText(
      summary.cityScienceBreakdown.length > 0
        ? `Per-city science: ${summary.cityScienceBreakdown.map((entry) => `${entry.cityName} ${formatMetric(entry.totalScience)}`).join(" | ")}`
        : "Per-city science: no city science breakdown available"
    );
    this.techTreeSummaryLegendLabel.setText("Status legend: Completed | Active | Available | Locked");
    payload.open = this.techTreeModalOpen;
    payload.graph.viewport = { ...this.techTreeGraphViewportBounds };
    payload.graph.scrollX = this.techTreeGraphScrollX;
    this.latestTechTreeModalPayload = payload;
    this.renderTechTreeGraph(payload);
  }

  renderTechTreeGraph(payload) {
    const graph = payload?.graph ?? null;
    if (!graph) {
      return;
    }
    this.clearTechTreeGraphNodes();
    this.techTreeGraphEdges.clear();
    const viewportWidth = Math.max(0, this.techTreeGraphViewportBounds.width);
    const viewportHeight = Math.max(0, this.techTreeGraphViewportBounds.height);
    this.techTreeGraphContentWidth = Math.max(viewportWidth, Number.isFinite(graph.contentWidth) ? graph.contentWidth : viewportWidth);
    this.techTreeGraphContentHeight = Math.max(viewportHeight, Number.isFinite(graph.contentHeight) ? graph.contentHeight : viewportHeight);
    this.techTreeGraphMaxScrollX = Math.max(0, this.techTreeGraphContentWidth - viewportWidth);
    this.applyTechTreeGraphScroll(this.techTreeGraphScrollX, { updatePayload: false });
    if (!this.techTreeModalOpen) {
      this.latestTechTreeModalPayload.graph = {
        ...this.latestTechTreeModalPayload.graph,
        viewport: { ...this.techTreeGraphViewportBounds },
        contentWidth: this.techTreeGraphContentWidth,
        contentHeight: this.techTreeGraphContentHeight,
        scrollX: this.techTreeGraphScrollX,
        nodes: graph.nodes.map((node) => ({ ...node })),
        edges: graph.edges.map((edge) => ({ ...edge })),
      };
      return;
    }
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      if (!source || !target) {
        continue;
      }
      const startX = source.x + source.width;
      const startY = source.y + source.height / 2;
      const endX = target.x;
      const endY = target.y + target.height / 2;
      const bendX = startX + Math.max(20, (endX - startX) * 0.5);
      this.techTreeGraphEdges.lineStyle(TECH_TREE_GRAPH_CONNECTOR_WIDTH, TECH_TREE_GRAPH_CONNECTOR_COLOR, TECH_TREE_GRAPH_CONNECTOR_ALPHA);
      this.techTreeGraphEdges.beginPath();
      this.techTreeGraphEdges.moveTo(startX, startY);
      this.techTreeGraphEdges.lineTo(bendX, startY);
      this.techTreeGraphEdges.lineTo(bendX, endY);
      this.techTreeGraphEdges.lineTo(endX, endY);
      this.techTreeGraphEdges.strokePath();
    }
    for (const node of graph.nodes) {
      const palette = resolveTechNodePalette(node.status);
      const rect = this.add.rectangle(node.x, node.y, node.width, node.height, palette.fill, palette.fillAlpha).setOrigin(0, 0);
      rect.setStrokeStyle(2, palette.stroke, 0.92);
      const title = this.createLabel(node.name, node.x + 7, node.y + 5, "12px", palette.text, 41);
      title.setWordWrapWidth(Math.max(84, node.width - 12), true);
      this.setTextWithinWidth(title, node.name, Math.max(84, node.width - 12));
      const statusLabel = this.createLabel(node.status, node.x + 7, node.y + 23, "11px", palette.statusText, 41);
      const progressLabel = this.createLabel(
        `${formatMetric(node.progress)}/${formatMetric(node.cost)} | ${node.boostTarget > 0 ? `Boost ${node.boostCurrent}/${node.boostTarget}` : "Boost n/a"}`,
        node.x + 7,
        node.y + 39,
        "10px",
        palette.progressText,
        41
      );
      progressLabel.setWordWrapWidth(Math.max(84, node.width - 12), true);
      this.setTextWithinWidth(progressLabel, progressLabel.text, Math.max(84, node.width - 12));
      this.techTreeGraphContainer.add([rect, title, statusLabel, progressLabel]);
      this.techTreeGraphNodeObjects.push(rect, title, statusLabel, progressLabel);
    }
    this.latestTechTreeModalPayload.graph = {
      ...this.latestTechTreeModalPayload.graph,
      viewport: { ...this.techTreeGraphViewportBounds },
      contentWidth: this.techTreeGraphContentWidth,
      contentHeight: this.techTreeGraphContentHeight,
      scrollX: this.techTreeGraphScrollX,
      nodes: graph.nodes.map((node) => ({ ...node })),
      edges: graph.edges.map((edge) => ({ ...edge })),
    };
  }

  clearTechTreeGraphNodes() {
    for (const object of this.techTreeGraphNodeObjects) {
      object.destroy();
    }
    this.techTreeGraphNodeObjects = [];
  }

  applyTechTreeGraphScroll(nextScrollX, options = {}) {
    const updatePayload = options.updatePayload !== false;
    const clamped = Phaser.Math.Clamp(
      Number.isFinite(nextScrollX) ? nextScrollX : 0,
      0,
      Math.max(0, this.techTreeGraphMaxScrollX)
    );
    this.techTreeGraphScrollX = clamped;
    this.techTreeGraphContainer.setPosition(this.techTreeGraphViewportBounds.x - clamped, this.techTreeGraphViewportBounds.y);
    if (updatePayload && this.latestTechTreeModalPayload?.graph) {
      this.latestTechTreeModalPayload.graph.scrollX = clamped;
      this.latestTechTreeModalPayload.graph.viewport = { ...this.techTreeGraphViewportBounds };
      this.latestTechTreeModalPayload.graph.contentWidth = this.techTreeGraphContentWidth;
      this.latestTechTreeModalPayload.graph.contentHeight = this.techTreeGraphContentHeight;
    }
    return clamped;
  }

  stopTechTreeGraphDrag() {
    this.techTreeGraphDragging = false;
    this.techTreeGraphDragPointerId = null;
  }

  isPointerInTechTreeGraphViewport(pointer) {
    if (!pointer || !this.techTreeModalOpen) {
      return false;
    }
    return Phaser.Geom.Rectangle.Contains(
      new Phaser.Geom.Rectangle(
        this.techTreeGraphViewportBounds.x,
        this.techTreeGraphViewportBounds.y,
        this.techTreeGraphViewportBounds.width,
        this.techTreeGraphViewportBounds.height
      ),
      pointer.x,
      pointer.y
    );
  }

  buildLayoutStateKey(gameState) {
    if (!gameState) {
      return "none";
    }
    const selectionKey = gameState.selectedUnitId
      ? `u:${gameState.selectedUnitId}`
      : gameState.selectedCityId
        ? `c:${gameState.selectedCityId}`
        : "none";
    const contextType = gameState.uiActions?.contextMenuType ?? "none";
    const turnState = `${gameState.turnState?.phase ?? "none"}`;
    const matchState = `${gameState.match?.status ?? "none"}:${gameState.match?.reason ?? "none"}`;
    const blockers = `${gameState.pendingCityResolution ? 1 : 0}:${gameState.turnPlayback?.active ? 1 : 0}:${
      gameState.animationState?.busy ? 1 : 0
    }`;
    const mapSize = `${gameState.map?.width ?? 0}x${gameState.map?.height ?? 0}`;
    const localUi = `${this.statsPanelOpen ? 1 : 0}:${this.techTreeModalOpen ? 1 : 0}:${this.contextPanelExpanded ? 1 : 0}:${
      this.contextPanelPinned ? 1 : 0
    }`;
    const modals = `${this.techTreeModalOpen ? 1 : 0}:${this.pauseMenuOpen ? 1 : 0}:${this.restartConfirmOpen ? 1 : 0}:${
      this.cityResolutionOpen ? 1 : 0
    }`;
    const cityUi =
      gameState.uiActions?.contextMenuType === "city"
        ? [
            gameState.uiActions?.cityProductionProgress ?? 0,
            gameState.uiActions?.cityQueueFrontRemainingProduction ?? 0,
            gameState.uiActions?.cityRushBuyCost ?? 0,
            gameState.uiActions?.canRushBuyCityQueueFront ? 1 : 0,
            (gameState.uiActions?.cityQueueSlots ?? [])
              .map((slot) => (slot.empty ? "-" : `${slot.kind ?? "item"}:${slot.id ?? "?"}`))
              .join(","),
          ].join(":")
        : "none";
    return [selectionKey, contextType, turnState, matchState, blockers, mapSize, localUi, modals, cityUi].join("|");
  }

  syncContextMenu(gameState, selectedUnit, selectedCity, canIssueOrders) {
    const menuType = gameState.uiActions?.contextMenuType ?? null;
    this.contextMenuMode = menuType;
    const visible = menuType !== null && gameState.match.status === "ongoing";
    const expanded = visible ? this.contextPanelExpanded : false;
    this.contextPanel.setVisible(visible);
    this.contextPanelTitle.setVisible(visible);
    this.setCompositeVisible(this.contextPanelExpandButton, visible);
    this.setCompositeVisible(this.contextPanelPinButton, visible);
    this.contextPanelMetaPrimary.setVisible(visible && expanded);
    this.contextPanelMetaSecondary.setVisible(visible && expanded);
    this.contextPanelDisabledReason.setVisible(false);
    this.setButtonEnabled(this.contextPanelExpandButton, visible);
    this.setButtonEnabled(this.contextPanelPinButton, visible);
    this.setButtonActive(this.contextPanelPinButton, this.contextPanelPinned);
    this.setButtonLabel(this.contextPanelExpandButton, expanded ? "v" : "^");
    this.setButtonLabel(this.contextPanelPinButton, this.contextPanelPinned ? "Unpin" : "Pin");

    if (!visible) {
      this.setCityControlsVisible(false);
      this.setUnitControlsVisible(false);
      this.contextPanelMetaPrimary.setText("");
      this.contextPanelMetaSecondary.setText("");
      this.contextPanelDisabledReason.setText("");
      return;
    }

    if (menuType === "city" && selectedCity) {
      this.contextPanelTitle.setText(
        `City Commands  Population ${selectedCity.population}  Queue ${selectedCity.queue.length}/${gameState.uiActions.cityQueueMax}`
      );
      this.setCityControlsVisible(expanded);
      this.setUnitControlsVisible(false);

      if (expanded) {
        const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, science: 0, gold: 0 };
        const productionProgress = Math.max(0, gameState.uiActions?.cityProductionProgress ?? 0);
        const queueFrontRemaining = Math.max(0, gameState.uiActions?.cityQueueFrontRemainingProduction ?? 0);
        const queueHasFront = (gameState.uiActions?.cityQueueSlots ?? []).some((slot) => !slot.empty);
        const queueFrontCost = queueHasFront ? productionProgress + queueFrontRemaining : 0;
        const localProduction = Math.max(0, gameState.uiActions?.cityLocalProduction ?? 0);
        const scienceBreakdown = formatCityScienceBreakdown(selectedCity.id, gameState);
        const rushBuyEnabled = !!gameState.uiActions?.canRushBuyCityQueueFront;
        const rushBuyCost = Math.max(0, gameState.uiActions?.cityRushBuyCost ?? 0);
        const rushBuyReason = gameState.uiActions?.cityRushBuyReason ?? null;
        const rushBuyText = queueHasFront
          ? rushBuyEnabled
            ? `Rush buy ${rushBuyCost}g`
            : `Rush buy blocked: ${rushBuyReason ?? "Unavailable"}`
          : "Rush buy unavailable (queue empty)";
        const progressText = queueHasFront ? `${productionProgress}/${queueFrontCost}` : "0 (queue empty)";
        this.contextPanelMetaPrimary.setText(
          `Local Food ${localYield.food} | Local Production ${localYield.production} | Local Gold ${localYield.gold ?? 0} | Local Science ${localYield.science} | Identity ${selectedCity.identity}`
        );
        this.contextPanelMetaSecondary.setText(
          scienceBreakdown
            ? `${scienceBreakdown} | Production progress ${progressText} | Local production per turn +${localProduction} | ${rushBuyText}`
            : `Production progress ${progressText} | Local production per turn +${localProduction} | ${rushBuyText}`
        );
      }

      const productionTab = gameState.uiActions?.cityProductionTab ?? "units";
      for (let i = 0; i < this.cityProductionTabButtons.length; i += 1) {
        const tab = PRODUCTION_TABS[i];
        const button = this.cityProductionTabButtons[i];
        this.setButtonActive(button, tab === productionTab);
        this.setButtonEnabled(button, canIssueOrders && !!gameState.uiActions?.canSetCityProductionTab);
      }

      const choiceByType = new Map((gameState.uiActions?.cityProductionChoices ?? []).map((choice) => [choice.type, choice]));
      for (let i = 0; i < this.cityProductionButtons.length; i += 1) {
        const unitType = UNIT_PRODUCTION_TYPES[i];
        const choice = choiceByType.get(unitType);
        const button = this.cityProductionButtons[i];
        this.setButtonLabel(button, formatProductionChoiceLabel(formatUnitLabel(unitType), choice));
        this.setCompositeVisible(button, expanded && productionTab === "units");
        this.setButtonEnabled(button, expanded && productionTab === "units" && canIssueOrders && !!choice?.queueable);
        this.setButtonWarning(button, !button.enabled && !!choice?.stateTag);
        this.applyProductionChoiceVisualState(button, choice);
      }

      const buildingChoiceById = new Map((gameState.uiActions?.cityBuildingChoices ?? []).map((choice) => [choice.id, choice]));
      for (let i = 0; i < this.cityBuildingButtons.length; i += 1) {
        const buildingId = BUILDING_PRODUCTION_TYPES[i];
        const choice = buildingChoiceById.get(buildingId);
        const button = this.cityBuildingButtons[i];
        this.setButtonLabel(button, formatProductionChoiceLabel(formatBuildingLabel(buildingId), choice));
        this.setCompositeVisible(button, expanded && productionTab === "buildings");
        this.setButtonEnabled(button, expanded && productionTab === "buildings" && canIssueOrders && !!choice?.queueable);
        this.setButtonWarning(button, !button.enabled && !!choice?.stateTag);
        this.applyProductionChoiceVisualState(button, choice);
      }

      const queueSlots = gameState.uiActions?.cityQueueSlots ?? [];
      const queueRailVisible = this.shouldShowCityQueueRail(gameState, menuType, selectedCity);
      for (let i = 0; i < this.cityQueueButtons.length; i += 1) {
        const slot = queueSlots[i] ?? null;
        const slotButton = this.cityQueueButtons[i];
        const moveUpButton = this.cityQueueMoveUpButtons[i];
        const moveDownButton = this.cityQueueMoveDownButtons[i];
        const removeButton = this.cityQueueRemoveButtons[i];
        this.setButtonLabel(slotButton, formatQueueSlotLabel(slot, i));
        this.setCompositeVisible(slotButton, queueRailVisible);
        this.setButtonEnabled(slotButton, false);
        this.setButtonWarning(slotButton, false);
        slotButton.label.setColor(slot?.empty ? "#d7c9ae" : "#f5e8ca");
        slotButton.label.setAlpha(slot?.empty ? 0.92 : 1);

        this.setCompositeVisible(moveUpButton, queueRailVisible);
        this.setCompositeVisible(moveDownButton, queueRailVisible);
        this.setCompositeVisible(removeButton, queueRailVisible);
        this.setButtonEnabled(moveUpButton, queueRailVisible && canIssueOrders && !!slot?.canMoveUp);
        this.setButtonEnabled(moveDownButton, queueRailVisible && canIssueOrders && !!slot?.canMoveDown);
        this.setButtonEnabled(removeButton, queueRailVisible && canIssueOrders && !!slot?.canRemove);
      }
      if (expanded) {
        const disabledReason = this.getInlineCityDisabledReason(gameState);
        this.contextPanelDisabledReason.setText(disabledReason ? `Blocked: ${disabledReason}` : "");
        this.contextPanelDisabledReason.setVisible(!!disabledReason);
      }
      return;
    }

    if (menuType === "unit" && selectedUnit) {
      this.contextPanelTitle.setText(`Unit Commands  ${formatUnitLabel(selectedUnit.type)}`);
      this.setCityControlsVisible(false);
      this.setUnitControlsVisible(expanded);
      if (expanded) {
        const previewSummary = summarizePreview(gameState.uiPreview);
        const diplomacyStatus =
          gameState.uiActions?.diplomacyTargetLabel && gameState.uiActions?.diplomacyStatus
            ? `${gameState.uiActions.diplomacyTargetLabel}: ${gameState.uiActions.diplomacyStatus === "war" ? "At War" : "At Peace"}`
            : "No diplomacy target selected.";
        this.contextPanelMetaPrimary.setText(
          `Movement ${selectedUnit.movementRemaining}/${selectedUnit.maxMovement} | Attack ${selectedUnit.attack} | Range ${selectedUnit.minAttackRange}-${selectedUnit.attackRange} | Armor ${selectedUnit.armor}`
        );
        this.contextPanelMetaSecondary.setText(
          previewSummary ? `${previewSummary}  Diplomacy ${diplomacyStatus}` : `Hover reachable or attackable hexes for action previews.  Diplomacy ${diplomacyStatus}`
        );
      }
      this.setButtonEnabled(this.unitFoundCityButton, expanded && canIssueOrders && !!gameState.uiActions?.canFoundCity);
      this.setButtonEnabled(this.unitSkipButton, expanded && canIssueOrders && !!gameState.uiActions?.canSkipUnit);
      const diplomacyLabel = gameState.uiActions?.diplomacyActionLabel ?? "Diplomacy";
      this.setButtonLabel(this.unitDiplomacyButton, diplomacyLabel);
      this.setButtonEnabled(this.unitDiplomacyButton, expanded && canIssueOrders && !!gameState.uiActions?.canToggleDiplomacy);
      this.setButtonWarning(this.unitDiplomacyButton, !!gameState.uiActions?.canToggleDiplomacy && diplomacyLabel === "Declare War");
      if (expanded) {
        const disabledReason =
          (!gameState.uiActions?.canFoundCity && gameState.uiActions?.foundCityReason) ||
          (!gameState.uiActions?.canSkipUnit && gameState.uiActions?.skipUnitReason) ||
          (!gameState.uiActions?.canToggleDiplomacy && gameState.uiActions?.diplomacyActionReason) ||
          "";
        this.contextPanelDisabledReason.setText(disabledReason ? `Blocked: ${disabledReason}` : "");
        this.contextPanelDisabledReason.setVisible(!!disabledReason);
      }
      return;
    }

    this.setCityControlsVisible(false);
    this.setUnitControlsVisible(false);
    this.contextPanelDisabledReason.setText("");
    this.contextPanelDisabledReason.setVisible(false);
  }

  setCityControlsVisible(visible) {
    for (const button of this.cityProductionTabButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityProductionButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityBuildingButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueMoveUpButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueMoveDownButtons) {
      this.setCompositeVisible(button, visible);
    }
    for (const button of this.cityQueueRemoveButtons) {
      this.setCompositeVisible(button, visible);
    }
  }

  setUnitControlsVisible(visible) {
    this.setCompositeVisible(this.unitFoundCityButton, visible);
    this.setCompositeVisible(this.unitSkipButton, visible);
    this.setCompositeVisible(this.unitDiplomacyButton, visible);
  }

  getSelectedInfoText(selectedUnit, selectedCity) {
    if (selectedUnit) {
      const status = selectedUnit.disabled ? "Disabled" : selectedUnit.hasActed ? "Acted" : "Ready";
      return `Unit ${formatUnitLabel(selectedUnit.type)} | Health ${selectedUnit.health}/${selectedUnit.maxHealth} | Movement ${selectedUnit.movementRemaining}/${selectedUnit.maxMovement} | Attack ${selectedUnit.attack} | ${status}`;
    }
    if (selectedCity) {
      const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, gold: 0, science: 0 };
      return `City Population ${selectedCity.population} | Health ${selectedCity.health}/${selectedCity.maxHealth} | Identity ${selectedCity.identity} | Specialization ${selectedCity.specialization ?? "balanced"} | Local Food ${localYield.food} | Local Production ${localYield.production} | Local Gold ${localYield.gold ?? 0} | Local Science ${localYield.science}`;
    }
    return "No unit or city selected.";
  }

  getQueueItemLabel(queueItem) {
    if (!queueItem) {
      return "--";
    }
    if (typeof queueItem === "string") {
      return formatUnitLabel(queueItem);
    }
    if (queueItem.kind === "building") {
      return formatBuildingLabel(queueItem.id);
    }
    return formatUnitLabel(queueItem.id);
  }

  buildCityQueueRailDetails(selectedCity, gameState) {
    const localYield = selectedCity.yieldLastTurn ?? { food: 0, production: 0, gold: 0, science: 0 };
    const productionProgress = Math.max(0, gameState.uiActions?.cityProductionProgress ?? 0);
    const queueFrontRemaining = Math.max(0, gameState.uiActions?.cityQueueFrontRemainingProduction ?? 0);
    const localProduction = Math.max(0, gameState.uiActions?.cityLocalProduction ?? 0);
    const scienceBreakdown = formatCityScienceBreakdown(selectedCity.id, gameState);
    const queueSlots = gameState.uiActions?.cityQueueSlots ?? [];
    const nextSlot = queueSlots.find((slot) => !slot.empty) ?? null;
    const queueFrontCost = nextSlot ? productionProgress + queueFrontRemaining : 0;
    const progressText = nextSlot ? `${productionProgress}/${queueFrontCost}` : "0 (queue empty)";
    const rushBuyEnabled = !!gameState.uiActions?.canRushBuyCityQueueFront;
    const rushBuyCost = Math.max(0, gameState.uiActions?.cityRushBuyCost ?? 0);
    const rushBuyReason = gameState.uiActions?.cityRushBuyReason ?? null;
    const rushBuyText = nextSlot
      ? rushBuyEnabled
        ? `Rush buy ${rushBuyCost}g`
        : `Rush buy blocked: ${rushBuyReason ?? "Unavailable"}`
      : "Rush buy unavailable (queue empty)";
    const nextCompletion = !nextSlot
      ? "Queue is empty."
      : nextSlot.etaTurns === 0
        ? `${nextSlot.label} is ready now.`
        : `${nextSlot.label} in ${formatTurns(nextSlot.etaTurns)}.`;
    return {
      primary: `${formatCityName(selectedCity.id)} | Population ${selectedCity.population} | Identity ${selectedCity.identity}`,
      secondary: scienceBreakdown
        ? `Local Food ${localYield.food} | Local Production ${localYield.production} | Local Gold ${localYield.gold ?? 0} | ${scienceBreakdown}`
        : `Local Food ${localYield.food} | Local Production ${localYield.production} | Local Gold ${localYield.gold ?? 0} | Local Science ${localYield.science}`,
      tertiary: `Production progress ${progressText} | Local production per turn +${localProduction} | ${rushBuyText} | Next completion: ${nextCompletion}`,
    };
  }

  buildCityQueueSummary(_selectedCity, gameState) {
    const queueSlots = gameState.uiActions?.cityQueueSlots ?? [];
    const populatedSlots = queueSlots.filter((slot) => !slot.empty);
    if (populatedSlots.length === 0) {
      return "Queue is empty. Add units or buildings from the production buttons.";
    }
    return populatedSlots
      .map((slot) => `${slot.label}${slot.statusTag ? ` [${slot.statusTag}]` : ""}`)
      .join("  |  ");
  }

  getInlineCityDisabledReason(gameState) {
    const queueReason = gameState.uiActions?.cityQueueReason ?? null;
    if (queueReason) {
      return queueReason;
    }
    const productionTab = gameState.uiActions?.cityProductionTab ?? "units";
    if (productionTab === "buildings") {
      const blocked = (gameState.uiActions?.cityBuildingChoices ?? []).find((choice) => !choice.queueable && choice.reasonText);
      return blocked?.reasonText ?? null;
    }
    const blocked = (gameState.uiActions?.cityProductionChoices ?? []).find((choice) => !choice.queueable && choice.reasonText);
    return blocked?.reasonText ?? null;
  }

  updatePreviewCard(uiPreview) {
    const mode = uiPreview?.mode ?? "none";
    const isVisible = mode !== "none" && this.latestState?.match?.status === "ongoing";
    this.animatePanelVisibility(this.previewPanel, [this.previewTitle, this.previewDetails], isVisible);
    if (!isVisible) {
      return;
    }

    if (mode === "move") {
      this.previewTitle.setText(`Move Preview -> (${uiPreview.q}, ${uiPreview.r})`);
      const routeText = formatMovePreviewRoute(uiPreview.path);
      const summary = `Cost ${uiPreview.moveCost ?? 0} | Remaining movement ${uiPreview.movementRemainingAfter ?? 0}`;
      this.previewDetails.setText(routeText ? `${summary}\nRoute ${routeText}` : summary);
      this.previewDetails.setColor("#2f5f74");
      return;
    }

    if (mode === "attack-unit") {
      const counter = uiPreview.counterattack;
      const counterText = counter?.triggered
        ? `Counter ${counter.damage ?? 0}`
        : counter?.reason === "out-of-range"
          ? "No counter (out of range)"
          : "No counter";
      this.previewTitle.setText(`Attack Preview -> ${uiPreview.targetId ?? "target"}`);
      this.previewDetails.setText(`Damage ${uiPreview.damage ?? 0} | ${counterText}`);
      this.previewDetails.setColor("#7b3024");
      return;
    }

    if (mode === "attack-city") {
      this.previewTitle.setText(`City Assault Preview -> ${uiPreview.cityId ?? "city"}`);
      this.previewDetails.setText(`Damage ${uiPreview.damage ?? 0} | City health after hit ${uiPreview.cityRemainingHealth ?? "?"}`);
      this.previewDetails.setColor("#7b3024");
      return;
    }

    this.previewTitle.setText("");
    this.previewDetails.setText("");
  }

  updateContextualHint() {
    if (!this.latestState) {
      this.setHint(null, null, null);
      return;
    }
    if (this.hoverHint) {
      this.setHint(this.hoverHint.primary ?? null, this.hoverHint.secondary ?? null, this.hoverHint.level ?? "warning");
      return;
    }
    const uiHints = this.latestState.uiHints ?? { primary: null, secondary: null, level: null };
    if (uiHints.level === "warning") {
      this.setHint(uiHints.primary, uiHints.secondary, uiHints.level);
      return;
    }
    this.setHint(null, null, null);
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
      this.hintPanel.setStrokeStyle(PANEL_STROKE_WIDTH, 0x9a3a2b, 0.9);
      this.hintPrimary.setColor("#6f241a");
      this.hintSecondary.setColor(SEMANTIC_COLORS.textWarning);
    } else {
      this.hintPanel.setFillStyle(SEMANTIC_COLORS.panelActiveBg, 0.95);
      this.hintPanel.setStrokeStyle(PANEL_STROKE_WIDTH, SEMANTIC_COLORS.panelBorder, 0.8);
      this.hintPrimary.setColor(SEMANTIC_COLORS.textStrong);
      this.hintSecondary.setColor(SEMANTIC_COLORS.textMuted);
    }
  }

  toggleContextPanelExpanded() {
    if (this.contextMenuMode === null || this.latestState?.match?.status !== "ongoing") {
      return false;
    }
    this.contextPanelExpanded = !this.contextPanelExpanded;
    this.updateFromState(this.latestState);
    return this.contextPanelExpanded;
  }

  toggleContextPanelPinned() {
    if (this.contextMenuMode === null || this.latestState?.match?.status !== "ongoing") {
      return false;
    }
    this.contextPanelPinned = !this.contextPanelPinned;
    this.updateFromState(this.latestState);
    return this.contextPanelPinned;
  }

  testSetContextPanelPinned(value) {
    this.contextPanelPinned = !!value;
    if (!this.contextPanelPinned && this.contextMenuMode !== null) {
      this.contextPanelExpanded = true;
    }
    if (this.latestState) {
      this.updateFromState(this.latestState);
    }
    return this.contextPanelPinned;
  }

  setNotificationFilter(filterName) {
    if (!NOTIFICATION_FILTERS.includes(filterName)) {
      return false;
    }
    this.notificationFilter = filterName;
    this.notificationScroll = 0;
    this.updateNotificationCenter();
    if (this.latestState) {
      this.updateFromState(this.latestState);
    }
    return true;
  }

  getFilteredNotifications() {
    if (this.notificationFilter === "All") {
      return this.notifications;
    }
    return this.notifications.filter((entry) => entry.category === this.notificationFilter);
  }

  getDisplayNotifications() {
    const filtered = this.getFilteredNotifications();
    const currentTurnEntries = [];
    const earlierEntries = [];
    for (const entry of filtered) {
      if (entry.turn === this.currentTurn) {
        currentTurnEntries.push(entry);
      } else {
        earlierEntries.push(entry);
      }
    }

    const rows = [];
    if (currentTurnEntries.length > 0) {
      rows.push({
        kind: "group",
        id: `group-new-${this.currentTurn}`,
        label: `New this turn (${currentTurnEntries.length})`,
      });
      for (const entry of currentTurnEntries) {
        rows.push({ kind: "entry", entry });
      }
    }

    if (earlierEntries.length > 0) {
      rows.push({
        kind: "group",
        id: "group-earlier",
        label: currentTurnEntries.length > 0 ? "Earlier" : "Notification history",
      });
      for (const entry of earlierEntries) {
        rows.push({ kind: "entry", entry });
      }
    }

    return rows;
  }

  focusNotificationByRow(rowIndex) {
    const row = this.notificationVisibleDisplaySlice[rowIndex];
    if (!row || row.kind !== "entry") {
      return false;
    }
    const entry = row.entry;
    if (!entry.focus) {
      return false;
    }
    entry.unread = false;
    gameEvents.emit("notification-focus-requested", { focus: entry.focus, id: entry.id });
    this.updateNotificationCenter();
    this.playUiSfx("select");
    return true;
  }

  handleNotificationRequested(payload) {
    const message = typeof payload === "string" ? payload : payload?.message;
    if (!message) {
      return;
    }
    const level = typeof payload === "object" ? payload.level ?? "info" : "info";
    const categoryInput = typeof payload === "object" ? payload.category : null;
    const category = normalizeNotificationCategory(categoryInput, message);
    const requestedTurn = typeof payload === "object" && Number.isFinite(payload.turn) ? Math.round(payload.turn) : null;
    const turn = Math.max(0, Number(requestedTurn ?? this.currentTurn ?? this.latestState?.turnState?.turn ?? 0));
    this.notifications.unshift({
      id: `n-${this.notificationNextId}`,
      level,
      message,
      category,
      focus: typeof payload === "object" ? normalizeNotificationFocus(payload.focus) : null,
      createdAtMs: Date.now(),
      turn,
      unread: true,
    });
    this.notificationNextId += 1;
    this.updateNotificationCenter();
    this.playUiSfx(level === "warning" ? "warning" : "notify");
  }

  handleNotificationsReset = () => {
    this.notifications = [];
    this.notificationScroll = 0;
    this.notificationFilter = "All";
    this.notificationUnreadCount = 0;
    this.updateNotificationCenter();
  };

  updateNotificationCenter() {
    const displayRows = this.getDisplayNotifications();
    const visibleCount = this.notificationVisibleRows || this.notificationRows.length;
    const maxScroll = Math.max(0, displayRows.length - visibleCount);
    this.notificationScroll = Phaser.Math.Clamp(this.notificationScroll, 0, maxScroll);
    const slice = displayRows.slice(this.notificationScroll, this.notificationScroll + visibleCount);
    this.notificationVisibleDisplaySlice = slice;
    this.notificationVisibleSlice = slice.filter((row) => row.kind === "entry").map((row) => row.entry);
    const shownRows = slice.length;
    const hasEmptyState = shownRows === 0;
    const filterHeight = this.scale.width < TABLET_LAYOUT_BREAKPOINT ? 60 : 34;
    const contentHeight = (hasEmptyState ? 1 : shownRows) * NOTIFICATION_ROW_HEIGHT + 14;
    const panelHeight = NOTIFICATION_HEADER_HEIGHT + filterHeight + contentHeight;
    const bounds = this.notificationPanel.getBounds();
    this.notificationPanel.setSize(this.notificationPanel.displayWidth, panelHeight);
    this.notificationPanel.setDisplaySize(this.notificationPanel.displayWidth, panelHeight);
    this.notificationPanel.setPosition(bounds.centerX, bounds.top + panelHeight / 2);
    this.notificationTitle.setPosition(bounds.left + 12, bounds.top + 9);
    this.notificationAccent.setPosition(bounds.left + 6, bounds.top + 6);
    this.notificationAccent.setSize(this.notificationPanel.displayWidth - 12, 4);
    const totalRows = displayRows.length;
    const startRow = shownRows > 0 ? this.notificationScroll + 1 : 0;
    const endRow = shownRows > 0 ? this.notificationScroll + shownRows : 0;
    const subtitleText =
      totalRows > 0
        ? `${this.notificationFilter} feed  ${startRow}-${endRow} / ${totalRows}`
        : `${this.notificationFilter} feed  no entries`;
    this.setTextWithinWidth(this.notificationSubtitle, subtitleText, Math.max(120, this.notificationPanel.displayWidth - 24));
    this.notificationSubtitle.setPosition(bounds.left + 12, bounds.top + 26);
    const emptyLabelText =
      this.notificationFilter === "All"
        ? "No notifications yet."
        : `No ${this.notificationFilter.toLowerCase()} notifications.`;
    this.notificationEmptyLabel.setText(emptyLabelText);
    this.notificationEmptyLabel.setPosition(
      bounds.centerX,
      bounds.top + NOTIFICATION_HEADER_HEIGHT + filterHeight + NOTIFICATION_ROW_HEIGHT / 2
    );
    this.notificationEmptyLabel.setWordWrapWidth(Math.max(120, this.notificationPanel.displayWidth - 18), true);
    this.notificationEmptyLabel.setVisible(hasEmptyState);

    for (const filterButton of this.notificationFilterButtons) {
      const filterName = filterButton.actionId.replace("notif-filter-", "");
      this.setButtonActive(filterButton, this.notificationFilter === filterName);
      this.setButtonEnabled(filterButton, true);
      filterButton.label.setAlpha(1);
    }

    for (let i = 0; i < this.notificationRows.length; i += 1) {
      const row = this.notificationRows[i];
      if (i >= visibleCount) {
        this.setNotificationRowVisible(row, false);
        row.panel.disableInteractive();
        continue;
      }
      const entry = slice[i];
      if (!entry) {
        this.setNotificationRowVisible(row, false);
        row.panel.disableInteractive();
        continue;
      }
      const rowTop = bounds.top + NOTIFICATION_HEADER_HEIGHT + filterHeight + i * NOTIFICATION_ROW_HEIGHT;
      const rowWidth = this.notificationPanel.displayWidth - NOTIFICATION_ROW_INSET * 2;
      const rowLeft = bounds.left + NOTIFICATION_ROW_INSET;
      const rowRight = rowLeft + rowWidth;
      this.setNotificationRowVisible(row, true);
      row.panel.setPosition(rowLeft, rowTop);
      row.panel.setSize(rowWidth, NOTIFICATION_ROW_HEIGHT - 4);
      row.stripe.setPosition(rowLeft, rowTop);
      row.stripe.setSize(3, NOTIFICATION_ROW_HEIGHT - 4);
      row.badge.setPosition(rowLeft + 8, rowTop + 8);
      row.header.setPosition(rowLeft + 70, rowTop + 7);
      row.message.setPosition(rowLeft + 12, rowTop + 24);
      row.unreadDot.setPosition(rowRight - 10, rowTop + 14);
      row.jump.setPosition(rowRight - 36, rowTop + 7);
      row.badgeLabel.setPosition(row.badge.x + 5, row.badge.y + 2);
      if (entry.kind === "group") {
        row.stripe.setVisible(false);
        row.badge.setVisible(false);
        row.badgeLabel.setVisible(false);
        this.setTextWithinWidth(row.header, entry.label, Math.max(80, rowWidth - 18));
        row.header.setColor("#6e5d45");
        row.header.setAlpha(1);
        row.message.setText("");
        row.message.setVisible(false);
        row.unreadDot.setVisible(false);
        row.jump.setVisible(false);
        row.panel.setFillStyle(SEMANTIC_COLORS.panelSoftBg, 0.54);
        row.panel.setStrokeStyle(1, SEMANTIC_COLORS.panelBorder, 0.4);
        row.panel.disableInteractive();
        continue;
      }
      const card = entry.entry;
      const categoryStyle = getNotificationCategoryStyle(card.category);
      const headerParts = [`${card.category}`, `Turn ${Math.max(0, card.turn ?? this.currentTurn)}`];
      if (card.level === "warning") {
        headerParts.push("Warning");
      } else if (card.focus) {
        headerParts.push("Focusable");
      }
      const rightPadding = card.focus ? 54 : card.unread ? 20 : 14;
      const headerMaxWidth = Math.max(82, rowWidth - 82 - rightPadding);
      const messageMaxWidth = Math.max(110, rowWidth - 20 - rightPadding);
      row.stripe.setVisible(true);
      row.stripe.setFillStyle(categoryStyle.fill, 0.9);
      row.badge.setVisible(true);
      row.badgeLabel.setVisible(true);
      row.badge.setFillStyle(categoryStyle.fill, 0.94);
      row.badge.setSize(52, 15);
      row.badgeLabel.setText(categoryStyle.label);
      row.badgeLabel.setColor("#f8f0dd");
      this.setTextWithinWidth(row.header, headerParts.join(" | "), headerMaxWidth);
      row.header.setColor(card.focus ? SEMANTIC_COLORS.textInfo : SEMANTIC_COLORS.textMuted);
      row.message.setVisible(true);
      this.setTextWithinWidth(row.message, card.message, messageMaxWidth);
      row.message.setColor(card.level === "warning" ? SEMANTIC_COLORS.textWarning : SEMANTIC_COLORS.textStrong);
      row.message.setAlpha(card.unread ? 1 : 0.92);
      row.unreadDot.setVisible(card.unread);
      row.unreadDot.setFillStyle(card.level === "warning" ? SEMANTIC_COLORS.accentRed : SEMANTIC_COLORS.accentBlue, 0.94);
      row.unreadDot.setPosition(rowRight - (card.focus ? 52 : 10), rowTop + 14);
      row.panel.setFillStyle(card.unread ? SEMANTIC_COLORS.panelActiveBg : SEMANTIC_COLORS.panelBg, card.focus ? 0.95 : 0.84);
      row.panel.setStrokeStyle(card.focus ? PANEL_STROKE_WIDTH : 1, card.focus ? 0x355e94 : SEMANTIC_COLORS.panelBorder, card.focus ? 0.9 : 0.56);
      row.jump.setVisible(!!card.focus);
      row.jump.setColor(card.level === "warning" ? SEMANTIC_COLORS.textWarning : SEMANTIC_COLORS.textInfo);
      row.jump.setPosition(rowRight - 36, rowTop + 7);
      if (card.focus) {
        row.panel.setInteractive({ useHandCursor: true });
      } else {
        row.panel.disableInteractive();
      }
    }
    this.notificationUnreadCount = this.notifications.filter((entry) => entry.unread).length;
    this.setTextWithinWidth(
      this.notificationTitle,
      this.notificationUnreadCount > 0 ? `Notifications (${this.notificationUnreadCount} new)` : "Notifications",
      Math.max(120, this.notificationPanel.displayWidth - 24)
    );
    const hasUnread = this.notificationUnreadCount > 0;
    this.notificationPanel.setStrokeStyle(
      PANEL_STROKE_WIDTH,
      hasUnread ? SEMANTIC_COLORS.accentBlue : SEMANTIC_COLORS.panelBorder,
      hasUnread ? 0.92 : 0.86
    );
    this.notificationTitle.setColor(hasUnread ? "#233a58" : "#2a1d11");
  }

  handlePointerMove(pointer) {
    if (this.techTreeGraphDragging) {
      const samePointer = this.techTreeGraphDragPointerId === null || pointer.id === this.techTreeGraphDragPointerId;
      if (!pointer.isDown || !samePointer) {
        if (!pointer.isDown) {
          this.stopTechTreeGraphDrag();
        }
      } else {
        const dragDelta = pointer.x - this.techTreeGraphDragStartX;
        this.applyTechTreeGraphScroll(this.techTreeGraphDragStartScrollX - dragDelta);
      }
    }
    if (!this.disabledTooltipVisible || !this.disabledHoverText) {
      return;
    }
    this.updateDisabledTooltipPosition(pointer);
  }

  handlePointerUp(pointer) {
    if (!this.techTreeGraphDragging) {
      return;
    }
    if (this.techTreeGraphDragPointerId === null || pointer.id === this.techTreeGraphDragPointerId) {
      this.stopTechTreeGraphDrag();
    }
  }

  showDisabledTooltip(message, options = {}) {
    if (!message) {
      this.hideDisabledTooltip();
      return;
    }
    this.disabledHoverText = message;
    const pointer = this.input.activePointer;
    const textColor = typeof options.textColor === "string" ? options.textColor : DELTA_TOOLTIP_DEFAULT_TEXT_COLOR;
    this.disabledTooltipLabel.setText(message);
    this.disabledTooltipLabel.setColor(textColor);
    const width = Math.min(320, Math.max(110, this.disabledTooltipLabel.width + 14));
    const height = Math.max(24, this.disabledTooltipLabel.height + 10);
    this.disabledTooltipPanel.setSize(width, height);
    this.disabledTooltipPanel.setDisplaySize(width, height);
    this.disabledTooltipPanel.setVisible(true);
    this.disabledTooltipLabel.setVisible(true);
    this.disabledTooltipVisible = true;
    this.updateDisabledTooltipPosition(pointer);
  }

  hideDisabledTooltip() {
    this.disabledHoverText = null;
    this.disabledTooltipVisible = false;
    this.disabledTooltipPanel.setVisible(false);
    this.disabledTooltipLabel.setVisible(false);
  }

  updateDisabledTooltipPosition(pointer) {
    if (!pointer || !this.disabledTooltipVisible) {
      return;
    }
    const width = this.disabledTooltipPanel.displayWidth || this.disabledTooltipPanel.width;
    const height = this.disabledTooltipPanel.displayHeight || this.disabledTooltipPanel.height;
    const margin = 12;
    const desiredX = pointer.x + margin + width / 2;
    const desiredY = pointer.y - margin - height / 2;
    const x = Phaser.Math.Clamp(desiredX, width / 2 + 4, this.scale.width - width / 2 - 4);
    const y = Phaser.Math.Clamp(desiredY, height / 2 + 4, this.scale.height - height / 2 - 4);
    this.disabledTooltipPanel.setPosition(x, y);
    this.disabledTooltipLabel.setPosition(x - width / 2 + 7, y - height / 2 + 5);
  }

  handleWheel(pointer, _gameObjects, deltaX, deltaY) {
    if (this.isPointerInTechTreeGraphViewport(pointer)) {
      const shiftHeld = !!pointer?.event?.shiftKey;
      let scrollDelta = Number.isFinite(deltaX) ? deltaX : 0;
      if (shiftHeld) {
        scrollDelta += Number.isFinite(deltaY) ? deltaY : 0;
      }
      if (Math.abs(scrollDelta) >= 0.1) {
        this.applyTechTreeGraphScroll(this.techTreeGraphScrollX + scrollDelta);
      }
      return;
    }
    if (!this.isPointerInNotificationCenter(pointer)) {
      return;
    }
    const visibleCount = this.notificationVisibleRows || this.notificationRows.length;
    const displayRows = this.getDisplayNotifications();
    if (displayRows.length <= visibleCount) {
      return;
    }
    const next = this.notificationScroll + (deltaY > 0 ? 1 : -1);
    this.notificationScroll = Phaser.Math.Clamp(next, 0, Math.max(0, displayRows.length - visibleCount));
    this.updateNotificationCenter();
  }

  isPointerInNotificationCenter(pointer) {
    const bounds = this.notificationPanel.getBounds();
    return Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
  }

  openPauseMenu() {
    if (this.cityResolutionOpen || this.pauseMenuOpen || this.techTreeModalOpen) {
      return this.pauseMenuOpen;
    }
    this.pauseMenuOpen = true;
    this.pausePanel.setVisible(true);
    this.pauseTitle.setVisible(true);
    this.pauseSettingsLabel.setVisible(true);
    this.setCompositeVisible(this.pauseResumeButton, true);
    this.setCompositeVisible(this.pauseRestartButton, true);
    this.setCompositeVisible(this.pauseSfxButton, true);
    this.setButtonEnabled(this.pauseResumeButton, true);
    this.setButtonEnabled(this.pauseRestartButton, true);
    this.setButtonEnabled(this.pauseSfxButton, true);
    this.setSfxMuted(this.uiSfxMuted);
    this.hoverHint = null;
    this.hideDisabledTooltip();
    this.updateContextualHint();
    this.syncModalState();
    return true;
  }

  closePauseMenu() {
    if (!this.pauseMenuOpen) {
      return false;
    }
    this.pauseMenuOpen = false;
    this.pausePanel.setVisible(false);
    this.pauseTitle.setVisible(false);
    this.pauseSettingsLabel.setVisible(false);
    this.setCompositeVisible(this.pauseResumeButton, false);
    this.setCompositeVisible(this.pauseRestartButton, false);
    this.setCompositeVisible(this.pauseSfxButton, false);
    this.closeRestartConfirm();
    this.syncModalState();
    return true;
  }

  openRestartConfirm() {
    const canOpenFromResult = this.latestState?.match?.status !== "ongoing";
    if ((!this.pauseMenuOpen && !canOpenFromResult) || this.restartConfirmOpen || this.cityResolutionOpen || this.techTreeModalOpen) {
      return false;
    }
    this.syncNewGameConfigFromState();
    this.restartConfirmOpen = true;
    this.restartConfirmPanel.setVisible(true);
    this.restartConfirmTitle.setVisible(true);
    this.restartConfirmSubtitle.setVisible(true);
    for (const button of this.newGameMapPresetButtons) {
      this.setCompositeVisible(button, true);
    }
    this.newGameAiLabel.setVisible(true);
    this.newGameAiValueLabel.setVisible(true);
    this.setCompositeVisible(this.newGameAiMinusButton, true);
    this.setCompositeVisible(this.newGameAiPlusButton, true);
    this.setCompositeVisible(this.restartConfirmButton, true);
    this.setCompositeVisible(this.restartCancelButton, true);
    this.refreshNewGameConfigUi();
    this.setButtonEnabled(this.restartConfirmButton, true);
    this.setButtonEnabled(this.restartCancelButton, true);
    this.syncModalState();
    return true;
  }

  closeRestartConfirm() {
    if (!this.restartConfirmOpen) {
      return false;
    }
    this.restartConfirmOpen = false;
    this.restartConfirmPanel.setVisible(false);
    this.restartConfirmTitle.setVisible(false);
    this.restartConfirmSubtitle.setVisible(false);
    for (const button of this.newGameMapPresetButtons) {
      this.setCompositeVisible(button, false);
    }
    this.newGameAiLabel.setVisible(false);
    this.newGameAiValueLabel.setVisible(false);
    this.setCompositeVisible(this.newGameAiMinusButton, false);
    this.setCompositeVisible(this.newGameAiPlusButton, false);
    this.setCompositeVisible(this.restartConfirmButton, false);
    this.setCompositeVisible(this.restartCancelButton, false);
    this.syncModalState();
    return true;
  }

  confirmRestart() {
    const payload = {
      mapWidth: this.newGameMapSize,
      mapHeight: this.newGameMapSize,
      aiFactionCount: this.newGameAiFactionCount,
    };
    this.closeRestartConfirm();
    this.closePauseMenu();
    gameEvents.emit("new-game-requested", payload);
  }

  syncNewGameConfigFromState() {
    const config = this.latestState?.matchConfig;
    const mapSizeCandidate = Number(config?.mapWidth ?? this.newGameMapSize);
    this.newGameMapSize = NEW_GAME_MAP_PRESETS.includes(mapSizeCandidate) ? mapSizeCandidate : NEW_GAME_MAP_PRESETS[0];
    const aiCountCandidate = Number(config?.aiFactionCount ?? this.newGameAiFactionCount);
    this.newGameAiFactionCount = Phaser.Math.Clamp(Math.round(aiCountCandidate || NEW_GAME_AI_MIN + 1), NEW_GAME_AI_MIN, NEW_GAME_AI_MAX);
    this.refreshNewGameConfigUi();
  }

  setNewGameMapSize(size) {
    if (!NEW_GAME_MAP_PRESETS.includes(size)) {
      return false;
    }
    this.newGameMapSize = size;
    this.refreshNewGameConfigUi();
    return true;
  }

  adjustNewGameAiCount(delta) {
    if (!Number.isFinite(delta) || delta === 0) {
      return false;
    }
    const nextValue = Phaser.Math.Clamp(this.newGameAiFactionCount + Math.round(delta), NEW_GAME_AI_MIN, NEW_GAME_AI_MAX);
    if (nextValue === this.newGameAiFactionCount) {
      this.refreshNewGameConfigUi();
      return false;
    }
    this.newGameAiFactionCount = nextValue;
    this.refreshNewGameConfigUi();
    return true;
  }

  refreshNewGameConfigUi() {
    for (const button of this.newGameMapPresetButtons) {
      const size = Number(String(button.actionId).replace("new-game-map-", ""));
      const selected = size === this.newGameMapSize;
      this.setButtonActive(button, selected);
      this.setButtonEnabled(button, true);
    }
    this.newGameAiValueLabel.setText(String(this.newGameAiFactionCount));
    this.setButtonEnabled(this.newGameAiMinusButton, this.newGameAiFactionCount > NEW_GAME_AI_MIN);
    this.setButtonEnabled(this.newGameAiPlusButton, this.newGameAiFactionCount < NEW_GAME_AI_MAX);
  }

  syncCityResolutionModal(pendingResolution) {
    if (pendingResolution) {
      this.closeTechTreeModal();
      this.cityResolutionOpen = true;
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
    const nextOpen = this.techTreeModalOpen || this.pauseMenuOpen || this.restartConfirmOpen || this.cityResolutionOpen;
    this.modalBackdrop.setVisible(nextOpen);
    if (nextOpen) {
      this.hideDisabledTooltip();
    }
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

  setButtonWarning(button, warning) {
    button.warning = warning;
    this.applyButtonVisualState(button);
  }

  applyButtonVisualState(button) {
    if (!button.enabled) {
      button.rectangle.setFillStyle(button.palette.disabledFill, button.palette.disabledAlpha);
      return;
    }
    if (button.warning) {
      button.rectangle.setFillStyle(button.palette.warningFill, button.palette.warningAlpha);
      return;
    }
    if (button.isActive) {
      button.rectangle.setFillStyle(button.palette.activeFill, button.palette.activeAlpha);
      return;
    }
    button.rectangle.setFillStyle(button.palette.enabledFill, button.palette.enabledAlpha);
  }

  setButtonLabel(button, text) {
    button.label.setText(text);
  }

  applyProductionChoiceVisualState(button, choice) {
    if (!choice) {
      button.label.setAlpha(button.enabled ? 1 : 0.95);
      button.label.setColor(button.palette.textColor);
      return;
    }

    if (!button.enabled) {
      button.label.setAlpha(0.92);
      button.label.setColor("#d7c9ae");
      return;
    }

    if (!choice.affordable) {
      button.label.setAlpha(0.98);
      button.label.setColor("#f4d8a2");
      return;
    }

    button.label.setAlpha(1);
    button.label.setColor(button.palette.textColor);
  }

  setCompositeVisible(button, visible) {
    button.rectangle.setVisible(visible);
    button.label.setVisible(visible);
  }

  setTurnAssistantPulse(_enabled) {
    if (this.turnAssistantPulseTween) {
      this.turnAssistantPulseTween.stop();
      this.turnAssistantPulseTween = null;
    }
    this.turnAssistantStatusDot.setScale(1);
    this.turnAssistantStatusDot.setAlpha(0.94);
  }

  handleEscapePressed() {
    if (this.techTreeModalOpen) {
      this.closeTechTreeModal();
      return;
    }
    if (this.restartConfirmOpen) {
      this.closeRestartConfirm();
      return;
    }
    if (this.pauseMenuOpen) {
      this.closePauseMenu();
      return;
    }
    if (!this.cityResolutionOpen) {
      this.openPauseMenu();
    }
  }

  isModalButton(actionId) {
    return (
      actionId === "toggle-tech-tree" ||
      actionId === "tech-tree-close" ||
      actionId === "pause-resume" ||
      actionId === "pause-restart" ||
      actionId === "pause-sfx" ||
      actionId === "restart-confirm" ||
      actionId === "restart-cancel" ||
      actionId.startsWith("new-game-map-") ||
      actionId === "new-game-ai-minus" ||
      actionId === "new-game-ai-plus" ||
      actionId === "cityCapture" ||
      actionId === "cityRaze"
    );
  }

  isAnyModalOpen() {
    return this.techTreeModalOpen || this.pauseMenuOpen || this.restartConfirmOpen || this.cityResolutionOpen;
  }

  getEndTurnButtonCenter() {
    return { x: this.endTurnButton.rectangle.x, y: this.endTurnButton.rectangle.y };
  }

  getRuntimeUiState() {
    return {
      techTreeModalOpen: this.techTreeModalOpen,
      pauseMenuOpen: this.pauseMenuOpen,
      restartConfirmOpen: this.restartConfirmOpen,
      notifications: this.notifications.map((entry) => ({ ...entry })),
      notificationFilter: this.notificationFilter,
      notificationUnreadCount: this.notificationUnreadCount,
      currentTurn: this.currentTurn,
      contextPanelExpanded: this.contextPanelExpanded,
      contextPanelPinned: this.contextPanelPinned,
      sfxMuted: this.uiSfxMuted,
      statsPanelOpen: this.statsPanelOpen,
      stats: { ...this.latestStatsPayload },
      techTree: structuredClone(this.latestTechTreeModalPayload),
    };
  }

  layoutResourceDeltas() {
    this.foodDeltaLabel.setPosition(this.foodLabel.x + this.foodLabel.width + 6, this.foodLabel.y + 2);
    this.productionDeltaLabel.setPosition(this.productionLabel.x + this.productionLabel.width + 6, this.productionLabel.y + 2);
    this.scienceDeltaLabel.setPosition(this.scienceLabel.x + this.scienceLabel.width + 6, this.scienceLabel.y + 2);
    this.refreshLabelHitArea(this.foodDeltaLabel);
    this.refreshLabelHitArea(this.productionDeltaLabel);
    this.refreshLabelHitArea(this.scienceDeltaLabel);
  }

  testOpenPauseMenu() {
    return this.openPauseMenu();
  }

  testClosePauseMenu() {
    this.closePauseMenu();
    return !this.pauseMenuOpen;
  }

  testGetPauseMenuState() {
    return {
      open: this.pauseMenuOpen,
      restartConfirmOpen: this.restartConfirmOpen,
      backdropVisible: this.modalBackdrop.visible,
      settingsVisible: this.pauseSettingsLabel.visible,
      sfxVisible: this.pauseSfxButton.rectangle.visible && this.pauseSfxButton.label.visible,
      sfxEnabled: this.pauseSfxButton.enabled,
      sfxLabel: this.pauseSfxButton.label.text,
    };
  }

  testOpenHudMenu() {
    this.handleButtonClick(this.menuButton);
    return this.pauseMenuOpen;
  }

  testGetTopHudControlsState() {
    const techTreeBounds = this.techTreeButton.rectangle.getBounds();
    const statsBounds = this.statsToggleButton.rectangle.getBounds();
    const menuBounds = this.menuButton.rectangle.getBounds();
    const devVisionBounds = this.devVisionLabel.getBounds();
    return {
      techTreeVisible: this.techTreeButton.rectangle.visible && this.techTreeButton.label.visible,
      techTreeLabel: this.techTreeButton.label.text,
      techTreeWidth: this.techTreeButton.width,
      techTreeBounds,
      statsVisible: this.statsToggleButton.rectangle.visible && this.statsToggleButton.label.visible,
      statsLabel: this.statsToggleButton.label.text,
      statsWidth: this.statsToggleButton.width,
      statsBounds,
      menuVisible: this.menuButton.rectangle.visible && this.menuButton.label.visible,
      menuLabel: this.menuButton.label.text,
      menuWidth: this.menuButton.width,
      menuBounds,
      devVisionBounds,
      hasHudSfxButton: false,
    };
  }

  testOpenRestartConfirm() {
    this.openPauseMenu();
    this.openRestartConfirm();
    return this.restartConfirmOpen;
  }

  testCancelRestartConfirm() {
    this.closeRestartConfirm();
    return this.restartConfirmOpen;
  }

  testConfirmRestartConfirm() {
    this.confirmRestart();
    return !this.restartConfirmOpen;
  }

  testGetRestartModalState() {
    return {
      open: this.restartConfirmOpen,
      backdropVisible: this.modalBackdrop.visible,
      confirmVisible: this.restartConfirmButton.rectangle.visible && this.restartConfirmButton.label.visible,
      cancelVisible: this.restartCancelButton.rectangle.visible && this.restartCancelButton.label.visible,
      mapButtonsVisible: this.newGameMapPresetButtons.every((button) => button.rectangle.visible && button.label.visible),
      mapSize: this.newGameMapSize,
      aiFactionCount: this.newGameAiFactionCount,
      confirmEnabled: this.restartConfirmButton.enabled,
      cancelEnabled: this.restartCancelButton.enabled,
      confirmDepth: this.restartConfirmButton.rectangle.depth,
      panelDepth: this.restartConfirmPanel.depth,
    };
  }

  testSetNewGameMapSize(size) {
    return this.setNewGameMapSize(Number(size));
  }

  testSetNewGameAiFactionCount(value) {
    const count = Phaser.Math.Clamp(Math.round(Number(value) || this.newGameAiFactionCount), NEW_GAME_AI_MIN, NEW_GAME_AI_MAX);
    this.newGameAiFactionCount = count;
    this.refreshNewGameConfigUi();
    return this.newGameAiFactionCount;
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
      visible: this.contextPanel.visible,
      mode: this.contextMenuMode,
      expanded: this.contextPanelExpanded,
      pinned: this.contextPanelPinned,
      metaPrimary: this.contextPanelMetaPrimary.text,
      metaSecondary: this.contextPanelMetaSecondary.text,
      disabledReason: this.contextPanelDisabledReason.visible ? this.contextPanelDisabledReason.text : "",
      notificationPanel: {
        x: this.notificationPanel.x,
        y: this.notificationPanel.y,
        width: this.notificationPanel.displayWidth,
        height: this.notificationPanel.displayHeight,
      },
      forecastPanel: {
        x: this.forecastPanel.x,
        y: this.forecastPanel.y,
        width: this.forecastPanel.displayWidth,
        height: this.forecastPanel.displayHeight,
        linePrimary: this.forecastLinePrimary.text,
        lineSecondary: this.forecastLineSecondary.text,
        lineTertiary: this.forecastLineTertiary.text,
      },
      statsPanel: {
        open: this.statsPanelOpen,
        visible: this.statsPanel.visible,
        x: this.statsPanel.x,
        y: this.statsPanel.y,
        width: this.statsPanel.displayWidth,
        height: this.statsPanel.displayHeight,
        cities: this.statsCitiesLabel.text,
        units: this.statsUnitsLabel.text,
        tech: this.statsTechLabel.text,
        explored: this.statsExploreLabel.text,
      },
      minimap: {
        visible: this.minimapVisible,
        x: this.minimapPanel.x,
        y: this.minimapPanel.y,
        width: this.minimapPanel.displayWidth,
        height: this.minimapPanel.displayHeight,
        frameVisible: this.minimapViewportBoundarySegments > 0,
        viewportBoundarySegments: this.minimapViewportBoundarySegments,
        viewportFootprint: this.minimapViewportFootprint ? { ...this.minimapViewportFootprint } : null,
        frame: {
          x: this.minimapViewportFrame.x,
          y: this.minimapViewportFrame.y,
          width: this.minimapViewportFrame.displayWidth,
          height: this.minimapViewportFrame.displayHeight,
        },
      },
      turnAssistant: {
        x: this.turnAssistantPanel.x,
        y: this.turnAssistantPanel.y,
        width: this.turnAssistantPanel.displayWidth,
        height: this.turnAssistantPanel.displayHeight,
        left: this.turnAssistantPanel.x - this.turnAssistantPanel.displayWidth / 2,
        right: this.turnAssistantPanel.x + this.turnAssistantPanel.displayWidth / 2,
        readyLabel: this.attentionReadyButton.label.text,
        readyEnabled: this.attentionReadyButton.enabled,
        readyX: this.attentionReadyButton.rectangle.x,
        readyWidth: this.attentionReadyButton.width,
        queueLabel: this.attentionQueueButton.label.text,
        queueEnabled: this.attentionQueueButton.enabled,
        queueX: this.attentionQueueButton.rectangle.x,
        queueWidth: this.attentionQueueButton.width,
      },
      cityQueueRail: {
        visible: this.cityQueueRailPanel.visible && this.cityQueueRailTitle.visible,
        title: this.cityQueueRailTitle.text,
        detailsPrimary: this.cityQueueRailDetailsPrimary.text,
        detailsSecondary: this.cityQueueRailDetailsSecondary.visible ? this.cityQueueRailDetailsSecondary.text : "",
        detailsTertiary: this.cityQueueRailDetailsTertiary.visible ? this.cityQueueRailDetailsTertiary.text : "",
        rushBuy: {
          label: this.cityQueueRushBuyButton.label.text,
          visible: this.cityQueueRushBuyButton.rectangle.visible && this.cityQueueRushBuyButton.label.visible,
          enabled: this.cityQueueRushBuyButton.enabled,
          x: this.cityQueueRushBuyButton.rectangle.x,
          y: this.cityQueueRushBuyButton.rectangle.y,
          width: this.cityQueueRushBuyButton.width,
          height: this.cityQueueRushBuyButton.height,
        },
        x: this.cityQueueRailPanel.x,
        y: this.cityQueueRailPanel.y,
        width: this.cityQueueRailPanel.displayWidth,
        height: this.cityQueueRailPanel.displayHeight,
      },
      cityProductionTabButtons: this.cityProductionTabButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        active: button.isActive,
      })),
      cityProductionButtons: this.cityProductionButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
      })),
      cityBuildingButtons: this.cityBuildingButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
      })),
      cityQueueButtons: this.cityQueueButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
        width: button.width,
        height: button.height,
      })),
      cityQueueMoveUpButtons: this.cityQueueMoveUpButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
        width: button.width,
        height: button.height,
      })),
      cityQueueMoveDownButtons: this.cityQueueMoveDownButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
        width: button.width,
        height: button.height,
      })),
      cityQueueRemoveButtons: this.cityQueueRemoveButtons.map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
        x: button.rectangle.x,
        y: button.rectangle.y,
        width: button.width,
        height: button.height,
      })),
      disabledTooltip: {
        visible: this.disabledTooltipPanel.visible && this.disabledTooltipLabel.visible,
        text: this.disabledTooltipLabel.text,
      },
      unitButtons: [this.unitFoundCityButton, this.unitSkipButton].map((button) => ({
        actionId: button.actionId,
        label: button.label.text,
        visible: button.rectangle.visible && button.label.visible,
        enabled: button.enabled,
      })),
    };
  }

  testShowActionTooltip(actionId) {
    if (typeof actionId !== "string") {
      return false;
    }
    const message = this.getProductionHoverText(actionId) ?? this.getDisabledActionHint(actionId);
    if (!message) {
      return false;
    }
    this.showDisabledTooltip(message);
    return true;
  }

  testShowResourceDeltaTooltip(resourceKey) {
    if (typeof resourceKey !== "string") {
      return false;
    }
    const normalizedKey = resourceKey.toLowerCase();
    if (!["food", "production", "gold"].includes(normalizedKey)) {
      return false;
    }
    const breakdown = this.resourceDeltaBreakdowns?.[normalizedKey] ?? null;
    if (!breakdown?.tooltip) {
      return false;
    }
    this.showDisabledTooltip(breakdown.tooltip, { textColor: breakdown.textColor });
    return true;
  }

  testHideActionTooltip() {
    this.hideDisabledTooltip();
    return !this.disabledTooltipVisible;
  }

  testGetNotificationCenterState() {
    return {
      count: this.notifications.length,
      scroll: this.notificationScroll,
      filter: this.notificationFilter,
      filteredCount: this.getFilteredNotifications().length,
      displayRowCount: this.getDisplayNotifications().length,
      unreadCount: this.notificationUnreadCount,
      panelHeight: this.notificationPanel.displayHeight,
      emptyStateVisible: this.notificationEmptyLabel.visible,
      emptyStateText: this.notificationEmptyLabel.text,
      entries: this.notifications.slice(0, 20).map((entry) => ({ ...entry })),
      visibleRows: this.notificationVisibleDisplaySlice.map((row) =>
        row.kind === "entry"
          ? {
              kind: "entry",
              category: row.entry.category,
              unread: row.entry.unread,
              level: row.entry.level,
              focusable: !!row.entry.focus,
            }
          : { kind: "group", label: row.label }
      ),
    };
  }

  testSetNotificationFilter(filterName) {
    return this.setNotificationFilter(filterName);
  }

  testClickNotificationRow(index) {
    return this.focusNotificationByRow(index);
  }

  testFocusNotification(index) {
    const filtered = this.getFilteredNotifications();
    const entry = filtered[index];
    if (!entry) {
      return false;
    }
    if (!entry.focus) {
      return false;
    }
    gameEvents.emit("notification-focus-requested", { focus: entry.focus, id: entry.id });
    return true;
  }

  testFocusAttention(kind) {
    if (kind === "ready") {
      if (!this.attentionReadyButton.enabled) {
        return false;
      }
      gameEvents.emit("attention-ready-unit-requested");
      return true;
    }
    if (kind === "queue") {
      if (!this.attentionQueueButton.enabled) {
        return false;
      }
      gameEvents.emit("attention-empty-queue-requested");
      return true;
    }
    return false;
  }

  testToggleSfxMute() {
    return this.toggleSfxMuted();
  }

  testGetSfxState() {
    return {
      muted: this.uiSfxMuted,
      label: this.pauseSfxButton.label.text,
    };
  }

  testToggleStatsPanel() {
    return this.toggleStatsPanel();
  }

  testToggleTechTreeModal() {
    return this.toggleTechTreeModal();
  }

  testGetTechTreeModalState() {
    return {
      open: this.techTreeModalOpen,
      panelVisible: this.techTreeModalPanel.visible,
      closeVisible: this.techTreeCloseButton.rectangle.visible && this.techTreeCloseButton.label.visible,
      panelBounds: this.techTreeModalPanel.getBounds(),
      summary: { ...this.latestTechTreeModalPayload.summary },
      rows: this.latestTechTreeModalPayload.rows.map((row) => ({ ...row })),
      graph: {
        viewport: { ...this.latestTechTreeModalPayload.graph.viewport },
        contentWidth: this.latestTechTreeModalPayload.graph.contentWidth,
        contentHeight: this.latestTechTreeModalPayload.graph.contentHeight,
        scrollX: this.latestTechTreeModalPayload.graph.scrollX,
        nodes: this.latestTechTreeModalPayload.graph.nodes.map((node) => ({ ...node })),
        edges: this.latestTechTreeModalPayload.graph.edges.map((edge) => ({ ...edge })),
      },
    };
  }

  testScrollTechTreeGraph(delta) {
    if (!this.techTreeModalOpen) {
      return this.techTreeGraphScrollX;
    }
    return this.applyTechTreeGraphScroll(this.techTreeGraphScrollX + (Number(delta) || 0));
  }

  testClickMinimapNormalized(nx, ny) {
    if (!this.minimapVisible) {
      return false;
    }
    const bounds = this.minimapContentBounds;
    const pointer = {
      x: bounds.x + Phaser.Math.Clamp(Number(nx) || 0, 0, 1) * bounds.width,
      y: bounds.y + Phaser.Math.Clamp(Number(ny) || 0, 0, 1) * bounds.height,
    };
    return this.handleMinimapPointerDown(pointer);
  }

  testFocusMinimapHex(q, r) {
    if (!Number.isFinite(q) || !Number.isFinite(r) || !this.latestState?.map) {
      return false;
    }
    const mapWidth = this.latestState.map.width ?? 0;
    const mapHeight = this.latestState.map.height ?? 0;
    const qClamped = Phaser.Math.Clamp(Math.round(q), 0, Math.max(0, mapWidth - 1));
    const rClamped = Phaser.Math.Clamp(Math.round(r), 0, Math.max(0, mapHeight - 1));
    gameEvents.emit("minimap-focus-requested", { q: qClamped, r: rClamped });
    return true;
  }

  testGetHudPolishState() {
    return {
      forecast: {
        visible: this.forecastPanel.visible,
        bounds: {
          x: this.forecastPanel.x,
          y: this.forecastPanel.y,
          width: this.forecastPanel.displayWidth,
          height: this.forecastPanel.displayHeight,
        },
        linePrimary: this.forecastLinePrimary.text,
        lineSecondary: this.forecastLineSecondary.text,
        lineTertiary: this.forecastLineTertiary.text,
      },
      stats: {
        open: this.statsPanelOpen,
        buttonActive: this.statsToggleButton.isActive,
        payload: { ...this.latestStatsPayload },
      },
      techTree: {
        open: this.techTreeModalOpen,
        buttonActive: this.techTreeButton.isActive,
        summary: { ...this.latestTechTreeModalPayload.summary },
        rows: this.latestTechTreeModalPayload.rows.map((row) => ({ ...row })),
        graph: {
          viewport: { ...this.latestTechTreeModalPayload.graph.viewport },
          contentWidth: this.latestTechTreeModalPayload.graph.contentWidth,
          contentHeight: this.latestTechTreeModalPayload.graph.contentHeight,
          scrollX: this.latestTechTreeModalPayload.graph.scrollX,
          nodes: this.latestTechTreeModalPayload.graph.nodes.map((node) => ({ ...node })),
          edges: this.latestTechTreeModalPayload.graph.edges.map((edge) => ({ ...edge })),
        },
      },
      minimap: {
        visible: this.minimapVisible,
        bounds: this.minimapContentBounds ? { ...this.minimapContentBounds } : null,
        frameVisible: this.minimapViewportBoundarySegments > 0,
        viewportBoundarySegments: this.minimapViewportBoundarySegments,
        viewportFootprint: this.minimapViewportFootprint ? { ...this.minimapViewportFootprint } : null,
        frame: {
          x: this.minimapViewportFrame.x,
          y: this.minimapViewportFrame.y,
          width: this.minimapViewportFrame.displayWidth,
          height: this.minimapViewportFrame.displayHeight,
        },
      },
    };
  }

  testGetContextPanelState() {
    return {
      expanded: this.contextPanelExpanded,
      pinned: this.contextPanelPinned,
      mode: this.contextMenuMode,
    };
  }
}

function buildTechTreeModalPayload(gameState) {
  const research = gameState.research ?? {};
  const economyPlayer = gameState.economy?.player ?? {};
  const completedSet = new Set(research.completedTechIds ?? []);
  const currentTechId = research.currentTechId ?? research.activeTechId ?? null;
  const rows = TECH_ORDER.map((techId) => {
    const tech = TECH_TREE[techId];
    const costScaled = Number.isFinite(research.effectiveCostByTech?.[techId]) ? research.effectiveCostByTech[techId] : 0;
    const progressScaled = Number.isFinite(research.progressByTech?.[techId]) ? research.progressByTech[techId] : 0;
    const boost = research.boostProgressByTech?.[techId] ?? { current: 0, target: 0, met: false, label: null };
    const prerequisites = Array.isArray(tech?.prerequisites) ? tech.prerequisites : [];
    const prerequisitesMet = prerequisites.every((prereq) => completedSet.has(prereq));
    const completed = completedSet.has(techId);
    const status = completed
      ? "Completed"
      : currentTechId === techId
        ? "Active"
        : prerequisitesMet
          ? "Available"
          : "Locked";
    const unlocks = [
      ...((tech?.unlocks?.units ?? []).map((unitType) => formatUnitLabel(unitType))),
      ...((tech?.unlocks?.buildings ?? []).map((buildingId) => formatBuildingLabel(buildingId))),
    ];
    return {
      id: techId,
      name: tech?.name ?? capitalizeLabel(techId),
      era: tech?.era ?? 0,
      status,
      prerequisites,
      progress: scaledToScience(progressScaled),
      cost: scaledToScience(costScaled),
      boostCurrent: Number.isFinite(boost.current) ? boost.current : 0,
      boostTarget: Number.isFinite(boost.target) ? boost.target : 0,
      boostMet: !!boost.met,
      boostLabel: typeof boost.label === "string" ? boost.label : null,
      unlocks,
    };
  });
  const graph = buildTechTreeGraphModel(rows);
  const cityScienceEntries = Object.values(research.cityScienceById ?? {})
    .sort((a, b) => String(a.cityName ?? a.cityId).localeCompare(String(b.cityName ?? b.cityId)))
    .map((entry) => ({
      cityId: entry.cityId ?? "",
      cityName: entry.cityName ?? formatCityName(entry.cityId),
      totalScience: Number.isFinite(entry.totalScience) ? entry.totalScience : 0,
      populationScience: Number.isFinite(entry.populationScience) ? entry.populationScience : 0,
      campusAdjacencyScience: Number.isFinite(entry.campusAdjacencyScience) ? entry.campusAdjacencyScience : 0,
      buildingScience: Number.isFinite(entry.buildingScience) ? entry.buildingScience : 0,
    }));
  const sciencePerTurn = Number.isFinite(research.sciencePerTurn)
    ? research.sciencePerTurn
    : Number.isFinite(economyPlayer.sciencePerTurn)
      ? economyPlayer.sciencePerTurn
      : 0;
  const baseSciencePerTurn = Number.isFinite(research.baseSciencePerTurn) ? research.baseSciencePerTurn : 0;
  const globalModifierTotal = Number.isFinite(research.globalModifierTotal) ? research.globalModifierTotal : 0;
  return {
    open: false,
    summary: {
      sciencePerTurn,
      baseSciencePerTurn,
      globalModifierTotal,
      completedTech: completedSet.size,
      totalTech: TECH_ORDER.length,
      currentTechId,
      currentTechName: currentTechId ? TECH_TREE[currentTechId]?.name ?? capitalizeLabel(currentTechId) : "None",
      turnsRemaining: Number.isFinite(research.turnsRemaining) ? research.turnsRemaining : null,
      cityScienceBreakdown: cityScienceEntries,
    },
    rows,
    graph,
  };
}

function buildTechTreeGraphModel(rows) {
  const depthByTechId = computeTechDepthMap();
  const depthGroups = new Map();
  for (const techId of TECH_ORDER) {
    const depth = depthByTechId[techId] ?? 0;
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth).push(techId);
  }
  const sortedDepths = [...depthGroups.keys()].sort((a, b) => a - b);
  const depthStartX = new Map();
  const depthSlotByTechId = new Map();
  let runningX = TECH_TREE_GRAPH_PADDING_LEFT;
  for (const depth of sortedDepths) {
    const group = depthGroups.get(depth) ?? [];
    depthStartX.set(depth, runningX);
    for (let index = 0; index < group.length; index += 1) {
      depthSlotByTechId.set(group[index], index);
    }
    runningX += Math.max(1, group.length) * TECH_TREE_GRAPH_NODE_SLOT_WIDTH + TECH_TREE_GRAPH_DEPTH_GAP;
  }
  const nodes = rows.map((row) => {
    const depth = depthByTechId[row.id] ?? 0;
    const slot = depthSlotByTechId.get(row.id) ?? 0;
    const lane = Phaser.Math.Clamp(Number(row.era) || 1, 1, 3);
    const x = (depthStartX.get(depth) ?? TECH_TREE_GRAPH_PADDING_LEFT) + slot * TECH_TREE_GRAPH_NODE_SLOT_WIDTH;
    const laneTop = TECH_TREE_GRAPH_PADDING_TOP + (lane - 1) * TECH_TREE_GRAPH_LANE_HEIGHT;
    const y = laneTop + (TECH_TREE_GRAPH_LANE_HEIGHT - TECH_TREE_GRAPH_NODE_HEIGHT) / 2;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      lane,
      depth,
      x,
      y,
      width: TECH_TREE_GRAPH_NODE_WIDTH,
      height: TECH_TREE_GRAPH_NODE_HEIGHT,
      progress: row.progress,
      cost: row.cost,
      boostCurrent: row.boostCurrent,
      boostTarget: row.boostTarget,
    };
  });
  const edges = [];
  for (const row of rows) {
    for (const prerequisite of row.prerequisites) {
      if (TECH_TREE[prerequisite]) {
        edges.push({ from: prerequisite, to: row.id });
      }
    }
  }
  const furthestNodeX = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0);
  const contentWidth = Math.max(
    TECH_TREE_GRAPH_PADDING_LEFT + TECH_TREE_GRAPH_NODE_WIDTH + TECH_TREE_GRAPH_PADDING_RIGHT,
    furthestNodeX + TECH_TREE_GRAPH_PADDING_RIGHT
  );
  const contentHeight = TECH_TREE_GRAPH_PADDING_TOP + TECH_TREE_GRAPH_LANE_HEIGHT * 3 + TECH_TREE_GRAPH_PADDING_BOTTOM;
  return {
    viewport: { x: 0, y: 0, width: 0, height: 0 },
    contentWidth,
    contentHeight,
    scrollX: 0,
    nodes,
    edges,
  };
}

function computeTechDepthMap() {
  const memo = {};
  const visiting = new Set();
  const resolveDepth = (techId) => {
    if (Number.isFinite(memo[techId])) {
      return memo[techId];
    }
    if (visiting.has(techId)) {
      return 0;
    }
    visiting.add(techId);
    const prerequisites = TECH_TREE[techId]?.prerequisites ?? [];
    let depth = 0;
    for (const prerequisite of prerequisites) {
      depth = Math.max(depth, resolveDepth(prerequisite) + 1);
    }
    visiting.delete(techId);
    memo[techId] = depth;
    return depth;
  };
  for (const techId of TECH_ORDER) {
    resolveDepth(techId);
  }
  return memo;
}

function resolveTechNodePalette(status) {
  if (status === "Completed") {
    return {
      fill: SEMANTIC_COLORS.accentGreen,
      fillAlpha: 0.32,
      stroke: SEMANTIC_COLORS.accentGreen,
      text: "#244a33",
      statusText: "#2f7242",
      progressText: "#2d5d40",
    };
  }
  if (status === "Active") {
    return {
      fill: SEMANTIC_COLORS.accentBlue,
      fillAlpha: 0.24,
      stroke: SEMANTIC_COLORS.accentBlue,
      text: "#23415e",
      statusText: "#2f5f90",
      progressText: "#385775",
    };
  }
  if (status === "Available") {
    return {
      fill: SEMANTIC_COLORS.panelActiveBg,
      fillAlpha: 0.74,
      stroke: SEMANTIC_COLORS.panelBorder,
      text: SEMANTIC_COLORS.textStrong,
      statusText: "#4d3a24",
      progressText: "#5a452f",
    };
  }
  return {
    fill: SEMANTIC_COLORS.panelSoftBg,
    fillAlpha: 0.58,
    stroke: SEMANTIC_COLORS.panelBorder,
    text: SEMANTIC_COLORS.textMuted,
    statusText: "#6a5944",
    progressText: "#7a6852",
  };
}

function scaledToScience(value) {
  const scaled = Number.isFinite(value) ? value : 0;
  return Math.max(0, scaled / 10);
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${formatMetric(value)}`;
}

function formatCityScienceBreakdown(cityId, gameState) {
  if (!cityId) {
    return null;
  }
  const breakdown = gameState?.research?.cityScienceById?.[cityId] ?? null;
  if (!breakdown) {
    return null;
  }
  return `Science breakdown Pop ${formatMetric(breakdown.populationScience)} + Campus ${formatMetric(
    breakdown.campusAdjacencyScience
  )} + Buildings ${formatMetric(breakdown.buildingScience)} = ${formatMetric(breakdown.totalScience)}`;
}

function formatMetric(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(numeric * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDeltaColor(value) {
  if (value > 0) {
    return SEMANTIC_COLORS.textPositive;
  }
  if (value < 0) {
    return DELTA_NEGATIVE_TEXT_COLOR;
  }
  return SEMANTIC_COLORS.textMuted;
}

function formatUnitLabel(type) {
  return UNIT_LABELS[type] ?? capitalizeLabel(type);
}

function formatBuildingLabel(type) {
  return BUILDING_LABELS[type] ?? capitalizeLabel(type);
}

function formatProductionChoiceLabel(baseLabel, choice) {
  const cost = choice?.cost ?? 0;
  const eta = choice?.etaTurns ?? 0;
  const stateTag = choice?.stateTag ?? null;
  const details = `Cost ${cost}, ${formatTurns(eta)}${stateTag ? ` (${stateTag})` : ""}`;
  return `${baseLabel}\n${details}`;
}

function formatQueueSlotLabel(slot, index) {
  if (!slot || slot.empty) {
    return `${index + 1}. Empty\nAdd an item`;
  }
  const itemLabel = slot.label ?? "--";
  const eta = Number.isFinite(slot.etaTurns) ? slot.etaTurns : 0;
  return `${index + 1}. ${itemLabel}\nCost ${slot.cost} | ETA ${formatTurnsShort(eta)}`;
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCityName(cityId) {
  if (typeof cityId !== "string" || cityId.length === 0) {
    return "Unknown";
  }
  return cityId
    .split("-")
    .map((segment) => capitalizeLabel(segment))
    .join(" ");
}

function formatTurns(turns) {
  const normalized = Math.max(0, Number.isFinite(turns) ? Math.round(turns) : 0);
  return normalized === 1 ? "1 turn" : `${normalized} turns`;
}

function formatTurnsShort(turns) {
  const normalized = Math.max(0, Number.isFinite(turns) ? Math.round(turns) : 0);
  return `${normalized}t`;
}

function resolveMinimapTileColor(terrainType, explored, visible) {
  if (!explored) {
    return 0x3a3834;
  }
  const terrainColor =
    terrainType === "forest"
      ? 0x738665
      : terrainType === "hill"
        ? 0x8b7f68
        : terrainType === "mountain"
          ? 0x75716d
          : 0x98aa75;
  if (visible) {
    return terrainColor;
  }
  return terrainType === "forest"
    ? 0x56604d
    : terrainType === "hill"
      ? 0x696252
      : terrainType === "mountain"
        ? 0x5e5a57
        : 0x667051;
}

function resolveMinimapOwnerColor(owner) {
  if (owner === "enemy") {
    return 0x925c4f;
  }
  if (owner === "purple") {
    return 0x736088;
  }
  if (owner === "player") {
    return 0x5b7394;
  }
  return 0x7b796f;
}

function normalizeNotificationCategory(input, message = "") {
  const normalizedInput = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (normalizedInput === "combat") {
    return "Combat";
  }
  if (normalizedInput === "city") {
    return "City";
  }
  if (normalizedInput === "research") {
    return "Research";
  }
  if (normalizedInput === "system") {
    return "System";
  }

  const text = message.toLowerCase();
  if (text.includes("research") || text.includes("tech")) {
    return "Research";
  }
  if (text.includes("city") || text.includes("queue") || text.includes("focus")) {
    return "City";
  }
  if (text.includes("attack") || text.includes("captured") || text.includes("razed") || text.includes("combat")) {
    return "Combat";
  }
  return "System";
}

function getNotificationCategoryStyle(category) {
  if (category === "Combat") {
    return { fill: 0x8a4734, label: "Combat" };
  }
  if (category === "City") {
    return { fill: 0x3e6d58, label: "City" };
  }
  if (category === "Research") {
    return { fill: 0x2f5f90, label: "Research" };
  }
  if (category === "System") {
    return { fill: 0x5f5d55, label: "System" };
  }
  return { fill: 0x5f5d55, label: "All" };
}

function normalizeNotificationFocus(focus) {
  if (!focus || typeof focus !== "object") {
    return null;
  }
  const normalized = {};
  if (typeof focus.unitId === "string") {
    normalized.unitId = focus.unitId;
  }
  if (typeof focus.cityId === "string") {
    normalized.cityId = focus.cityId;
  }
  if (Number.isFinite(focus.q)) {
    normalized.q = Math.round(focus.q);
  }
  if (Number.isFinite(focus.r)) {
    normalized.r = Math.round(focus.r);
  }
  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
}

function summarizePreview(uiPreview) {
  const mode = uiPreview?.mode ?? "none";
  if (mode === "move") {
    const stepCount = countMovePreviewSteps(uiPreview.path);
    return `Move preview -> cost ${uiPreview.moveCost ?? 0}, remaining ${uiPreview.movementRemainingAfter ?? 0}${stepCount > 0 ? `, route ${stepCount} step${stepCount === 1 ? "" : "s"}` : ""}.`;
  }
  if (mode === "attack-unit") {
    const counter = uiPreview.counterattack;
    if (counter?.triggered) {
      return `Attack preview -> ${uiPreview.damage ?? 0} damage, counter ${counter.damage ?? 0}.`;
    }
    return `Attack preview -> ${uiPreview.damage ?? 0} damage, no counter.`;
  }
  if (mode === "attack-city") {
    return `City assault preview -> ${uiPreview.damage ?? 0} damage, city health after hit ${uiPreview.cityRemainingHealth ?? "?"}.`;
  }
  return "";
}

function formatMovePreviewRoute(path, maxShown = 5) {
  if (!Array.isArray(path)) {
    return "";
  }
  const labels = path
    .filter((hex) => Number.isFinite(hex?.q) && Number.isFinite(hex?.r))
    .map((hex) => `(${hex.q}, ${hex.r})`);
  if (labels.length === 0) {
    return "";
  }
  if (labels.length <= maxShown) {
    return labels.join(" -> ");
  }
  const visiblePrefix = Math.max(2, maxShown - 2);
  return `${labels.slice(0, visiblePrefix).join(" -> ")} -> ... -> ${labels[labels.length - 1]}`;
}

function countMovePreviewSteps(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return 0;
  }
  return path.length - 1;
}

function truncateText(value, maxChars) {
  if (typeof value !== "string" || value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeFontSize(size, minPx = 13) {
  const text = String(size ?? "");
  const matched = text.match(/^(\d+(?:\.\d+)?)px$/);
  if (!matched) {
    return size;
  }
  const parsed = Number(matched[1]);
  const clamped = Math.max(minPx, parsed);
  return `${clamped}px`;
}

function resolveUiSfxProfile(kind) {
  if (kind === "select") {
    return { frequency: 560, frequencyDrop: 0.92, duration: 0.08, gain: 0.22, wave: "triangle" };
  }
  if (kind === "confirm") {
    return { frequency: 700, frequencyDrop: 1.06, duration: 0.1, gain: 0.24, wave: "triangle" };
  }
  if (kind === "warning") {
    return { frequency: 300, frequencyDrop: 0.74, duration: 0.13, gain: 0.28, wave: "sawtooth" };
  }
  if (kind === "notify") {
    return { frequency: 480, frequencyDrop: 1.01, duration: 0.09, gain: 0.16, wave: "sine" };
  }
  return null;
}
