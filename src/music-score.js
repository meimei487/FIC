export const SCORE_STEPS_PER_BAR = 16;
export const SCORE_BARS = 16;

export const MUSICAL_IDENTITY = Object.freeze({
  title: "先鋒五音",
  tonalCenter: "one signal, six modal identities",
  meter: "4/4",
  form: "intro-A-B-return",
  motifIntervals: Object.freeze([0, 5, 7, 4, 9]),
  motif: Object.freeze([64, 69, 71, 68, 73])
});

export const CHORD_INTERVALS = Object.freeze({
  minor: Object.freeze([0, 3, 7]),
  major: Object.freeze([0, 4, 7]),
  power: Object.freeze([0, 7, 12]),
  sus2: Object.freeze([0, 2, 7])
});

export function midiToFrequency(noteValue) {
  return 440 * Math.pow(2, (noteValue - 69) / 12);
}

function chord(root, quality = "minor") {
  return Object.freeze({ root, quality });
}

function note(step, midi, length = 2, velocity = 1) {
  return Object.freeze({ step, midi, length, velocity });
}

function bass(step, interval = 0, length = 2, velocity = 1) {
  return Object.freeze({ step, interval, length, velocity });
}

function pulse(step, voice = 0, length = 1, velocity = 1) {
  return Object.freeze({ step, voice, length, velocity });
}

function arp(step, voice = 0, length = 1, velocity = 1) {
  return Object.freeze({ step, voice, length, velocity });
}

function freezeBars(bars) {
  return Object.freeze(bars.map((bar) => Object.freeze([...bar])));
}

function theme(root, bars) {
  if (bars.length !== SCORE_BARS) throw new Error(`樂句必須是 ${SCORE_BARS} 小節`);
  return freezeBars(bars.map((bar) => bar.map(([step, interval, length = 2, velocity = 1]) =>
    note(step, root + interval, length, velocity))));
}

function plan(bassName, drumName, pulseName, arpName, {
  pad = false,
  stab = false,
  dynamic = 0.8
} = {}) {
  return Object.freeze({ bass: bassName, drums: drumName, pulse: pulseName, arpeggio: arpName, pad, stab, dynamic });
}

const BASS_PATTERNS = Object.freeze({
  none: Object.freeze([]),
  breathe: Object.freeze([bass(0, 0, 7, 0.72)]),
  march: Object.freeze([bass(0, 0, 3, 0.92), bass(8, 7, 3, 0.72)]),
  drive: Object.freeze([bass(0, 0, 2), bass(4, 7, 2, 0.68), bass(8, 12, 2, 0.84), bass(12, 7, 2, 0.68)]),
  sync: Object.freeze([bass(0, 0, 3), bass(6, 7, 2, 0.7), bass(10, 12, 2, 0.82), bass(14, 7, 2, 0.66)]),
  half: Object.freeze([bass(0, 0, 5), bass(10, 7, 4, 0.72)]),
  forge: Object.freeze([bass(0, 0, 3), bass(7, 7, 2, 0.76), bass(11, 12, 3, 0.88)]),
  frost: Object.freeze([bass(0, 0, 8, 0.78), bass(11, 7, 4, 0.58)]),
  roll: Object.freeze([bass(0, 0, 2), bass(3, 7, 2, 0.7), bass(6, 12, 2, 0.82), bass(10, 7, 2, 0.7), bass(13, 12, 2, 0.78)]),
  boss: Object.freeze([bass(0, 0, 4), bass(8, 0, 3, 0.78), bass(12, 7, 3, 0.74)])
});

const PULSE_PATTERNS = Object.freeze({
  none: Object.freeze([]),
  signal: Object.freeze([pulse(2, 0, 2, 0.68), pulse(10, 1, 2, 0.62)]),
  engine: Object.freeze([pulse(2, 0), pulse(6, 1), pulse(10, 0), pulse(14, 1)]),
  forge: Object.freeze([pulse(3, 0, 2, 0.68), pulse(11, 1, 2, 0.72)])
});

const ARPEGGIO_PATTERNS = Object.freeze({
  none: Object.freeze([]),
  open: Object.freeze([arp(2, 0, 2, 0.62), arp(6, 1, 2, 0.56), arp(10, 2, 2, 0.62), arp(14, 1, 2, 0.54)]),
  roll: Object.freeze([arp(0, 0, 2, 0.62), arp(3, 1, 2, 0.56), arp(6, 2, 2, 0.62), arp(10, 1, 2, 0.56), arp(13, 2, 2, 0.6)]),
  frost: Object.freeze([arp(4, 2, 3, 0.48), arp(12, 1, 3, 0.44)])
});

