import test from "node:test";
import assert from "node:assert/strict";

import {
  GameRenderer,
  IMPACT_SHAKE_OVERSCAN,
  QUALITY_LEVELS,
  bossDamageStage,
  impactShakeOffset,
  weaponTrailProfile
} from "../src/game/render.js";

function mockContext() {
  const calls = { save: 0, restore: 0, beginPath: 0, moveTo: 0, lineTo: 0, stroke: 0, fillRect: 0 };
  return {
    calls,
    save() { calls.save += 1; },
    restore() { calls.restore += 1; },
    beginPath() { calls.beginPath += 1; },
    moveTo() { calls.moveTo += 1; },
    lineTo() { calls.lineTo += 1; },
    stroke() { calls.stroke += 1; },
    fillRect() { calls.fillRect += 1; }
  };
}

test("密集彈幕依樣式批次描繪，不再每顆子彈各自存檔與描線", () => {
  const context = mockContext();
  const renderer = Object.create(GameRenderer.prototype);
  renderer.context = context;
  const bullets = Array.from({ length: 300 }, (_, index) => ({
    x: index % 390,
    y: 400 - index,
    vx: 0,
    vy: -720,
    r: 2.5,
    color: index < 290 ? "#a8ff6a" : "#ff6278",
    enemy: index >= 290
  }));

  renderer.drawBullets({ bullets });
  assert.equal(context.calls.save, 1);
  assert.equal(context.calls.restore, 1);
  assert.equal(context.calls.stroke, 3);
  assert.equal(context.calls.moveTo, 300);
  assert.equal(context.calls.lineTo, 300);
});

test("延伸戰線不會顯示越過接敵線的玩家預射彈", () => {
  const context = mockContext();
  const renderer = Object.create(GameRenderer.prototype);
  renderer.context = context;
  renderer.approachHeight = 75;
  renderer.quality = QUALITY_LEVELS.LOW;
  renderer.drawBullets({
    bullets: [
      { x: 100, y: -8, vx: 0, vy: -660, r: 2, color: "#fff", enemy: false, weapon: "rifle" },
      { x: 120, y: 8, vx: 0, vy: -660, r: 2, color: "#fff", enemy: false, weapon: "rifle" },
      { x: 140, y: -8, vx: 0, vy: 240, r: 2, color: "#f66", enemy: true }
    ]
  });
  assert.equal(context.calls.moveTo, 2);
  assert.equal(context.calls.lineTo, 2);
});

test("六種武器各自使用不同的曳光語彙", () => {
  const weapons = ["rifle", "shotgun", "rocket", "laser", "minigun", "railgun"];
  const signatures = weapons.map((weapon) => {
    const profile = weaponTrailProfile(weapon);
    return `${profile.length}|${profile.width}|${profile.core}|${profile.head}`;
  });
  assert.equal(new Set(signatures).size, weapons.length);
  assert.ok(weaponTrailProfile("railgun").length > weaponTrailProfile("shotgun").length);
  assert.equal(weaponTrailProfile("rocket").head, true);
});

test("Boss血量依序進入完整、輕損、重損與核心過載", () => {
  const enemy = { maxHp: 100, hp: 100 };
  assert.equal(bossDamageStage(enemy), 0);
  enemy.hp = 80;
  assert.equal(bossDamageStage(enemy), 1);
  enemy.hp = 50;
  assert.equal(bossDamageStage(enemy), 2);
  enemy.hp = 30;
  assert.equal(bossDamageStage(enemy), 3);
});

test("衝擊震動恢復8.5.1完整震幅且預留足夠防露邊空間", () => {
  assert.deepEqual(impactShakeOffset(2, 0), { x: 0, y: 0 });
  const samples = [0, 1];
  const offset = impactShakeOffset(1.25, 25, () => samples.shift());
  assert.deepEqual(offset, { x: -12.5, y: 12.5 });
  assert.ok(IMPACT_SHAKE_OVERSCAN > Math.max(Math.abs(offset.x), Math.abs(offset.y)));
});

