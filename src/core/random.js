const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * @param {number|string|undefined|null} seed
 * @returns {number}
 */
export function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    const normalized = seed >>> 0;
    return normalized === 0 ? 1 : normalized;
  }

  const text = String(seed ?? "hexfall");
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  const normalized = hash >>> 0;
  return normalized === 0 ? 1 : normalized;
}

/**
 * @param {number|string} seed
 * @param {number|string} salt
 * @returns {number}
 */
export function mixSeed(seed, salt) {
  let value = normalizeSeed(seed) ^ normalizeSeed(salt);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  const normalized = value >>> 0;
  return normalized === 0 ? 1 : normalized;
}

/**
 * @param {number|string} seed
 * @returns {() => number}
 */
export function createSeededRng(seed) {
  let state = normalizeSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {T[]} values
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffleInPlace(values, rng) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