const DRUM_PATTERNS = Object.freeze({
  none: Object.freeze({ kick: [], snare: [], hat: [], metal: [] }),
  light: Object.freeze({ kick: [0, 10], snare: [6, 14], hat: [4, 12], metal: [] }),
  march: Object.freeze({ kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], metal: [] }),
  drive: Object.freeze({ kick: [0, 6, 10], snare: [4, 12], hat: [2, 6, 10, 14], metal: [] }),
  half: Object.freeze({ kick: [0, 10], snare: [8], hat: [4, 12], metal: [] }),
  siege: Object.freeze({ kick: [0, 10], snare: [4, 12], hat: [2, 10], metal: [14] }),
  forge: Object.freeze({ kick: [0, 7, 11], snare: [4, 12], hat: [2, 10], metal: [14] }),
  frost: Object.freeze({ kick: [0], snare: [12], hat: [6, 14], metal: [] }),
  flight: Object.freeze({ kick: [0, 6, 10], snare: [4, 12], hat: [2, 6, 10, 14], metal: [] }),
  hunt: Object.freeze({ kick: [0, 6, 12], snare: [4, 10], hat: [2, 8, 14], metal: [] }),
  boss: Object.freeze({ kick: [0, 10], snare: [8], hat: [4, 12], metal: [14] }),
  furnace: Object.freeze({ kick: [0, 7], snare: [12], hat: [4, 10], metal: [14] })
});

const BAR_PLANS = Object.freeze({
  air: plan("none", "none", "none", "none", { pad: true, dynamic: 0.52 }),
  signal: plan("breathe", "none", "signal", "none", { pad: true, dynamic: 0.65 }),
  breath: plan("breathe", "none", "none", "none", { pad: true, dynamic: 0.6 }),
  resolve: plan("breathe", "none", "none", "none", { pad: true, dynamic: 0.78 }),
  theme: plan("march", "march", "none", "none", { dynamic: 0.78 }),
  themePad: plan("march", "light", "none", "none", { pad: true, dynamic: 0.74 }),
  drive: plan("drive", "drive", "none", "none", { dynamic: 0.86 }),
  lift: plan("sync", "light", "none", "open", { dynamic: 0.84 }),
  climax: plan("drive", "flight", "none", "open", { stab: true, dynamic: 0.96 }),
  cadence: plan("half", "half", "none", "none", { pad: true, dynamic: 0.76 }),
  half: plan("half", "half", "none", "none", { dynamic: 0.78 }),
  siege: plan("half", "siege", "signal", "none", { dynamic: 0.82 }),
  forge: plan("forge", "forge", "forge", "none", { dynamic: 0.82 }),
  frost: plan("frost", "frost", "none", "frost", { dynamic: 0.66 }),
  frostPad: plan("frost", "none", "none", "none", { pad: true, dynamic: 0.58 }),
  flight: plan("drive", "flight", "signal", "none", { dynamic: 0.88 }),
  roll: plan("roll", "hunt", "none", "roll", { dynamic: 0.87 }),
  boss: plan("boss", "boss", "none", "none", { pad: true, dynamic: 0.8 }),
  bossDrive: plan("boss", "boss", "signal", "none", { dynamic: 0.86 }),
  bossLift: plan("roll", "hunt", "none", "open", { dynamic: 0.91 }),
  furnace: plan("forge", "furnace", "forge", "none", { dynamic: 0.86 })
});

