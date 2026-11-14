# UI integration guide (for Hazel)

<!-- Owner: Hazel · Support: Freia -->

Hi Hazel! This guide explains everything on the `integration` branch that touches your area, so you can
review it, change what you don't like, and take it over. Everything here was checked against the real
code on `integration` at commit `1a1a097` and your `frontend` branch at commit `fd26dea`
(fetched on 14 Nov 2026, evening). If something here doesn't match what you see, trust the code and tell
Freia.

## Where to start

Your `frontend` branch already contains all of `integration` (you merged it in `fd26dea`), so you are not
behind. These are the five things to do first, in order:

1. **Fix the video size on `frontend`.** In your `index.html` the `<video id="video">` sits directly inside
   `.stage`, but your CSS only sizes `.media video`. In Chrome the video renders at 2048 by 1024 pixels
   inside a stage of about 964 by 542, so it is cropped. The overlay canvas is still the size of the stage,
   so the Explore cursor, the proof panel and the Scan column don't line up with the map. We tested it:
   the cursor was drawn over the Caribbean while the value was read from the middle of the real video
   (Africa). A rule like this fixes it:
   ```css
   .stage > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
   ```
   It must be `contain`, not `cover` (see "Contracts" below).
2. **Fix the "TODO: COPY FROM SVS PAGE" date.** Your `start()` in `js/main.js` does
   `{ ...fixtures[config.id], ...config }`, so the `dates` field from `datasets/*.json` (still a TODO for
   SST, lightning and aerosols) overwrites the nice dates in `js/presentation.js`. Either ask Celene and
   Aahana to fill in `dates` in the JSON files, or keep your fixture date while the JSON still says TODO.
3. **Bring in the latest `integration`** (it only adds this guide right now) and run the test checklist at
   the end of this guide on your branch.
4. **Connect Planet Symphony to the sound engine.** Your `#symphony` page is a timer preview with no sound
   yet. Section 5 has a plan and starter code.
5. **Do the screen reader and phone passes.** Nobody has tested NVDA, VoiceOver or a real phone yet.

## 1. Overview

### What `integration` adds compared with `main`

`main` is still the first project setup. `integration` = Aahana's `data` branch + Freia's `sound` branch +
the features below. Owners are from the README.

| Feature | Files touched | Commits | File owners |
|---|---|---|---|
| Real SST data (calibrated colour bar, new analyser, SST video) | `js/analyzer.js`, `js/colorbar.js`, `datasets/sst.json`, `media/sst.mp4`, `tools/` | `253e159`, `df267d2` | Aahana |
| Sound engine, tuning, sound lab, sound docs | `js/sound/*`, `tools/sound-lab.html`, `docs/` | `b13a7c5`, `0d8aac7`, `c609096`, `67567b0`, `43d1995` | Freia |
| Sample data while a video is missing | `js/player.js`, `js/sound/demo.js` | `df53f27`, `148b3ee` | Hazel (player), Freia (demo) |
| Scan mode wired to the engine | `js/player.js`, `js/main.js`, `docs/mapping-notes.md` | `441215a` | Hazel |
| Sonic legend before playback | `js/main.js`, `js/a11y.js`, `index.html`, `css/style.css` | `9f54dba` | Hazel |
| Explore mode with proof panel | `js/explore.js`, `js/sound/engine.js`, `js/sound/tuning.js`, `css/style.css` | `443e0f7`, `acbdba7`, `76a226e`, `1a1a097` | Jaden (explore), Freia (engine) |
| Accurate Explore colour matching | `js/colormatch.js`, `js/explore.js` | `1a1a097` | Jaden |
| Shareable links and Copy link | `js/main.js`, `index.html` | `1ee154e` | Hazel |
| Eyes-closed mode | `js/eyes.js`, `js/main.js`, `js/a11y.js`, `index.html`, `css/style.css`, `js/sound/engine.js` | `86eea82`, `6f61c84` | Hazel (eyes.js header says Hazel, support Freia) |
| Add your own visualization page | `add.html`, `js/add.js`, link in `index.html` | `a70abcc` | Freia (support Aahana, Hazel) |
| Record track | `js/sound/export.js`, `js/main.js`, `index.html` | `205d61e` | Jaden (export), Hazel (button) |
| Docs: SST notes and feature list | `README.md`, `docs/mapping-notes.md` | `bf6d560` | Celene |

The merge commits are `3feeffb` (data) and `4f58c4f` (sound). The small test fix in Aahana's
`tools/test_pipeline.mjs` is `94abf48`.

### What is yours from now on

