import { AUDIO_ASSETS } from "./audio-assets.js";
import { BOSS_CHASSIS, zoneForRun } from "./config.js";
import {
  MUSIC_SCORES,
  chordMidiNotes,
  midiToFrequency,
  scorePosition
} from "./music-score.js";

export const AUDIO_DEFAULTS = Object.freeze({ music: 62, sfx: 28 });
export const PROCEDURAL_MIX = Object.freeze({
  padAttack: 0.34,
  melodyAttack: 0.034,
  battleKick: 0.0085,
  bossKick: 0.011,
  melodyGain: 0.024,
  reverbSend: 0.065,
  weaponBus: 0.13,
  musicOutput: 2,
  tonalLift: 1,
  masterOutput: 0.78
});

export const INDUSTRIAL_PULSE = Object.freeze({
  octave: 12,
  intervals: Object.freeze([0, 7]),
  waveform: "triangle",
  cutoff: 880,
  minimumDuration: 0.13
});

export const MUSIC = MUSIC_SCORES;

const SILENT_MODES = new Set([
  "paused",
  "safe-exit",
  "result",
  "retreat-confirm",
  "abandon-confirm",
  "restart-confirm"
]);
const STEM_NAMES = ["mix", "drums", "bass", "melody", "tension"];

function clamp(value, minimum = 0, maximum = 100) {
  const number = Number.isFinite(Number(value)) ? Number(value) : minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function volumeGain(percent) {
  return Math.pow(clamp(percent) / 100, 1.28);
}

function assetSource(entry) {
  return typeof entry === "string" ? entry : entry?.src;
}

function assetGain(entry) {
  return clamp(typeof entry === "object" ? entry.gain ?? 1 : 1, 0, 2);
}

export function musicState(run, mode = "menu") {
  const activeBoss = run?.enemies?.find((enemy) => enemy.type === "boss" && enemy.hp > 0);
  const inBattle = mode === "playing" && Boolean(run);
  let scene = "menu";
  let bossChassis = null;
  if (["safe-exit", "research", "result"].includes(mode)) scene = "respite";
  else if (inBattle && run.bossAlive) {
    bossChassis = activeBoss?.chassis || run.bossChassis || "babel";
    scene = BOSS_CHASSIS[bossChassis]?.music || BOSS_CHASSIS.babel.music;
  } else if (inBattle) scene = zoneForRun(run).id;

  const referenceSquad = Math.max(8, run?.maxSquad || run?.squad || 8);
  const boss = Boolean(bossChassis);
  return {
    active: !SILENT_MODES.has(mode),
    scene,
    boss,
    bossChassis,
    bossPhase: boss ? Math.max(1, run?.bossPhase || 1) : 0,
    lowSquad: inBattle && (run?.squad || 0) <= Math.max(4, Math.ceil(referenceSquad * 0.25)),
    counterProtocol: inBattle && (run?.weapon?.level || 0) >= 9,
    globalThreat: Boolean(run?.telegraphs?.some((telegraph) => telegraph.kind === "global-strike")),
    enraged: boss && (run?.bossKills || 0) >= 5 && (activeBoss?.battleClock || 0) >= 45
  };
}

export function externalStemLevels(state) {
  const intensity = MUSIC[state?.scene]?.intensity || 0;
  const boss = Boolean(state?.boss);
  return {
    mix: 0.68,
    drums: state?.globalThreat ? 0.18 : boss ? 0.36 + (state.bossPhase || 1) * 0.035 : 0.24 + intensity * 0.035,
    bass: boss ? 0.5 : 0.4 + intensity * 0.025,
    melody: state?.lowSquad ? 0.68 : 0.82,
    tension: state?.globalThreat ? 0.72 : state?.enraged ? 0.64 : boss ? 0.24 + (state.bossPhase || 1) * 0.06 : state?.counterProtocol ? 0.3 : 0.06
  };
}

export class AudioSystem {
  constructor(settings = true) {
    const options = typeof settings === "boolean" ? { enabled: settings } : settings || {};
    this.enabled = options.enabled ?? true;
    this.musicVolume = clamp(options.musicVolume ?? AUDIO_DEFAULTS.music);
    this.sfxVolume = clamp(options.sfxVolume ?? AUDIO_DEFAULTS.sfx);
    this.assets = options.assets || AUDIO_ASSETS;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.limiter = null;
    this.musicBus = null;
    this.musicToneBus = null;
    this.musicHighpass = null;
    this.musicFilter = null;
    this.musicDuck = null;
    this.musicReverbSend = null;
    this.musicReverb = null;
    this.musicReverbReturn = null;
    this.sfxBus = null;
    this.weaponBus = null;
    this.sfxFilter = null;
    this.noiseBuffer = null;
    this.noiseIndex = 0;
    this.state = musicState(null, "menu");
    this.scene = this.state.scene;
    this.step = 0;
    this.nextTime = 0;
    this.lastShot = 0;
    this.lastEffectAt = new Map();
    this.nodes = { music: new Set(), sfx: new Set() };
    this.nodeGroups = new Map();
    this.externalBuffers = new Map();
    this.externalBufferPromises = new Map();
    this.externalErrors = [];
    this.externalFailedScenes = new Set();
    this.externalLoadingScene = null;
    this.externalLoadToken = 0;
    this.externalScene = null;
    this.externalNodes = new Map();
    this.silenceToken = 0;
    this.suspendTimer = null;
    this.pageVisible = typeof document === "undefined" || !document.hidden;

    this.visibilityHandler = () => this.setPageVisible(!globalThis.document?.hidden);
    this.pageHideHandler = () => this.setPageVisible(false);
    this.pageShowHandler = () => { this.pageVisible = !globalThis.document?.hidden; };
    globalThis.document?.addEventListener?.("visibilitychange", this.visibilityHandler);
    globalThis.addEventListener?.("pagehide", this.pageHideHandler);
    globalThis.addEventListener?.("pageshow", this.pageShowHandler);

    this.timer = setInterval(() => this.scheduleMusic(), 45);
    this.timer.unref?.();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.silence({ suspend: true });
      return;
    }
    this.unlock();
  }

  setMix(musicVolume, sfxVolume) {
    this.musicVolume = clamp(musicVolume);
    this.sfxVolume = clamp(sfxVolume);
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicBus?.gain.setTargetAtTime(volumeGain(this.musicVolume) * PROCEDURAL_MIX.musicOutput, now, 0.035);
    this.sfxBus?.gain.setTargetAtTime(volumeGain(this.sfxVolume), now, 0.035);
    if (this.musicVolume <= 0) {
      this.stopExternalScene(0.05);
      this.stopNodes("music", 0.055);
      this.nextTime = 0;
    }
    if (this.sfxVolume <= 0) this.stopNodes("sfx", 0.035);
  }

  createGraph() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return null;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.0001;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;

    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.musicBus = this.context.createGain();
    this.musicBus.gain.value = volumeGain(this.musicVolume) * PROCEDURAL_MIX.musicOutput;
    this.musicToneBus = this.context.createGain();
    this.musicToneBus.gain.value = PROCEDURAL_MIX.tonalLift;
    this.musicHighpass = this.context.createBiquadFilter();
    this.musicHighpass.type = "highpass";
    this.musicHighpass.frequency.value = 48;
    this.musicHighpass.Q.value = 0.32;
    this.musicFilter = this.context.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 4400;
    this.musicFilter.Q.value = 0.34;
    this.musicDuck = this.context.createGain();
    this.musicDuck.gain.value = 1;
    this.musicReverbSend = this.context.createGain();
    this.musicReverbSend.gain.value = PROCEDURAL_MIX.reverbSend;
    this.musicReverb = this.context.createConvolver();
    this.musicReverb.buffer = this.createImpulseResponse();
    this.musicReverbReturn = this.context.createGain();
    this.musicReverbReturn.gain.value = 0.28;

    this.sfxBus = this.context.createGain();
    this.sfxBus.gain.value = volumeGain(this.sfxVolume);
    this.weaponBus = this.context.createGain();
    this.weaponBus.gain.value = PROCEDURAL_MIX.weaponBus;
    this.sfxFilter = this.context.createBiquadFilter();
    this.sfxFilter.type = "lowpass";
    this.sfxFilter.frequency.value = 4300;
    this.sfxFilter.Q.value = 0.28;

    this.musicToneBus.connect(this.musicBus);
    this.musicToneBus.connect(this.musicReverbSend).connect(this.musicReverb).connect(this.musicReverbReturn).connect(this.musicBus);
    this.musicBus.connect(this.musicHighpass).connect(this.musicFilter).connect(this.musicDuck).connect(this.master);
    this.weaponBus.connect(this.sfxBus);
    this.sfxBus.connect(this.sfxFilter).connect(this.master);
    this.master.connect(this.compressor).connect(this.limiter).connect(this.context.destination);
    this.noiseBuffer = this.createNoiseBuffer();
    return this.context;
  }

  unlock() {
    if (!this.enabled || !this.pageVisible || !this.state.active) return this.context;
    if (!this.context) this.createGraph();
    if (!this.context) return null;
    this.silenceToken += 1;
    clearTimeout(this.suspendTimer);
    const resume = () => {
      if (!this.enabled || !this.pageVisible || !this.state.active || !this.master) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(PROCEDURAL_MIX.masterOutput, now, 0.075);
      this.nextTime = now + 0.06;
      this.preloadExternalEffects();
      this.ensureExternalScene();
    };
    if (this.context.state === "suspended" || this.context.state === "interrupted") {
      Promise.resolve(this.context.resume()).then(resume).catch(() => {});
    } else resume();
    return this.context;
  }

  setPageVisible(visible) {
    this.pageVisible = Boolean(visible);
    if (!this.pageVisible) this.silence({ suspend: true, fade: 0.025 });
  }

  silence({ suspend = true, fade = 0.055 } = {}) {
    const token = ++this.silenceToken;
    clearTimeout(this.suspendTimer);
    this.nextTime = 0;
    this.step = 0;
    this.externalLoadToken += 1;
    this.externalLoadingScene = null;
    if (!this.context) return;
    const now = this.context.currentTime;
    const stopDelay = Math.max(0.015, fade + 0.012);
    if (this.master) {
      const gain = this.master.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.linearRampToValueAtTime(0.0001, now + fade);
    }
    this.stopExternalScene(fade);
    this.stopNodes("all", stopDelay);
    if (this.musicDuck) {
      this.musicDuck.gain.cancelScheduledValues(now);
      this.musicDuck.gain.setValueAtTime(1, now + stopDelay);
    }
    if (!suspend) return;
    this.suspendTimer = setTimeout(() => {
      const shouldSuspend = token === this.silenceToken
        && (!this.enabled || !this.pageVisible || !this.state.active);
      if (shouldSuspend && this.context?.state === "running") this.context.suspend().catch?.(() => {});
    }, Math.ceil((stopDelay + 0.035) * 1000));
  }

  destroy() {
    clearInterval(this.timer);
    clearTimeout(this.suspendTimer);
    globalThis.document?.removeEventListener?.("visibilitychange", this.visibilityHandler);
    globalThis.removeEventListener?.("pagehide", this.pageHideHandler);
    globalThis.removeEventListener?.("pageshow", this.pageShowHandler);
    this.silence({ suspend: false, fade: 0.01 });
    this.context?.close?.();
  }

  createNoiseBuffer() {
    const length = Math.floor(this.context.sampleRate * 2);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    let seed = 0x51f15e;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = seed / 0xffffffff * 2 - 1;
      previous = previous * 0.35 + white * 0.65;
      data[index] = previous;
    }
    return buffer;
  }

  createImpulseResponse() {
    const duration = 1.25;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    let seed = 0x1a2b3c4d;
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const white = seed / 0xffffffff * 2 - 1;
        const progress = index / length;
        data[index] = white * Math.pow(1 - progress, 2.7) * (channel ? 0.88 : 0.94);
      }
    }
    return buffer;
  }

  setGameState(run, mode = "menu") {
    const previous = this.state;
    const next = musicState(run, mode);
    this.state = next;
    const sceneChanged = next.scene !== this.scene;

    if (sceneChanged) {
      this.scene = next.scene;
      this.step = 0;
      this.nextTime = this.context ? this.context.currentTime + 0.1 : 0;
      this.externalLoadToken += 1;
      this.externalLoadingScene = null;
      this.stopExternalScene(0.12);
      this.stopNodes("music", 0.13);
      this.transitionMusic();
    }

    if (previous.active && !next.active) {
      this.silence({ suspend: true });
      return;
    }

    if (!this.context || !this.master) return;
    if (this.enabled && this.pageVisible && next.active && this.context.state === "running") {
      this.master.gain.setTargetAtTime(PROCEDURAL_MIX.masterOutput, this.context.currentTime, 0.08);
    }
    if (this.musicFilter && previous.lowSquad !== next.lowSquad) {
      this.musicFilter.frequency.setTargetAtTime(next.lowSquad ? 3400 : 4400, this.context.currentTime, 0.28);
    }
    if (this.musicReverbSend && sceneChanged) {
      const space = ["menu", "respite"].includes(next.scene) ? 0.095 : next.boss ? 0.045 : 0.06;
      this.musicReverbSend.gain.setTargetAtTime(space, this.context.currentTime, 0.28);
    }
    if (this.externalScene === next.scene) this.updateExternalStemLevels();
    if (this.context.state === "running" && previous.boss && next.boss
      && next.bossPhase > previous.bossPhase && !next.globalThreat) {
      this.effect("boss-phase", { phase: next.bossPhase });
    }
    if (this.context.state === "running" && !previous.enraged && next.enraged && !next.globalThreat) this.effect("enrage");
  }

  transitionMusic() {
    if (!this.musicDuck || !this.context || !this.state.active) return;
    const now = this.context.currentTime;
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(0.08, now + 0.09);
    gain.linearRampToValueAtTime(1, now + 0.7);
  }

  output(bus = "music", group = null) {
    if (bus === "sfx") return group === "weapon" ? this.weaponBus || this.sfxBus : this.sfxBus;
    return this.musicBus;
  }

  trackNode(source, bus = "music", group = null) {
    this.nodes[bus]?.add(source);
    if (group) {
      if (!this.nodeGroups.has(group)) this.nodeGroups.set(group, new Set());
      this.nodeGroups.get(group).add(source);
    }
    const cleanup = () => {
      this.nodes[bus]?.delete(source);
      if (group) this.nodeGroups.get(group)?.delete(source);
      try { source.disconnect(); } catch {}
    };
    source.addEventListener?.("ended", cleanup, { once: true });
    return source;
  }

  stopNodes(bus = "all", delay = 0.035) {
    if (!this.context) return;
    const sets = bus === "all" ? [this.nodes.music, this.nodes.sfx] : [this.nodes[bus]];
    const when = this.context.currentTime + Math.max(0, delay);
    for (const set of sets) {
      if (!set) continue;
      for (const source of [...set]) {
        try { source.stop(when); } catch {}
      }
    }
    if (bus === "all" || bus === "music") {
      this.externalScene = null;
      this.externalNodes.clear();
    }
  }

  tone(frequency, start, duration, gain, type = "square", cutoff = 1400, bus = "music", endFrequency = null, detune = 0, group = null) {
    const destination = this.output(bus, group);
    if (!destination || !this.context) return null;
    const oscillator = this.trackNode(this.context.createOscillator(), bus, group);
    const volume = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    oscillator.detune.value = detune;
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter).connect(volume).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
    return oscillator;
  }

  softTone(frequency, start, duration, gain, type = "triangle", cutoff = 1800,
    attack = PROCEDURAL_MIX.melodyAttack, release = 0.18, detune = 0, pan = 0, spatial = true) {
    const destination = spatial ? this.musicToneBus || this.musicBus : this.musicBus;
    if (!destination || !this.context) return null;
    const oscillator = this.trackNode(this.context.createOscillator(), "music");
    const volume = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner?.();
    const attackTime = Math.min(Math.max(0.015, attack), duration * 0.38);
    const releaseTime = Math.min(Math.max(0.06, release), duration * 0.46);
    const releaseAt = Math.max(start + attackTime + 0.01, start + duration - releaseTime);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    oscillator.detune.value = detune;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.35;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.linearRampToValueAtTime(Math.max(0.0002, gain), start + attackTime);
    volume.gain.setValueAtTime(Math.max(0.0002, gain), releaseAt);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter).connect(volume);
    if (panner) {
      panner.pan.value = Math.max(-0.7, Math.min(0.7, pan));
      volume.connect(panner).connect(destination);
    } else volume.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.035);
    return oscillator;
  }

  padChord(chordValue, start, duration, gain = 0.018) {
    const notes = chordMidiNotes(chordValue, 12);
    const safeDuration = Math.max(0.2, duration);
    this.softTone(midiToFrequency(notes[0]), start, safeDuration, gain, "triangle", 1050,
      PROCEDURAL_MIX.padAttack, 0.5, -4, -0.32);
    this.softTone(midiToFrequency(notes[1]), start + 0.035, safeDuration - 0.035, gain * 0.42, "sine", 1320,
      PROCEDURAL_MIX.padAttack, 0.46, 2, 0.04);
    this.softTone(midiToFrequency(notes[2]), start + 0.065, safeDuration - 0.065, gain * 0.34, "triangle", 1480,
      PROCEDURAL_MIX.padAttack, 0.44, 5, 0.32);
  }

  bassNote(midi, start, duration = 0.34, gain = 0.026) {
    const frequency = midiToFrequency(midi);
    const safeDuration = Math.max(0.09, duration);
    this.softTone(frequency, start, safeDuration, gain, "triangle", 520, 0.022, 0.14, 0, -0.05, false);
    this.softTone(frequency / 2, start, safeDuration, gain * 0.26, "sine", 220, 0.02, 0.15, 0, 0.04, false);
  }

  melodyNote(midi, start, duration = 0.34, gain = PROCEDURAL_MIX.melodyGain, pan = 0, accent = 1, voice = "arcade") {
    const frequency = midiToFrequency(midi);
    const safeDuration = Math.max(0.08, duration);
    const level = gain * accent;
    const timbres = {
      command: ["triangle", 1900, "sine", 0.1],
      respite: ["sine", 1750, "triangle", 0.08],
      brass: ["triangle", 2350, "sawtooth", 0.085],
      flight: ["triangle", 2550, "square", 0.05],
      siege: ["triangle", 2050, "sine", 0.09],
      forge: ["triangle", 1850, "sawtooth", 0.065],
      crystal: ["sine", 2700, "triangle", 0.11],
      boss: ["triangle", 2150, "sawtooth", 0.075],
      arcade: ["triangle", 2250, "sawtooth", 0.075]
    };
    const [primary, cutoff, secondary, secondaryGain] = timbres[voice] || timbres.arcade;
    this.softTone(frequency, start, safeDuration, level, primary, cutoff,
      PROCEDURAL_MIX.melodyAttack, 0.22, -3, pan);
    this.softTone(frequency, start + 0.014, safeDuration - 0.014, level * secondaryGain, secondary, cutoff * 0.72,
      0.025, 0.22, 5, -pan * 0.4);
  }

  arpeggioNote(chordValue, voice, start, duration = 0.11, gain = 0.008, pan = 0) {
    const chordNotes = chordMidiNotes(chordValue, 24);
    const midi = chordNotes[voice % chordNotes.length] + (voice >= chordNotes.length ? 12 : 0);
    const frequency = midiToFrequency(midi);
    this.softTone(frequency, start, Math.max(0.1, duration), gain, "triangle", 2050,
      0.024, 0.11, voice % 2 ? 3 : -3, pan, true);
  }

  pulseNote(chordValue, voice, start, duration = 0.1, gain = 0.013, pan = 0) {
    const interval = INDUSTRIAL_PULSE.intervals[voice % INDUSTRIAL_PULSE.intervals.length];
    const midi = chordValue.root + INDUSTRIAL_PULSE.octave + interval;
    const frequency = midiToFrequency(midi);
    const safeDuration = Math.max(INDUSTRIAL_PULSE.minimumDuration, duration);
    this.softTone(frequency, start, safeDuration, gain * 0.74, INDUSTRIAL_PULSE.waveform,
      INDUSTRIAL_PULSE.cutoff, 0.025, 0.11, -4, pan * 0.45, false);
    this.softTone(frequency / 2, start, safeDuration, gain * 0.16, "sine", 320,
      0.028, 0.12, 0, -pan * 0.25, false);
  }

  brassStab(chordValue, start, duration = 0.22, gain = 0.014) {
    const notes = chordMidiNotes(chordValue, 24);
    [notes[0], notes[2]].forEach((midi, index) => {
      this.softTone(midiToFrequency(midi), start + index * 0.01, duration, gain * (1 - index * 0.22),
        "triangle", 1380 + index * 180, 0.025, 0.17, index * 4 - 2, index ? 0.2 : -0.2);
    });
  }

  threatDrone(chordValue, start, duration, gain = 0.02) {
    const root = midiToFrequency(chordValue.root);
    this.softTone(root, start, duration, gain, "sawtooth", 520, 0.08, 0.22, -8, -0.18, false);
    this.softTone(root * Math.pow(2, 1 / 12), start + 0.02, duration - 0.02, gain * 0.58,
      "triangle", 780, 0.1, 0.2, 6, 0.18, false);
  }

  noise(start, duration, gain, cutoff = 1800, filterType = "bandpass", bus = "music", group = null) {
    const destination = this.output(bus, group);
    if (!destination || !this.context || !this.noiseBuffer) return null;
    const source = this.trackNode(this.context.createBufferSource(), bus, group);
    const filter = this.context.createBiquadFilter();
    const volume = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = filterType === "bandpass" ? 0.9 : 0.35;
    volume.gain.setValueAtTime(Math.max(0.0002, gain), start);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(volume).connect(destination);
    const offset = (this.noiseIndex * 0.137) % 1.75;
    this.noiseIndex += 1;
    source.start(start, offset);
    source.stop(start + duration + 0.02);
    return source;
  }

  kick(start, gain = PROCEDURAL_MIX.battleKick, bus = "music") {
    const destination = this.output(bus);
    if (!destination || !this.context) return;
    const oscillator = this.trackNode(this.context.createOscillator(), bus);
    const volume = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(68, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.075);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.004);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.105);
    oscillator.connect(volume).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + 0.12);
  }

  snare(start, gain = 0.016, bus = "music") {
    this.noise(start, 0.062, gain, 1650, "bandpass", bus);
    this.tone(148, start, 0.052, gain * 0.16, "triangle", 680, bus, 122);
  }

  hat(start, gain = 0.0035, bus = "music") {
    this.noise(start, 0.016, gain, 4800, "highpass", bus);
  }

  metal(start, gain = 0.006, bus = "music") {
    this.noise(start, 0.032, gain * 0.68, 2200, "bandpass", bus);
    this.tone(180, start, 0.045, gain * 0.2, "triangle", 720, bus, 154, -4);
  }

  tom(start, midi = 38, gain = 0.013, bus = "music") {
    const frequency = midiToFrequency(midi);
    this.tone(frequency, start, 0.13, gain, "sine", 620, bus, frequency * 0.72);
  }

  hasExternalMusic(scene = this.scene) {
    if (this.externalFailedScenes.has(scene)) return false;
    const tracks = this.assets?.music?.[scene] || {};
    return STEM_NAMES.some((name) => Boolean(assetSource(tracks[name])));
  }

  async loadExternalBuffer(key, entry) {
    const source = assetSource(entry);
    if (!source || !this.context) return null;
    if (this.externalBuffers.has(key)) return this.externalBuffers.get(key);
    if (this.externalBufferPromises.has(key)) return this.externalBufferPromises.get(key);
    const promise = fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => this.context.decodeAudioData(bytes))
      .then((buffer) => {
        this.externalBuffers.set(key, buffer);
        return buffer;
      })
      .catch((error) => {
        this.externalErrors.push(`${key}: ${error.message}`);
        return null;
      });
    this.externalBufferPromises.set(key, promise);
    return promise;
  }

  ensureExternalScene() {
    const scene = this.scene;
    if (!this.context || this.context.state !== "running" || !this.state.active || !this.pageVisible
      || this.musicVolume <= 0 || !this.hasExternalMusic(scene)) return false;
    if (this.externalScene === scene) {
      this.updateExternalStemLevels();
      return true;
    }
    if (this.externalLoadingScene === scene) return true;
    const token = ++this.externalLoadToken;
    this.externalLoadingScene = scene;
    const tracks = this.assets.music[scene];
    Promise.all(STEM_NAMES.map(async (name) => ({
      name,
      entry: tracks[name],
      buffer: await this.loadExternalBuffer(`music:${scene}:${name}`, tracks[name])
    }))).then((loaded) => {
      if (token !== this.externalLoadToken || this.scene !== scene || !this.state.active || !this.pageVisible) return;
      const usable = loaded.filter((item) => item.buffer);
      this.externalLoadingScene = null;
      if (!usable.length) {
        this.externalFailedScenes.add(scene);
        return;
      }
      this.stopExternalScene(0.08);
      const start = this.context.currentTime + 0.045;
      const levels = externalStemLevels(this.state);
      for (const item of usable) {
        const source = this.trackNode(this.context.createBufferSource(), "music");
        const gain = this.context.createGain();
        source.buffer = item.buffer;
        source.loop = true;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(levels[item.name] * assetGain(item.entry), start + 0.45);
        source.connect(gain).connect(this.musicBus);
        source.start(start);
        this.externalNodes.set(item.name, { source, gain, entry: item.entry, level: levels[item.name] });
      }
      this.externalScene = scene;
      this.stopProceduralMusicExceptExternal();
    });
    return true;
  }

  stopProceduralMusicExceptExternal() {
    const keep = new Set([...this.externalNodes.values()].map((item) => item.source));
    const when = this.context.currentTime + 0.08;
    for (const source of [...this.nodes.music]) {
      if (keep.has(source)) continue;
      try { source.stop(when); } catch {}
    }
  }

  updateExternalStemLevels() {
    if (!this.context || this.externalScene !== this.scene) return;
    const levels = externalStemLevels(this.state);
    const now = this.context.currentTime;
    for (const [name, node] of this.externalNodes) {
      const next = levels[name] * assetGain(node.entry);
      if (Math.abs(next - node.level) < 0.015) continue;
      node.level = next;
      node.gain.gain.setTargetAtTime(next, now, 0.18);
    }
  }

  stopExternalScene(fade = 0.1) {
    if (!this.context || !this.externalNodes.size) {
      this.externalScene = null;
      this.externalNodes.clear();
      return;
    }
    const now = this.context.currentTime;
    for (const node of this.externalNodes.values()) {
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), now);
      node.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
      try { node.source.stop(now + fade + 0.015); } catch {}
    }
    this.externalScene = null;
    this.externalNodes.clear();
  }

  preloadExternalEffects() {
    for (const [name, entry] of Object.entries(this.assets?.sfx || {})) {
      this.loadExternalBuffer(`sfx:${name}`, entry);
    }
  }

  playExternalEffect(name, { gain = 1, group = null } = {}) {
    const entry = this.assets?.sfx?.[name];
    const buffer = this.externalBuffers.get(`sfx:${name}`);
    if (!entry || !buffer || !this.context || this.context.state !== "running") return false;
    const source = this.trackNode(this.context.createBufferSource(), "sfx", group);
    const volume = this.context.createGain();
    source.buffer = buffer;
    volume.gain.value = assetGain(entry) * clamp(gain, 0, 2);
    source.connect(volume).connect(this.output("sfx", group));
    source.start();
    return true;
  }

  scheduleMusic() {
    if (!this.enabled || !this.state.active || !this.pageVisible || this.musicVolume <= 0) return;
    const context = this.context;
    if (!context || context.state !== "running") return;
    if (this.ensureExternalScene()) return;
    const pattern = MUSIC[this.scene] || MUSIC.menu;
    const interval = 60 / pattern.bpm / 4;
    if (!this.nextTime || this.nextTime < context.currentTime - 0.2) this.nextTime = context.currentTime + 0.04;

    while (this.nextTime < context.currentTime + 0.11) {
      this.scheduleStep(pattern, this.step, this.nextTime, interval);
      this.step += 1;
      this.nextTime += interval;
    }
  }

  scheduleStep(pattern, absoluteStep, time, interval) {
    const frame = scorePosition(this.scene, absoluteStep);
    const { bar, step, chord, plan, melody, bass, pulse, arpeggio, drums } = frame;
    const boss = Boolean(this.state.boss);
    const phase = boss ? Math.max(1, this.state.bossPhase || 1) : 1;
    const barDuration = interval * 16;
    const dynamic = plan.dynamic * (boss ? 0.9 + phase * 0.035 : 1);

    if (this.state.globalThreat) {
      if (step === 0) this.threatDrone(chord, time, barDuration * 0.96, boss ? 0.013 : 0.01);
      if (step === 0 || step === 8) {
        this.bassNote(chord.root, time, interval * 5.5, pattern.bassGain * 0.48);
      }
      if ([0, 4, 8, 12].includes(step)) {
        this.pulseNote(chord, step / 4, time, interval * 0.72, 0.0038, step < 8 ? -0.14 : 0.14);
      }
      return;
    }

    if (step === 0 && plan.pad) {
      this.padChord(chord, time, barDuration * 0.97, pattern.padGain * dynamic);
    }
    if (step === 0 && plan.stab) {
      this.brassStab(chord, time + interval * 0.08, interval * 1.55, (boss ? 0.0058 : 0.0048) * dynamic);
    }

    for (const event of bass) {
      const gain = pattern.bassGain * event.velocity * dynamic * (this.state.lowSquad ? 0.86 : 1);
      this.bassNote(chord.root + event.interval, time, interval * event.length * 0.92, gain);
    }

    if (drums.kick.includes(step)) {
      const gain = boss
        ? PROCEDURAL_MIX.bossKick * (1 + (phase - 1) * 0.035)
        : PROCEDURAL_MIX.battleKick * (1 + pattern.intensity * 0.018);
      this.kick(time, gain * dynamic);
    }
    if (drums.snare.includes(step)) this.snare(time, (boss ? 0.0074 : 0.0058 + pattern.intensity * 0.00025) * dynamic);
    if (drums.hat.includes(step)) this.hat(time, (boss ? 0.00125 : 0.00095 + pattern.intensity * 0.00008) * dynamic);
    if (drums.metal.includes(step) && bar % 2 === 1) this.metal(time, (boss ? 0.0019 : 0.00145) * dynamic);

    if (boss && phase >= 2 && bar % 4 === 3 && step === 14) this.tom(time, 36, 0.0065 * dynamic);
    if (boss && phase >= 3 && bar % 2 === 1 && step === 14) this.hat(time, 0.0009 * dynamic);
    if (boss && this.state.enraged && bar % 4 === 3 && step === 11) this.tom(time, 31, 0.0075 * dynamic);
    if (this.state.counterProtocol && bar % 4 === 2 && step === 10) this.metal(time, 0.00135 * dynamic);

    for (const event of pulse) {
      const phaseGain = boss ? 0.78 + phase * 0.05 : 1;
      this.pulseNote(chord, event.voice, time, interval * event.length * 0.74,
        pattern.pulseGain * event.velocity * phaseGain * dynamic, event.voice % 2 ? 0.18 : -0.18);
    }

    for (const event of arpeggio) {
      const phaseGain = boss ? 0.78 + phase * 0.04 : 1;
      this.arpeggioNote(chord, event.voice, time, interval * event.length * 0.82,
        pattern.arpGain * event.velocity * phaseGain * dynamic, event.voice % 2 ? 0.24 : -0.24);
    }

    for (const event of melody) {
      const panDirection = (bar + (event.step < 8 ? 0 : 1)) % 2 ? 0.15 : -0.15;
      const dangerGain = this.state.lowSquad ? 0.88 : 1;
      this.melodyNote(event.midi, time, interval * event.length * 0.97,
        pattern.leadGain * dangerGain * dynamic, panDirection, event.velocity, pattern.leadVoice);
    }

    if (this.state.lowSquad && bar % 4 === 0 && step === 0) {
      this.softTone(55, time, interval * 5.5, 0.0055, "sine", 380, 0.15, 0.28, 0, 0, false);
    }
  }

  duckMusic(level = 0.28, duration = 0.4) {
    if (!this.musicDuck || !this.context) return;
    const now = this.context.currentTime;
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(Math.max(0.0001, level), now + 0.025);
    gain.linearRampToValueAtTime(1, now + Math.max(0.08, duration));
  }

  canPlaySfx() {
    return this.enabled && this.state.active && this.pageVisible && this.sfxVolume > 0;
  }

  beep(frequency, duration, gain = 0.02, type = "square", group = null) {
    if (!this.canPlaySfx()) return;
    const context = this.unlock();
    if (!context || context.state !== "running") return;
    this.tone(frequency, context.currentTime, duration, gain, type, 2100, "sfx", null, 0, group);
  }

  shot(weaponId) {
    if (!this.canPlaySfx()) return;
    const now = performance.now();
    if (now - this.lastShot < 155 || (this.nodeGroups.get("weapon")?.size || 0) >= 2) return;
    this.lastShot = now;
    const externalName = `weapon-${weaponId}`;
    if (this.playExternalEffect(externalName, { gain: 0.54, group: "weapon" })) return;
    const values = {
      rocket: [84, 0.06, 0.011],
      shotgun: [130, 0.038, 0.0065],
      laser: [260, 0.045, 0.006],
      railgun: [60, 0.115, 0.013],
      minigun: [310, 0.02, 0.002],
      rifle: [190, 0.022, 0.0032]
    }[weaponId];
    if (values) this.beep(...values, "square", "weapon");
  }

  globalCharge({ duration = 2, enrage = false } = {}) {
    if (!this.canPlaySfx()) return;
    const context = this.unlock();
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    this.duckMusic(0.52, duration);
    this.tone(enrage ? 48 : 62, now, duration, 0.018, "sawtooth", 1200, "sfx", enrage ? 840 : 660);
    this.tone(enrage ? 34 : 41, now, duration, 0.014, "sine", 320, "sfx", enrage ? 170 : 138);
    this.noise(now, duration, 0.0042, 1900, "bandpass", "sfx");
    const pulses = Math.max(3, Math.floor(duration / 0.38));
    for (let index = 0; index < pulses; index += 1) {
      const progress = index / Math.max(1, pulses - 1);
      const at = now + 0.16 + progress * Math.max(0.1, duration - 0.32);
      const pulse = 165 + progress * 95;
      this.tone(pulse, at, 0.052, 0.0025 + progress * 0.0022, "triangle", 720, "sfx", pulse * 1.04);
    }
  }

  effect(name, options = {}) {
    if (!this.canPlaySfx()) return;
    const cooldown = { kill: 95, hit: 70, gate: 90, drop: 110 }[name] || 0;
    const clock = performance.now();
    if (cooldown && clock - (this.lastEffectAt.get(name) || 0) < cooldown) return;
    if (cooldown) this.lastEffectAt.set(name, clock);
    if (this.playExternalEffect(name, options)) return;
    if (name === "global-charge") {
      this.globalCharge(options);
      return;
    }
    const context = this.unlock();
    if (!context || context.state !== "running") return;
    const now = context.currentTime;

    if (name === "kill") {
      this.noise(now, 0.018, 0.0011, 2300, "bandpass", "sfx");
      return;
    }

    if (name === "global-interrupt") {
      this.duckMusic(0.64, 0.28);
      [392, 587.33, 783.99].forEach((frequency, index) => {
        this.tone(frequency, now + index * 0.07, 0.13, 0.017 - index * 0.002, "triangle", 2800, "sfx", frequency * 1.08);
      });
      return;
    }
    if (name === "global-impact") {
      this.duckMusic(0.36, 0.54);
      this.kick(now, 0.078, "sfx");
      this.noise(now, 0.32, 0.038, 600, "lowpass", "sfx");
      this.tone(46, now, 0.48, 0.047, "sawtooth", 460, "sfx", 25);
      return;
    }
    if (name === "boss-phase") {
      const phase = options.phase || 2;
      this.duckMusic(0.58, 0.4);
      [73.42, 92.5, 110].slice(0, phase).forEach((frequency, index) => {
        this.tone(frequency, now + index * 0.08, 0.3, 0.022, "sawtooth", 980, "sfx", frequency * 0.82);
      });
      this.metal(now + 0.04, 0.015, "sfx");
      return;
    }
    if (name === "enrage") {
      this.duckMusic(0.5, 0.52);
      this.noise(now, 0.46, 0.024, 980, "bandpass", "sfx");
      this.tone(55, now, 0.56, 0.032, "sawtooth", 780, "sfx", 82.41);
      this.metal(now + 0.1, 0.017, "sfx");
      return;
    }
    if (name === "victory") {
      this.duckMusic(0.48, 0.58);
      [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
        this.tone(frequency, now + index * 0.075, 0.22, 0.019, "triangle", 2450, "sfx");
      });
      return;
    }

    const effects = {
      start: [150, 0.065, 0.018, "sawtooth"],
      gate: [760, 0.068, 0.013, "triangle"],
      drop: [820, 0.062, 0.0105, "triangle"],
      hit: [92, 0.075, 0.014, "sawtooth"],
      support: [300, 0.15, 0.019, "triangle"],
      airstrike: [52, 0.4, 0.035, "sawtooth"],
      boss: [48, 0.46, 0.032, "sawtooth"],
      revive: [180, 0.22, 0.025, "triangle"],
      ultimate: [1080, 0.19, 0.025, "triangle"]
    };
    const cue = effects[name];
    if (cue) this.beep(...cue);
  }
}
