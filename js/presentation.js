export const fixtures = {
  sst: {
    dates: 'Mar 2007 – Mar 2008', preview: 'media/sst.jpg', accent: '#69e5d4',
    instrument: 'Warm pad', duration: 48,
    mapping: 'Surface temperatures become notes. Warmer water raises the pitch, while colder currents play lower notes.',
    readout: { label: 'Surface temperature', value: 21.4, unit: '°C', timestamp: 'Mar 2007' },
    cells: { '16,8': { value: 21.4 }, '17,8': { value: 28.2, hotspot: true }, '15,8': { value: 0 } },
  },
  lightning: {
    dates: 'Jan 2017 – Jul 2023', preview: 'media/lightning.jpg', accent: '#aeb6ff',
    instrument: 'Percussion', duration: 42,
    mapping: 'Each detected flash triggers a drum hit. The stereo position follows the flash from left to right on the screen.',
    readout: { label: 'Detected flashes', value: 0, unit: 'flashes' },
    cells: { '16,8': { value: 0, unit: 'flashes' }, '17,8': { value: 12, unit: 'flashes', hotspot: true } },
  },
  nightlights: {
    preview: 'media/nightlights.jpg', accent: '#f7ca80', instrument: 'Glass tones', duration: 52,
    mapping: 'Brighter areas raise the pitch. Larger lit areas increase the number of notes you hear.',
    readout: { label: 'Brightness', value: 36.8, unit: 'nW/cm²/sr', timestamp: '2023' },
    cells: { '16,8': { value: 0 }, '17,8': { value: 36.8, hotspot: true } },
  },
  aerosols: {
    dates: '19 Aug 2025', preview: 'media/aerosols.png', accent: '#ecace8',
    instrument: 'Dust · Smoke · Sea salt · Sulfate', duration: 36,
    mapping: 'Each aerosol layer has its own timbre. A bigger share of the picture makes that layer louder.',
    readout: { label: 'Dominant layer', value: null },
    cells: { '16,8': { value: 'Sea salt', unit: '' }, '17,8': { value: 'Dust', unit: '', hotspot: true } },
  },
};

export const modeCopy = {
  play: 'Preview the timeline and see how the dataset maps to sound.',
  scan: 'The line sweeps west to east, previewing how columns of the image become a sequence of sounds.',
  explore: 'Use the arrow keys on the map, or click or tap a cell to inspect it.',
};


