// External audio slots. Keep these empty to use the built-in procedural soundtrack.
// To ship local MP3/WAV files inside the single-HTML release, import them here, then
// assign the imported URL to a scene stem or sound effect. Vite will inline the bytes.
//
// Example:
// import harborMelody from "./assets/audio/harbor-melody.mp3";
// music.harbor.melody = { src: harborMelody, gain: 0.9 };

import harborMix from "./assets/audio/harbor-mix.mp3";
import capitalMix from "./assets/audio/capital-mix.mp3";
import respiteMix from "./assets/audio/respite-mix.mp3";
import bossBabelMix from "./assets/audio/boss-babel-mix.mp3";
import menuMix from "./assets/audio/menu-mix.mp3";
import snowfieldMix from "./assets/audio/snowfield-mix.mp3";
import skyfrontMix from "./assets/audio/skyfront-mix.mp3";
import foundryMix from "./assets/audio/foundry-mix.mp3";
import bossMolochMix from "./assets/audio/boss-moloch-mix.mp3";
import bossLeviathanMix from "./assets/audio/boss-leviathan-mix.mp3";
import canyonMix from "./assets/audio/canyon-mix.mp3";

// Music stems for the same scene should be exported with identical duration and loop
// points. Supported layers: mix, drums, bass, melody, tension.
const music = {
  menu: { mix: { src: menuMix, gain: 1 } },
  respite: { mix: { src: respiteMix, gain: 1 } },
  harbor: { mix: { src: harborMix, gain: 1 } },
  canyon: { mix: { src: canyonMix, gain: 1 } },
  capital: { mix: { src: capitalMix, gain: 1 } },
  foundry: { mix: { src: foundryMix, gain: 1 } },
  snowfield: { mix: { src: snowfieldMix, gain: 1 } },
  skyfront: { mix: { src: skyfrontMix, gain: 1 } },
  bossBabel: { mix: { src: bossBabelMix, gain: 1 } },
  bossLeviathan: { mix: { src: bossLeviathanMix, gain: 1 } },
  bossMoloch: { mix: { src: bossMolochMix, gain: 1 } }
};

// Supported effect keys match AudioSystem.effect(), plus weapon-rocket,
// weapon-shotgun, weapon-laser, weapon-railgun, weapon-minigun and weapon-rifle.
const sfx = {};

export const AUDIO_ASSETS = Object.freeze({ music, sfx });