const FORMS = Object.freeze({
  command: Object.freeze(["air", "signal", "air", "breath", "signal", "air", "breath", "air", "signal", "breath", "air", "breath", "signal", "breath", "air", "resolve"]),
  respite: Object.freeze(["air", "breath", "air", "breath", "air", "breath", "air", "breath", "signal", "breath", "air", "breath", "air", "breath", "air", "resolve"]),
  march: Object.freeze(["signal", "themePad", "theme", "breath", "theme", "drive", "theme", "lift", "breath", "theme", "drive", "theme", "climax", "drive", "lift", "cadence"]),
  assault: Object.freeze(["signal", "theme", "drive", "breath", "drive", "flight", "drive", "lift", "themePad", "drive", "flight", "breath", "climax", "flight", "lift", "cadence"]),
  siege: Object.freeze(["breath", "siege", "half", "breath", "siege", "drive", "half", "lift", "breath", "siege", "drive", "half", "climax", "siege", "lift", "cadence"]),
  forge: Object.freeze(["signal", "forge", "half", "breath", "forge", "drive", "forge", "lift", "breath", "forge", "drive", "half", "climax", "forge", "lift", "cadence"]),
  frost: Object.freeze(["air", "frostPad", "frost", "air", "frostPad", "frost", "breath", "frost", "air", "frostPad", "frost", "breath", "frost", "lift", "frostPad", "cadence"]),
  flight: Object.freeze(["signal", "flight", "drive", "breath", "flight", "drive", "lift", "flight", "themePad", "flight", "drive", "breath", "climax", "flight", "lift", "cadence"]),
  babel: Object.freeze(["air", "boss", "half", "breath", "bossDrive", "boss", "half", "bossLift", "breath", "bossDrive", "boss", "half", "climax", "bossDrive", "bossLift", "cadence"]),
  leviathan: Object.freeze(["signal", "roll", "half", "breath", "roll", "bossLift", "roll", "lift", "breath", "roll", "bossLift", "half", "climax", "roll", "bossLift", "cadence"]),
  moloch: Object.freeze(["air", "furnace", "half", "breath", "furnace", "bossDrive", "half", "bossLift", "breath", "furnace", "bossDrive", "half", "climax", "furnace", "bossLift", "cadence"])
});

const MENU_THEME = theme(64, [
  [[0, 0, 8]], [[0, 0, 6], [8, 3, 6]], [], [[2, 0, 9]],
  [[0, 5, 4], [5, 10, 3], [9, 10, 5]], [], [[0, 3, 3], [6, 3, 7]], [],
  [[0, 0, 4], [5, 3, 3], [9, 3, 5]], [], [[0, 10, 4], [5, 7, 4], [10, 3, 4]], [],
  [[0, 10, 5, 1.12], [7, 7, 7]], [[0, 7, 6], [8, 12, 6]], [[0, 5, 3], [6, 0, 7]], [[0, 7, 13, 1.1]]
]);

const RESPITE_THEME = theme(65, [
  [[2, 0, 9]], [[0, 0, 6], [8, 4, 6]], [], [[0, 2, 8]],
  [[2, 7, 7]], [], [[0, 4, 6], [8, 7, 6]], [],
  [[0, 7, 3], [6, 4, 7]], [], [[2, 2, 7]], [],
  [[0, 0, 6], [8, 4, 6]], [], [[2, 2, 7]], [[0, 0, 13, 1.1]]
]);

const HARBOR_THEME = theme(62, [
  [[2, 0, 8]], [[0, 5, 8, 1.08], [10, 5, 5], [14, 9, 1]], [[0, 5, 7, 1.08], [8, 5, 7], [12, -2, 3]], [[2, 4, 8]],
  [[0, 2, 2], [3, 7, 2], [6, 9, 2], [9, 6, 2], [12, 11, 3]], [[0, 5, 5, 1.08], [6, 0, 3], [10, 5, 5]], [[0, 7, 7, 1.08], [8, 10, 7], [12, 7, 3]], [[0, 4, 8, 1.08], [10, 0, 5], [14, 4, 1]],
  [], [[0, 5, 7, 1.08], [8, 10, 7], [12, 5, 3]], [[0, 5, 5, 1.08], [6, 0, 3], [10, 5, 5]], [[0, 7, 7, 1.08], [8, 7, 7], [12, 7, 3]],
  [[0, 5, 5, 1.08], [6, -2, 3], [10, 5, 5]], [[0, 5, 5, 1.08], [6, 9, 3], [10, 5, 5]], [[0, 4, 8, 1.08], [10, 0, 5], [14, 4, 1]], [[0, 7, 8, 1.08], [10, 7, 5]]
]);

