import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIO_DEFAULTS,
  INDUSTRIAL_PULSE,
  MUSIC,
  PROCEDURAL_MIX,
  externalStemLevels,
  musicState
} from "../src/audio.js";
import {
  MUSICAL_IDENTITY,
  SCORE_BARS,
  SCORE_STEPS_PER_BAR,
  chordMidiNotes,
  scorePosition
} from "../src/music-score.js";

function run(overrides = {}) {
  return {
    scene: 0,
    zoneRoute: [0, 1, 2],
    squad: 20,
    maxSquad: 20,
    bossAlive: false,
    bossPhase: 1,
    bossKills: 0,
    weapon: { level: 1 },
    telegraphs: [],
    enemies: [],
    ...overrides
  };
}

test("動態配樂依選單、六戰區、三種Boss與整備切換", () => {
  assert.equal(musicState(null, "menu").scene, "menu");
  assert.equal(musicState(run({ scene: 0 }), "playing").scene, "harbor");
  assert.equal(musicState(run({ scene: 1 }), "playing").scene, "canyon");
  assert.equal(musicState(run({ scene: 2 }), "playing").scene, "capital");
  assert.equal(musicState(run({ scene: 3, zoneRoute: [3, 4, 5] }), "playing").scene, "foundry");
  assert.equal(musicState(run({ scene: 4, zoneRoute: [3, 4, 5] }), "playing").scene, "snowfield");
  assert.equal(musicState(run({ scene: 5, zoneRoute: [3, 4, 5] }), "playing").scene, "skyfront");
  assert.equal(musicState(run({ bossAlive: true, bossChassis: "babel" }), "playing").scene, "bossBabel");
  assert.equal(musicState(run({ bossAlive: true, bossChassis: "leviathan" }), "playing").scene, "bossLeviathan");
  assert.equal(musicState(run({ bossAlive: true, bossChassis: "moloch" }), "playing").scene, "bossMoloch");
  assert.equal(musicState(run(), "safe-exit").scene, "respite");
  assert.equal(musicState(run(), "research").scene, "respite");
  assert.equal(musicState(run(), "paused").active, false);
  assert.equal(musicState(run(), "safe-exit").active, false);
  assert.equal(musicState(run(), "result").active, false);
  assert.equal(musicState(run(), "restart-confirm").active, false);
  assert.equal(musicState(run(), "research").active, true);
});

test("Boss階段、高壓反制、低兵力、全域預警與狂暴均會驅動音樂層", () => {
  const boss = { type: "boss", hp: 100, battleClock: 46 };
  const state = musicState(run({
    squad: 8,
    maxSquad: 36,
    bossAlive: true,
    bossPhase: 3,
    bossKills: 5,
    weapon: { level: 9 },
    telegraphs: [{ kind: "global-strike" }],
    enemies: [boss]
  }), "playing");
  assert.equal(state.bossPhase, 3);
  assert.equal(state.lowSquad, true);
  assert.equal(state.counterProtocol, true);
  assert.equal(state.globalThreat, true);
  assert.equal(state.enraged, true);
});

test("六戰區節奏服從場景而非一路加速，Boss轉階不強制加速", () => {
  const stageTempos = ["harbor", "canyon", "capital", "foundry", "snowfield", "skyfront"].map((scene) => MUSIC[scene].bpm);
  assert.equal(new Set(stageTempos).size, stageTempos.length);
  assert.equal(Math.min(...stageTempos), MUSIC.snowfield.bpm);
  assert.equal(Math.max(...stageTempos), MUSIC.skyfront.bpm);
  assert.ok(MUSIC.harbor.bpm < MUSIC.canyon.bpm);
  assert.ok(MUSIC.capital.bpm < MUSIC.canyon.bpm);
  const bossTempos = ["bossBabel", "bossLeviathan", "bossMoloch"].map((scene) => MUSIC[scene].bpm);
  assert.equal(new Set(bossTempos).size, bossTempos.length);
  assert.ok(Math.max(...bossTempos) <= MUSIC.skyfront.bpm);
});

