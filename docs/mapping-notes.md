# Mapping notes

<!-- Owner: Celene · Support: Aahana, Freia -->

How each picture becomes sound, in plain words. This text feeds the "How we mapped it" panel,
the spoken legend, the README and the demo. The sound part matches the code in `js/sound/`.
All the numbers below (octaves, levels, thresholds) are settings in `js/sound/tuning.js`.

## General choices

**Every note comes from a pentatonic scale.** A pentatonic scale has five notes per octave and no
notes that clash with each other. So whatever the data does, any mix of notes still sounds pleasant.
Most datasets use C major pentatonic. Lightning uses C minor pentatonic, which sounds darker.

**Higher values play higher notes.** Each value is placed on the scale between the lowest and the
highest value on the visualization's colour bar. Low values get low notes and high values get high
notes, so the pitch tracks the real data, not just how red or blue a pixel looks.

**Left and right follow west and east.** Stereo position follows longitude. Something on the
west side of the map sounds in your left ear and something on the east side in your right ear.
With headphones you can tell roughly where on Earth a sound is coming from.

**We limit how many notes play at once.** Each dataset has a voice limit, and no dataset can ever
hold more than 8 notes. Too many notes at once turn into mush, and a listener cannot pick anything
out. Fewer, clearer notes are easier to follow.

**We smooth the data a little.** Values are averaged over the last few frames (up to 4) and chords
change at most twice a second. This stops notes from flickering when the video has small changes or
compression noise.

**Extreme values add tension.** When a value goes past a danger line, we add one quiet extra note
just one semitone above a main note. Those two notes rub against each other and sound uneasy. It is
the only note in the app that is outside the scale, so it stands out. Right now this is used for
the very warmest sea water (above 31 °C, which only the hottest spots reach some of the time) and
for an aerosol type that clearly takes over the picture.

**The mix is kept safe.** Every sound goes through a little room echo and then a limiter, which stops
the sound from getting so loud that it distorts. Each dataset has its own level so that none of them
is much louder than the others.

## Sea Surface Currents and Temperature (`sst`)

**What you see.** The world's oceans, with currents drawn as moving streaks. The colour shows the
water temperature at the surface, from 0 to 32 °C: cold water is blue, middle temperatures are green and
yellow, and warm water is orange and red.

**What we measure per frame.** Temperature sampled from visible coloured current streamlines across a 32x16 grid (°C, 0.0 to 32.0 °C). Note: `mean` reflects the average temperature of currently detected, illuminated streamline filaments, not a geographic area-weighted global ocean mean. `change` measures the visual advection and motion of streamlines across grid cells between frames, not a physical heating/cooling trend. Unknown areas, unlit ocean floor, and continents return null.

**What you hear.**
- A soft, slow pad chord that is always playing, like a held organ or string sound.
- The main note follows the average temperature of the currents you can see on screen (not the whole
  ocean, since only the moving streaks carry colour). Warmer water plays a higher note and colder
  water plays a lower note.
- Up to four more notes come from the coldest, the warmest and the middle parts of the ocean in that
  frame. So a map with a big temperature range gives a wide chord, and an even map gives a narrow one.
- When the picture changes a lot from one frame to the next (fast-moving currents), the tone gets
  brighter. When the ocean is calm, the tone is darker and softer.
- If any water is warmer than 31 °C, a quiet note one semitone up is added, which makes the chord
  sound tense.
- In Scan mode, each column of the map plays a chord of three notes: the southern part in a low
  octave, the middle in the middle octave and the northern part in a high octave.

**Why we chose this sound.** The ocean moves slowly and smoothly, so a slow pad that fades in and out
feels like it. Temperature goes up and down smoothly too, so it makes sense as pitch. Brightness for
fast currents works because a brighter tone sounds more active, the way choppy water looks more active.
Tension above 31 °C marks the very warmest water, warm enough to matter for things like coral
bleaching and storms. (Some water in this video is always above 28 °C, so 31 °C is where it becomes
the exception you notice.)

**What to notice with your eyes closed.**
- Whether the ocean overall is warm (high chord) or cold (low chord).
- Whether the temperatures are spread out (wide chord) or similar everywhere (close notes).
- When the chord starts to sound tense, some water has gone above 31 °C.
- When the sound gets brighter, the currents are moving faster.

## Lightning from the ISS (`lightning`)

**What you see.** Footage of Earth from the International Space Station. Lightning flashes show up as
short bright spots in the clouds.

**What we measure per frame.** Each new strike: a bright yellow blob with a white-hot centre. Stars,
the station's track line and its label are bright but have no yellow glow, so they are not counted.
Strikes stay on screen for a while, so only strikes that are new since the last frame make sound. The
globe moves and zooms, so a position on screen is not a fixed place on Earth.

**What you hear.**
- Deep drum hits for new lightning flashes, with a short crack of noise on top.
- More new flashes at once means more hits, from 1 for a single flash up to 4 for a big burst.
- Flashes on the left of the screen sound on the left and flashes on the right sound on the right.
- Flashes higher on the screen are higher drum notes and lower ones are lower.
- Brighter flashes hit harder.
- When there is no new lightning, there is silence.

**Why we chose this sound.** A drum hit and a lightning flash are both sudden and short, so one
matches the other without any explaining. The noise crack on top sounds like the snap of a strike.
Keeping silence when there are no flashes makes every flash easy to hear. The minor scale gives
it a darker, stormier mood than the other datasets.

**What to notice with your eyes closed.**
- How often lightning strikes: a few hits or a busy drum pattern.
- Where the storm is on the screen: left or right, high or low.
- A really bright strike as a harder hit.

## Night Lights 2012–2023 (`nightlights`)