const CANYON_THEME = theme(64, [
  [[2, 0, 8]], [[0, 3, 7, 1.08], [8, 7, 7], [12, 10, 3]], [[0, 5, 5, 1.08], [6, 5, 3], [10, 0, 5]], [[2, 3, 8]],
  [[0, 7, 5, 1.08], [6, 10, 3], [10, 7, 5]], [[0, 2, 5, 1.08], [6, -2, 3], [10, 2, 5]], [[0, 5, 5, 1.08], [6, 9, 3], [10, 5, 5]], [[0, 3, 8, 1.08], [10, -2, 5], [14, 3, 1]],
  [[0, 5, 8, 1.08], [10, 10, 5], [14, 5, 1]], [[0, 2, 5, 1.08], [6, -2, 3], [10, 2, 5]], [[0, 5, 5, 1.08], [6, 9, 3], [10, 5, 5]], [[2, 3, 8]],
  [[0, -2, 5, 1.08], [6, 2, 3], [10, 5, 5]], [[0, 10, 5, 1.08], [6, 7, 3], [10, 2, 5]], [[0, 0, 8, 1.08], [10, 5, 5], [14, 5, 1]], [[0, 12, 8, 1.08], [10, 7, 5]]
]);

const CAPITAL_THEME = theme(60, [
  [[2, 0, 8]], [[0, 1, 8, 1.08], [10, 5, 5], [12, 1, 3]], [[0, 0, 8, 1.08], [10, 0, 5]], [[2, 0, 8]],
  [[0, 1, 8, 1.08], [10, 5, 5], [12, 1, 3]], [[0, 0, 5, 1.08], [6, 0, 3], [10, 0, 5]], [[0, 0, 8, 1.08], [10, 3, 5]], [[0, 1, 8, 1.08], [10, -4, 5], [14, 1, 1]],
  [], [[0, 1, 8, 1.08], [10, 1, 5], [12, 5, 3]], [[0, 0, 5, 1.08], [6, -4, 3], [10, 0, 5]], [[0, 1, 8, 1.08], [10, 1, 5]],
  [[0, 3, 5, 1.08], [6, 0, 3], [10, -4, 5]], [[0, 1, 8, 1.08], [10, 1, 5], [12, 1, 3]], [[0, 5, 8, 1.08], [10, 1, 5], [14, -4, 1]], [[0, 0, 8, 1.08], [10, 0, 5]]
]);

const FOUNDRY_THEME = theme(66, [
  [[2, 0, 8]], [[0, 5, 6, 1.08], [7, 5, 3], [11, 5, 4]], [[0, -2, 8, 1.08], [10, -2, 5]], [[2, 0, 8]],
  [[0, 3, 6, 1.08], [7, 3, 3], [11, 3, 4]], [[0, 0, 5, 1.08], [6, -4, 3], [10, 0, 5]], [[0, 3, 6, 1.08], [7, 3, 3], [11, 3, 4]], [[0, -2, 8, 1.08], [10, -2, 5], [14, -2, 1]],
  [], [[0, 3, 6, 1.08], [7, 3, 3], [11, 3, 4]], [[0, 0, 5, 1.08], [6, -4, 3], [10, 0, 5]], [[0, 3, 8, 1.08], [10, 3, 5]],
  [[0, 2, 5, 1.08], [6, -2, 3], [10, -2, 5]], [[0, 0, 6, 1.08], [7, 3, 3], [11, 3, 4]], [[0, 3, 8, 1.08], [10, -2, 5], [14, -2, 1]], [[0, 0, 8, 1.08], [10, 3, 5]]
]);

const SNOWFIELD_THEME = theme(69, [
  [[2, 0, 8]], [], [[0, 4, 8, 1.08]], [],
  [], [[0, 9, 8, 1.08]], [[2, 0, 8]], [[0, 2, 8, 1.08]],
  [], [], [[0, 9, 8, 1.08]], [],
  [[0, 0, 8, 1.08]], [[0, 2, 8, 1.08], [10, 6, 5]], [[2, 0, 8]], [[0, 4, 8, 1.08], [10, 7, 5]]
]);

const SKYFRONT_THEME = theme(67, [
  [[2, 0, 8]], [[0, 4, 5, 1.08], [6, 7, 3], [10, 12, 5]], [[0, 9, 5, 1.08], [6, 5, 3], [10, 0, 5]], [[2, 4, 8]],
  [[0, 7, 5, 1.08], [6, 12, 3], [10, 7, 5]], [[0, 5, 5, 1.08], [6, -2, 3], [10, 5, 5]], [[0, 5, 8, 1.08], [10, 12, 5], [14, 9, 1]], [[0, 5, 5, 1.08], [6, -2, 3], [10, 5, 5]],
  [[0, 7, 8, 1.08], [10, 10, 5], [14, 10, 1]], [[0, 5, 5, 1.08], [6, 0, 3], [10, 5, 5]], [[0, 7, 5, 1.08], [6, 12, 3], [10, 7, 5]], [[2, 5, 8]],
  [[0, -2, 5, 1.08], [6, 2, 3], [10, 7, 5]], [[0, 10, 5, 1.08], [6, 10, 3], [10, 5, 5]], [[0, 2, 8, 1.08], [10, 5, 5], [14, 5, 1]], [[0, 12, 8, 1.08], [10, 7, 5]]
]);

