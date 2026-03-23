const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const SQRT_3 = Math.sqrt(3);

/**
 * @param {{ q: number, r: number }} hex
 * @returns {{ q: number, r: number }[]}
 */
export function neighbors(hex) {
  return HEX_DIRECTIONS.map((direction) => ({
    q: hex.q + direction.q,
    r: hex.r + direction.r,
  }));
}

/**
 * @param {{ q: number, r: number }} a
 * @param {{ q: number, r: number }} b
 * @returns {number}
 */
export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (a.q + a.r) - (b.q + b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

/**
 * @param {{ q: number, r: number }} hex
 * @returns {string}
 */
export function axialKey(hex) {
  return `${hex.q},${hex.r}`;
}

/**
 * @param {{ q: number, r: number }} hex
 * @param {number} size
 * @param {number} originX
 * @param {number} originY
 * @returns {{ x: number, y: number }}
 */
export function axialToWorld(hex, size, originX, originY) {
  const x = originX + size * SQRT_3 * (hex.q + hex.r / 2);
  const y = originY + size * 1.5 * hex.r;
  return { x, y };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} originX
 * @param {number} originY
 * @returns {{ q: number, r: number }}
 */
export function worldToAxial(x, y, size, originX, originY) {
  const localX = x - originX;
  const localY = y - originY;

  const fractionalQ = ((SQRT_3 / 3) * localX - (1 / 3) * localY) / size;
  const fractionalR = ((2 / 3) * localY) / size;

  return roundAxial({ q: fractionalQ, r: fractionalR });
}

/**
 * @param {{ q: number, r: number }} hex
 * @returns {{ q: number, r: number }}
 */
export function roundAxial(hex) {
  const x = hex.q;
  const z = hex.r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}
