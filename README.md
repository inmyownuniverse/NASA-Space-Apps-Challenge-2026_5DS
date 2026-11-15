# Earth Jukebox

<!-- Owner: Celene · Support: Hazel -->

**Pick a NASA Earth visualization and hear it as live music made from the real data in every frame — for sighted and blind listeners alike.**

Built for the NASA Space Apps Challenge 2026 (Nov 14–15, 2026).

## The problem

NASA's Earth Information Center (EIC) visualizations convey patterns through color and motion. Those cues can be inaccessible to blind and low-vision visitors. Sound gives visitors another way to follow change over time and compare locations.

## Our solution

Earth Jukebox turns EIC visualizations into sound (sonification). Three pillars:

1. **Data-faithful.** The sound comes from what the data in each frame shows, not from how pretty the colours are. For sea surface temperature we invert the colour bar to turn a pixel's colour back into the real value in °C, so pitch means real temperature, not just "redness". For night lights, lightning and aerosols we measure what the picture shows: how bright each area is, each new lightning strike, and which aerosol type each coloured pixel belongs to.
2. **Explorable by touch.** Move a finger, mouse or arrow keys over the map and hear the value at that spot; phones vibrate on hotspots.
3. **Any visualization.** One engine plus one JSON config per dataset; a new visualization with a supported colour bar can be configured without changing the engine.

Modes: **Play** (sound follows the video), **Scan** (a line sweeps west → east, each column becomes a chord), **Explore** (a globe or a flat map: click, drag or use the arrow keys to hear any spot, or pick a marked location; the proof panel shows the pixel colour, its place on the colour bar, the value and the note), and **Planet Symphony** (all four datasets playing together, each with its own level slider).

Also: a **sonic legend** before playback, **eyes-closed mode** (E) with spoken summaries, **shareable links** (`?dataset=sst&t=30&mode=scan`), **Record track** (R), and **[Add your own visualization](add.html)**, which turns any video or image with a colour bar into a playable config. See `docs/mapping-notes.md` for plain notes on each.

### Keyboard shortcuts

On Play and Scan, use Space for playback, left/right to seek, up/down for volume, 1–4 to select a dataset, M to cycle modes, L for the legend, D for a spoken reading, E for eyes-closed mode, R to record, and Escape to stop sound. Symphony supports Space and Escape. In Explore, Tab to the dataset selector or a marked-location button and press Enter to activate it.

## How it works

```
video frame → crop & grid → colorbar inversion → mapping rules → Tone.js → sound + accessible output
```

| Step | File |
|---|---|
| Read the current frame, crop it, split it into a 32 × 16 grid, skip labels and panels | `js/analyzer.js` |
| SST: turn each cell's colour back into °C with the colour bar | `js/colorbar.js` |
| Night lights, lightning, aerosols: measure brightness, new strikes or aerosol colours | `js/analyzer.js` |
| Map values to notes, rhythm, density or layers | `js/sound/mappers.js`, `js/sound/scales.js` |
| Play it with Tone.js | `js/sound/engine.js`, `js/sound/instruments.js` |
| Announce, speak and vibrate | `js/a11y.js` |
| Video loop, modes and controls | `js/player.js`, `js/main.js`, `js/explore.js` |

Each dataset is described by a config in `datasets/` (crop box, grid, colorbar stops, sound settings, legend).

## Data and credits

