# media/

<!-- Owner: Aahana · Support: Hazel -->

Put the 720p MP4s here: `sst.mp4`, `lightning.mp4`, `nightlights_web.mp4`, `aerosols.mp4` (each < 100 MB).

| File | Download from |
|---|---|
| `sst.mp4` | https://svs.gsfc.nasa.gov/3912/ |
| `lightning.mp4` | https://svs.gsfc.nasa.gov/5011/ |
| `nightlights_web.mp4` | https://svs.gsfc.nasa.gov/5313/ (see below) |
| `aerosols.mp4` | https://svs.gsfc.nasa.gov/5572/ (annotated 2:1 master, see below) |

These files are committed on purpose so the site works on GitHub Pages. GitHub rejects files over 100 MB, so pick the 720p version (or re-encode) if the download is larger.

## Aerosols: provenance and colour encoding

### Where `media/aerosols.mp4` comes from

The dataset config and this README used to point at **SVS 5669**, which is a
still-image page — it publishes PNGs and a colorbar and no movies at all, so a
73.6 s video cannot come from it. The render used here is **SVS 5572, "GEOS
Aerosols"** (Joseph V. Ardizzone, GMAO), specifically its 2:1 annotated master:

- **Source:** `Aerosols_AnnotationsLabel_6480x3240_30p.mp4` on
  https://svs.gsfc.nasa.gov/5572/ (6480×3240, 30 fps, 2208 frames, 73.6 s, 351 MB)
- **Local file:** `media/aerosols.mp4` — 1280×640 H.264, 30 fps, **2208 frames,
  73.6 s**, 16.9 MB. 1280×640 is exactly 6480×3240 ÷ 5.0625.
- **Processing history:** a lossy re-encode of that master. The exact ffmpeg
  command was not recorded when the file was downloaded, so it is documented as
  unknown rather than reconstructed.

The file is identified by **content**, not by its name or metadata:

| Check | Result |
|---|---|
| Official frame 1099 (t = 36.633 s) of the master, scaled to 1280×640, vs the local frame at the same time | **PSNR 31.3 dB** |
| Official `Aerosols_AnnotationsLabel_2048x1024_30p_0000.png` vs the local frame 0 | **30.9 dB** |
| A different SVS aerosol animation would score | ≈ 10–15 dB |

Both frames carry the burned-in legend panel and event captions, which the local
file reproduces at the same positions — consistent with the *AnnotationsLabel*
master rather than the unannotated `Aerosols_6480x3240_30p.mp4`.

### The legend, measured on the frame

| Species | Legend states | Measured in the frame | Hue | Chroma | Value |
|---|---|---|---|---|---|
| Black Carbon | (208, 93, 65) | (209, 92, 66) | 11.7° | 0.56 | 0.82 |
| Dust | (191, 151, 219) | (191, 152, 220) | 275.3° | 0.27 | 0.86 |
| Sea Salt | (134, 167, 164) | (134, 168, 167) | 178.2° | 0.13 | 0.65 |
| Sulfate | (81, 219, 53) | (84, 220, 54) | 109.9° | 0.65 | 0.86 |

Swatches reproduce the stated colours within ±2 levels (h.264 rounding). The
configured hue for sea salt is the *stated* 174.5°; the frame measures 178.2°.

### Why the earlier plume clusters did not match the swatches

The earlier audit clustered plume colours into purple (162,130,185), teal
(102,132,133), dark teal (69,91,100) and green (64,92,56), none of which equals a
swatch, and none of which looked like Black Carbon. The explanation is
compositing: each species is drawn as a translucent layer over a dark base map,
so on-screen colour = α·swatch + background. Scaling toward black multiplies all
three channels, which **preserves hue** while dropping chroma and value. The
swatch is simply the α = 1 case:

| Cluster | RGB | Hue | Matches | Δhue |
|---|---|---|---|---|
| purple | (162,130,185) | 274.9° | Dust | 0.4° |
| green | (64,92,56) | 106.7° | Sulfate | 3.2° |
| teal | (102,132,133) | 181.9° | Sea Salt | 7.4° |
| dark teal | (69,91,100) | 197.4° | Sea Salt, dim tail (V 0.39 vs 0.52) | 22.9° |

Black Carbon was missing from that list because it is the dimmest and smallest
layer. Measured directly on the frame, the wildfires over central Africa give a
median plume colour of **(119,70,46), hue 16.6° — 4.9° from the Black Carbon
swatch** (208,93,65). Every species therefore maps by hue; the four clusters were
three species plus a second brightness level of sea salt, never a fifth species.

