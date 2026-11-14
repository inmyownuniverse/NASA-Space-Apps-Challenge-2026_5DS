# Earth Jukebox

<!-- Owner: Celene · Support: Hazel -->

**Pick a NASA Earth visualization and hear it as live music made from the real data in every frame — for sighted and blind listeners alike.**

Built for the NASA Space Apps Challenge 2026 (Nov 14–15, 2026).

## The problem

NASA's Earth Information Center (EIC) visualizations are visual-only. People who are blind or have low vision can't experience them, and even sighted visitors only get one sense. TODO(Celene): expand with who we're building for and why it matters.

## Our solution

Earth Jukebox turns EIC visualizations into sound (sonification). Three pillars:

1. **Data-faithful.** We invert each visualization's colorbar to turn a pixel's colour back into the real data value (e.g. °C), so pitch means real temperature, not just "redness".
2. **Explorable by touch.** Move a finger, mouse or arrow keys over the map and hear the value at that spot; phones vibrate on hotspots.
3. **Any visualization.** One engine plus one JSON config per dataset; a new EIC visualization becomes playable with no code changes.

Modes: **Play** (sound follows the video), **Scan** (a line sweeps west → east, each column becomes a chord), **Explore** (touch / mouse / keys to hear one spot, with a proof panel showing pixel colour, colour bar position, value and note), and **Planet Symphony** (all four datasets layered; sound engine ready, not in the UI yet).

Also: a **sonic legend** before playback, **eyes-closed mode** (E) with spoken summaries, **shareable links** (`?dataset=sst&t=30&mode=scan`), **Record track** (R), and **[Add your own visualization](add.html)**, which turns any video or image with a colour bar into a playable config. See `docs/mapping-notes.md` for plain notes on each.

## How it works

```
video frame → crop & grid → colorbar inversion → mapping rules → Tone.js → sound + accessible output
```

| Step | File |
|---|---|
| Read the current frame, crop it, split it into a 32 × 16 grid | `js/analyzer.js` |
| Turn each cell's colour back into a data value | `js/colorbar.js` |
| Map values to notes, rhythm, density or layers | `js/sound/mappers.js`, `js/sound/scales.js` |
| Play it with Tone.js | `js/sound/engine.js`, `js/sound/instruments.js` |
| Announce, speak and vibrate | `js/a11y.js` |
| Video loop, modes and controls | `js/player.js`, `js/main.js`, `js/explore.js` |

Each dataset is described by a config in `datasets/` (crop box, grid, colorbar stops, sound settings, legend). TODO(Celene): add a diagram.

## Datasets

All visualizations are by the [NASA Scientific Visualization Studio (SVS)](https://svs.gsfc.nasa.gov/).

| Dataset | Source |
|---|---|
| Lightning from the ISS | https://svs.gsfc.nasa.gov/5011/ |
| Night Lights 2012–2023 | https://svs.gsfc.nasa.gov/5313/ |
| Sea Surface Currents and Temperature | https://svs.gsfc.nasa.gov/3912/ |
| GEOS Aerosols | https://svs.gsfc.nasa.gov/5669/ |

## How to run locally

1. Clone the repo:
   ```
   git clone https://github.com/inmyownuniverse/NASA-Space-Apps-Challenge-2026_5DS.git
   ```
2. Open the folder in VS Code and install the recommended **Live Server** extension.
3. Right-click `index.html` → **Open with Live Server**. (It must be served over http — opening the file directly with `file://` won't work.)
   No VS Code? Run `python -m http.server` in the folder and open http://localhost:8000.
   (Python's simple server can't jump around inside videos, so scrubbing and shared links with a time
   work best with Live Server.)
4. Download the 720p MP4s from the SVS pages into `media/` (see `media/README.md`). Without them the app still plays sample sound so you can work on everything else.

Optional colorbar tool: `pip install -r tools/requirements.txt`, then `python tools/sample_colorbar.py --help`.

## Team & roles

| Person | Role | Owns |
|---|---|---|
| Aahana | Data & Vision | `js/analyzer.js`, `js/colorbar.js`, `datasets/`, `media/`, `tools/` |
| Freia | Sound Design | `js/sound/` (engine, scales, instruments, mappers) |
| Hazel | Frontend & Accessibility | `index.html`, `css/`, `js/main.js`, `js/player.js`, `js/a11y.js`, deploy |
| Celene | Story & Product (also helps Hazel / Aahana) | `README.md`, `docs/`, spoken text in configs |
| Jaden | Support for Freia and Hazel | `js/explore.js`, `js/sound/export.js` |

Search the code for `TODO(YourName)` to find your tasks.

## Branch workflow

- `main` must always run.
- Create your own branch from `main`:
  `data` (Aahana) · `sound` (Freia) · `ui` (Hazel) · `explore-export` (Jaden) · `docs` (Celene)
  ```
  git checkout main && git pull
  git checkout -b sound
  ```
- Pull `main` before starting; merge back at least every 2 hours.
- Merges happen at stand-ups: **5 pm, 9 pm, 9 am IST**.
- Stay inside your own files where possible. Shared files (`datasets/*.json`) are split by block: Aahana owns `crop` / `colorbar`, Freia owns `sound`.

## License

MIT. NASA visualizations are courtesy of the NASA Scientific Visualization Studio.