- **Yours:** `index.html`, `css/style.css`, `js/main.js`, `js/player.js`, `js/a11y.js`, `js/eyes.js`, plus
  your new `js/landing.js` and `js/presentation.js`. You can restyle or rewrite any of these, as long as
  the contracts in section 4 still hold.
- **Freia (sound):** everything in `js/sound/` (engine, tuning, mappers, instruments, scales, demo),
  `tools/sound-lab.html`, the `sound` blocks in `datasets/*.json`, and `add.html` / `js/add.js`.
- **Aahana (data):** `js/analyzer.js`, `js/colorbar.js`, the `crop` and `colorbar` blocks in
  `datasets/*.json`, `media/`, the data tools in `tools/`.
- **Jaden (explore and export):** `js/explore.js`, `js/colormatch.js`, `js/sound/export.js`.
- **Celene:** `README.md`, `docs/`, the `description` and `legend` wording in the configs.

## 2. File by file

All diff commands are for PowerShell in VS Code (they also work in Git Bash). Run `git fetch --all` first.
They use the remote branch names, so you don't need local copies of `main` or `integration`.

### `index.html` (yours)

**What it does now.** The single page of the jukebox: dataset list, video stage with an overlay canvas,
player controls, info panel and the `#live` region. On `integration` it is still the simple first layout;
your `frontend` version replaces it with the landing page, hash routes and dialogs.

**What was added on `integration`:**
- `9f54dba`: the "Hear the legend before the data starts" checkbox `#legend-first` under the legend button.
- `1ee154e`: the `#share-btn` "Copy link" button in the controls.
- `86eea82`: the `#eyes-btn` "Eyes closed" button, the `.eyes-message` cover paragraph inside `.stage`,
  and the E shortcut in the shortcut list.
- `205d61e`: the `#record-btn` "Record track" button and the R shortcut in the list.
- `a70abcc`: a link to `add.html` in the header tagline.

**See the diff:** `git diff origin/main..origin/integration -- index.html`

**Free to change:** layout, wording, order, styling, where buttons live. **Keep:** the IDs and classes in
the contracts table (section 4), and `.eyes-message` must stay inside `.stage`.

### `css/style.css` (yours)

**What it does now.** The dark theme and layout. `integration` only added rules at the end of the file.

**What was added:**
- `9f54dba`: `.legend li.speaking` (highlights the legend line being read) and `.legend-first`.
- `443e0f7`: `.player-message { pointer-events: none; }` so Explore works over the "Video not found"
  message, an `.overlay:focus-visible` outline, and all the `.probe-*` styles for the proof panel.
- `86eea82` then `6f61c84`: eyes-closed styles. `6f61c84` matters: the video must **not** be hidden with
  `visibility: hidden` or `display: none`, because then `requestVideoFrameCallback` can stop and the
  music stops. Instead `.eyes-closed .eyes-message` is an opaque black cover on top:
  ```css
  .eyes-closed .eyes-message {
    display: flex; position: absolute; inset: 0; z-index: 5; margin: 0; padding: 1.5rem;
    background: #000;
  ```

**See the diff:** `git diff origin/main..origin/integration -- css/style.css`

**Free to change:** colours, sizes, fonts, the look of the proof panel and the cover. **Keep:** the video
visible (cover it, never hide it), `pointer-events: none` on anything that sits above the overlay canvas,
and the video and canvas covering exactly the same box (see section 4).

### `js/main.js` (yours)

**What it does now.** Loads the dataset configs, builds the list, wires every control and keyboard
shortcut, and talks to the player, the sound engine, eyes.js and export.js. Your `frontend` version is a
big rewrite with hash routes; the integration features are all in it except the integration version of
shareable links (you wrote your own, see section 3).

**What was added or changed on `integration`:**
- `441215a`: `setMode` became `async` and calls `ensureAudio()` first, because Scan makes sound straight
  away. `selectDataset` now calls `loadDataset(cfg)` **before** `player.load(cfg)`, so Scan can start on
  the new dataset. `togglePlay` leaves Scan mode before playing.
- `9f54dba`: `playLegend()` became the sonic legend (speak a line, play its example, next line), with
  `legendRun` to cancel it and `legendHeard` so "legend first" only happens once per dataset.
  `stopAll()` bumps `legendRun` so Escape cancels the legend.
- `1ee154e`: shareable links: `pendingMode`, `updateUrl()`, `copyLink()`, `applyUrl()`, and
  `ensureAudio()` now returns true when it applied a mode from a link.
- `86eea82` then `6f61c84`: `toggleEyes()` and the E key.
- `205d61e`: `toggleRecord()` and the R key.

**See the diff:** `git diff origin/main..origin/integration -- js/main.js`
(or one feature: `git show 9f54dba -- js/main.js`)