Largest connected plume per species at t = 0 (measured): black carbon (119,70,46)
H 16.6, dust (162,130,187) H 275.3, sea salt (51,82,77) H 173.3, sulfate
(37,82,29) H 112.9 — all within 5° of their swatch.

### Classification

Per pixel, at source resolution, after masking:

1. `value ≥ 0.26 × the species' swatch value`, `chroma ≥ 0.25 × the species'
   swatch chroma` — **relative** floors, because sea salt's swatch (chroma 0.13,
   value 0.65) is far dimmer and greyer than sulfate's (0.65 / 0.86). A single
   absolute floor silently deletes most real sea salt.
2. Nearest species hue within **26°**.
3. **Ambiguous** (counted, never assigned) when a pixel is eligible for two
   species, or sits within **7°** of the hue boundary between two species while
   still being close to a species colour. A hue that is nowhere near a species
   (the blue base-map tint) is background, not ambiguity.
4. Everything else is background: black ocean, neutral grey land, white text.

Outputs (`extract.mode: "layers"`): `grid` = fraction of each 32×16 cell's
unmasked pixels that classify as any aerosol (0..1, null under a mask), `layers`
= each species' share of classified pixels, plus `aerosolPixels`,
`aerosolAmbiguous`, `aerosolMasked` and `layerPixels` for validation. These are
**relative visual proportions of coloured picture area** — not aerosol optical
depth, mass concentration or any physical unit, and they must not be described as
such.

### Masks (measured from the frames)

- **Legend:** panel spans x 858–1132, y 576–633 (detected as the flat dark panel
  that is constant across the whole video); masked as 280×60 at (855, 575).
- **Captions and leader lines:** nine caption boxes, taken from SVS's own
  annotation overlay frame set `Annotations_6480x3240_30p` at frames
  0/300/600/1100/1500/1800/2100/2200 — the alpha overlay is the authoritative
  list of every annotation the render composites, and its union covers captions
  that appear at different times. Downscaled with a box filter, dilated 5 px and
  padded 3 px. Leader lines are thin neutral-grey strokes, so they also fail the
  chroma floor.

### Measured behaviour

- Density: mean 0.21, max 1.00 across the 32×16 grid; 20–22 % of frame pixels
  classify as aerosol at t = 0 (the independent audit estimated ≈ 23 %).
- Shares at t = 0: black carbon 6.6 %, dust 21.0 %, sea salt 39.4 %, sulfate
  33.0 %; at t = 36.6 s: 8.1 / 14.4 / 44.7 / 32.8 %.
- Region purity on real frames: 100 % black carbon over the African fires,
  97 % dust over the Sahara plume, 100 % sea salt in the Southern Ocean swirls,
  96–100 % sulfate over North America and Europe.
- Ambiguity: 0.18–0.37 % of frame pixels.
- Cost: `analyze()` median **31–40 ms** per 1280×640 frame in Node, inside the
  4 Hz (250 ms) slot.


## Night Lights web proxy

The EIC version of SVS 5313 is published only as 7680×2160 HEVC. That is 20×
the pixels the analyser needs and not every browser decodes HEVC, so the app uses
a 32:9 H.264 proxy:

- **Source:** `nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4`
  (SVS 5313, 7680×2160, 30 fps, 1300 frames, 43.33 s, 34.3 MB)
- **Original file:** `media/nightlights.mp4` — kept locally, **not committed**
  (listed in `.gitignore`)
- **Proxy:** `media/nightlights_web.mp4` — 1920×540, H.264 High, 30 fps, all 1300
  frames, 43.33 s, 2.0 MB, AAC-free, `+faststart`
- **Conversion:**
  ```
  ffmpeg -i media/nightlights.mp4 \
    -vf "scale=1920:540:flags=lanczos" \
    -c:v libx264 -profile:v high -level:v 4.0 -pix_fmt yuv420p -crf 21 -preset slow \
    -r 30 -vsync cfr -an -movflags +faststart \
    media/nightlights_web.mp4
  ```

### Duplicated world map (measured, not assumed)

The EIC master is built for a two-screen hyperwall, so a single 32:9 frame contains
the **same world map twice** side by side. Cross-correlation of the map layer gives
a period of **3842 px at 8K and 961 px in the proxy** (copy-to-copy mean absolute
error 0.86 grey levels on an annotation-free frame). Each copy is a full 360° of
longitude, and the two copies join without a visible seam (column-to-column error
0.07 grey levels).

