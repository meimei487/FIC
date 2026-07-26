import {
  BOSS_CHASSIS,
  COMMANDERS,
  FORMATION_Y,
  HEIGHT,
  MAX_SQUAD,
  WEAPONS,
  WIDTH,
  zoneForRun
} from "../config.js";
import { ART } from "../generated/art.js";
import { formationOffsets } from "./state.js";

const ENEMY_ART = {
  trooper: "enemy",
  rusher: "enemy",
  shield: "shield",
  turret: "turret",
  tank: "tank",
  gunship: "gunship",
  elite: "shield",
  sniper: "enemy",
  boss: "boss"
};

export const QUALITY_LEVELS = Object.freeze({ LOW: 0, STANDARD: 1, HIGH: 2 });
export const IMPACT_SHAKE_OVERSCAN = 16;

const WEAPON_TRAILS = Object.freeze({
  rifle: Object.freeze({ length: 0.028, width: 1, core: 0.42, head: false }),
  shotgun: Object.freeze({ length: 0.014, width: 1.28, core: 0, head: false }),
  rocket: Object.freeze({ length: 0.062, width: 1.5, core: 0.34, head: true }),
  laser: Object.freeze({ length: 0.082, width: 0.82, core: 0.72, head: false }),
  minigun: Object.freeze({ length: 0.038, width: 0.72, core: 0.22, head: false }),
  railgun: Object.freeze({ length: 0.11, width: 1.85, core: 0.82, head: false }),
  enemy: Object.freeze({ length: 0.024, width: 1, core: 0, head: false })
});

const BOSS_CRACKS = Object.freeze([
  Object.freeze([[-48, -30], [-24, -12], [-35, 10], [-12, 28]]),
  Object.freeze([[42, -42], [21, -18], [34, 4], [12, 22]]),
  Object.freeze([[-58, 34], [-32, 22], [-18, 47], [4, 58]]),
  Object.freeze([[55, 18], [30, 30], [42, 52], [18, 66]])
]);

export function weaponTrailProfile(weapon, enemy = false) {
  return WEAPON_TRAILS[enemy ? "enemy" : weapon] || WEAPON_TRAILS.rifle;
}

export function bossDamageStage(enemy) {
  const ratio = Math.max(0, Math.min(1, (enemy?.hp || 0) / Math.max(1, enemy?.maxHp || 1)));
  if (ratio <= 0.34) return 3;
  if (ratio <= 0.58) return 2;
  if (ratio <= 0.82) return 1;
  return 0;
}