const BABEL_THEME = theme(62, [
  [[2, 0, 8]], [[0, 0, 8, 1.08], [10, 7, 5]], [[0, 8, 8, 1.08], [10, 1, 5]], [[2, 0, 8]],
  [[0, 0, 8, 1.08], [10, 0, 5]], [[0, 8, 8, 1.08], [10, 8, 5]], [[0, 1, 8, 1.08], [10, 1, 5]], [[0, 1, 5, 1.08], [6, 1, 5], [12, 8, 3]],
  [], [[0, 8, 8, 1.08], [10, 0, 5]], [[0, 1, 8, 1.08], [10, 1, 5]], [[0, 1, 8, 1.08], [10, 8, 5]],
  [[0, 8, 5, 1.08], [6, 0, 3], [10, 0, 5]], [[0, 1, 8, 1.08], [10, 1, 5]], [[0, 8, 5, 1.08], [6, 8, 5], [12, 0, 3]], [[0, 0, 8, 1.08], [10, 0, 5]]
]);

const LEVIATHAN_THEME = theme(65, [
  [[2, 0, 8]], [[0, 3, 5, 1.08], [6, 7, 5], [12, 12, 3]], [[0, 7, 8, 1.08], [10, 3, 5]], [[2, 0, 8]],
  [[0, 3, 5, 1.08], [6, 7, 5], [12, 12, 3]], [[0, 5, 5, 1.08], [6, 2, 5], [12, -2, 3]], [[0, 3, 5, 1.08], [6, 7, 5], [12, 10, 3]], [[0, 5, 8, 1.08], [10, 5, 5], [14, 0, 1]],
  [], [[0, 3, 5, 1.08], [6, 7, 5], [12, 10, 3]], [[0, 7, 5, 1.08], [6, 3, 5], [12, 0, 3]], [[0, 5, 8, 1.08], [10, 5, 5]],
  [[0, 10, 5, 1.08], [6, 7, 3], [10, 2, 5]], [[0, -2, 5, 1.08], [6, 2, 5], [12, 5, 3]], [[0, 9, 5, 1.08], [6, 5, 5], [12, 5, 3]], [[0, 0, 8, 1.08], [10, 3, 5]]
]);

const MOLOCH_THEME = theme(61, [
  [[2, 0, 8]], [[0, 5, 6, 1.08], [7, 5, 8], [12, 5, 3]], [[0, -2, 8, 1.08], [10, -2, 5]], [[2, 0, 8]],
  [[0, 3, 6, 1.08], [7, 3, 8], [12, 3, 3]], [[0, 0, 8, 1.08], [10, 0, 5]], [[0, 0, 8, 1.08], [10, 5, 5]], [[0, 3, 5, 1.08], [6, 3, 5], [12, -2, 3]],
  [], [[0, -4, 6, 1.08], [7, 0, 8], [12, 3, 3]], [[0, 5, 8, 1.08], [10, 5, 5]], [[0, -2, 8, 1.08], [10, -2, 5]],
  [[0, 0, 5, 1.08], [6, 3, 3], [10, 3, 5]], [[0, 3, 6, 1.08], [7, 0, 8], [12, 0, 3]], [[0, -2, 5, 1.08], [6, 3, 5], [12, 3, 3]], [[0, 3, 8, 1.08], [10, 0, 5]]
]);

const SCORE_GAIN = 1.6;

function makeScore({ bpm, intensity, arrangement, story, chords, melody, padGain, bassGain, leadGain, pulseGain = 0, arpGain = 0, leadVoice = "arcade" }) {
  const formNames = FORMS[arrangement];
  if (!formNames || formNames.length !== SCORE_BARS) throw new Error(`未知或不完整曲式：${arrangement}`);
  if (chords.length !== SCORE_BARS) throw new Error(`${story} 和弦不是 ${SCORE_BARS} 小節`);
  return Object.freeze({
    bpm,
    intensity,
    arrangement,
    groove: arrangement,
    story,
    bars: SCORE_BARS,
    chords: Object.freeze(chords),
    melody,
    form: Object.freeze(formNames.map((name) => BAR_PLANS[name])),
    formNames,
    padGain: padGain * SCORE_GAIN,
    bassGain: bassGain * SCORE_GAIN,
    leadGain: leadGain * SCORE_GAIN,
    pulseGain: pulseGain * SCORE_GAIN,
    arpGain: arpGain * SCORE_GAIN,
    leadVoice
  });
}