test("延伸戰線、核心背景、接敵線與戰鬥物件共用同一震動鏡頭", () => {
  const translations = [];
  const calls = [];
  let depth = 0;
  const renderer = Object.create(GameRenderer.prototype);
  Object.assign(renderer, {
    ratio: 1,
    approachHeight: 75,
    viewHeight: 768,
    context: {
      setTransform() {},
      clearRect() {},
      save() { depth += 1; },
      restore() { depth -= 1; },
      translate(x, y) { translations.push({ x, y, depth }); }
    },
    drawApproachBackground(_run, overscan) { calls.push(["approach-background", depth, overscan]); },
    drawBackground(_run, overscan) { calls.push(["background", depth, overscan]); },
    drawTelegraphs() {},
    drawGates() {},
    drawDrops() {},
    drawBullets() {},
    drawEnemies() {},
    drawFormation() { calls.push(["formation", depth]); },
    drawParticles() {},
    drawCinematics() {},
    drawTexts() {},
    drawStageBanner() {},
    drawApproachBoundary(_run, overscan) { calls.push(["approach-boundary", depth, overscan]); }
  });

  renderer.render({ elapsed: 1.25, shake: 25 });
  assert.equal(translations.length, 2);
  assert.ok(Math.abs(translations[0].x) <= 12.5);
  assert.ok(Math.abs(translations[0].y) <= 12.5);
  assert.equal(translations[0].depth, 1);
  assert.deepEqual(translations[1], { x: 0, y: 75, depth: 2 });
  assert.deepEqual(calls, [
    ["approach-background", 1, IMPACT_SHAKE_OVERSCAN],
    ["background", 2, IMPACT_SHAKE_OVERSCAN],
    ["formation", 2],
    ["approach-boundary", 1, IMPACT_SHAKE_OVERSCAN]
  ]);
  assert.equal(depth, 0);
});

test("核心背景在全螢幕延伸模式從接敵線正下方開始，不反蓋上方戰線", () => {
  const fills = [];
  const renderer = Object.create(GameRenderer.prototype);
  Object.assign(renderer, {
    approachHeight: 75,
    quality: QUALITY_LEVELS.LOW,
    context: {
      createLinearGradient() { return { addColorStop() {} }; },
      fillRect(...args) { fills.push(args); },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {}
    },
    drawZoneLandmarks() {},
    drawAtmosphere() {}
  });
  renderer.drawBackground({ elapsed: 0, scene: 0 }, IMPACT_SHAKE_OVERSCAN);
  assert.deepEqual(fills[0], [
    -IMPACT_SHAKE_OVERSCAN,
    0,
    390 + IMPACT_SHAKE_OVERSCAN * 2,
    693 + IMPACT_SHAKE_OVERSCAN
  ]);
});

test("自動畫質在持續掉幀時降階，穩定後恢復", () => {
  const renderer = Object.create(GameRenderer.prototype);
  Object.assign(renderer, {
    quality: QUALITY_LEVELS.HIGH,
    frameAverage: 16.7,
    slowFrames: 0,
    fastFrames: 0,
    qualityHold: 0
  });
  for (let frame = 0; frame < 35; frame += 1) renderer.observeFrame(0.04);
  assert.equal(renderer.quality, QUALITY_LEVELS.STANDARD);
  for (let frame = 0; frame < 520; frame += 1) renderer.observeFrame(0.012);
  assert.equal(renderer.quality, QUALITY_LEVELS.HIGH);
});

test("大量粒子共用一次畫布狀態", () => {
  const context = mockContext();
  const renderer = Object.create(GameRenderer.prototype);
  renderer.context = context;
  const particles = Array.from({ length: 300 }, () => ({
    x: 100,
    y: 100,
    life: 0.4,
    maxLife: 0.7,
    size: 3,
    color: "#fff"
  }));

  renderer.drawParticles({ particles });
  assert.equal(context.calls.save, 1);
  assert.equal(context.calls.restore, 1);
  assert.equal(context.calls.fillRect, 300);
});
