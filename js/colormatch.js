// Owner: Jaden · Support: Aahana
// Colour matching for Explore mode: read a small patch of pixels around one spot and find the
// data value, robustly. Separate from colorbar.js, which the analyser uses and which stays
// exactly as Aahana validated it.
//
// Why a patch and not one pixel: frames have thin white current lines over the coloured water,
// grey land, black background, labels and video compression blur. One pixel often lands on one
// of those. Here we:
//   1. take a 7 × 7 patch around the spot (source video pixels),
//   2. drop near-white and grey pixels (no colour) and very dark pixels,
//   3. match the rest to the colour bar in CIELAB space, which follows how people see colour.
//      Current lines are drawn with soft edges that fade into the dark background, so a pixel is
//      often a bar colour made darker. We allow for that: for each point along the bar we find how
//      much darker the pixel is (down to 20% brightness, blended toward black the way video
//      edges are, in ordinary sRGB values) and compare it with the bar colour darkened that much,
//   4. use the median value of the pixels that matched,
//   5. if too few matched, look outward up to 10 px for the nearest pixel that does.

export const PATCH = 7;          // patch size, source pixels
export const SEARCH = 10;        // how far to look for the nearest valid pixel, source pixels
export const MIN_VALID = 5;      // matched pixels needed in the patch to trust it
export const MAX_DELTA_E = 18;   // largest colour difference (delta E) accepted (white scores ~42, magenta ~48; grey land is dropped earlier as colourless)
const MIN_BRIGHTNESS = 0.2;      // darkest version of a bar colour we still trust
const STEPS = 12;                // points tried between two neighbouring colour bar stops
const MIN_CHROMA = 12;           // below this a pixel has no real colour (white, grey, black)
const MIN_LIGHT = 12;            // below this lightness a pixel counts as background
const WHITE_LIGHT = 70;          // colourless and lighter than this: a white current line or label

const toLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB 0..255 to CIELAB (D65). */
export function rgbToLab(r, g, b) {
  return linearToLab(toLinear(r), toLinear(g), toLinear(b));
}

function linearToLab(R, G, B) {
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const labCache = new WeakMap();
function stopsLab(stops) {
  let lab = labCache.get(stops);
  if (!lab) {
    lab = stops.map((s) => rgbToLab(...s.rgb));
    labCache.set(stops, lab);
  }
  return lab;
}

// Points along the colour bar (sRGB, interpolated like colorbar.js), with their values.
const candCache = new WeakMap();
function candidates(stops) {
  let list = candCache.get(stops);
  if (list) return list;
  list = [];
  const lin = stops.map((s) => s.rgb);
  for (let i = 0; i < stops.length; i++) {
    const steps = i === stops.length - 1 ? 1 : STEPS;
    for (let k = 0; k < steps; k++) {
      const t = k / STEPS;
      const a = lin[i], b = lin[i + 1] ?? a;
      list.push({
        c: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])],
        value: stops[i].value + t * ((stops[i + 1]?.value ?? stops[i].value) - stops[i].value),
      });
    }
  }
  candCache.set(stops, list);
  return list;
}

/**
 * Closest colour bar colour for one pixel, allowing the pixel to be a darker version of it.
 * @returns {{ value: number, dE: number, brightness: number }}
 */
export function matchShaded(rgb, stops) {
  const p = rgb;
  const lab = rgbToLab(...p);
  let best = { value: stops[0].value, dE: Infinity, brightness: 1 };
  for (const { c, value } of candidates(stops)) {
    const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
    if (!cc) continue;
    const k = Math.min(1, Math.max(MIN_BRIGHTNESS, (p[0] * c[0] + p[1] * c[1] + p[2] * c[2]) / cc));
    const q = rgbToLab(k * c[0], k * c[1], k * c[2]);
    const dE = Math.hypot(lab[0] - q[0], lab[1] - q[1], lab[2] - q[2]);
    if (dE < best.dE) best = { value, dE, brightness: k };
  }
  return best;
}

/**
 * Closest point on the colour bar (in Lab) for one colour.
 * @returns {{ value: number, dE: number }}
 */