test("預設混音壓低音效，外部音軌會依Boss與全域威脅調層", () => {
  assert.ok(AUDIO_DEFAULTS.music > AUDIO_DEFAULTS.sfx);
  const calm = externalStemLevels(musicState(run({ bossAlive: true, bossPhase: 1 }), "playing"));
  const dangerState = musicState(run({
    bossAlive: true,
    bossPhase: 3,
    weapon: { level: 9 },
    telegraphs: [{ kind: "global-strike" }]
  }), "playing");
  const danger = externalStemLevels(dangerState);
  const phaseThree = externalStemLevels({ ...dangerState, globalThreat: false });
  assert.ok(danger.tension > calm.tension);
  assert.ok(danger.drums < phaseThree.drums);
});

test("內建配樂採共同訊號、六種調式身份與十六小節完整曲式", () => {
  assert.equal(MUSICAL_IDENTITY.tonalCenter, "one signal, six modal identities");
  assert.equal(MUSICAL_IDENTITY.form, "intro-A-B-return");
  assert.deepEqual(MUSICAL_IDENTITY.motif, [64, 69, 71, 68, 73]);
  assert.deepEqual(MUSICAL_IDENTITY.motifIntervals, [0, 5, 7, 4, 9]);
  for (const score of Object.values(MUSIC)) {
    assert.equal(score.bars, SCORE_BARS);
    assert.equal(score.chords.length, SCORE_BARS);
    assert.equal(score.melody.length, SCORE_BARS);
    assert.equal(score.form.length, SCORE_BARS);
    assert.equal(score.formNames.length, SCORE_BARS);
    assert.ok(score.story.length >= 4);
    const dynamics = score.form.map((bar) => bar.dynamic);
    assert.ok(Math.max(...dynamics) - Math.min(...dynamics) >= 0.24, `${score.story} 缺少段落起伏`);
  }
  assert.deepEqual(MUSIC.harbor.melody[4].map((event) => event.midi), MUSICAL_IDENTITY.motif);
  const fingerprints = ["harbor", "canyon", "capital", "foundry", "snowfield", "skyfront"]
    .map((scene) => MUSIC[scene].melody.flat().map((event) => event.midi).join(","));
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  assert.ok(MUSIC.snowfield.melody.flat().length < MUSIC.harbor.melody.flat().length / 2);
  for (const scene of ["harbor", "canyon", "capital", "foundry", "snowfield", "skyfront"]) {
    assert.ok(MUSIC[scene].melody.flat().length / SCORE_BARS <= 4, `${scene} 主旋律過密`);
  }
});

test("和弦、低音、脈衝與旋律永遠共用同一小節位置", () => {
  for (const scene of Object.keys(MUSIC)) {
    const score = MUSIC[scene];
    for (let step = 0; step < SCORE_BARS * SCORE_STEPS_PER_BAR; step += 1) {
      const frame = scorePosition(scene, step);
      assert.equal(frame.chord, score.chords[frame.bar]);
      assert.ok(frame.bass.every((event) => event.step === frame.step));
      assert.ok(frame.pulse.every((event) => event.step === frame.step));
      assert.ok(frame.arpeggio.every((event) => event.step === frame.step));
      assert.ok(frame.melody.every((event) => event.step === frame.step));
      assert.ok(frame.plan);
      assert.ok(frame.drums);
      assert.ok(chordMidiNotes(frame.chord).every(Number.isFinite));
    }
    assert.deepEqual(scorePosition(scene, 0), scorePosition(scene, SCORE_BARS * SCORE_STEPS_PER_BAR));
  }
});

