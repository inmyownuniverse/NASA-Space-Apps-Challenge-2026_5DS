// Audit-only: dump the analyzer grid for one Night Lights timestamp (visual check).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'datasets/nightlights.json'), 'utf-8'));
const t = Number(process.argv[2] ?? 5);
const raw = path.join(root, 'tools', '.grid.rgba');
execSync(`ffmpeg -v error -y -ss ${t} -i "${path.join(root, cfg.video)}" -frames:v 1 -f rawvideo -pix_fmt rgba "${raw}"`);
const full = new Uint8ClampedArray(fs.readFileSync(raw));
fs.unlinkSync(raw);
const W = 1920;
class Ctx {
  drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh) {
    const b = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const s = ((sy + y) * W + sx) * 4;
      b.set(full.subarray(s, s + dw * 4), y * dw * 4);
    }
    this.buffer = b;
  }
  getImageData(sx, sy, sw, sh) { return { data: this.buffer, width: sw, height: sh }; }
}
class Canvas { constructor() { this._ctx = new Ctx(); } getContext() { return this._ctx; } }
globalThis.document = { createElement: () => new Canvas() };
const { analyze } = await import('../../js/analyzer.js');
const f = analyze({ readyState: 4, videoWidth: 1920, videoHeight: 540, currentTime: t }, cfg);
console.log(JSON.stringify({ t, mean: f.mean, max: f.max, grid: f.grid }));
