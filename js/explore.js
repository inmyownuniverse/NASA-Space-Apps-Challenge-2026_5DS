// Owner: Jaden · Support: Hazel
// Explore mode: move a finger, mouse or arrow keys over the map and hear the value at that spot.

/**
 * Turn on Explore mode for the overlay canvas.
 * TODO(Jaden):
 *  - canvas 'pointermove' → convert pointer position to a grid cell (cfg.grid.w × cfg.grid.h)
 *    → read that cell's value from the latest features.grid → valueToNote → play a short note
 *  - arrow keys move the selected cell one step; announce "row, column: value unit"
 *  - buzz(30) from a11y.js when the cell is a hotspot (e.g. above cfg.sound.tensionAbove)
 *  - canvas needs `touch-action: none` (already set on .overlay in style.css) so touch
 *    exploring doesn't scroll the page
 *  - draw a small cursor square on the canvas for sighted users
 *
 * @param {HTMLCanvasElement} canvas overlay canvas above the video
 * @param {object} cfg dataset config
 * @returns {() => void} call to turn Explore mode off (remove listeners)
 */
export function enableExplore(canvas, cfg) {
  canvas.style.touchAction = 'none';
  return () => {};
}
