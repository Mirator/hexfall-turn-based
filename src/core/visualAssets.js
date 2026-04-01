import { COLORS } from "./constants.js";
import { mixSeed } from "./random.js";

const TERRAIN_TYPES = ["plains", "forest", "hill", "mountain", "water"];
const OWNERS = ["player", "enemy", "purple"];
const UNIT_TYPES = ["warrior", "settler", "spearman", "archer"];
const SPRITE_FRAME = { frameWidth: 64, frameHeight: 64, startFrame: 0, endFrame: 0 };

const spriteAssetModules = import.meta.glob("../assets/sprites/**/*.svg", {
  eager: true,
  import: "default",
});

function assetUrl(spritePath) {
  const modulePath = `../assets/sprites/${spritePath}`;
  const resolvedUrl = spriteAssetModules[modulePath];
  if (typeof resolvedUrl !== "string") {
    throw new Error(`Missing sprite asset: ${modulePath}`);
  }
  return resolvedUrl;
}

export const TERRAIN_TEXTURE_KEYS = Object.fromEntries(
  TERRAIN_TYPES.map((terrainType) => [
    terrainType,
    [0, 1, 2].map((variant) => `terrain-${terrainType}-${variant}`),
  ])
);

export const UNIT_TEXTURE_KEYS = Object.fromEntries(UNIT_TYPES.map((unitType) => [unitType, `unit-${unitType}`]));

export const OWNER_UNIT_TINTS = {
  player: COLORS.playerUnit,
  enemy: COLORS.enemyUnit,
  purple: COLORS.purpleUnit,
  amber: 0xc47a17,
  teal: 0x1f7c86,
  crimson: 0x97213f,
  onyx: 0x3a3a42,
};

export const OWNER_CITY_TINTS = {
  player: COLORS.cityPlayer,
  enemy: COLORS.cityEnemy,
  purple: COLORS.cityPurple,
  amber: 0xb36f1d,
  teal: 0x29706f,
  crimson: 0x8a3145,
  onyx: 0x43434c,
};

export const CITY_TEXTURE_KEYS = Object.fromEntries(OWNERS.map((owner) => [owner, `city-${owner}`]));

export const FX_TEXTURE_KEYS = {
  impact: "fx-impact",
  burst: "fx-burst",
  found: "fx-found",
};

export const VISUAL_ASSETS = [
  ...TERRAIN_TYPES.flatMap((terrainType) =>
    [0, 1, 2].map((variant) => ({
      key: `terrain-${terrainType}-${variant}`,
      kind: "image",
      url: assetUrl(`terrain/${terrainType}-${variant}.svg`),
    }))
  ),
  ...UNIT_TYPES.map((unitType) => ({
    key: `unit-${unitType}`,
    kind: "image",
    url: assetUrl(`units/${unitType}.svg`),
  })),
  ...OWNERS.map((owner) => ({
    key: `city-${owner}`,
    kind: "spritesheet",
    frameConfig: SPRITE_FRAME,
    url: assetUrl(`cities/${owner}.svg`),
  })),
  ...Object.entries(FX_TEXTURE_KEYS).map(([, key]) => ({
    key,
    kind: "spritesheet",
    frameConfig: SPRITE_FRAME,
    url: assetUrl(`fx/${key.replace("fx-", "")}.svg`),
  })),
];

export function getTerrainTextureKey(terrainType, seed, q, r) {
  const variants = TERRAIN_TEXTURE_KEYS[terrainType] ?? TERRAIN_TEXTURE_KEYS.plains;
  const mix = mixSeed(seed, `terrain:${terrainType}:${q},${r}`) >>> 0;
  return variants[mix % variants.length];
}

export function getUnitTextureKey(unitType) {
  return UNIT_TEXTURE_KEYS[unitType] ?? UNIT_TEXTURE_KEYS.warrior;
}

export function getOwnerUnitTint(owner) {
  const knownTint = OWNER_UNIT_TINTS[owner];
  if (typeof knownTint === "number") {
    return knownTint;
  }
  return buildDeterministicTint(owner);
}

export function getCityTextureKey(owner) {
  return CITY_TEXTURE_KEYS[owner] ?? CITY_TEXTURE_KEYS.enemy;
}

export function getOwnerCityTint(owner) {
  const knownTint = OWNER_CITY_TINTS[owner];
  if (typeof knownTint === "number") {
    return knownTint;
  }
  return buildDeterministicTint(`city:${owner ?? "unknown"}`);
}

function buildDeterministicTint(owner) {
  const mixed = mixSeed("unit-owner-tint", String(owner ?? "unknown")) >>> 0;
  const hue = mixed % 360;
  const saturation = 0.58 + ((mixed >>> 8) % 17) / 100;
  const value = 0.72 + ((mixed >>> 4) % 21) / 100;
  return hsvToRgbInt(hue, saturation, value);
}

function hsvToRgbInt(hue, saturation, value) {
  const hueWrapped = ((hue % 360) + 360) % 360;
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hueWrapped / 60) % 2) - 1));
  const m = value - c;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hueWrapped < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hueWrapped < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hueWrapped < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hueWrapped < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hueWrapped < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);
  return (r << 16) | (g << 8) | b;
}