**What you see.** Earth at night, year by year. Cities and towns glow. Brighter areas mean more light.

**What we measure per frame.** How bright each part of the map looks, as a brightness index from 0
to 100 (0 is dark). It is how bright the picture is, not a measured amount of light. Labels and
pop-out panels are covered up and give no data. Parts of the video show a change map with a
different colour meaning; those parts are left silent on purpose.

**What you hear.**
- Short sparkling glass or bell notes in bursts, two per second, with a soft echo.
- The more of the map that is lit, the more notes in each burst (from 1 up to 6).
- Brighter places play higher and louder notes. Dim places play lower and softer notes.
- When the lit area grows from one frame to the next, an extra high sparkle note plays.
- A part of the map only counts as lit if it is brighter than a small threshold, so dark ocean and
  empty land stay quiet.

**Why we chose this sound.** City lights twinkle, and short glassy notes sound like twinkling. More
lights giving more notes is easy to understand: a busy, crowded sound for a busy, crowded map.
The extra sparkle on growth lets you hear new lights switching on over the years.

**What to notice with your eyes closed.**
- How much of the world is lit: sparse notes or a busy shower of notes.
- How bright the brightest cities are: how high the top notes go.
- Over the years, the extra sparkles mean the lit area is growing.

## GEOS Aerosols (`aerosols`)

**What you see.** A NASA computer model of tiny particles floating in the air. Each kind has its own
colour: dust, black carbon (soot, mostly from fires), sea salt and sulfate.

**What we measure per frame.** Each pixel is sorted into one of the four types by its colour (hue),
using the legend swatches as the reference. We get how much of the picture each type covers, as a
share of all the aerosol colour on screen, and how much of each map cell shows aerosol colour. These
are shares of picture area, not amounts of mass.

**What you hear.**
- Four different instruments, one for each kind of particle, all playing notes from one shared chord
  so they blend instead of clashing:
  - dust is a low, rough drone, a bit like a cello
  - black carbon (smoke and soot) is a crackling noise, like a fire
  - sea salt is a soft, airy, high shimmer
  - sulfate is soft bells that ring about once a second
- Each instrument gets louder when there is more of its particle and goes silent when there is none.
- The whole chord moves up a little when the total amount of particles is higher.
- If one kind of particle clearly takes over the picture, it adds a tense note one semitone up.

**Why we chose this sound.** Each sound matches its particle. Dust is heavy and low, so it gets the
lowest, roughest sound. Black carbon is soot from fires, so it crackles. Sea salt comes from ocean spray, so it
is light and airy. Sulfate often comes from volcanoes and pollution and forms tiny droplets, so it gets
small clear bells. Using one shared chord means you can hear all four at once without a mess.

**What to notice with your eyes closed.**
- Which particle is the strongest right now: the loudest instrument.
- When a particle appears or disappears: its instrument fading in or out.
- For example, a big dust storm makes the low drone take over, and wildfire season brings in
  more crackle.

## App features (notes for the story)

Short plain notes on what each feature does and why it matters. One line per feature.

- **Scan mode.** Press Scan and the video pauses. A bar sweeps the frozen map from west to east, and
  each column plays as a short chord: low notes for the south, high notes for the north. It turns one
  moment of the map into a little melody you can follow with your ears.
- **Sonic legend.** Before the data starts, each legend line is read out and its example sound
  plays, for example "high notes means warm water" followed by those high notes. Listeners learn the
  sound language first, so the music makes sense from the first second. Press L to hear it again,
  or Escape to skip. It can be turned off with the "Hear the legend before the data starts" box.
- **Explore mode and the proof panel.** Press Explore, then move a finger or the mouse over the map,
  or use the arrow keys. You hear the note for that one spot, and phones buzz on hotspots. The proof
  panel shows the exact pixel colour, where it sits on the colour bar, the real value it stands for
  (for example 28.9 °C) and the note it became. It is the one-glance proof that the music comes from
  the data, not from how pretty the colours are. Screen readers hear the same thing as a short sentence.
  To be accurate it reads a small patch of pixels, not just one: it skips white current lines, grey
  land and the black background, matches the remaining colours to the colour bar the way people see
  colour, and takes the middle value. If the spot itself has no water colour it uses the nearest ocean
  pixel and says so. When there is no value it says why: land or no data, a current line, or a colour
  outside the colour bar.
  For night lights, lightning and aerosols the panel shows the analyser's own reading for that map
  cell (brightness index, number of strikes, or how much aerosol colour and which type), which is
  exactly the number the music uses.
- **Shareable links.** The address always matches what you are hearing, for example
  `index.html?dataset=sst&t=30&mode=scan`. The "Copy link" button copies a link to this exact moment,
  so anyone (a judge, a teacher, another website) opens the same dataset, time and mode. Browsers only
  allow sound after a click, so the link waits for one click or key press before it starts.
- **Eyes-closed mode.** Press E (or the "Eyes closed" button). The picture disappears and every
  8 seconds a voice gives a one-sentence summary, such as "Visible currents average 21 degrees,
  rising". It shows that the whole story can be followed by ear alone, which is exactly how a blind
  listener uses it. Everything still works from the keyboard.
- **Add your own visualization (add.html).** Load any video or image, drag a box over the map, click
  the two ends of the colour bar and type the values at each end. The page reads the colour bar,
  says how many map cells match it, plays the result straight away with the same sound engine, and
  downloads the config file. Drop that file in `datasets/` and the new visualization is in the
  jukebox, with no code changes. This is the live proof that Earth Jukebox works for any EIC
  visualization, not just our four.
- **Record track.** Press R (or "Record track") while listening, then press it again. The music
  downloads as an audio file you can share, so a dataset's song can live outside the app, for
  example in a class or on social media.