Consequences, which `datasets/nightlights.json` handles explicitly:

- The analyse crop is **one copy**: `{x:0, y:20, w:960, h:520}` (the tile is 961 px;
the final seam column is dropped). Treating both copies as independent geography
would double-count every longitude band.
- The proxy file itself is still 1920×540 (32:9) — the player shows the full
panorama; only the analyser reads one copy.
- Crop pixels are taken 1:1, so the crop introduces no extra distortion. Note the
render draws 360°×180° into 960×520 px, i.e. an anisotropic stretch.
- The year label sits at x≈996–1036, over the seam and **outside** the analysed
copy, so it needs no mask; `cfg.masks` keeps the rectangle as a guard in case the
crop is ever widened.
## Lightning (media/lightning.mp4)

1280×720, H.264, 30 fps, 6501 frames, 216.7 s (17.9 MB). ISS LIS quality-controlled
lightning observations, drawn as small saturated-yellow blobs with a hotter centre
over a dark globe. **There is no intensity colourbar in this visualization.**

### Timeline (measured from the frame, not assumed)

| Video time | Bottom-right overlay | Evidence |
|---|---|---|
| 0 – ~66 s | date clock `Mar 01 2017 HH:MM` | clock reads 11:10 at 45 s, 12:01 at 50 s, 13:23 at 58 s, 14:04 at 62 s |
| ~68 s – 216.7 s | 10-day roving window wheel (year + month dot) | 2017 at 70–110 s, 2018 at 130 s, 2019 at 150 s, 2021 at 170 s, 2022 at 190 s, 2023 at 210 s |

The year is **not** a constant function of video time: 2019 → 2021 happens between
150 s and 170 s (2020 is passed quickly), while 2021 → 2022 takes the same 20 s.
The video-time ↔ physical-time mapping is therefore non-uniform and is not used by
the analysis; only the strike pixels are.

### Flash colours (measured)

Reference values supplied with the dataset: white core ≈ RGB(238,238,237), yellow
halo ≈ RGB(234,234,76). Sampling real frames gives a wider family:

- cores: (255,255,66), (255,255,95), (254,252,153) — the hot centre of a fresh strike
- halos: (247,255,4), (254,255,46), (193,185,35)

The detector therefore uses `core: r,g ≥ 235` (admits the reference white) and
`halo: r ≥ 185, g ≥ 165, b ≤ 145, r−b ≥ 70` (admits the reference yellow). A blob
counts only when it has **both**, which is what rejects the star field, the white ISS
ground-track line and its “ISS” label: all are bright, none is yellow.

### Detection

Source-resolution pixel masks (no 32×16 downsampling), 8-connected component
grouping, blobs capped at 400 px so a merged blanket cannot masquerade as a flash.
Only blobs that were **not** lit in the previous analysed frame (4 px dilation for
globe motion, plus a 0.02 normalised-position guard) become events, so the 10-day
window does not retrigger the same dot every frame. Tracking resets on a seek, a
loop, a timestamp jump > 1.5 s, or a globe shift/scale change > 30 %.

### Coordinates

`nx, ny` are image coordinates, never geography:

- `flashSpace: 'globe'` — the whole disc was inside the frame; `nx, ny` are
  relative to that disc's bounding square (0,0 = its top-left) and are guaranteed
  to fall in 0..1, because every star/artifact outside the silhouette is dropped.
- `flashSpace: 'screen'` — the disc runs off the frame (the zoomed-in opening);
  `nx, ny` are relative to the crop rect instead and no boundary test is possible.

**How the disc is measured.** A luminance-threshold centroid only finds the *lit
crescent*, and on a frame whose night half is black that is badly wrong: at t=90 s
it gave c=(571,380) r=267, which pushed genuine limb strikes to nx=1.10. The lit
limb lies ON the true circle, so the estimator now fits a circle (Kasa least
squares, 15 % trimming per round) to the leftmost lit pixel of every 4th row:

| t | centre | r | complete | independent check |
|---|---|---|---|---|
| 30 s | (653, 484) | 558 | no (cropped) | red circle matches the frame edge |
| 90 s | (639, 362) | 315 | yes | ffmpeg circle fit: (640.0, 361.8) r 315.7 |
| 180 s | (639, 362) | 315 | yes | ffmpeg circle fit: (639.8, 361.9) r 315.5 |

The camera is locked from ~70 s on: the apparent "zoom" between 90 s and 180 s in
the first version was the terminator sweeping across, which grows/shrinks the lit
crescent without moving the globe.