export const MUSIC_SCORES = Object.freeze({
  menu: makeScore({ bpm: 74, intensity: 0, arrangement: "command", story: "戰前決心", chords: [chord(40), chord(40), chord(43, "major"), chord(40), chord(50, "major"), chord(47), chord(43, "major"), chord(45, "major"), chord(40), chord(50, "major"), chord(43, "major"), chord(47), chord(43, "major"), chord(40), chord(45, "major"), chord(40)], melody: MENU_THEME, padGain: 0.008, bassGain: 0.011, leadGain: 0.02, pulseGain: 0.004, leadVoice: "command" }),
  respite: makeScore({ bpm: 64, intensity: 0, arrangement: "respite", story: "戰後呼吸", chords: [chord(41, "major"), chord(41, "major"), chord(45), chord(43, "major"), chord(41, "major"), chord(48, "major"), chord(45), chord(38), chord(41, "major"), chord(43, "major"), chord(48, "major"), chord(45), chord(41, "major"), chord(48, "major"), chord(43, "major"), chord(41, "major")], melody: RESPITE_THEME, padGain: 0.009, bassGain: 0.01, leadGain: 0.018, pulseGain: 0.003, leadVoice: "respite" }),
  harbor: makeScore({ bpm: 116, intensity: 1, arrangement: "march", story: "港區黎明出擊", chords: [chord(38, "major"), chord(43, "major"), chord(48, "major"), chord(38, "major"), chord(38, "major"), chord(43, "major"), chord(45), chord(38, "major"), chord(43, "major"), chord(48, "major"), chord(43, "major"), chord(38, "major"), chord(48, "major"), chord(43, "major"), chord(38, "major"), chord(38, "major")], melody: HARBOR_THEME, padGain: 0.0075, bassGain: 0.016, leadGain: 0.025, pulseGain: 0.0045, arpGain: 0.0038, leadVoice: "brass" }),
  canyon: makeScore({ bpm: 128, intensity: 2, arrangement: "assault", story: "峽谷高速追擊", chords: [chord(40), chord(43, "major"), chord(45, "major"), chord(40), chord(47), chord(50, "major"), chord(45, "major"), chord(43, "major"), chord(50, "major"), chord(47), chord(45, "major"), chord(43, "major"), chord(50, "major"), chord(47), chord(45, "major"), chord(40)], melody: CANYON_THEME, padGain: 0.007, bassGain: 0.0165, leadGain: 0.0255, pulseGain: 0.0045, arpGain: 0.004, leadVoice: "flight" }),
  capital: makeScore({ bpm: 114, intensity: 3, arrangement: "siege", story: "首都廢墟攻堅", chords: [chord(36), chord(37, "major"), chord(36), chord(41), chord(46), chord(36), chord(44, "major"), chord(37, "major"), chord(36), chord(46), chord(41), chord(37, "major"), chord(44, "major"), chord(46), chord(37, "major"), chord(36)], melody: CAPITAL_THEME, padGain: 0.0075, bassGain: 0.017, leadGain: 0.025, pulseGain: 0.0048, arpGain: 0.0037, leadVoice: "siege" }),
  foundry: makeScore({ bpm: 120, intensity: 3, arrangement: "forge", story: "鑄造廠熱浪機械", chords: [chord(42), chord(47), chord(45, "major"), chord(42), chord(42), chord(47), chord(50, "major"), chord(45, "major"), chord(52, "major"), chord(50, "major"), chord(47), chord(45, "major"), chord(52, "major"), chord(42), chord(45, "major"), chord(42)], melody: FOUNDRY_THEME, padGain: 0.007, bassGain: 0.018, leadGain: 0.0245, pulseGain: 0.0048, arpGain: 0.0036, leadVoice: "forge" }),
  snowfield: makeScore({ bpm: 84, intensity: 2, arrangement: "frost", story: "雪原孤寂視野", chords: [chord(45, "major"), chord(45, "major"), chord(42), chord(47, "major"), chord(45, "major"), chord(42), chord(45, "major"), chord(47, "major"), chord(45, "major"), chord(42), chord(42), chord(45, "major"), chord(42), chord(47, "major"), chord(42), chord(45, "major")], melody: SNOWFIELD_THEME, padGain: 0.009, bassGain: 0.0145, leadGain: 0.023, pulseGain: 0.0035, arpGain: 0.0034, leadVoice: "crystal" }),
  skyfront: makeScore({ bpm: 136, intensity: 4, arrangement: "flight", story: "天際線最終突進", chords: [chord(43, "major"), chord(43, "major"), chord(48, "major"), chord(43, "major"), chord(43, "major"), chord(53, "major"), chord(48, "major"), chord(53, "major"), chord(50), chord(48, "major"), chord(43, "major"), chord(45), chord(50), chord(53, "major"), chord(45), chord(43, "major")], melody: SKYFRONT_THEME, padGain: 0.0068, bassGain: 0.017, leadGain: 0.026, pulseGain: 0.0045, arpGain: 0.004, leadVoice: "flight" }),
  bossBabel: makeScore({ bpm: 104, intensity: 5, arrangement: "babel", story: "Babel 巨構儀式", chords: [chord(38, "major"), chord(38, "major"), chord(39, "major"), chord(38, "major"), chord(38, "major"), chord(46, "major"), chord(39, "major"), chord(39, "major"), chord(38, "major"), chord(46, "major"), chord(39, "major"), chord(39, "major"), chord(43), chord(39, "major"), chord(46, "major"), chord(38, "major")], melody: BABEL_THEME, padGain: 0.008, bassGain: 0.019, leadGain: 0.0255, pulseGain: 0.0048, arpGain: 0.0038, leadVoice: "boss" }),
  bossLeviathan: makeScore({ bpm: 130, intensity: 5, arrangement: "leviathan", story: "Leviathan 盤旋追獵", chords: [chord(41), chord(41), chord(44, "major"), chord(41), chord(41), chord(51, "major"), chord(44, "major"), chord(46, "major"), chord(48), chord(44, "major"), chord(41), chord(46, "major"), chord(48), chord(51, "major"), chord(46, "major"), chord(41)], melody: LEVIATHAN_THEME, padGain: 0.007, bassGain: 0.0185, leadGain: 0.026, pulseGain: 0.0045, arpGain: 0.0043, leadVoice: "flight" }),
  bossMoloch: makeScore({ bpm: 116, intensity: 5, arrangement: "moloch", story: "Moloch 熔爐決戰", chords: [chord(37), chord(42), chord(40, "major"), chord(37), chord(37), chord(37), chord(42), chord(40, "major"), chord(45, "major"), chord(45, "major"), chord(42), chord(40, "major"), chord(45, "major"), chord(37), chord(40, "major"), chord(37)], melody: MOLOCH_THEME, padGain: 0.0075, bassGain: 0.0195, leadGain: 0.0255, pulseGain: 0.0048, arpGain: 0.0038, leadVoice: "forge" })
});

export function scorePosition(scene, absoluteStep) {
  const score = MUSIC_SCORES[scene] || MUSIC_SCORES.menu;
  const cycle = score.bars * SCORE_STEPS_PER_BAR;
  const position = ((Math.floor(absoluteStep) % cycle) + cycle) % cycle;
  const bar = Math.floor(position / SCORE_STEPS_PER_BAR);
  const step = position % SCORE_STEPS_PER_BAR;
  const planValue = score.form[bar];
  return {
    score,
    bar,
    step,
    chord: score.chords[bar],
    plan: planValue,
    melody: score.melody[bar].filter((event) => event.step === step),
    bass: BASS_PATTERNS[planValue.bass].filter((event) => event.step === step),
    pulse: PULSE_PATTERNS[planValue.pulse].filter((event) => event.step === step),
    arpeggio: ARPEGGIO_PATTERNS[planValue.arpeggio].filter((event) => event.step === step),
    drums: DRUM_PATTERNS[planValue.drums]
  };
}

export function chordMidiNotes(chordValue, octaveOffset = 12) {
  const intervals = CHORD_INTERVALS[chordValue.quality] || CHORD_INTERVALS.minor;
  return intervals.map((interval) => chordValue.root + octaveOffset + interval);
}