export function matchLab(lab, stops) {
  const sl = stopsLab(stops);
  let best = { value: stops[0].value, dE: Infinity };
  const dist = (p, q) => Math.hypot((p[0] - q[0]) / 2, p[1] - q[1], p[2] - q[2]); // lightness weighted 1/2
  for (let i = 0; i < sl.length; i++) {
    const a = sl[i];
    const b = sl[i + 1];
    if (!b) {
      const dE = dist(lab, a);
      if (dE < best.dE) best = { value: stops[i].value, dE };
      continue;
    }
    // Project onto the segment a..b using the same weighting.
    const v = [(b[0] - a[0]) / 2, b[1] - a[1], b[2] - a[2]];
    const p = [(lab[0] - a[0]) / 2, lab[1] - a[1], lab[2] - a[2]];
    const len = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const t = len ? Math.max(0, Math.min(1, (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / len)) : 0;
    const dE = Math.hypot(p[0] - t * v[0], p[1] - t * v[1], p[2] - t * v[2]);
    if (dE < best.dE) best = { value: stops[i].value + t * (stops[i + 1].value - stops[i].value), dE };
  }
  return best;
}

/** What kind of pixel this is: 'colour', 'white' (current line or label), 'grey' (land) or 'dark'. */
function kindOf(lab) {
  const chroma = Math.hypot(lab[1], lab[2]);
  if (lab[0] < MIN_LIGHT) return 'dark';
  if (chroma < MIN_CHROMA) return lab[0] > WHITE_LIGHT ? 'white' : 'grey';
  return 'colour';
}

/**
 * Read the value around (cx, cy).
 * @param {Uint8ClampedArray} px RGBA pixels of a region of the frame
 * @param {number} w region width
 * @param {number} h region height
 * @param {number} cx spot x inside the region
 * @param {number} cy spot y inside the region
 * @param {{rgb:number[], value:number}[]} stops colour bar stops
 * @returns {{ status: 'ok'|'nearest'|'land'|'line'|'outside', value: number|null, rgb: number[]|null,
 *            dE: number|null, valid: number, total: number, at: number[] }}
 *   status: ok = patch median; nearest = nearest valid pixel within SEARCH px;
 *   land = mostly land, background or no data; line = mostly a white current line or label;
 *   outside = coloured, but not a colour on the bar. `at` = [x, y] of the pixel shown.
 */
export function readPatch(px, w, h, cx, cy, stops) {
  const read = (x, y) => {
    const i = (y * w + x) * 4;
    const rgb = [px[i], px[i + 1], px[i + 2]];
    const lab = rgbToLab(...rgb);
    const kind = kindOf(lab);
    const m = kind === 'colour' ? matchShaded(rgb, stops) : null;
    return { x, y, rgb, kind, m, ok: Boolean(m && m.dE <= MAX_DELTA_E) };
  };

  const half = Math.floor(PATCH / 2);
  const patch = [];
  for (let y = Math.max(0, cy - half); y <= Math.min(h - 1, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x <= Math.min(w - 1, cx + half); x++) patch.push(read(x, y));
  }
  const good = patch.filter((p) => p.ok).sort((a, b) => a.m.value - b.m.value);

  if (good.length >= MIN_VALID) {
    const mid = good[Math.floor(good.length / 2)];
    return { status: 'ok', value: mid.m.value, rgb: mid.rgb, dE: mid.m.dE, valid: good.length, total: patch.length, at: [mid.x, mid.y] };
  }

  // Too few: look outward, ring by ring, for the nearest pixel that matches.
  for (let r = half + 1; r <= SEARCH; r++) {
    let found = null, foundD = Infinity;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = read(x, y);
        const d = Math.hypot(x - cx, y - cy);
        if (p.ok && d < foundD) { found = p; foundD = d; }
      }
    }
    if (found) {
      return { status: 'nearest', value: found.m.value, rgb: found.rgb, dE: found.m.dE, valid: good.length, total: patch.length, at: [found.x, found.y], distance: Math.round(foundD) };
    }
  }

  // Nothing usable: say why.
  const count = (k) => patch.filter((p) => p.kind === k).length;
  const colourful = count('colour');
  const status = colourful > patch.length / 3 ? 'outside'
    : count('white') >= Math.max(count('grey'), count('dark')) && count('white') > 0 ? 'line'
    : 'land';
  const centre = patch.find((p) => p.x === cx && p.y === cy) ?? patch[0];
  return { status, value: null, rgb: centre?.rgb ?? null, dE: null, valid: 0, total: patch.length, at: [cx, cy] };
}