**Boundary rejection.** Lightning happens on the disc, so a blob outside
`r × 1.03` (the pad covers limb bloom) is dropped when `flashSpace` is `globe`;
`flashRejected` counts them. Measured over 36 frames sampled every 6 s across the
whole video: 6 449 strikes, **0 rejected** — no genuine strike sits outside the
silhouette. The check only exists to keep stars and compression sparkle out.

**Event rate at 4 Hz playback** (simulated over the whole video, 864 consecutive
calls): 18 460 new events, mean **21.4** per call, median 16, p90 52, max 180
(a scene transition), with 74 % of calls producing at least one event. Spikes are
kept in the output — voice limiting belongs to the sound mapper.

### Bottom-right panel

`masks[0] = {x:1090, y:555, w:190, h:165}` — covers both the date clock and the
year wheel, which are pure white text and would otherwise read as flashes. It
nulls 20 of the 512 cells.

### Measured behaviour

| t | strikes in view | busiest cell | mean | new events | space |
|---|---|---|---|---|---|
| 10 s | 0 (empty sky) | 0 | 0 | 0 | globe |
| 30 s | 14 | 2 | 0.028 | – | screen |
| 45 s | 24 | 4 | 0.049 | 0 | screen |
| 90 s | 336 | 16 | 0.683 | 8 on the next frame | globe |
| 180 s | 350 | 17 | 0.711 | 5 on the next frame | globe |
| 215 s | 146 | 11 | 0.297 | – | globe |

`analyze()` costs ~25–30 ms per 1280×720 frame in Node (circle fitting added ~12 ms
to the original detector) and 50–134 ms in Chromium with canvas readback, i.e. it
still fits the 4 Hz player slot but is the most expensive dataset so far.

### Pop-out annotations in the second annual segment (Night Lights)

From t≈22.5 s to the end of the segment the frame carries four zoom panels with
leader callouts. Reading each header back from the frame at t=30 s, and detecting
their bright borders by run-length:

| Panel | Frame bounds (x0–x1, y0–y1) | Inside the crop? |
|---|---|---|
| Western Europe | 170–498, 186–514 | yes |
| Eastern Mediterranean | 592–806, 32–317 | yes |
| Ukraine | 1161–1431, 26–229 | no (second copy) |
| India | 1514–1770, 267–523 | no (second copy) |

The two panels over the analysed copy are masked whole. Their callouts (a fenced
"you are here" rectangle, a translucent beam and its bright edges) sit **on top of
real map data**, so only the drawn lines are masked: masking the whole callout would
throw away genuine city light underneath. The 12 rectangles in `segments[1].masks`
are **crop-relative** pixels:

| Mask | Crop rect | Frame position |
|---|---|---|
| Western Europe panel | 170, 166, 329, 329 | x 170–498, y 186–514 |
| W. Europe fence, top / bottom | 419, 78 / 419, 144, 67 × 2 | y 98 / y 164 |
| W. Europe fence, left / right | 419, 78 / 484, 78, 2 × 68 | x 419 / x 485 |
| W. Europe beam, lower edge | 188, 140, 232, 26 | x 188–419, y 160–185 |
| Eastern Mediterranean panel | 592, 12, 215, 286 | x 592–806, y 32–317 |
| E. Med. fence, top / bottom | 522, 128 / 522, 178, 37 × 2 | y 148 / y 198 |
| E. Med. fence, left / right | 522, 128 / 557, 128, 2 × 52 | x 522 / x 558 |
| E. Med. beam, panel edge | 565, 12, 28, 286 | x 565–592, y 32–317 |

Mask coordinates are crop-relative (the analyser compares crop pixels), so a mask
y is `frame y − 20`. Getting this wrong is what made an earlier Western Europe mask
too tall: it ran 20 px past the panel bottom and nulled real map rows.

Verification, and the reason the fences are border-only: take every pixel that is
bright (> 60) at t=30 s but dark (< 10) at t=5 s inside the crop — that is exactly
the set of marks the renderer adds in the pop-out segment. The 12 rectangles cover
it completely; after masking, a connected-component pass on the difference leaves
zero clusters. A fence's interior is *not* in that set, so it stays data.

Result at t=30 s: 231 of 512 cells masked, 281 valid, mean brightness 2.02, max 67.3.
Masking the source boxes whole instead of their borders dropped the same frame to
1.06 mean with only 7 lit cells, and left a fake reading of 73.6 from a white
leader line.