**Free to change:** all of it, it is your file, and you already rewrote it. **Keep:** the call order rules
in section 4 (audio after a click, `loadDataset` before `player.load`, `releaseAll` on stop).

### `js/player.js` (yours)

**What it does now.** Drives the video and the frame loop: every 0.25 s of media time it analyses the
frame, sends it to the sound engine and updates the readout. It also runs Scan mode and turns Explore
mode on and off.

**What was added or changed:**
- `df53f27` then `148b3ee`: when the video is missing, the loop uses sample data from
  `js/sound/demo.js` instead of the analyser (the new analyser returns empty data when there is no video,
  which would be silence).
- `441215a`: `analyseNow()`, `latestFeatures()`, `startScanning()`, `stopScanning()`, `isScanning()` and
  `drawScanColumn()`. The old time-based scan line `drawScanLine` and `SCAN_SECONDS` were removed.
  `pause()` and `setMode()` stop Scan.
- `acbdba7`: `drawScanColumn()` allows for letterboxing (the SST video is 2 to 1 inside a 16 by 9 stage).

**See the diff:** `git diff origin/main..origin/integration -- js/player.js`

**Free to change:** messages and wording, how the scan column looks. **Keep:** the exports (main.js and
eyes.js use `latestFeatures`, `isPlaying`, `isScanning`), `STEP = 0.25`, and the rule that every frame
goes through `analyseNow()` so Scan, Explore and eyes-closed see the same data.

### `js/a11y.js` (yours)

**What it does now.** Screen reader announcements (`announce`), speech (`speak`), vibration (`buzz`),
time formatting and the frame description (`describe`).

**What was added:**
- `9f54dba`: `speakAndWait(text, maxMs)`, which speaks and resolves when the line is done (or after
  `maxMs`). The sonic legend uses it.
- `86eea82`: `setDataAnnouncements(on)` and a check in `announce()`, so eyes-closed mode can turn off the
  throttled data lines (its spoken summaries replace them).

**See the diff:** `git diff origin/main..origin/integration -- js/a11y.js`

**Keep:** `announce(text, { data })` and its 5 second throttle for data lines, and the element it writes
to (`#live`, and the readout element, see section 4). On `frontend` you changed `describe` to write to
`#readout-value`; that is fine.

### `js/eyes.js` (new, yours)

**What it does now.** Eyes-closed mode. It adds the `eyes-closed` class to `<body>`, turns off the data
announcements, speaks a short intro and a first summary straight away, then one summary every 8 seconds
while playing. The music dips 6 dB while it talks.

**Added in:** `86eea82`, rewritten for reliability in `6f61c84` (voices loaded first, English voice,
summaries only cut off when the next is due, shorter wording, ducking).

**See it:** `git show origin/integration:js/eyes.js`

**Free to change:** the wording in `summarize()`. **Keep:** the speech logic in `say()` (Chrome needs the
small pause after `cancel()` and the `resume()` call), and `duckMusic(false)` on exit.

### `js/explore.js` and `js/colormatch.js` (Jaden's, the UI depends on them)

**What they do now.** `explore.js` turns on Explore mode on the overlay canvas: pointer or arrow keys pick
a spot, it reads the colour there, plays the note, buzzes on hotspots, fills the proof panel and announces
a sentence. `colormatch.js` does the colour reading: a 7 by 7 pixel patch, skipping white lines, grey land
and the dark background, matched to the colour bar in CIELAB, with the median value, or the nearest ocean
pixel within 10 pixels.

**Added in:** `443e0f7` (first version), `acbdba7` (letterbox fix), `76a226e` (wording), `1a1a097`
(colour patch and CIELAB matching, misses explained, `?debug=1`).

**See the diff:** `git diff origin/main..origin/integration -- js/explore.js js/colormatch.js`

**What touches your area:** explore.js creates the proof panel (`#probe`) and inserts it right after the
readout element, and while Explore is on it changes the canvas: `tabindex="0"`, `role="application"`,
`aria-roledescription="map explorer"` and a new `aria-label`. It restores them when Explore turns off.
You can restyle the panel with the `.probe-*` classes.

### `js/sound/demo.js` (Freia's)

Sample features shaped for each dataset (drifting storm flashes for lightning, growing city lights,
changing aerosol layers), always with `fake: true`. The player uses it when a video is missing. Added in
`148b3ee`. You don't need to change it.

### `js/sound/export.js` (Jaden's)

`startRecording()`, `stopRecording(name)` and `isRecording()`. It connects a `Tone.Recorder` to the
speakers output and downloads a `.webm` file (or `.mp4` in Safari). The offline WAV export is still a
TODO for Jaden. Added in `205d61e`.

### `add.html` and `js/add.js` (Freia's)

