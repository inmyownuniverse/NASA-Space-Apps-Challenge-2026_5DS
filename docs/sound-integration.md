# Sound integration guide

<!-- Owner: Freia · Support: Jaden -->

How to connect the sound engine (`js/sound/`) to the rest of the app.
Part 1 is for Hazel (UI and player). Part 2 is for Aahana (what `analyze()` must return).

To hear any of this without the app, open `tools/sound-lab.html` with Live Server
(http://127.0.0.1:5500/tools/sound-lab.html).

## Part 1: for Hazel

### Rules that apply everywhere

- **Audio only starts after a click or key press.** Browsers block sound until the user does
  something. Call `initAudio()` inside a click or keydown handler. Before that, every other
  function quietly does nothing (except `loadDataset`, which is remembered and applied once audio starts).
- **Pass the dataset config exactly as loaded from `datasets/*.json`.** The engine adds the
  settings from `js/sound/tuning.js` itself. If you need a sound setting in the UI (for example
  `tensionAbove` for hotspots), read it with `tuned(cfg).sound.tensionAbove` from `js/sound/tuning.js`,
  not from the JSON. The JSON no longer has those numbers.
- **Call `releaseAll()` on pause, on seek and on Esc.** Otherwise held pad and drone notes keep ringing.
  Switching dataset with `loadDataset` already does it for you.
- **One thing at a time.** The engine has either one dataset loaded (`loadDataset`) or the
  Planet Symphony loaded (`loadSymphony`), never both. Loading one unloads the other.
- **Scan mode uses `Tone.Transport`.** Don't start or stop the Transport anywhere else while scanning.

### Functions in `js/sound/engine.js`

| Function | Takes | What it does | When to call it |
|---|---|---|---|
| `initAudio()` | nothing; returns a Promise | Starts the audio context and builds the master chain (mix level, listener volume, room echo, limiter). Safe to call twice. | Inside the first click or key press (the Play button, any shortcut). Await it before playing. |
| `loadDataset(cfg)` | dataset config | Stops Scan, releases notes, unloads the Symphony and builds the instruments for this dataset. | When the user picks a dataset, and when leaving Planet Symphony. |
| `playFrame(features, cfg, time)` | features from `analyze()`, the same config, media time in seconds (not used yet) | Turns one analysed frame into notes using the dataset's mapper. Notes are scheduled slightly ahead on the audio clock. | Every analysed frame in Play mode (the player does this every 0.25 s of video). |
| `releaseAll()` | nothing | Stops every held or ringing note, in the single dataset and in the Symphony. | Pause, seek, Esc, mode change. |
| `setVolume(db)` | number in dB, 0 = full, default -8 | Sets the listener volume. Kept if called before `initAudio`. | On the volume slider's `input` event, and once after `initAudio`. |
| `startScan(cfg, getFeatures, onColumn)` | config; a function returning the current (paused) frame's features; optional callback `(col, notes)` | Steps through the map west to east, one column per sixteenth note at 90 BPM, each column played as a chord. Loops until stopped. `onColumn` runs in time with the sound. | When entering Scan mode, after pausing the video and after `loadDataset`. |
| `stopScan()` | nothing | Stops Scan mode. Safe to call when not scanning. | When leaving Scan mode, on Esc, before playing the video again. |
| `isScanning()` | nothing; returns true or false | Tells you whether Scan mode is running. | Optional, for button states. |
| `playScanColumn(features, cfg, col)` | features, config, column number (0 = west edge) | Plays one column as a chord right now and returns the note names, e.g. `["E3", "G4"]`. | Optional: stepping columns by hand with arrow keys in Scan mode. |
| `loadSymphony(cfgs)` | array of all dataset configs | Unloads the single dataset and loads every dataset on its own mixer channel. | When entering Planet Symphony. |
| `playSymphonyFrame(featuresById)` | object of features by dataset id, e.g. `{ sst: f1, lightning: f2 }` | Plays one frame of every dataset at once. Missing ids are skipped. | Every frame while in Planet Symphony. |
| `setSymphonyLevel(id, db)` | dataset id, level in dB (around -40 to +6) | Changes one dataset's level in the Symphony. Starts at its `symphonyLevel` from the tuning. | From a per-dataset mixer slider, if you add one. |
| `playLegendSample(cfg, i)` | config, legend line number | Plays the example sound for `cfg.legend[i]`. Does nothing while the Symphony is loaded. | As each legend line is spoken or shown. |
| `outputLevel()` | nothing; returns dB | Loudness of the final mix right now. | Optional, for a level meter. |
| `retune()` | nothing | Re-applies `TUNING` after it was changed in code. | Only the sound lab needs it. |

### Other exports you might use

| File | Export | Use |
|---|---|---|
| `js/sound/tuning.js` | `TUNING` | All sound settings (master, scan, legend, one block per dataset). |
| `js/sound/tuning.js` | `tuned(cfg)` | The config with tuning merged in. Read sound settings from `tuned(cfg).sound`. |
| `js/sound/tuning.js` | `tuningChanged()`, `voiceSettings(name, sound)` | Internal helpers for the lab and the instruments. |
| `js/sound/scales.js` | `valueToNote(v, min, max, lowOct, highOct, scale)` | A data value to a note name such as `"E4"`. Useful for Explore mode (Jaden). |
| `js/sound/scales.js` | `valueRange(cfg)` | The `[min, max]` of the dataset's colour bar. |
| `js/sound/scales.js` | `valueToMidi`, `midiToNote`, `scaleNotes`, `parseScale`, `norm`, `SCALES`, `MAJOR_PENTATONIC` | Lower-level note helpers. |
| `js/sound/instruments.js` | `makeInstrument(name, destination, sound)`, `disposeInstrument`, `INSTRUMENT_NAMES` | Build one of the instruments yourself (for example for Explore or export). |
| `js/sound/mappers.js` | `MAPPERS`, `continuousField`, `events`, `density`, `layers`, `scanColumn`, `SILENT_DB` | The mapping rules. The engine calls these; you normally don't. |

### Examples

**Play mode**

```js
import { initAudio, loadDataset, playFrame, releaseAll, setVolume } from './sound/engine.js';

// first click on Play (or any key)
await initAudio();
setVolume(Number(volumeSlider.value));
loadDataset(cfg);

// every analysed frame
playFrame(analyze(video, cfg), cfg, video.currentTime);

// pause, seek, Esc
releaseAll();
```

**Scan mode**

```js
import { loadDataset, startScan, stopScan, releaseAll } from './sound/engine.js';

video.pause();
releaseAll();
loadDataset(cfg);                            // only needed if you came from Planet Symphony
const frame = analyze(video, cfg);           // the paused frame
startScan(cfg, () => frame, (col, notes) => {
  drawScanLine(col);                         // move the line on the overlay
  readout.textContent = `Column ${col + 1}: ${notes.join(' ')}`;
});

// leaving Scan mode, or Esc
stopScan();
releaseAll();
```

**Legend**

```js
import { loadDataset, playLegendSample } from './sound/engine.js';

loadDataset(cfg); // already loaded in Play mode; needed again after Planet Symphony
cfg.legend.forEach((line, i) => {
  setTimeout(() => {
    speak(`${line.sound} means ${line.means}`);
    playLegendSample(cfg, i);
  }, i * 2500);
});
```

**Planet Symphony**

```js
import { loadSymphony, playSymphonyFrame, setSymphonyLevel, loadDataset, releaseAll } from './sound/engine.js';

loadSymphony(allCfgs);

// every frame: analyse each dataset's video
const byId = {};
for (const c of allCfgs) byId[c.id] = analyze(videos[c.id], c);
playSymphonyFrame(byId);

// optional mixer slider per dataset
setSymphonyLevel('lightning', Number(slider.value));

// leaving the Symphony
releaseAll();
loadDataset(currentCfg);
```

## Part 2: for Aahana

### What the sound engine reads from `analyze()`

The engine reads these fields of the features object. Fields it doesn't need can be missing,
but keep the shape so the UI can rely on it.

| Field | Type | Range and meaning | Used by |
|---|---|---|---|
| `grid` | array of `grid.w * grid.h` numbers or `null` | One value per cell in data units (the colour bar's range, e.g. 0 to 30 °C). `null` = no data (land, labels, background). Stored row by row: index `y * w + x`, row 0 is the **north** edge, column 0 is the **west** edge. | sst (chord notes from the coldest, warmest and middle values), nightlights (lit share and note pitch), Scan mode for every dataset |
| `mean` | number or `null` | Average of the non-null grid values, in data units. | sst (main note), aerosols (chord shift), nightlights (one note when the grid has no values) |
| `max` | number or `null` | Highest grid value, in data units. | sst (tension note when above 28 °C) |
| `columns` | array of `grid.w` numbers or `null` | Mean of each column, column 0 = west. | Scan mode, only when `grid` has no values |
| `change` | number, 0 to 1 | Share of cells that changed noticeably since the last frame. Usually small: 0.25 already gives the brightest tone. | sst and aerosols (tone brightness) |
| `flashes` | array of flash objects, see below | New lightning flashes in this frame. | lightning (all of its sound) |
| `layers` | object, see below | Strength of each aerosol type. | aerosols (volume of each instrument) |
| `fake` | boolean | `true` only for sample data from `fakeFeatures()`. | sst (turns the tension note off, since the sample `max` is not real) |

### `flashes` (lightning)

```js
flashes: [
  { x: 12, y: 3, value: 0.9 },
  { x: 27, y: 10, value: 0.4 },
]
```

- `x`: whole number, grid column of the flash, 0 to `grid.w - 1` (0 = west edge). Sets left or right.
- `y`: whole number, grid row of the flash, 0 to `grid.h - 1` (**0 = north edge**). North flashes play higher.
- `value`: flash brightness in the colour bar's units (0 to 1 for lightning). Brighter = harder hit.
  If missing, the flash is played at full strength.
- **One object per new flash.** Every object becomes one drum hit, so only report a flash in the
  frame where it appears. If the same flash stays bright for three frames and you report it three
  times, it plays three times.
- Any number of flashes is fine; the engine plays the 4 brightest per frame.
- An empty array means no lightning, which is silence.

### `layers` (aerosols)

```js
layers: { dust: 0.7, smoke: 0.1, salt: 0.4, sulfate: 0 }
```

- Keys must be exactly `dust`, `smoke`, `salt` and `sulfate` (the instrument names in
  `datasets/aerosols.json`). Note it is `salt`, not `sea salt`.
- Values are numbers from 0 to 1: 0 = none of that aerosol on screen, 1 = as much as the
  visualization ever shows. A simple version: the share of cells whose colour matches that layer's
  colour, scaled so a heavy event reaches about 1.
- 0.02 or less is treated as absent and that instrument goes silent.
- Above 0.8 adds a tension note for that layer.
- A missing key counts as 0. An empty object `{}` means "not measured yet" and every layer plays at
  a fixed 30% (that is what happens today).

### Which dataset needs what

| Dataset | Needs |
|---|---|
| sst | `grid`, `mean`, `max`, `change` |
| lightning | `flashes` (and `grid` for Scan mode) |
| nightlights | `grid`, `mean` |
| aerosols | `layers`, `mean`, `change` (and `grid` for Scan mode) |