export function impactShakeOffset(elapsed, strength, random = Math.random) {
  const power = Math.max(0, Number.isFinite(Number(strength)) ? Number(strength) : 0);
  if (!power) return { x: 0, y: 0 };
  const sample = typeof random === "function" ? random : Math.random;
  const unit = () => {
    const value = Number(sample());
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  };
  return {
    x: (unit() - 0.5) * power,
    y: (unit() - 0.5) * power
  };
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export function formationFootprint(count) {
  const offsets = formationOffsets(count);
  if (!offsets.length) return { offsets, centerX: 0, centerY: 0, radiusX: 0, radiusY: 0 };

  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumY = Infinity;
  let maximumY = -Infinity;
  offsets.forEach((offset, index) => {
    const halfWidth = index === 0 ? 15 : 12.5;
    const halfHeight = index === 0 ? 19 : 16;
    minimumX = Math.min(minimumX, offset.x - halfWidth);
    maximumX = Math.max(maximumX, offset.x + halfWidth);
    minimumY = Math.min(minimumY, offset.y - halfHeight);
    maximumY = Math.max(maximumY, offset.y + halfHeight);
  });

  return {
    offsets,
    centerX: (minimumX + maximumX) / 2,
    centerY: (minimumY + maximumY) / 2,
    radiusX: (maximumX - minimumX) / 2 + 6,
    radiusY: (maximumY - minimumY) / 2 + 6
  };
}

export function squadBadgeText(count) {
  return count >= MAX_SQUAD ? "▲ MAX" : `▲ ${Math.max(0, Math.floor(count))}/${MAX_SQUAD}`;
}

export class GameRenderer {
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.profile = profile;
    this.context = canvas.getContext("2d");
    this.images = {};
    this.approachHeight = 0;
    this.viewHeight = HEIGHT;
    this.quality = QUALITY_LEVELS.HIGH;
    this.frameAverage = 16.7;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.qualityHold = 0;
    this.resize();
    this.preload();
  }

  observeFrame(deltaSeconds) {
    const milliseconds = deltaSeconds * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds < 4 || milliseconds > 80) return this.quality;
    this.frameAverage = this.frameAverage * 0.94 + milliseconds * 0.06;
    this.qualityHold = Math.max(0, this.qualityHold - 1);
    if (this.frameAverage > 22) {
      this.slowFrames += 1;
      this.fastFrames = 0;
    } else if (this.frameAverage < 17.4) {
      this.fastFrames += 1;
      this.slowFrames = Math.max(0, this.slowFrames - 2);
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = Math.max(0, this.fastFrames - 1);
    }
    if (this.qualityHold === 0 && this.slowFrames >= 24 && this.quality > QUALITY_LEVELS.LOW) {
      this.quality -= 1;
      this.qualityHold = 120;
      this.slowFrames = 0;
      this.fastFrames = 0;
    } else if (this.qualityHold === 0 && this.fastFrames >= 300 && this.quality < QUALITY_LEVELS.HIGH) {
      this.quality += 1;
      this.qualityHold = 180;
      this.slowFrames = 0;
      this.fastFrames = 0;
    }
    return this.quality;
  }

  resize() {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.ratio = ratio;
    this.viewHeight = HEIGHT + this.approachHeight;
    this.canvas.width = Math.round(WIDTH * ratio);
    this.canvas.height = Math.round(this.viewHeight * ratio);
  }

  setApproachHeight(value) {
    const numeric = Number(value);
    const next = Math.round(Math.max(0, Math.min(HEIGHT, Number.isFinite(numeric) ? numeric : 0)) * 1000) / 1000;
    if (Math.abs(next - this.approachHeight) < 0.05) return false;
    this.approachHeight = next;
    this.resize();
    return true;
  }

  preload() {
    for (const [id, source] of Object.entries(ART)) {
      const image = new Image();
      image.src = source;
      this.images[id] = image;
    }
  }

  render(run) {
    const context = this.context;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, WIDTH, this.viewHeight);
    if (!run) {
      this.drawEmptyBackground();
      return;
    }

    const shake = impactShakeOffset(run.elapsed, run.shake);
    context.save();
    context.translate(shake.x, shake.y);
    if (this.approachHeight > 0) this.drawApproachBackground(run, IMPACT_SHAKE_OVERSCAN);
    context.save();
    context.translate(0, this.approachHeight);
    this.drawBackground(run, IMPACT_SHAKE_OVERSCAN);
    this.drawTelegraphs(run);
    this.drawGates(run);
    this.drawDrops(run);
    this.drawBullets(run);
    this.drawEnemies(run);
    this.drawFormation(run);
    this.drawTelegraphs(run, "overlay");
    this.drawParticles(run);
    this.drawCinematics(run);
    this.drawTexts(run);
    this.drawStageBanner(run);
    context.restore();
    if (this.approachHeight > 0) this.drawApproachBoundary(run, IMPACT_SHAKE_OVERSCAN);
    context.restore();
  }

  drawEmptyBackground() {
    const context = this.context;
    const gradient = context.createLinearGradient(0, 0, 0, this.viewHeight);
    gradient.addColorStop(0, "#263f43");
    gradient.addColorStop(1, "#071012");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, this.viewHeight);
    context.strokeStyle = "rgba(102,232,238,.08)";
    for (let y = 0; y < this.viewHeight; y += 42) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(WIDTH, y);
      context.stroke();
    }
  }

  drawApproachBackground(run, overscan = 0) {
    const context = this.context;
    const zone = zoneForRun(run);
    const height = this.approachHeight;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#03090b");
    gradient.addColorStop(0.54, zone.top);
    gradient.addColorStop(1, zone.top);
    context.fillStyle = gradient;
    context.fillRect(-overscan, -overscan, WIDTH + overscan * 2, height + overscan);

    context.save();
    context.globalAlpha = 0.22;
    context.strokeStyle = zone.accent;
    context.lineWidth = 0.8;
    for (let y = height % 24; y < height; y += 24) {
      context.beginPath();
      context.moveTo(-overscan, y);
      context.lineTo(WIDTH + overscan, y);
      context.stroke();
    }
    context.globalAlpha = 0.13;
    for (let index = -5; index <= 5; index += 1) {
      context.beginPath();
      context.moveTo(WIDTH / 2, height);
      context.lineTo(WIDTH / 2 + index * 58, 0);
      context.stroke();
    }
    context.globalAlpha = 0.24;
    context.fillStyle = zone.accent;
    const sweep = (run.elapsed * 34) % Math.max(1, height + 18) - 9;
    context.fillRect(-overscan, sweep, WIDTH + overscan * 2, 1);
    if (run.enemies.some((enemy) => enemy.type === "boss" && enemy.hp > 0)) {
      const warning = context.createLinearGradient(0, 0, 0, height);
      warning.addColorStop(0, "rgba(255,52,75,.16)");
      warning.addColorStop(1, "rgba(255,52,75,0)");
      context.globalAlpha = 1;
      context.fillStyle = warning;
      context.fillRect(-overscan, -overscan, WIDTH + overscan * 2, height + overscan);
    }
    context.restore();
  }

  drawApproachBoundary(run, overscan = 0) {
    const context = this.context;
    const zone = zoneForRun(run);
    const y = this.approachHeight;
    context.save();
    if (run.skillVisual > 0 || run.bossPhaseVisual > 0) {
      const boss = run.enemies.find((enemy) => enemy.type === "boss" && enemy.hp > 0);
      const color = run.skillVisual > 0
        ? COMMANDERS[run.commander].color
        : (BOSS_CHASSIS[boss?.chassis || run.bossChassis] || BOSS_CHASSIS.babel).color;
      context.globalAlpha = 0.12;
      context.fillStyle = color;
      context.fillRect(-overscan, -overscan, WIDTH + overscan * 2, y + overscan);
    }
    context.globalAlpha = 0.55;
    context.strokeStyle = zone.accent;
    context.lineWidth = 1;
    context.setLineDash([7, 6]);
    context.beginPath();
    context.moveTo(-overscan, y + 0.5);
    context.lineTo(WIDTH + overscan, y + 0.5);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  drawBackground(run, overscan = 0) {
    const context = this.context;
    const zone = zoneForRun(run);
    const topOverscan = this.approachHeight > 0 ? 0 : overscan;
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, zone.top);
    gradient.addColorStop(0.48, zone.bottom);
    gradient.addColorStop(1, "#071012");
    context.fillStyle = gradient;
    context.fillRect(
      -overscan,
      topOverscan ? -topOverscan : 0,
      WIDTH + overscan * 2,
      HEIGHT + topOverscan + overscan
    );

    const horizon = 155;
    context.fillStyle = "rgba(2,8,10,.42)";
    context.fillRect(-overscan, horizon, WIDTH + overscan * 2, HEIGHT - horizon + overscan);
    this.drawZoneLandmarks(run, zone, horizon);
    context.strokeStyle = `${zone.accent}22`;
    context.lineWidth = 1;
    for (let index = -7; index <= 7; index += 1) {
      context.beginPath();
      context.moveTo(WIDTH / 2, horizon);
      context.lineTo(WIDTH / 2 + index * 74, HEIGHT);
      context.stroke();
    }
    const scroll = (run.elapsed * 95) % 70;
    for (let y = horizon + scroll; y < HEIGHT; y += 70) {
      const perspective = (y - horizon) / (HEIGHT - horizon);
      context.globalAlpha = 0.08 + perspective * 0.12;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(WIDTH, y);
      context.stroke();
    }
    context.globalAlpha = 1;

    if (zone.id === "harbor") {
      context.fillStyle = "rgba(104,220,236,.08)";
      for (let index = 0; index < 7; index += 1) context.fillRect((index * 67 + run.elapsed * 12) % 460 - 35, 95 + (index % 3) * 25, 46, 2);
    } else if (zone.id === "canyon") {
      context.fillStyle = "rgba(255,151,79,.08)";
      for (let index = 0; index < 8; index += 1) {
        const x = ((index * 57 + run.elapsed * 27) % 460) - 40;
        const y = (index * 83) % HEIGHT;
        context.fillRect(x, y, 35, 2);
      }
    } else if (zone.id === "capital") {
      context.fillStyle = "rgba(255,177,61,.055)";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.strokeStyle = "rgba(190,220,255,.06)";
      for (let index = 0; index < 9; index += 1) {
        const x = ((index * 47 + run.elapsed * 210) % (WIDTH + 80)) - 40;
        const y = (index * 83) % HEIGHT;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 22, y + 62);
        context.stroke();
      }
    } else if (zone.id === "foundry") {
      const heat = 0.05 + (Math.sin(run.elapsed * 3.2) + 1) * 0.025;
      context.fillStyle = `rgba(255,92,42,${heat})`;
      context.fillRect(0, horizon, WIDTH, HEIGHT - horizon);
      context.strokeStyle = "rgba(255,151,74,.1)";
      for (let index = 0; index < 7; index += 1) {
        const y = horizon + 42 + index * 77 + Math.sin(run.elapsed * 2 + index) * 4;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(WIDTH, y + 5);
        context.stroke();
      }
    } else if (zone.id === "snowfield") {
      context.fillStyle = "rgba(196,241,255,.045)";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.strokeStyle = "rgba(210,247,255,.1)";
      for (let index = 0; index < 8; index += 1) {
        const x = ((index * 59 + run.elapsed * 120) % (WIDTH + 80)) - 40;
        const y = (index * 89) % HEIGHT;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 32, y + 18);
        context.stroke();
      }
    } else {
      const band = (Math.sin(run.elapsed * 0.7) + 1) * 0.5;
      context.fillStyle = `rgba(91,139,255,${0.035 + band * 0.025})`;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.strokeStyle = "rgba(151,196,255,.09)";
      for (let index = 0; index < 6; index += 1) {
        const y = 95 + index * 92 + Math.sin(run.elapsed + index) * 8;
        context.beginPath();
        context.moveTo(20 + index % 2 * 80, y);
        context.lineTo(WIDTH - 20 - index % 3 * 55, y);
        context.stroke();
      }
    }
    this.drawAtmosphere(run, zone);
  }

  drawZoneLandmarks(run, zone, horizon) {
    const context = this.context;
    context.save();
    context.globalAlpha = 0.62;
    context.fillStyle = "#071114";
    context.strokeStyle = `${zone.accent}25`;
    context.lineWidth = 1;
    if (zone.id === "harbor") {
      context.fillRect(18, horizon - 34, 70, 34);
      context.fillRect(296, horizon - 24, 78, 24);
      context.beginPath();
      for (const x of [58, 315]) {
        context.moveTo(x, horizon - 18);
        context.lineTo(x, horizon - 92);
        context.lineTo(x + 44, horizon - 92);
        context.lineTo(x + 25, horizon - 76);
      }
      context.stroke();
      context.fillStyle = `${zone.accent}55`;
      for (let index = 0; index < 6; index += 1) context.fillRect(28 + index * 58, horizon - 7 - (index % 2) * 7, 3, 2);
    } else if (zone.id === "canyon") {
      context.beginPath();
      context.moveTo(0, horizon);
      context.lineTo(0, horizon - 70);
      context.lineTo(56, horizon - 28);
      context.lineTo(104, horizon - 58);
      context.lineTo(148, horizon);
      context.closePath();
      context.moveTo(WIDTH, horizon);
      context.lineTo(WIDTH, horizon - 82);
      context.lineTo(338, horizon - 42);
      context.lineTo(296, horizon - 66);
      context.lineTo(250, horizon);
      context.closePath();
      context.fill();
      context.stroke();
    } else if (zone.id === "capital") {
      const heights = [52, 84, 38, 68, 96, 58, 76, 44, 88];
      for (let index = 0; index < heights.length; index += 1) {
        const x = index * 46 - 12;
        context.fillRect(x, horizon - heights[index], 38, heights[index]);
        context.fillStyle = `${zone.accent}25`;
        for (let row = 0; row < 3; row += 1) context.fillRect(x + 8 + row * 9, horizon - heights[index] + 12, 3, 8);
        context.fillStyle = "#071114";
      }
    } else if (zone.id === "foundry") {
      context.fillRect(14, horizon - 62, 66, 62);
      context.fillRect(104, horizon - 38, 74, 38);
      context.fillRect(278, horizon - 76, 84, 76);
      context.fillStyle = `${zone.accent}35`;
      for (const x of [34, 132, 304, 338]) context.fillRect(x, horizon - 96, 12, 96);
      context.strokeStyle = `${zone.accent}55`;
      context.beginPath();
      context.moveTo(0, horizon - 22);
      context.lineTo(WIDTH, horizon - 22);
      context.moveTo(82, horizon - 44);
      context.lineTo(278, horizon - 44);
      context.stroke();
    } else if (zone.id === "snowfield") {
      context.fillStyle = "#0b1b24";
      context.beginPath();
      context.moveTo(0, horizon);
      context.lineTo(0, horizon - 22);
      context.lineTo(76, horizon - 92);
      context.lineTo(132, horizon - 35);
      context.lineTo(218, horizon - 118);
      context.lineTo(286, horizon - 46);
      context.lineTo(350, horizon - 96);
      context.lineTo(WIDTH, horizon - 38);
      context.lineTo(WIDTH, horizon);
      context.closePath();
      context.fill();
      context.stroke();
      context.strokeStyle = "rgba(221,249,255,.22)";
      context.beginPath();
      context.moveTo(56, horizon - 72);
      context.lineTo(76, horizon - 92);
      context.lineTo(95, horizon - 72);
      context.moveTo(192, horizon - 92);
      context.lineTo(218, horizon - 118);
      context.lineTo(245, horizon - 88);
      context.stroke();
    } else {
      context.fillStyle = "#0b1425";
      context.fillRect(28, horizon - 28, 104, 28);
      context.fillRect(258, horizon - 42, 108, 42);
      context.strokeStyle = `${zone.accent}45`;
      context.beginPath();
      context.moveTo(48, horizon - 28);
      context.lineTo(76, horizon - 72);
      context.lineTo(116, horizon - 28);
      context.moveTo(276, horizon - 42);
      context.lineTo(314, horizon - 102);
      context.lineTo(350, horizon - 42);
      context.stroke();
      context.fillStyle = `${zone.accent}55`;
      for (const x of [43, 91, 276, 324]) context.fillRect(x, horizon - 11, 18, 2);
    }
    context.restore();
  }

  drawAtmosphere(run, zone) {
    const context = this.context;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    const count = quality === QUALITY_LEVELS.HIGH ? 14 : quality === QUALITY_LEVELS.STANDARD ? 8 : 4;
    context.save();
    context.lineWidth = 1;
    if (zone.id === "harbor") {
      context.strokeStyle = "rgba(158,239,255,.18)";
      context.beginPath();
      for (let index = 0; index < count; index += 1) {
        const x = ((index * 43 + run.elapsed * 78) % (WIDTH + 50)) - 25;
        const y = (index * 79 + run.elapsed * 132) % HEIGHT;
        context.moveTo(x, y);
        context.lineTo(x - 5, y + 19);
      }
      context.stroke();
    } else if (zone.id === "canyon") {
      context.fillStyle = "rgba(255,193,116,.2)";
      for (let index = 0; index < count; index += 1) {
        const x = ((index * 67 - run.elapsed * (34 + index % 3 * 8)) % (WIDTH + 60) + WIDTH + 60) % (WIDTH + 60) - 30;
        const y = 74 + (index * 47) % (HEIGHT - 110);
        context.fillRect(x, y, 12 + index % 4 * 5, 1 + index % 2);
      }
    } else if (zone.id === "capital") {
      context.fillStyle = "rgba(255,193,111,.22)";
      for (let index = 0; index < count; index += 1) {
        const x = (index * 83 + Math.sin(run.elapsed * .7 + index) * 24 + WIDTH) % WIDTH;
        const y = (index * 61 + run.elapsed * (18 + index % 4 * 3)) % HEIGHT;
        context.fillRect(x, y, 2, 2 + index % 3);
      }
      if (quality > QUALITY_LEVELS.LOW) {
        const sweep = (Math.sin(run.elapsed * .38) + 1) / 2;
        context.globalAlpha = 0.08;
        context.fillStyle = zone.accent;
        context.beginPath();
        context.moveTo(WIDTH * sweep, 90);
        context.lineTo(WIDTH * sweep - 65, HEIGHT);
        context.lineTo(WIDTH * sweep + 25, HEIGHT);
        context.closePath();
        context.fill();
      }
    } else if (zone.id === "foundry") {
      context.fillStyle = "rgba(255,151,78,.28)";
      for (let index = 0; index < count; index += 1) {
        const x = (index * 71 + Math.sin(run.elapsed * 1.2 + index) * 29 + WIDTH) % WIDTH;
        const y = HEIGHT - ((index * 53 + run.elapsed * (24 + index % 4 * 4)) % HEIGHT);
        context.fillRect(x, y, 2 + index % 2, 3 + index % 4);
      }
    } else if (zone.id === "snowfield") {
      context.strokeStyle = "rgba(222,250,255,.28)";
      context.beginPath();
      for (let index = 0; index < count + 4; index += 1) {
        const x = ((index * 47 - run.elapsed * 96) % (WIDTH + 60) + WIDTH + 60) % (WIDTH + 60) - 30;
        const y = (index * 67 + run.elapsed * 52) % HEIGHT;
        context.moveTo(x, y);
        context.lineTo(x - 12, y + 7);
      }
      context.stroke();
    } else {
      context.fillStyle = "rgba(182,218,255,.18)";
      for (let index = 0; index < count; index += 1) {
        const x = ((index * 83 + run.elapsed * (18 + index % 3 * 5)) % (WIDTH + 80)) - 40;
        const y = 60 + (index * 57) % (HEIGHT - 100);
        context.fillRect(x, y, 24 + index % 4 * 12, 1);
      }
      if (quality > QUALITY_LEVELS.LOW) {
        context.globalAlpha = 0.07;
        context.fillStyle = zone.accent;
        context.beginPath();
        context.moveTo(WIDTH / 2, 65);
        context.lineTo(72, HEIGHT);
        context.lineTo(132, HEIGHT);
        context.closePath();
        context.fill();
      }
    }
    if (run.bossAlive) {
      context.globalAlpha = 0.035 + (Math.sin(run.elapsed * 3) + 1) * 0.018;
      context.fillStyle = "#ff3858";
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    context.restore();
  }

  drawGates(run) {
    const context = this.context;
    for (const gate of run.gates) {
      context.save();
      context.globalAlpha = gate.used ? 0.12 : 1;
      context.fillStyle = "rgba(6,15,20,.9)";
      context.shadowColor = gate.color;
      context.shadowBlur = gate.used ? 0 : 18;
      roundedRect(context, gate.x, gate.y, gate.w, gate.h, 8);
      context.fill();
      context.strokeStyle = gate.color;
      context.lineWidth = 2;
      context.stroke();
      context.shadowBlur = 0;
      context.textAlign = "center";
      context.fillStyle = gate.color;
      context.font = "1000 24px Arial";
      context.fillText(gate.label, gate.x + gate.w / 2, gate.y + 28);
      context.fillStyle = "#f3ffff";
      context.font = "900 12px Arial";
      context.fillText(gate.sub, gate.x + gate.w / 2, gate.y + 47);
      context.fillStyle = "#9ab4b1";
      context.font = "700 9px Arial";
      const description = gate.effect.length > 23 ? `${gate.effect.slice(0, 22)}…` : gate.effect;
      context.fillText(description, gate.x + gate.w / 2, gate.y + 63);
      context.restore();
    }
  }

  drawTelegraphs(run, layer = "under") {
    const context = this.context;
    for (const telegraph of run.telegraphs) {
      if (telegraph.kind === "global-strike" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.5 + Math.sin(run.elapsed * 30) * 0.18;
        context.save();
        context.globalAlpha = 0.16 + urgency * 0.17 + pulse * 0.08;
        context.fillStyle = "#ff183f";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.globalAlpha = 0.72 + pulse * 0.2;
        context.strokeStyle = "#ff7084";
        context.lineWidth = 4;
        context.setLineDash([14, 8]);
        context.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16);
        context.setLineDash([]);
        context.fillStyle = "rgba(30, 0, 7, .82)";
        roundedRect(context, 54, HEIGHT * 0.38, WIDTH - 108, 82, 8);
        context.fill();
        context.strokeStyle = "#ff536d";
        context.lineWidth = 2;
        context.stroke();
        context.textAlign = "center";
        context.fillStyle = "#fff1f3";
        context.font = "1000 25px Arial";
        context.fillText(telegraph.enrage ? "狂暴・全域殲滅" : "全域殲滅", WIDTH / 2, HEIGHT * 0.43);
        context.fillStyle = "#ff9aaa";
        context.font = "900 13px Arial";
        context.fillText(`技能可中斷・${Math.max(0, telegraph.time).toFixed(1)}s`, WIDTH / 2, HEIGHT * 0.47);
        context.restore();
        continue;
      }
      if (telegraph.kind === "leviathan-crossfire" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / Math.max(0.001, telegraph.duration);
        const fired = Boolean(telegraph.fired);
        const pulse = 0.56 + Math.sin(run.elapsed * 30) * 0.2;
        context.save();
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        for (const beam of telegraph.beams) {
          const travel = (HEIGHT - beam.originY) / Math.max(1, beam.targetY - beam.originY);
          const endX = beam.originX + (beam.targetX - beam.originX) * travel;
          context.globalAlpha = fired ? 0.9 : 0.34 + urgency * 0.32 + pulse * 0.08;
          context.strokeStyle = fired ? "#e8fbff" : "#79c9ff";
          context.lineWidth = fired ? 13 : 2.5 + urgency * 2;
          context.shadowColor = "#61c8ff";
          context.shadowBlur = fired ? 24 : 10 + urgency * 8;
          context.setLineDash(fired ? [] : [11, 7]);
          context.beginPath();
          context.moveTo(beam.originX, beam.originY);
          context.lineTo(endX, HEIGHT);
          context.stroke();
          context.setLineDash([]);

          context.globalAlpha = fired ? 0.28 : 0.08 + urgency * 0.12;
          context.fillStyle = fired ? "#dffaff" : "#5fb9ff";
          context.fillRect(beam.targetX - beam.radius, FORMATION_Y - 74, beam.radius * 2, 142);
          context.globalAlpha = fired ? 0.95 : 0.62 + pulse * 0.2;
          context.strokeStyle = "#b9ecff";
          context.lineWidth = fired ? 4 : 2;
          context.beginPath();
          context.arc(beam.targetX, FORMATION_Y + 28, beam.radius, 0, Math.PI * 2);
          context.stroke();
        }
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 0.95;
        context.shadowBlur = 0;
        context.textAlign = "center";
        context.fillStyle = fired ? "#ffffff" : "#cfefff";
        context.font = "1000 11px Arial";
        context.fillText(fired ? "變軌射線・發射" : "變軌射線・移出軌跡", WIDTH / 2, FORMATION_Y - 88);
        context.restore();
        continue;
      }
      if (telegraph.kind === "artillery" && layer === "overlay") {
        const pulse = 0.48 + Math.sin(run.elapsed * 28) * 0.18;
        const y = FORMATION_Y + 18;
        context.save();
        context.globalAlpha = 0.1 + pulse * 0.12;
        context.fillStyle = "#ff3355";
        context.fillRect(telegraph.x - telegraph.radius, y - 92, telegraph.radius * 2, 154);
        context.globalAlpha = 0.68 + pulse * 0.24;
        context.strokeStyle = "#ff5d73";
        context.lineWidth = 3;
        context.setLineDash([8, 5]);
        context.strokeRect(telegraph.x - telegraph.radius, y - 92, telegraph.radius * 2, 154);
        context.beginPath();
        context.ellipse(telegraph.x, y, telegraph.radius, 31, 0, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(telegraph.x - 16, y);
        context.lineTo(telegraph.x + 16, y);
        context.moveTo(telegraph.x, y - 16);
        context.lineTo(telegraph.x, y + 16);
        context.stroke();
        context.fillStyle = "#fff1f3";
        context.font = "1000 11px Arial";
        context.textAlign = "center";
        context.fillText("砲擊", telegraph.x, y - 38);
        context.restore();
        continue;
      }
      if (telegraph.kind === "heat-lane" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.55 + Math.sin(run.elapsed * 26) * 0.2;
        context.save();
        context.globalAlpha = 0.1 + urgency * 0.14 + pulse * 0.06;
        context.fillStyle = "#ff542e";
        context.fillRect(telegraph.x - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 150);
        context.globalAlpha = 0.68 + pulse * 0.22;
        context.strokeStyle = "#ff9b58";
        context.lineWidth = 3;
        context.setLineDash([11, 6]);
        context.strokeRect(telegraph.x - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 162);
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillStyle = "#fff0d8";
        context.font = "1000 11px Arial";
        context.fillText(telegraph.bossAttack ? "熔核噴發" : "高熱危險區", telegraph.x, FORMATION_Y - 92);
        context.restore();
        continue;
      }
      if (telegraph.kind === "frost-wall" && layer === "overlay") {
        const pulse = 0.52 + Math.sin(run.elapsed * 24) * 0.18;
        const left = Math.max(0, telegraph.safeX - telegraph.safeRadius);
        const right = Math.min(WIDTH, telegraph.safeX + telegraph.safeRadius);
        context.save();
        context.globalAlpha = 0.12 + pulse * 0.08;
        context.fillStyle = "#b9f4ff";
        context.fillRect(0, 120, left, HEIGHT - 120);
        context.fillRect(right, 120, WIDTH - right, HEIGHT - 120);
        context.globalAlpha = 0.72 + pulse * 0.2;
        context.strokeStyle = "#dffcff";
        context.lineWidth = 3;
        context.setLineDash([9, 5]);
        context.strokeRect(left, 120, right - left, HEIGHT - 132);
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillStyle = "#eaffff";
        context.font = "1000 11px Arial";
        context.fillText("安全通道", telegraph.safeX, FORMATION_Y - 92);
        context.restore();
        continue;
      }
      if (telegraph.kind === "air-raid" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.55 + Math.sin(run.elapsed * 32) * 0.18;
        const y = FORMATION_Y + 12;
        context.save();
        context.globalAlpha = 0.12 + urgency * 0.14;
        context.fillStyle = "#679dff";
        context.beginPath();
        context.arc(telegraph.x, y, telegraph.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.7 + pulse * 0.24;
        context.strokeStyle = "#a8d4ff";
        context.lineWidth = 3;
        context.setLineDash([7, 5]);
        context.beginPath();
        context.arc(telegraph.x, y, telegraph.radius, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(telegraph.x - telegraph.radius - 12, y);
        context.lineTo(telegraph.x + telegraph.radius + 12, y);
        context.moveTo(telegraph.x, y - telegraph.radius - 12);
        context.lineTo(telegraph.x, y + telegraph.radius + 12);
        context.stroke();
        context.textAlign = "center";
        context.fillStyle = "#edf6ff";
        context.font = "1000 11px Arial";
        context.fillText("空襲鎖定", telegraph.x, y - telegraph.radius - 18);
        context.restore();
      }

      if (telegraph.kind === "shore-barrage" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.55 + Math.sin(run.elapsed * 27) * 0.2;
        context.save();
        context.globalAlpha = 0.1 + urgency * 0.14 + pulse * 0.06;
        context.fillStyle = "#6eeeff";
        context.fillRect(telegraph.leftX - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 150);
        context.fillRect(telegraph.rightX - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 150);
        context.globalAlpha = 0.68 + pulse * 0.22;
        context.strokeStyle = "#bffcff";
        context.lineWidth = 3;
        context.setLineDash([11, 6]);
        context.strokeRect(telegraph.leftX - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 162);
        context.strokeRect(telegraph.rightX - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 162);
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillStyle = "#eafdff";
        context.font = "1000 11px Arial";
        context.fillText("灘頭炮擊", telegraph.leftX, FORMATION_Y - 92);
        context.fillText("灘頭炮擊", telegraph.rightX, FORMATION_Y - 92);
        context.restore();
      }

      if (telegraph.kind === "armor-barrage" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.55 + Math.sin(run.elapsed * 29) * 0.2;
        context.save();
        context.globalAlpha = 0.1 + urgency * 0.14 + pulse * 0.06;
        context.fillStyle = "#ffc05f";
        for (const lane of telegraph.lanes) {
          context.fillRect(lane - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 150);
        }
        context.globalAlpha = 0.68 + pulse * 0.22;
        context.strokeStyle = "#ffe0a8";
        context.lineWidth = 3;
        context.setLineDash([9, 5]);
        for (const lane of telegraph.lanes) {
          context.strokeRect(lane - telegraph.radius, 150, telegraph.radius * 2, HEIGHT - 162);
        }
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillStyle = "#fff2da";
        context.font = "1000 11px Arial";
        // Single centred label — three lanes' worth would collide.
        context.fillText("裝甲彈幕", WIDTH / 2, FORMATION_Y - 92);
        context.restore();
      }

      if (telegraph.kind === "air-superiority" && layer === "overlay") {
        const urgency = 1 - Math.max(0, telegraph.time) / telegraph.duration;
        const pulse = 0.55 + Math.sin(run.elapsed * 22) * 0.2;
        const y = FORMATION_Y + 12;
        context.save();
        context.globalAlpha = 0.1 + urgency * 0.16;
        context.fillStyle = "#ff6b78";
        context.beginPath();
        context.arc(telegraph.x, y, telegraph.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.68 + pulse * 0.24;
        context.strokeStyle = "#ffb3ba";
        context.lineWidth = 3;
        context.setLineDash([10, 6]);
        context.beginPath();
        context.arc(telegraph.x, y, telegraph.radius, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillStyle = "#fff0f1";
        context.font = "1000 11px Arial";
        context.fillText("空優轟炸", telegraph.x, y - telegraph.radius - 18);
        context.restore();
      }
    }
  }

  drawDrops(run) {
    const context = this.context;
    for (const drop of run.drops) {
      context.save();
      context.translate(drop.x, drop.y);
      context.rotate(run.elapsed * 1.7);
      context.shadowColor = drop.kind === "reinforce" ? "#62ffc5" : "#ffd768";
      context.shadowBlur = 16;
      const image = this.images.crate;
      if (image?.complete) context.drawImage(image, -17, -17, 34, 34);
      context.rotate(-run.elapsed * 1.7);
      context.fillStyle = drop.kind === "reinforce" ? "#69ffc8" : "#ffdb70";
      context.font = "1000 11px Arial";
      context.textAlign = "center";
      context.fillText(drop.kind === "reinforce" ? `+${drop.value}` : "☄", 0, 4);
      context.restore();
    }
  }

  drawBullets(run) {
    const context = this.context;
    if (!run.bullets.length) return;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    const denseBarrage = run.bullets.length > 160;
    const groups = new Map();
    for (const bullet of run.bullets) {
      if (this.approachHeight > 0 && !bullet.enemy && bullet.y < 0) continue;
      const weapon = bullet.enemy ? "enemy" : (bullet.weapon || "rifle");
      const profile = weaponTrailProfile(weapon, bullet.enemy);
      const lineWidth = Math.round(Math.max(1.25, bullet.r * 0.75 * profile.width) * 2) / 2;
      const key = `${weapon}|${bullet.color}|${lineWidth}`;
      let group = groups.get(key);
      if (!group) {
        group = { weapon, color: bullet.color, lineWidth, profile, bullets: [] };
        groups.set(key, group);
      }
      group.bullets.push(bullet);
    }
    if (!groups.size) return;

    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = denseBarrage ? 0.8 : 0.9;
    context.lineCap = "round";
    for (const group of groups.values()) {
      context.strokeStyle = group.color;
      context.lineWidth = group.lineWidth;
      context.shadowColor = group.color;
      context.shadowBlur = quality === QUALITY_LEVELS.LOW
        ? 0
        : denseBarrage ? (quality === QUALITY_LEVELS.HIGH ? 3 : 1.5) : Math.min(9, group.lineWidth * 2.9);
      context.beginPath();
      for (const bullet of group.bullets) {
        context.moveTo(bullet.x, bullet.y + (bullet.enemy ? -2 : 4));
        context.lineTo(
          bullet.x - bullet.vx * group.profile.length,
          bullet.y - bullet.vy * group.profile.length
        );
      }
      context.stroke();
      if (group.profile.core > 0 && (quality === QUALITY_LEVELS.HIGH || !denseBarrage)) {
        context.globalAlpha = group.profile.core;
        context.shadowBlur = 0;
        context.strokeStyle = "#f5ffff";
        context.lineWidth = Math.max(0.7, group.lineWidth * 0.34);
        context.stroke();
        context.globalAlpha = denseBarrage ? 0.8 : 0.9;
      }
      if (group.profile.head) {
        context.globalAlpha = 0.92;
        context.fillStyle = "#fff2c2";
        for (const bullet of group.bullets) context.fillRect(bullet.x - 2, bullet.y - 3, 4, 6);
        context.globalAlpha = denseBarrage ? 0.8 : 0.9;
      }
    }
    context.restore();
  }

  drawEnemies(run) {
    const context = this.context;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0) continue;
      const approaching = this.approachHeight > 0 && enemy.type !== "boss" && enemy.y < 0;
      const artId = ENEMY_ART[enemy.type] || "enemy";
      const image = this.images[artId];
      const size = enemy.type === "boss" ? 230 : enemy.r * 2.3;
      context.save();
      context.translate(enemy.x, enemy.y);
      if (enemy.type === "rusher") context.rotate(Math.sin(enemy.phase * 8) * 0.12);
      if (enemy.frozen > 0) {
        context.shadowColor = "#a8efff";
        context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 5 : 22;
        context.globalAlpha = 0.78;
      } else if (enemy.flash > 0) {
        context.shadowColor = "#fff";
        context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 3 : 16;
      } else if (enemy.armorBreaker) {
        context.shadowColor = "#d873ff";
        context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 2 : 16;
      } else if (enemy.flanker) {
        context.shadowColor = "#ff765d";
        context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 2 : 14;
      }
      if (approaching) context.globalAlpha *= 0.42;
      const customBoss = enemy.type === "boss" && enemy.chassis && enemy.chassis !== "babel";
      if (customBoss) this.drawBossChassis(enemy, run, size);
      else if (image?.complete) context.drawImage(image, -size / 2, -size / 2, size, size);
      else {
        context.fillStyle = enemy.type === "boss" ? "#ff596d" : "#ad5964";
        context.beginPath();
        context.arc(0, 0, enemy.r, 0, Math.PI * 2);
        context.fill();
      }
      if (enemy.type === "boss") this.drawBossDamage(enemy, run, size);
      if (enemy.flash > 0) this.drawHitFeedback(enemy);
      context.restore();

      if (!approaching && enemy.type !== "trooper" && enemy.type !== "rusher" && enemy.type !== "boss") {
        const width = Math.max(36, enemy.r * 2.2);
        const y = enemy.y - (enemy.r - 5);
        context.fillStyle = "rgba(0,0,0,.72)";
        context.fillRect(enemy.x - width / 2, y, width, 4);
        context.fillStyle = "#ff8b68";
        context.fillRect(enemy.x - width / 2, y, width * Math.max(0, enemy.hp / enemy.maxHp), 4);
      }
      if (!approaching && (enemy.armorBreaker || enemy.flanker)) {
        context.fillStyle = enemy.armorBreaker ? "#e5a0ff" : "#ff9c75";
        context.font = "1000 9px Arial";
        context.textAlign = "center";
        context.fillText(enemy.armorBreaker ? "爆甲" : "側翼", enemy.x, enemy.y + enemy.r + 15);
      }
    }
  }

  drawBossChassis(enemy, run, size) {
    const context = this.context;
    const meta = BOSS_CHASSIS[enemy.chassis] || BOSS_CHASSIS.babel;
    const scale = size / 230;
    const pulse = 0.72 + Math.sin(run.elapsed * (run.bossPhase >= 3 ? 10 : 5)) * 0.2;
    context.save();
    context.scale(scale, scale);
    context.shadowColor = meta.color;
    context.shadowBlur = this.quality === QUALITY_LEVELS.LOW ? 4 : 13;

    if (enemy.chassis === "leviathan") {
      context.fillStyle = "rgba(0,4,12,.62)";
      context.beginPath();
      context.ellipse(0, 76, 94, 13, 0, 0, Math.PI * 2);
      context.fill();

      const wing = context.createLinearGradient(-96, -30, 96, 55);
      wing.addColorStop(0, "#173858");
      wing.addColorStop(0.5, "#52697b");
      wing.addColorStop(1, "#132c48");
      context.fillStyle = wing;
      context.strokeStyle = meta.color;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(-104, 24);
      context.lineTo(-46, -24);
      context.lineTo(-24, -6);
      context.lineTo(0, -54);
      context.lineTo(24, -6);
      context.lineTo(46, -24);
      context.lineTo(104, 24);
      context.lineTo(62, 50);
      context.lineTo(28, 36);
      context.lineTo(0, 80);
      context.lineTo(-28, 36);
      context.lineTo(-62, 50);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "#0b1829";
      context.strokeStyle = "#a7e5ff";
      context.lineWidth = 3;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.ellipse(side * 66, 17, 22, 13, side * 0.22, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = meta.color;
        context.fillRect(side * 66 - 10, 13, 20, 7);
        context.fillStyle = "#0b1829";
      }

      context.globalCompositeOperation = "lighter";
      context.globalAlpha = pulse;
      context.fillStyle = "#bcefff";
      context.beginPath();
      context.moveTo(0, -25);
      context.lineTo(14, 8);
      context.lineTo(0, 34);
      context.lineTo(-14, 8);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "#d6f6ff";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-86, 35);
      context.lineTo(-52, 28);
      context.moveTo(86, 35);
      context.lineTo(52, 28);
      context.stroke();
    } else {
      context.fillStyle = "rgba(7,2,0,.66)";
      context.beginPath();
      context.ellipse(0, 82, 82, 14, 0, 0, Math.PI * 2);
      context.fill();

      for (const side of [-1, 1]) {
        context.fillStyle = "#211915";
        context.strokeStyle = "#85513a";
        context.lineWidth = 4;
        roundedRect(context, side * 62 - 17, 8, 34, 80, 10);
        context.fill();
        context.stroke();
        context.fillStyle = "#5e3728";
        for (let row = 0; row < 4; row += 1) context.fillRect(side * 62 - 12, 18 + row * 17, 24, 7);
      }

      const armor = context.createLinearGradient(-58, -58, 58, 75);
      armor.addColorStop(0, "#713520");
      armor.addColorStop(0.46, "#38231d");
      armor.addColorStop(1, "#171414");
      context.fillStyle = armor;
      context.strokeStyle = meta.color;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(-52, -38);
      context.lineTo(-25, -68);
      context.lineTo(25, -68);
      context.lineTo(52, -38);
      context.lineTo(45, 56);
      context.lineTo(0, 84);
      context.lineTo(-45, 56);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "#261715";
      context.strokeStyle = "#ffbd79";
      context.lineWidth = 3;
      for (const side of [-1, 1]) {
        context.fillRect(side * 43 - 11, -72, 22, 47);
        context.strokeRect(side * 43 - 11, -72, 22, 47);
        context.fillStyle = meta.color;
        context.fillRect(side * 43 - 7, -82, 14, 18);
        context.fillStyle = "#261715";
      }

      context.globalCompositeOperation = "lighter";
      context.globalAlpha = pulse;
      context.fillStyle = "#ffb35f";
      context.shadowBlur = this.quality === QUALITY_LEVELS.LOW ? 5 : 20;
      context.beginPath();
      context.arc(0, 9, 21, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#fff0b0";
      context.beginPath();
      context.arc(0, 9, 8, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "#ffad68";
      context.lineWidth = 2;
      for (let row = 0; row < 3; row += 1) {
        context.beginPath();
        context.moveTo(-30, 38 + row * 10);
        context.lineTo(30, 38 + row * 10);
        context.stroke();
      }
    }
    context.restore();
  }

  drawBossDamage(enemy, run, size) {
    const context = this.context;
    const stage = bossDamageStage(enemy);
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    if (stage === 0 && run.bossPhase < 3) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    if (run.bossPhase >= 3) {
      const pulse = 0.55 + Math.sin(run.elapsed * 9) * 0.22;
      context.globalAlpha = pulse;
      context.strokeStyle = "#ffb45f";
      context.fillStyle = "rgba(255,58,76,.2)";
      context.shadowColor = "#ff3a50";
      context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 3 : 16;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 4, 18 + pulse * 6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    if (stage > 0) {
      context.globalAlpha = 0.42 + stage * 0.14;
      context.strokeStyle = stage >= 3 ? "#fff0a2" : "#ff875f";
      context.shadowColor = "#ff4f45";
      context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 0 : 7;
      context.lineWidth = 1.5 + stage * 0.35;
      context.beginPath();
      for (let index = 0; index < Math.min(BOSS_CRACKS.length, stage + 1); index += 1) {
        const crack = BOSS_CRACKS[index];
        context.moveTo(crack[0][0], crack[0][1]);
        for (let point = 1; point < crack.length; point += 1) context.lineTo(crack[point][0], crack[point][1]);
      }
      context.stroke();
      if (stage >= 2 && quality > QUALITY_LEVELS.LOW) {
        context.shadowBlur = 0;
        context.fillStyle = "#ffbe68";
        const embers = quality === QUALITY_LEVELS.HIGH ? 6 : 3;
        for (let index = 0; index < embers; index += 1) {
          const x = Math.sin(run.elapsed * (1.4 + index * .11) + index * 2.3) * size * .28;
          const y = -size * .12 - ((run.elapsed * (20 + index * 3) + index * 29) % (size * .4));
          context.fillRect(x, y, 2 + index % 2, 3 + index % 3);
        }
      }
    }
    context.restore();
  }

  drawHitFeedback(enemy) {
    const context = this.context;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    const strength = Math.max(0, Math.min(1, enemy.flash / 0.08));
    const weapon = enemy.hitWeapon || "rifle";
    const radius = enemy.r * (enemy.type === "boss" ? 1.08 : 1.18);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = strength * 0.58;
    context.strokeStyle = enemy.hitColor || "#fff";
    context.shadowColor = enemy.hitColor || "#fff";
    context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 0 : 7;
    context.lineWidth = weapon === "rocket" || weapon === "railgun" ? 3 : 1.5;
    context.beginPath();
    context.ellipse(0, 0, radius, radius * .72, 0, 0, Math.PI * 2);
    if (quality > QUALITY_LEVELS.LOW && weapon === "rocket") {
      for (let index = 0; index < 4; index += 1) {
        const angle = Math.PI * .25 + index * Math.PI * .5;
        context.moveTo(Math.cos(angle) * radius * .65, Math.sin(angle) * radius * .5);
        context.lineTo(Math.cos(angle) * radius * 1.25, Math.sin(angle) * radius);
      }
    } else if (quality > QUALITY_LEVELS.LOW && weapon === "railgun") {
      context.moveTo(-radius * 1.25, 0);
      context.lineTo(radius * 1.25, 0);
      context.moveTo(0, -radius);
      context.lineTo(0, radius);
    } else if (quality > QUALITY_LEVELS.LOW && weapon === "laser") {
      context.moveTo(0, -radius * 1.2);
      context.lineTo(0, radius * 1.2);
    }
    context.stroke();
    context.restore();
  }

  drawFormation(run) {
    const context = this.context;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    const footprint = formationFootprint(run.squad);
    const offsets = footprint.offsets;
    const soldier = this.images.viper;
    const commander = COMMANDERS[run.commander];
    const commanderImage = this.images[commander.art];
    const rearY = offsets[0]?.y || 0;

    context.save();
    context.globalAlpha = 0.34;
    context.fillStyle = "#000";
    context.beginPath();
    context.ellipse(run.x, FORMATION_Y + rearY + 24, Math.min(92, 32 + Math.sqrt(run.squad) * 11), 16, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    for (let index = offsets.length - 1; index >= 0; index -= 1) {
      const offset = offsets[index];
      const x = run.x + offset.x;
      const y = FORMATION_Y + offset.y;
      const image = index === 0 ? commanderImage : soldier;
      const width = index === 0 ? 30 : 25;
      const height = index === 0 ? 38 : 32;
      context.save();
      context.shadowColor = index === 0 ? commander.color : WEAPONS[run.weapon.id].color;
      context.shadowBlur = quality === QUALITY_LEVELS.LOW ? 0 : run.fury > 0 ? (quality === QUALITY_LEVELS.HIGH ? 12 : 7) : 5;
      if (run.invuln > 0) context.globalAlpha = 0.68 + Math.sin(run.elapsed * 32) * 0.25;
      if (image?.complete) context.drawImage(image, x - width / 2, y - height / 2, width, height);
      context.restore();
    }

    const badgeText = squadBadgeText(run.squad);
    context.save();
    context.font = "900 11px Arial";
    const badgeWidth = Math.max(58, context.measureText(badgeText).width + 18);
    const badgeX = run.x - badgeWidth / 2;
    const badgeY = FORMATION_Y - 65;
    context.fillStyle = "rgba(3,12,15,.88)";
    context.strokeStyle = commander.color;
    context.lineWidth = 1;
    roundedRect(context, badgeX, badgeY, badgeWidth, 23, 6);
    context.fill();
    context.stroke();
    context.fillStyle = "#efffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = commander.color;
    context.shadowBlur = 7;
    context.fillText(badgeText, run.x, badgeY + 12);
    context.restore();
  }

  drawParticles(run) {
    const context = this.context;
    if (!run.particles.length) return;
    const quality = Number.isFinite(this.quality) ? this.quality : QUALITY_LEVELS.HIGH;
    const stride = quality === QUALITY_LEVELS.LOW && run.particles.length > 160 ? 2 : 1;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < run.particles.length; index += stride) {
      const particle = run.particles[index];
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.restore();
  }

  drawCinematics(run) {
    const context = this.context;
    if (run.skillVisual > 0) {
      const commander = COMMANDERS[run.commander];
      const elapsed = 0.72 - run.skillVisual;
      const envelope = Math.max(0, Math.min(1, elapsed * 9, run.skillVisual * 5));
      const sweep = Math.min(1, elapsed / 0.42);
      context.save();
      context.globalAlpha = envelope * 0.2;
      context.fillStyle = "#010607";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = envelope * 0.55;
      context.fillStyle = commander.color;
      context.beginPath();
      context.moveTo(-90 + sweep * (WIDTH + 180), 0);
      context.lineTo(-25 + sweep * (WIDTH + 180), 0);
      context.lineTo(-135 + sweep * (WIDTH + 180), HEIGHT);
      context.lineTo(-205 + sweep * (WIDTH + 180), HEIGHT);
      context.closePath();
      context.fill();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = envelope * 0.92;
      context.textAlign = "left";
      context.fillStyle = commander.color;
      context.font = "900 9px monospace";
      context.fillText(`${commander.callsign} // TACTICAL RELEASE`, 22, HEIGHT * .29);
      context.fillStyle = "#fff";
      context.font = "1000 25px Arial";
      context.fillText(commander.special, 22, HEIGHT * .335);
      context.restore();
    }
    if (run.bossPhaseVisual > 0) {
      const boss = run.enemies.find((enemy) => enemy.type === "boss" && enemy.hp > 0);
      const bossMeta = BOSS_CHASSIS[boss?.chassis || run.bossChassis] || BOSS_CHASSIS.babel;
      const elapsed = 0.75 - run.bossPhaseVisual;
      const envelope = Math.max(0, Math.min(1, elapsed * 10, run.bossPhaseVisual * 4));
      context.save();
      context.globalAlpha = envelope * 0.14;
      context.fillStyle = bossMeta.color;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.globalAlpha = envelope * 0.86;
      context.strokeStyle = bossMeta.color;
      context.lineWidth = 2;
      context.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
      context.textAlign = "center";
      context.fillStyle = bossMeta.color;
      context.font = "900 9px monospace";
      context.fillText(`${bossMeta.id.toUpperCase()} COMBAT FRAME SHIFT`, WIDTH / 2, HEIGHT * .245);
      context.fillStyle = "#fff";
      context.font = "1000 28px Arial";
      context.fillText(`戰鬥階段 ${run.bossPhase}`, WIDTH / 2, HEIGHT * .292);
      context.restore();
    }
  }

  drawTexts(run) {
    const context = this.context;
    for (const text of run.texts) {
      context.save();
      context.globalAlpha = Math.min(1, text.life * 2);
      context.fillStyle = text.color;
      context.shadowColor = "#000";
      context.shadowBlur = 4;
      context.font = text.big ? "1000 21px Arial" : "900 12px Arial";
      context.textAlign = "center";
      context.fillText(text.text, text.x, text.y);
      context.restore();
    }
  }

  drawStageBanner(run) {
    if (run.stageBanner <= 0) return;
    run.stageBanner = Math.max(0, run.stageBanner - 1 / 60);
    const context = this.context;
    const zone = zoneForRun(run);
    const message = run.stageMessage;
    const alpha = Math.min(1, run.stageBanner * 1.5);
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = "rgba(4,10,12,.84)";
    context.fillRect(0, HEIGHT * 0.31, WIDTH, 112);
    context.textAlign = "center";
    context.fillStyle = zone.accent;
    context.font = "900 9px monospace";
    context.fillText(zone.code, WIDTH / 2, HEIGHT * 0.355);
    context.fillStyle = "#fff";
    context.font = "1000 29px Arial";
    context.fillText(message?.title || zone.name, WIDTH / 2, HEIGHT * 0.41);
    context.fillStyle = "#a7bfbc";
    context.font = "800 10px Arial";
    context.fillText(message?.subtitle || zone.rule, WIDTH / 2, HEIGHT * 0.45);
    context.restore();
    if (run.stageBanner === 0) run.stageMessage = null;
  }
}
