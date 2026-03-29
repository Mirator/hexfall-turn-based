export const MAP_SIZE_PRESETS = [16, 20, 24];
export const DEFAULT_MAP_SIZE = MAP_SIZE_PRESETS[0];
export const MIN_AI_FACTIONS = 1;
export const MAX_AI_FACTIONS = 6;
export const DEFAULT_AI_FACTION_COUNT = 2;

/**
 * @typedef {{ mapWidth: number, mapHeight: number, aiFactionCount: number }} MatchConfig
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function coerceInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

/**
 * @param {number} count
 * @returns {number}
 */
export function clampAiFactionCount(count) {
  return Math.max(MIN_AI_FACTIONS, Math.min(MAX_AI_FACTIONS, coerceInt(count, DEFAULT_AI_FACTION_COUNT)));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeMapSize(value) {
  const parsed = coerceInt(value, DEFAULT_MAP_SIZE);
  if (MAP_SIZE_PRESETS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_MAP_SIZE;
}

/**
 * @param {Partial<MatchConfig>|undefined|null} input
 * @returns {MatchConfig}
 */
export function resolveMatchConfig(input = null) {
  const mapWidth = normalizeMapSize(input?.mapWidth);
  const mapHeight = normalizeMapSize(input?.mapHeight);
  const aiFactionCount = clampAiFactionCount(input?.aiFactionCount);

  return {
    mapWidth,
    mapHeight,
    aiFactionCount,
  };
}