A separate page: load a video or image, drag the map box, click the two ends of the colour bar, type the
values, play it with the same engine, download the config. It has its own `#live` region and uses
`css/style.css`. Added in `a70abcc`. Your `frontend` navigation already links to it ("Add visualization").
If you restyle `style.css`, check this page still looks fine, since it reuses `.panel`, `.stage`,
`.player-message`, `.readout`, `.skip-link`, `.site-header` and `.visually-hidden`.

## 3. How each feature is wired

The excerpts are copied from the real code on `integration`.

### Play mode sync loop

- **Trigger:** Play button `#play-btn` or Space, in `main.js` `togglePlay()`.
- **Order:** `ensureAudio()` (starts Tone.js the first time) then, if "legend first" applies,
  `playLegend()`, then `player.play()`. The player plays the video and starts `loop()`:

```js
function loop() {
  if (!playing) return;
  const useVfc = !missing && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  if (useVfc) {
    vfcId = video.requestVideoFrameCallback((_now, meta) => { tick(meta.mediaTime); loop(); });
  } else {
    rafId = requestAnimationFrame(() => { tick(currentTime()); loop(); });
  }
}
```

  `tick(t)` runs at most every 0.25 s of media time and calls `analyseNow(t)` (analyser or sample data),
  then `playFrame(features, cfg, t)` in `js/sound/engine.js`, then `describe(features, cfg, t)` in
  `js/a11y.js`.
- **Pause, seek, Escape:** `player.pause()` and `player.seek()` both call `releaseAll()` in the engine.

### Sonic legend

- **UI:** the legend button (`#legend-btn` on integration, `#legend-button` on frontend), the
  `#legend-first` checkbox, the `#legend` list.
- **Trigger:** the button, the L key, or pressing Play the first time for a dataset while the checkbox is on.
- **Order:** `playLegend()` in `main.js` pauses the player, then for each line calls `speakAndWait()` from
  `js/a11y.js`, then `playLegendSample(cfg, i)` from `js/sound/engine.js`, then waits 2.2 s:

```js
for (let i = 0; i < cfg.legend.length; i++) {
  if (stopped()) break;
  items.forEach((li, k) => li.classList.toggle('speaking', k === i));
  await speakAndWait(`${cfg.legend[i].sound} means ${cfg.legend[i].means}.`);
  if (stopped()) break;
  playLegendSample(cfg, i);
  await wait(2200);
}
```

- **Cancel:** Escape calls `stopAll()`, which does `legendRun++`; picking another dataset also stops it.
  The dataset is added to `legendHeard` at the start, so skipping counts as heard.

### Scan mode

- **UI:** the Scan mode button (`.mode-btn[data-mode="scan"]` on integration, `[data-mode="scan"]` on
  frontend), the overlay canvas, the readout.
- **Trigger on integration:** the Scan button or M key, then `setMode('scan')` in `main.js`, then
  `player.setMode('scan')`. On `frontend` your `togglePlay()` starts it when the route is `#scan`.
- **Order inside the player:** pause the video, analyse the current frame once, `describe()` it, then
  start the engine's sweep:

```js
startScan(cfg, () => frame, (col, notes) => {
  drawScanColumn(col);
  const text = `Column ${col + 1} of ${cfg.grid.w}, west to east: ${notes.join(' ') || 'no data'}`;
  const readout = document.getElementById('readout');
  if (readout) readout.textContent = text;
});
```

  `startScan` is in `js/sound/engine.js` (one column per sixteenth note at 90 BPM, using Tone.Transport).
- **Stop:** `player.setMode()` to any mode, or `player.pause()`, calls `stopScanning()`, which calls
  `stopScan()` and `releaseAll()`. If the frame isn't decoded yet, `startScanning()` waits for
  `loadeddata` or `error` and tries again.

### Explore mode, proof panel and debug flag

- **UI:** the Explore mode button, the overlay canvas `#overlay`, the proof panel `#probe` (created by
  explore.js after the readout element).
- **Trigger:** `player.setMode('explore')` calls `enableExplore(canvas, cfg)` in `js/explore.js`; the
  function it returns turns Explore off again.
- **Order for one spot:** pointer or arrow key, then `readSpot()` copies a small square of the video at
  full size and calls `readPatch()` in `js/colormatch.js`, then `playProbe(cfg, value, col)` in
  `js/sound/engine.js` plays the note, `buzz(30)` from `js/a11y.js` on hotspots, `updatePanel()` fills the
  proof panel, and `announce()` speaks one sentence (at most every 0.7 s while dragging).
- **Keys:** the arrow keys, Home, End and Enter are handled on the canvas itself and call
  `e.stopPropagation()`, so they don't also scrub or change the volume:

```js
e.preventDefault();
e.stopPropagation(); // keep the arrows from scrubbing or changing the volume
probe(true);
```

- **Debug:** add `?debug=1` to the address. A magenta cross and box show the exact source pixel and the
  7 by 7 patch that were read, and a cyan dot shows the pixel whose colour is in the panel.

### Eyes-closed mode

- **UI:** `#eyes-btn` (with `aria-pressed`), the `.eyes-message` cover inside `.stage`.
- **Trigger:** the button or the E key, in `main.js` `toggleEyes()`, which calls
  `setEyesClosed(on, src)` in `js/eyes.js` with three getters:

```js
setEyesClosed(eyesClosed, {
  getFeatures: player.latestFeatures,
  getCfg: () => current,
  isPlaying: player.isPlaying,
});
```

- **Order inside eyes.js:** add the `eyes-closed` class to `<body>` (CSS shows the black cover), call
  `setDataAnnouncements(false)` in `js/a11y.js`, wait for speech voices, say the intro, say a first
  summary, then a summary every 8 seconds (start to start) while playing. Each spoken line calls
  `duckMusic(true)` from `js/sound/engine.js` when it starts and `duckMusic(false)` when speech ends.
  Turning it off removes the class, turns data announcements back on and un-ducks.

### Shareable links

- **On `integration`:** the address is kept up to date with `history.replaceState` (`updateUrl()` on
  dataset change, mode change, pause and scrub). `#share-btn` calls `copyLink()`. On load,
  `applyUrl()` selects the dataset, seeks after `loadedmetadata`, and stores the mode in `pendingMode`,
  which is applied on the first click or key press (browsers block sound before that).
- **On `frontend`:** you replaced this with your own version. The Copy link button builds
  `?dataset=...&t=...&mode=...` from the current state, and `start()` reads `dataset` and `t` and sets
  the `#hash` route from `mode`. That works with your routing, so keep yours. One difference: on yours,
  `mode=scan` opens the Scan route but the sweep only starts when the user presses Play. That seems fine.

### Record track

- **UI:** `#record-btn` (with `aria-pressed`, text switches to "Stop and download").
- **Trigger:** the button or the R key, in `main.js` `toggleRecord()`.
- **Order:** `ensureAudio()`, then `startRecording()` from `js/sound/export.js`; the second press calls
  `stopRecording(`${id}-earth-jukebox`)`, which stops the recorder and triggers the download.

### Sample data when a video is missing

- The video `error` event in `player.js` sets `missing = true` and shows the "Video not found" message.
- The player then runs a simulated clock and `analyseNow()` uses sample data:

```js
function analyseNow(t) {
  latest = missing ? demoFeatures(cfg, t) : analyze(video, cfg);
  return latest;
}
```

- `describe()` adds "(sample data)" to the readout because the features have `fake: true`.
- Right now this is what lightning, night lights and aerosols do, because only `media/sst.mp4` exists.

### Add your own visualization (`add.html`)

- **Separate page**, script `js/add.js`. Steps: file input (video or image), "Draw the map box" (drag on
  the preview, or type numbers), "Click the two ends of the colour bar" (or type numbers), "Read the
  colour bar", sound choices, Play and Stop, "Download config".
- **Calls:** `analyze()` from `js/analyzer.js` for the check line and for playback, `initAudio()`,
  `loadDataset()`, `playFrame()` and `releaseAll()` from `js/sound/engine.js`, and `announce()` from
  `js/a11y.js` (with its own `#live` region). Escape stops playback and cancels picking.

## 4. Contracts to keep

### Functions your files call in other modules

The full sound list with arguments and examples is in `docs/sound-integration.md`, so this table is the
short version.

| Function | File | Arguments | When to call it |
|---|---|---|---|
| `initAudio()` | `js/sound/engine.js` | none, returns a Promise | Inside a click or key press, before any sound. Safe to call twice. |
| `setVolume(db)` | `js/sound/engine.js` | dB, 0 is full, default -8 | Volume slider, and once after `initAudio`. |
| `loadDataset(cfg)` | `js/sound/engine.js` | dataset config as loaded | On dataset change, **before** `player.load(cfg)`, and when leaving Planet Symphony. |
| `releaseAll()` | `js/sound/engine.js` | none | Stop, Escape. Pause and seek in the player already call it. |
| `playLegendSample(cfg, i)` | `js/sound/engine.js` | config, legend line index | During the sonic legend. Does nothing while Planet Symphony is loaded. |
| `loadSymphony`, `playSymphonyFrame`, `setSymphonyLevel` | `js/sound/engine.js` | see section 5 | Planet Symphony. |
| `startRecording()`, `stopRecording(name)`, `isRecording()` | `js/sound/export.js` | file name without extension | Record button. Audio must be started first. |
| `setEyesClosed(on, src)` | `js/eyes.js` | true or false, and `{ getFeatures, getCfg, isPlaying }` | Eyes-closed toggle. |
| `load`, `play`, `pause`, `seek`, `setMode`, `currentTime`, `duration`, `isPlaying`, `isScanning`, `latestFeatures` | `js/player.js` | as in the file | Your controls. |
| `announce`, `speak`, `speakAndWait`, `formatTime`, `buzz` | `js/a11y.js` | as in the file | Anywhere in the UI. |
| `tuned(cfg)` | `js/sound/tuning.js` | config | If you need a sound setting in the UI (for example `tuned(cfg).sound.symphonyLevel`). The JSON files no longer hold those numbers. |

