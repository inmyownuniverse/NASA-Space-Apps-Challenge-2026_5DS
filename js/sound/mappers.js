// Owner: Freia · Support: Jaden
// Mapping rules: turn features into notes. One mapper per kind of visualization.
// Every mapper has the same signature: (features, cfg, inst, time).
// The dataset config picks one with cfg.sound.mapper.

/**
 * Continuous field (sea surface temperature).
 * TODO(Freia):
 *  - pitch from features.mean via valueToNote (cfg.sound.octaves)
 *  - up to cfg.sound.maxVoices notes from the warmest/coldest regions of features.grid
 *  - smooth over cfg.sound.smoothFrames frames so notes don't jump around
 *  - features.change → filter cutoff (cfg.sound.changeTo === "filter")
 *  - above cfg.sound.tensionAbove → add a dissonant / tense voice
 */
export function continuousField(features, cfg, inst, time) {
  // stub — engine.playFrame currently plays a single note from features.mean
}

/**
 * Discrete events (lightning).
 * TODO(Freia):
 *  - one drum hit per item in features.flashes
 *  - pan by flash x (west = left, east = right), pitch by y (north = high)
 *  - velocity by flash brightness; cap hits per frame to avoid clutter
 */
export function events(features, cfg, inst, time) {
  // stub
}

/**
 * Density (night lights).
 * TODO(Freia):
 *  - number of glass notes per frame ∝ share of lit cells in features.grid
 *  - brightness (radiance) → pitch; growth over the years → more sparkle
 */
export function density(features, cfg, inst, time) {
  // stub
}

/**
 * Layers (aerosols).
 * TODO(Freia):
 *  - one instrument per aerosol type (dust, smoke, salt, sulfate)
 *  - features.layers[type] (0..1) → that layer's volume
 *  - keep layers on a shared chord so they blend
 */
export function layers(features, cfg, inst, time) {
  // stub
}

export const MAPPERS = { continuousField, events, density, layers };