Browse the [Earth Information Center Content Database](https://svs.gsfc.nasa.gov/gallery/earth-information-center/). The visualizations and the sources used in the app are listed below.

| Dataset | Source | What we read from it |
|---|---|---|
| Sea Surface Currents and Temperature | [NASA Goddard SVS, ECCO2 with NASA/JPL](https://svs.gsfc.nasa.gov/3912/) | Temperature in °C of the visible currents, from the colour bar |
| Lightning from the ISS | [NASA SVS, ISS Lightning Imaging Sensor, NASA GHRC DAAC, Blakeslee 2020](https://svs.gsfc.nasa.gov/5011/) | New visible lightning events and their positions on screen |
| Night Lights 2012–2023 | [NASA SVS, Black Marble, Suomi NPP VIIRS, NASA/NOAA](https://svs.gsfc.nasa.gov/5313/) | How bright each area is (a 0 to 100 index), year by year |
| GEOS Aerosols | [NASA GMAO and SVS, GEOS-FP animation](https://svs.gsfc.nasa.gov/5572/) | How much of the picture each aerosol type (dust, black carbon, sea salt, sulfate) covers |

Visualizations courtesy of NASA's Scientific Visualization Studio. The video files in `media/` are
smaller copies of the SVS originals so the site can run on GitHub Pages (details in `media/README.md`).
The aerosol preview uses the [GEOS Aerosols (2025) still](https://svs.gsfc.nasa.gov/5669/).
[Data Sonification: Caldwell 73](https://svs.gsfc.nasa.gov/13786/) inspired Scan mode.

Tools include Tone.js, Three.js, Web Audio, Web Speech, the Vibration API, ffmpeg, Python with Pillow and NumPy, and GitHub Pages.

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
4. The four videos are already in `media/`. If one is missing, that dataset plays sample sound (clearly marked "sample data") so the app still works.

Optional colorbar tool: `pip install -r tools/requirements.txt`, then `python tools/sample_colorbar.py --help`.

### Run with the Rocky server (optional)

Rocky is our guide character. The page tour works everywhere, but Rocky's live chat and the
spoken legend in Indian languages need our small local server, because they use API keys that must
never go into the website. On the live site (GitHub Pages) the app tells you this and uses your
browser's English voice instead.

1. Install Node.js 20 or newer from https://nodejs.org (the LTS version is fine).
2. In the repo folder, create a file called `.env` (it is already in `.gitignore`, so it never gets
   committed) with your keys, one per line:
   ```
   GROQ_API=your-groq-key
   SARVAM_API=your-sarvam-key
   ```
   Either line can be left out: that feature just stays off.
3. Stop any other server using port 8000, then run this in the repo folder:
   ```
   node server.mjs
   ```
4. Open the address it prints (http://127.0.0.1:8000/).

The server only serves the app's own files and never serves `.env` or any file whose name starts
with `env` or a dot. Never put the keys in the JavaScript or JSON files.

## Accuracy and limits

We want to be honest about what the sound can and can't tell you:

- **Sea surface temperature** is real °C read from the colour bar, but only for the moving current lines
  you can see, not an average of the whole ocean. Reading colours from a compressed video is accurate
  to about one or two degrees. Explore mode reads a small patch of pixels in a slightly different way
  from the music, so the two can differ by a degree or so at the same spot.
- **Night lights** is how bright the picture looks (a 0 to 100 index), not a measured amount of light.
  The parts of the video that show a change map use a different colour meaning, so they are silent.
- **Lightning** counts the strikes the visualization draws. The globe moves and zooms, so left and
  right in the sound mean left and right on the screen, not east and west on Earth.
- **Aerosols** are shares of coloured picture area, not amounts of mass or optical depth.
- All four are sounds made from NASA visualizations, not from the raw science data files.

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

## Live site

After GitHub Pages is turned on (see "Deploy" below), the app is at
https://inmyownuniverse.github.io/NASA-Space-Apps-Challenge-2026_5DS/

## Deploy

GitHub repo, then **Settings**, then **Pages**. Under "Build and deployment" choose **Deploy from a
branch**, pick the branch `main` and the folder `/ (root)`, and press **Save**. After a minute or two the
link above works. Every path in the app is relative and every video is under 100 MB, so nothing else
is needed.

## License

NASA visualizations are courtesy of the NASA Scientific Visualization Studio. The vendored Three.js license is in `js/vendor/three.LICENSE`.
