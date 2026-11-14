// Owner: Aahana · Support: Celene
// Colorbar inversion: turn a pixel colour back into the real data value it represents.
// Each dataset config lists colorbar "stops": [{ rgb: [r, g, b], value: number }, ...].

const colorCache = new Map();
let cachedStops = null;
let cachedMaxDist = null;

/**
 * Clear the color conversion cache. Useful when stops or configuration change.
 */
export function clearColorCache() {
  colorCache.clear();
  cachedStops = null;
  cachedMaxDist = null;
}

/**
 * Find the data value for a pixel colour.
 * Finds the nearest calibrated RGB colour and interpolates between adjacent
 * colour stops along the colour gradient to recover numerical data values.
 * Returns null when the colour is farther than maxDist from the calibrated gradient
 * (e.g. land, background, labels, borders).
 *
 * @param {number} r 0–255
 * @param {number} g 0–255
 * @param {number} b 0–255
 * @param {{rgb: number[], value: number}[]} stops
 * @param {number} [maxDist=60] max Euclidean RGB distance to accept
 * @returns {number|null}
 */
export function colorToValue(r, g, b, stops, maxDist = 60) {
  if (!stops || !Array.isArray(stops) || stops.length === 0) return null;
  if (
    typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
    Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)
  ) {
    return null;
  }

  // Round inputs to integer pixel range
  const ir = Math.round(r);
  const ig = Math.round(g);
  const ib = Math.round(b);
  if (ir < 0 || ir > 255 || ig < 0 || ig > 255 || ib < 0 || ib > 255) {
    return null;
  }

  // Manage cache validity
  if (stops !== cachedStops || maxDist !== cachedMaxDist) {
    colorCache.clear();
    cachedStops = stops;
    cachedMaxDist = maxDist;
  }

  const cacheKey = ((ir & 0xff) << 16) | ((ig & 0xff) << 8) | (ib & 0xff);
  if (colorCache.has(cacheKey)) {
    return colorCache.get(cacheKey);
  }

  // Single stop: direct distance check without interpolation
  if (stops.length === 1) {
    const s0 = stops[0];
    const dr = ir - s0.rgb[0];
    const dg = ig - s0.rgb[1];
    const db = ib - s0.rgb[2];
    const dSq = dr * dr + dg * dg + db * db;
    const val = dSq <= maxDist * maxDist ? s0.value : null;
    colorCache.set(cacheKey, val);
    return val;
  }

  // 1. Find nearest calibrated stop
  let nearestIdx = 0;
  let nearestDistSq = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const dr = ir - s.rgb[0];
    const dg = ig - s.rgb[1];
    const db = ib - s.rgb[2];
    const dSq = dr * dr + dg * dg + db * db;
    if (dSq < nearestDistSq) {
      nearestDistSq = dSq;
      nearestIdx = i;
    }
  }

  // 2. Interpolate between adjacent colour stops (nearestIdx - 1 and nearestIdx + 1)
  const adjacentIndices = [];
  if (nearestIdx > 0) adjacentIndices.push(nearestIdx - 1);
  if (nearestIdx < stops.length - 1) adjacentIndices.push(nearestIdx + 1);

  let bestDistSq = nearestDistSq;
  let bestVal = stops[nearestIdx].value;

  for (const adjIdx of adjacentIndices) {
    const sA = stops[nearestIdx];
    const sB = stops[adjIdx];

    const vr = sB.rgb[0] - sA.rgb[0];
    const vg = sB.rgb[1] - sA.rgb[1];
    const vb = sB.rgb[2] - sA.rgb[2];
    const vLenSq = vr * vr + vg * vg + vb * vb;
    if (vLenSq === 0) continue;

    const pr = ir - sA.rgb[0];
    const pg = ig - sA.rgb[1];
    const pb = ib - sA.rgb[2];

    const dot = pr * vr + pg * vg + pb * vb;
    const t = Math.max(0, Math.min(1, dot / vLenSq));

    const projR = sA.rgb[0] + t * vr;
    const projG = sA.rgb[1] + t * vg;
    const projB = sA.rgb[2] + t * vb;

    const dr = ir - projR;
    const dg = ig - projG;
    const db = ib - projB;
    const dSq = dr * dr + dg * dg + db * db;

    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestVal = sA.value + t * (sB.value - sA.value);
    }
  }

  const result = bestDistSq <= maxDist * maxDist ? bestVal : null;
  colorCache.set(cacheKey, result);
  return result;
}