### Element IDs, ARIA and classes other modules rely on

These are used by files that are not `main.js`, so renaming them breaks something. IDs that only
`main.js` uses (like `#play-btn` or `#share-btn`) are yours to rename freely.

| Name | Type | Used by | What breaks if it changes |
|---|---|---|---|
| `#live` | element with `aria-live="polite"` (or `role="status"`) | `js/a11y.js` `announce()` | All screen reader announcements. |
| `#readout` on integration, `#readout-value` on frontend | element | `js/a11y.js` `describe()`, `js/player.js` scan text, `js/explore.js` puts `#probe` right after it | Live readout, scan readout, and where the proof panel appears. All three files must use the same ID (they do on both branches). |
| `#video` | `<video>`, `muted`, `playsinline`, `aria-hidden="true"` | `js/player.js`, `js/explore.js` | Playback, analysis, Explore. |
| `#overlay` | `<canvas width="1280" height="720" class="overlay">` | `js/player.js`, `js/explore.js` | Scan drawing, Explore. Must be 16 by 9 and cover exactly the same box as the video. |
| `#player-message` | element | `js/player.js` | The "Video not found" message. Keep `pointer-events: none` on it. |
| `#probe` and `.probe-*` | created by explore.js | `js/explore.js`, your CSS | Don't create your own `#probe`. |
| `.stage` containing `.eyes-message` | layout and cover | your CSS, `js/eyes.js` (via the body class) | The black cover in eyes-closed mode. |
| `body.eyes-closed` | class set by `js/eyes.js` | your CSS | The cover won't show. |
| `.overlay.scanning` | class set by `js/player.js` | your CSS (hidden with reduced motion) | The scan line respecting reduced motion. |
| `li.speaking` inside the legend list | class set by `main.js` | your CSS | The legend highlight. |
| canvas `tabindex`, `role`, `aria-roledescription`, `aria-label` | changed by `js/explore.js` during Explore | screen readers | Keyboard Explore. explore.js restores your values afterwards, so set them in HTML as you like. |
| `<video>` fills the stage with `object-fit: contain` | CSS | `js/player.js` `drawScanColumn()`, `js/explore.js` `fit()` | Scan column and Explore cursor won't line up with the map (this is the current bug on `frontend`). |

### Keyboard shortcuts