test("六戰區使用不同調性中心，旋律維持可唱奏音域", () => {
  const scenes = ["harbor", "canyon", "capital", "foundry", "snowfield", "skyfront"];
  const roots = scenes.map((scene) => MUSIC[scene].melody[0][0].midi % 12);
  assert.equal(new Set(roots).size, scenes.length);
  for (const [scene, score] of Object.entries(MUSIC)) {
    for (const bar of score.melody) {
      for (const event of bar) assert.ok(event.midi >= 55 && event.midi <= 88, `${scene} 音域失控 ${event.midi}`);
    }
  }
});

test("每個非留白小節都有和弦落點，主旋律以穩定音為主", () => {
  for (const [scene, score] of Object.entries(MUSIC)) {
    let chordTones = 0;
    let total = 0;
    score.melody.forEach((bar, barIndex) => {
      const chordPitchClasses = new Set(chordMidiNotes(score.chords[barIndex]).map((midi) => midi % 12));
      for (const event of bar) {
        total += 1;
        if (chordPitchClasses.has(event.midi % 12)) chordTones += 1;
      }
    });
    assert.ok(chordTones / total >= 0.58, `${scene} 和弦音比例不足：${chordTones}/${total}`);
    score.melody.forEach((bar, barIndex) => {
      if (!bar.length) return;
      const chordPitchClasses = new Set(chordMidiNotes(score.chords[barIndex]).map((midi) => midi % 12));
      assert.ok(bar.some((event) => chordPitchClasses.has(event.midi % 12)), `${scene} 第${barIndex + 1}小節沒有和弦落點`);
    });
  }
  assert.ok(MUSIC.menu.melody.some((bar) => !bar.length));
  assert.ok(MUSIC.respite.melody.some((bar) => !bar.length));
  assert.ok(MUSIC.snowfield.melody.some((bar) => !bar.length));
});

test("配器不再堆成聲牆，鼓組、Pad與高頻層都有硬限制", () => {
  for (const scene of Object.keys(MUSIC)) {
    for (let bar = 0; bar < SCORE_BARS; bar += 1) {
      const frame = scorePosition(scene, bar * SCORE_STEPS_PER_BAR);
      assert.ok(frame.drums.kick.length <= 3, `${scene} 第${bar + 1}小節底鼓過密`);
      const foregroundLayers = [frame.plan.pad, frame.plan.pulse !== "none", frame.plan.arpeggio !== "none"].filter(Boolean).length;
      assert.ok(foregroundLayers <= 2, `${scene} 第${bar + 1}小節伴奏堆疊`);
      if (["menu", "respite"].includes(scene)) assert.equal(frame.drums.kick.length, 0);
    }
  }
  assert.ok(PROCEDURAL_MIX.padAttack >= 0.3);
  assert.ok(PROCEDURAL_MIX.melodyAttack >= 0.025 && PROCEDURAL_MIX.melodyAttack <= 0.045);
  assert.ok(PROCEDURAL_MIX.melodyGain > PROCEDURAL_MIX.battleKick);
  assert.ok(PROCEDURAL_MIX.bossKick > PROCEDURAL_MIX.battleKick);
  assert.ok(PROCEDURAL_MIX.melodyGain > PROCEDURAL_MIX.bossKick);
  assert.ok(PROCEDURAL_MIX.weaponBus <= 0.15);
  assert.ok(PROCEDURAL_MIX.reverbSend > 0 && PROCEDURAL_MIX.reverbSend < 0.1);
  assert.ok(PROCEDURAL_MIX.musicOutput <= 2.05);
  assert.ok(PROCEDURAL_MIX.tonalLift <= 1);
  assert.ok(PROCEDURAL_MIX.masterOutput <= 0.8);
});

test("機械脈衝只使用低八度根音與五度，不再產生高音嗶啵方波", () => {
  assert.deepEqual(INDUSTRIAL_PULSE.intervals, [0, 7]);
  assert.equal(INDUSTRIAL_PULSE.octave, 12);
  assert.equal(INDUSTRIAL_PULSE.waveform, "triangle");
  assert.ok(INDUSTRIAL_PULSE.cutoff <= 900);
  assert.ok(INDUSTRIAL_PULSE.minimumDuration >= 0.12);
});
