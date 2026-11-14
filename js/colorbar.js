// Owner: Aahana · Support: Celene
// Colorbar inversion: turn a pixel colour back into the real data value it represents.
// Each dataset config lists colorbar "stops": [{ rgb: [r, g, b], value: number }, ...].

/**
 * Find the data value for a pixel colour.
 * Uses the nearest stop by squared RGB distance. Returns null when the colour is
 * farther than maxDist from every stop (land, text, coastlines, background, ...).
 *
 * @param {number} r 0–255
 * @param {number} g 0–255
 * @param {number} b 0–255
 * @param {{rgb: number[], value: number}[]} stops
 * @param {number} [maxDist=60] max Euclidean RGB distance to accept
 * @returns {number|null}
 */
export function colorToValue(r, g, b, stops, maxDist = 60) {
  if (!stops || stops.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const stop of stops) {
    const dr = r - stop.rgb[0];
    const dg = g - stop.rgb[1];
    const db = b - stop.rgb[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = stop;
    }
  }

  return bestDist <= maxDist * maxDist ? best.value : null;

  // TODO(Aahana): optional upgrade — interpolate between the two nearest neighbouring
  // stops for smoother values once the real colorbars are sampled with tools/sample_colorbar.py.
}