| Key | What it does | Handled in |
|---|---|---|
| Space | Play or pause (in Scan mode on integration: back to Play) | `main.js` `onKey` |
| Left and Right arrows | Scrub 5 seconds | `main.js` |
| Up and Down arrows | Volume 2 dB | `main.js` |
| 1 to 4 | Pick a dataset | `main.js` |
| M | Next mode (Play, Scan, Explore) | `main.js` |
| L | Sonic legend | `main.js` |
| D | Speak the readout | `main.js` |
| E | Eyes-closed mode | `main.js` |
| R | Record track, then stop and download | `main.js` |
| Escape | Stop sound, speech and the legend | `main.js` |
| Arrows, Home, End, Enter (when the map has focus in Explore) | Move the spot, jump west or east, replay | `js/explore.js` (stops the event so `main.js` doesn't see it) |
| Escape on `add.html` | Stop and cancel picking | `js/add.js` |

On `frontend`, `onKey` only runs in the jukebox view, when a dataset is chosen and no dialog is open.
That's a good rule, keep it.

## 5. Planet Symphony UI (still your task)

### What the engine already gives you (`js/sound/engine.js`)

- `loadSymphony(cfgs)`: unloads the single dataset and loads every dataset on its own mixer channel.
  Each channel starts at that dataset's `symphonyLevel` from `js/sound/tuning.js` (sst -6, lightning -4,
  night lights -8, aerosols -8 dB, on top of each dataset's normal level).
- `playSymphonyFrame(featuresById)`: plays one frame of every dataset. Pass `{ sst: f1, lightning: f2, ... }`;
  missing ids are skipped.
- `setSymphonyLevel(id, db)`: moves one dataset's level (about -40 to +6 dB is a sensible slider range).
- To leave the Symphony, call `releaseAll()` and then `loadDataset(dataset)` again.

### Suggested UI

- A 2 by 2 grid of tiles (your `#tiles` already does this), each with a real `<video>` when there is one,
  and your preview image otherwise.
- One level slider per tile, labelled with the dataset name, with `aria-valuetext` like "-6 decibels".
- One Play or Stop button for the whole Symphony, plus Escape to stop. Space can toggle it too.
- Announce what is real: right now that is "1 real dataset and 3 on sample data". Show "(sample data)"
  on those tiles too, so nobody thinks it is real.
- Respect reduced motion: don't autoplay the four videos if the user prefers reduced motion.

### Starter code

This follows your `frontend` style (`byId`, `dataset`, `ensureAudio`). It is a starting point and
hasn't been run.

```js
import { loadSymphony, playSymphonyFrame, setSymphonyLevel, loadDataset, releaseAll } from './sound/engine.js';
import { analyze } from './analyzer.js';
import { demoFeatures } from './sound/demo.js';
import { tuned } from './sound/tuning.js';

const symphonyVideos = {}; // dataset id: <video> in its tile, only for datasets with a real file
let symphonyTimer = null;

async function startSymphony() {
  await ensureAudio();
  player.pause();
  loadSymphony(datasets);
  const t0 = performance.now();
  for (const v of Object.values(symphonyVideos)) v.play().catch(() => {});
  symphonyTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const byId = {};
    for (const data of datasets) {
      const v = symphonyVideos[data.id];
      byId[data.id] = v && v.readyState >= 2 ? analyze(v, data) : demoFeatures(data, t);
    }
    playSymphonyFrame(byId);
  }, 250);
  const real = datasets.filter((d) => symphonyVideos[d.id]).length;
  announce(`Planet Symphony playing. ${real} real, ${datasets.length - real} on sample data.`);
}

function stopSymphony() {
  clearInterval(symphonyTimer);
  symphonyTimer = null;
  for (const v of Object.values(symphonyVideos)) v.pause();
  releaseAll();
  if (dataset) loadDataset(dataset); // back to the single-dataset engine
  announce('Planet Symphony stopped.');
}

function levelSlider(data) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = -40;
  input.max = 6;
  input.value = tuned(data).sound.symphonyLevel ?? -6;
  input.setAttribute('aria-valuetext', `${input.value} decibels`);
  input.addEventListener('input', () => {
    setSymphonyLevel(data.id, Number(input.value));
    input.setAttribute('aria-valuetext', `${input.value} decibels`);
  });
  label.append(`${data.title} level `, input);
  return label;
}
```

**One thing to know (unsure, ask Aahana):** `analyze()` keeps one "previous frame" for the whole app to
work out `change`. If you call it for four videos in a row, `change` will compare different datasets, so
the SST brightness sweep may jump around in the Symphony. Pitch and everything else are fine. A real fix
would be per-dataset state in `analyzer.js`, which is Aahana's file.

## 6. How to merge with your work

### You have a branch: `frontend`

`frontend` already contains every `integration` commit up to `1a1a097` (we checked: `integration` is an
ancestor of `frontend`). The only newer `integration` commit is this guide. So:

**Bring the latest `integration` into `frontend` (PowerShell in VS Code):**

```powershell
git fetch --all
git checkout frontend
git pull
git merge origin/integration
git push
```

Right now this only adds `docs/ui-integration-guide.md`, so there should be no conflicts.

**If later `integration` commits touch your files and you get conflicts**, open each file in VS Code and
use the "Accept Current" or "Accept Incoming" buttons:

| File | What to keep |
|---|---|
| `index.html` | Yours (current). Then check the contracts table: the IDs other modules need must still be there. |
| `css/style.css` | Yours, then copy in any new rules from integration at the end of the file (they are usually small and self-contained). |
| `js/main.js` | Yours. Then copy in only the new feature logic from the integration side (look at that commit with `git show <hash> -- js/main.js`). |
| `js/player.js`, `js/a11y.js` | Usually integration (incoming), then re-apply your `readout-value` ID change. |
| `js/explore.js` | Integration (incoming), then re-apply your `readout-value` ID change. |
| Anything in `js/sound/`, `js/analyzer.js`, `js/colorbar.js`, `datasets/` | Always integration (incoming). Those belong to Freia and Aahana. |

After fixing a file:

```powershell
git add index.html
git commit
git push
```

**Merging into `main`:** don't do this alone, decide with the team at a stand-up. Because `frontend`
already contains `integration`, merging `frontend` into `main` brings everything. Whoever does it should
run the checklist below first.

### If you had no branch

Just in case someone else needs it: start from `integration` and work there.

```powershell
git fetch --all
git checkout -b my-ui origin/integration
git push -u origin my-ui
```

## 7. Test checklist

Use Live Server (Python's simple server can't seek inside videos, so the scrubber and links with a time
don't work there). Start every test with the Network tab open, to see that `media/sst.mp4` loads.

### Desktop, Chrome or Edge

1. Open the jukebox and pick SST. Press Play. With the legend box ticked you should hear the legend first
   (each line read out, then its example notes). Then the video plays and you hear a soft pad that
   changes with the picture. The readout shows something like "average 20.3 °C, highest 30.8 °C".
2. Press Escape. Everything goes quiet, including speech.
3. Go to Scan and press Play. A yellow column steps across the map from left to right and the readout
   says "Column N of 32, west to east" with note names. The column should sit exactly on the map.
4. Go to Explore and click the warm tropical Pacific. The yellow box sits under your pointer, you hear one
   note, and the proof panel shows a red or orange swatch, a marker near the right end of the bar and a
   value around 28 to 30 °C. Click land: "Land or no data here."
5. Add `?debug=1` to the address and repeat step 4: the magenta cross must be under the pointer.
6. Press E while playing. The picture goes black, the music keeps playing, and you hear "Eyes-closed mode
   on" and a summary like "Currents 21 degrees. Hottest 31." The music dips a little while the voice
   talks. Press E again.
7. Press R, wait 5 seconds, press R again. A `.webm` file downloads and plays back the music.
8. Copy link, open it in a new tab, click once: same dataset, time and mode.
9. Pick lightning, night lights and aerosols. Each says "Video not found" and plays sample sound, and the
   readout ends with "(sample data)".
10. Open `add.html` and check it still looks right with your new styles.

### Phone (touch, vibration, layout)

1. Open the Live Server address from your phone on the same Wi-Fi (your laptop's IP and port).
2. Tap to start audio, then Play SST. Check the layout has no sideways scrolling and the controls are big
   enough to tap.
3. In Explore, drag a finger over the map. The page must not scroll, notes should follow your finger, and
   an Android phone should buzz on very warm water (iPhones don't support vibration in the browser).
4. Rotate the phone and check the overlay still lines up with the map.

### Keyboard only

1. Unplug the mouse. Tab through the page: every control should show a clear focus outline, in a sensible
   order.
2. Use Space, the arrows, 1 to 4, M, L, D, E, R and Escape from the shortcut table.
3. In Explore, Tab to the map, then use the arrows, Home, End and Enter. The arrows must move the spot,
   not scrub the video or change the volume.
4. Open and close every dialog with the keyboard only. Focus should return to the button that opened it.

### NVDA screen reader

1. Start NVDA, open the page in Chrome or Edge, and press NVDA+Space if needed to leave browse mode on
   the controls.
2. Pick a dataset: you should hear "... selected". Press Play: "Playing ...", then data lines at most
   every 5 seconds.
3. Explore: on the map, NVDA should say it is a "map explorer". Each arrow press reads a sentence like
   "Row 7, column 9, west. 25.6 degrees Celsius, note D5."
4. Eyes-closed mode: NVDA should stop reading data lines while the built-in voice speaks the summaries.
   Note whether the two voices clash; if they do, tell Freia.
5. Check that each button is read with its name and its pressed state (Eyes closed, Record track, modes).

### Known issues and limits

- Only SST has real data. Lightning, night lights and aerosols use sample data until Aahana adds their
  videos and calibration (lightning also needs `flashes`, aerosols needs `layers`).
- Explore uses CIELAB matching on a pixel patch (`js/colormatch.js`), while the analyser that drives the
  music uses Aahana's RGB matching (`js/colorbar.js`). They can differ by a degree or two on the same
  spot (for example 25.6 vs 27.4 °C in the Gulf of Mexico). This was left alone on purpose, so Aahana's
  validated results don't change.
- Only Chrome on Windows desktop has been tested. Not yet: Edge (it should behave like Chrome), Firefox,
  Safari, phones, NVDA and VoiceOver.
- `frontend` has the video sizing bug from "Where to start". Until it is fixed, Explore and Scan are
  misaligned on your layout.
- The `frontend` Planet Symphony page is a visual preview with a timer; it doesn't play sound yet.
- Speech timing depends on the voice. With the Windows "David" voice a short summary takes about
  4 seconds.
- `frontend` adds `js/vendor/three.module.js` (about 1.2 MB) for the landing globe. Worth checking how
  long the first load takes on a phone.
