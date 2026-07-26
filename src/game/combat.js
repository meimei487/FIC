import {
  ARMOR_HIT_INVULN_SECONDS,
  BATTLE_ACHIEVEMENTS,
  BOSS_CHASSIS,
  COMMANDER_SKILL_COOLDOWN_SECONDS,
  COMMANDERS,
  ENEMY_STATS,
  FORMATION_Y,
  FURY_COMBO_TARGET,
  FURY_COOLDOWN_SECONDS,
  HEIGHT,
  MAX_SQUAD,
  NO_SUPPORT_BOSS_SCORE_BONUS,
  PERFECT_GATE_MINIMUM,
  SAFE_EXIT_SECONDS,
  SQUAD_HIT_INVULN_SECONDS,
  SUPPORTS,
  TACTICAL_MISSIONS,
  WEAPONS,
  WEAPON_MAX_LEVEL,
  WIDTH,
  allResearchMax,
  armorCap,
  bossChassisForOrdinal,
  buildZoneRoute,
  pickHazardRounds,
  maxDeploymentCost,
  supportCost,
  threatProtocolAvailable,
  zoneForRun
} from "../config.js";
import {
  addDailyCommander,
  addDailyProgress,
  clearCheckpoint,
  grantAchievementRewards,
  saveProfile,
  setDailyProgress,
  unlockAchievement
} from "../storage.js";
import {
  addArmor,
  airGainMultiplier,
  createRun,
  creditMultiplier,
  critChance,
  dodgeChance,
  effectiveArmor,
  effectiveBulletDamage,
  effectiveFireInterval,
  effectiveWeaponLevel,
  formationOffsets,
  protocolForRun,
  restoreRun,
  serializeRun
} from "./state.js";

const VEHICLES = new Set(["turret", "tank", "gunship", "elite", "sniper"]);
const GLOBAL_STRIKE_DAMAGE_FRACTION = 0.3;
const GLOBAL_STRIKE_MIN_INTERVAL = 8;
const GLOBAL_STRIKE_ENRAGE_START = 45;
const GLOBAL_STRIKE_ENRAGE_INTERVAL = 12;
const MAX_COMBAT_PARTICLES = 360;
const MAX_COMBAT_TEXTS = 72;
const WEAPON_MASTERY = Object.freeze({
  rifleKills: 30,
  shotgunVolleyKills: 4,
  rocketProjectileKills: 3,
  laserPierces: 4,
  minigunKills: 20,
  minigunWindow: 8,
  railgunProjectileKills: 3
});
const LEVIATHAN_CROSSFIRE_KIND = "leviathan-crossfire";

// Every telegraph kind that occupies the full lane. Only one may be live at a
// time, otherwise overlapping warnings become unreadable and undodgeable.
const BLOCKING_TELEGRAPH_KINDS = [
  "global-strike",
  "artillery",
  "heat-lane",
  "frost-wall",
  "air-raid",
  "shore-barrage",
  "armor-barrage",
  "air-superiority"
];

// Same set plus the Leviathan crossfire, which also blocks a global strike.
// Hoisted rather than spread inline: this is checked every frame a boss is up.
const GLOBAL_STRIKE_BLOCKERS = [...BLOCKING_TELEGRAPH_KINDS, LEVIATHAN_CROSSFIRE_KIND];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedItem(items) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return randomItem(items);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function circlesOverlap(ax, ay, ar, bx, by, br) {
  const limit = ar + br;
  const dx = ax - bx;
  if (Math.abs(dx) >= limit) return false;
  const dy = ay - by;
  return Math.abs(dy) < limit && dx * dx + dy * dy < limit * limit;
}

function isTargetableEnemy(enemy) {
  return enemy.hp > 0 && enemy.y >= (enemy.type === "boss" ? -25 : 0);
}

export class CombatEngine {
  constructor(profile, { onEvent = () => {}, onSave = () => {}, audio = null } = {}) {
    this.profile = profile;
    this.run = null;
    this.playing = false;
    this.onEvent = onEvent;
    this.onSave = onSave;
    this.audio = audio;
    this.playerBulletPool = [];
  }

  start(commanderId = this.profile.selected, { protocolId = "standard", maxDeployment = false } = {}) {
    const selectedProtocol = threatProtocolAvailable(this.profile, protocolId) ? protocolId : "standard";
    const useMaxDeployment = Boolean(maxDeployment && allResearchMax(this.profile));
    const protocol = protocolForRun({ threatProtocol: selectedProtocol });
    const deploymentCost = protocol.cost + (useMaxDeployment ? maxDeploymentCost(commanderId, 0) : 0);
    if (this.profile.credits < deploymentCost) return null;
    this.profile.credits -= deploymentCost;
    this.run = createRun(this.profile, commanderId, Math.random, {
      protocolId: selectedProtocol,
      maxDeployment: useMaxDeployment
    });
    this.playing = true;
    this.queueAchievement("deploy");
    if (useMaxDeployment) this.queueAchievement("fullsortie");
    const contract = useMaxDeployment ? "・滿級出擊" : "";
    this.alert("縱隊出擊", COMMANDERS[commanderId].color, `${zoneForRun(this.run).rule}・${protocol.name}${contract}`);
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.audio?.effect("start");
    return this.run;
  }

  resume(snapshot, reason = "checkpoint") {
    this.run = restoreRun(snapshot, this.profile);
    this.playing = true;
    const zone = zoneForRun(this.run);
    if (reason === "research") {
      this.run.stageMessage = {
        title: "研究整備完成",
        subtitle: `第 ${this.run.bossKills + 1} 輪・${zone.name}｜永久研究已套用`
      };
    } else {
      this.run.stageMessage = {
        title: "檢查點接續",
        subtitle: `${zone.name}｜機體與戰果已恢復`
      };
    }
    this.run.alert = "";
    this.run.alertTime = 0;
    return this.run;
  }

  pause() {
    this.playing = false;
  }

  unpause() {
    if (this.run && !this.run.gameOver) this.playing = true;
  }

  moveTo(x) {
    if (!this.run) return;
    this.run.x = clamp(x, 48, WIDTH - 48);
  }

  queueAchievement(id) {
    const run = this.run;
    const achievement = BATTLE_ACHIEVEMENTS.find((item) => item.id === id);
    if (!run || !achievement || (achievement.elite && run.cycleMaxDeploymentUsed)
      || this.profile.achievements.includes(id) || run.segmentAchievements.includes(id)) return;
    run.segmentAchievements.push(id);
    this.onEvent("achievement", { id });
    if (achievement?.commander) this.checkCommanderMastery();
    if (achievement?.commanderSkill) this.checkSkillMastery();
    if (achievement?.weaponMastery) this.checkWeaponMastery();
  }

  checkCommanderMastery() {
    const run = this.run;
    const commanderIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commander).map((achievement) => achievement.id);
    const mastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.commanderMeta);
    if (!run || !mastery || commanderIds.length !== Object.keys(COMMANDERS).length) return;
    if (commanderIds.every((id) => this.profile.achievements.includes(id) || run.segmentAchievements.includes(id))) {
      this.queueAchievement(mastery.id);
    }
  }

  checkSkillMastery() {
    const run = this.run;
    const skillIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commanderSkill).map((achievement) => achievement.id);
    const mastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.skillMeta);
    if (!run || !mastery || skillIds.length !== Object.keys(COMMANDERS).length) return;
    if (skillIds.every((id) => this.profile.achievements.includes(id) || run.segmentAchievements.includes(id))) {
      this.queueAchievement(mastery.id);
    }
  }

  checkWeaponMastery() {
    const run = this.run;
    const weaponIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.weaponMastery)
      .map((achievement) => achievement.id);
    const mastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.weaponMeta);
    if (!run || !mastery || weaponIds.length !== Object.keys(WEAPONS).length) return;
    if (weaponIds.every((id) => this.profile.achievements.includes(id) || run.segmentAchievements.includes(id))) {
      this.queueAchievement(mastery.id);
    }
  }

  checkScoreAchievements() {
    if (!this.run) return;
    for (const achievement of BATTLE_ACHIEVEMENTS) {
      if (achievement.scoreTarget && this.run.score >= achievement.scoreTarget) this.queueAchievement(achievement.id);
    }
  }

  addSegmentStat(id, amount = 1) {
    const run = this.run;
    if (!run) return 0;
    run.segmentStats ||= {};
    run.segmentStats[id] = (run.segmentStats[id] || 0) + amount;
    const projected = (this.profile.stats[id] || 0) + run.segmentStats[id];
    for (const achievement of BATTLE_ACHIEVEMENTS) {
      if (achievement.stat === id && projected >= achievement.target) this.queueAchievement(achievement.id);
    }
    return projected;
  }

  addSegmentDaily(id, amount = 1, mode = "add") {
    const run = this.run;
    if (!run) return;
    if (mode === "max") run.segmentDaily[id] = Math.max(run.segmentDaily[id] || 0, amount);
    else run.segmentDaily[id] = (run.segmentDaily[id] || 0) + amount;
  }

  alert(title, color, detail = "") {
    const run = this.run;
    if (!run) return;
    run.alert = detail ? `${title} // ${detail}` : title;
    run.alertColor = color;
    run.alertTime = 3;
    run.texts.push({
      x: WIDTH / 2,
      y: HEIGHT * 0.29,
      text: title,
      color,
      life: 1.35,
      big: true
    });
  }

  particles(x, y, color, count = 12, speed = 170) {
    const run = this.run;
    if (!run) return;
    const available = Math.max(0, MAX_COMBAT_PARTICLES - run.particles.length);
    const emitted = Math.min(count, available);
    for (let index = 0; index < emitted; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 30 + Math.random() * speed;
      run.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.25 + Math.random() * 0.45,
        maxLife: 0.7,
        size: 1.5 + Math.random() * 4,
        color
      });
    }
  }

  update(delta) {
    const run = this.run;
    if (!run || !this.playing || run.gameOver) return;
    const dt = Math.min(0.034, Math.max(0, delta));

    if (run.safeExitClock > 0) {
      run.safeExitClock = Math.max(0, run.safeExitClock - dt);
      if (run.safeExitClock === 0) this.continueAfterBoss();
      return;
    }

    run.elapsed += dt;
    run.sceneTime += dt;
    run.fireClock -= dt;
    run.spawnClock -= dt;
    run.gateClock -= dt;
    run.eventClock -= dt;
    run.hazardClock -= dt;
    run.comboClock -= dt;
    run.furyChainClock -= dt;
    run.invuln = Math.max(0, run.invuln - dt);
    run.hardInvuln = Math.max(0, (run.hardInvuln || 0) - dt);
    run.fury = Math.max(0, run.fury - dt);
    run.furyLock = Math.max(0, run.furyLock - dt);
    run.skillCooldown = Math.max(0, run.skillCooldown - dt);
    run.skillVisual = Math.max(0, (run.skillVisual || 0) - dt);
    run.bossPhaseVisual = Math.max(0, (run.bossPhaseVisual || 0) - dt);
    if (run.commanderChallenge.clock > 0) {
      run.commanderChallenge.clock = Math.max(0, run.commanderChallenge.clock - dt);
      if (run.commanderChallenge.clock === 0) run.commanderChallenge = { type: null, clock: 0, kills: 0 };
    }
    run.shake = Math.max(0, run.shake - 25 * dt);
    run.alertTime -= dt;
    run.reinforceDropCooldown = Math.max(0, run.reinforceDropCooldown - dt);
    run.energyDropCooldown = Math.max(0, run.energyDropCooldown - dt);
    if (run.weaponMastery.minigunClock > 0) {
      run.weaponMastery.minigunClock = Math.max(0, run.weaponMastery.minigunClock - dt);
      if (run.weaponMastery.minigunClock === 0) run.weaponMastery.minigunKills = 0;
    }
    if (run.alertTime <= 0) run.alert = "";
    if (run.comboClock <= 0) {
      run.combo = 0;
      run.weaponMastery.rifleChain = 0;
    }
    if (run.furyChainClock <= 0) run.furyChain = 0;

    if (run.commander === "warden") this.updateWarden(dt);

    if (run.fireClock <= 0) {
      this.firePlayerWeapon();
      run.fireClock = effectiveFireInterval(run);
    }

    this.updateStageFlow();
    this.updateCounterThreats(dt);
    this.updateGates(dt);
    this.updateDrops(dt);
    this.updateTelegraphs(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updateEnemies(dt);
    this.resolvePlayerBullets();
    this.cleanup();
  }

  updateWarden(dt) {
    const run = this.run;
    run.regenClock -= dt;
    const cap = armorCap(this.profile.research);
    if (run.regenClock <= 0 && effectiveArmor(run) < cap) {
      addArmor(run, 1, this.profile);
      run.regenClock = 3;
      run.texts.push({ x: run.x, y: FORMATION_Y - 60, text: "裝甲 +1", color: "#7dffb0", life: 0.65 });
    } else if (run.regenClock <= 0) {
      run.regenClock = 3;
    }
  }

  counterProtocolActive() {
    return Boolean(this.run && effectiveWeaponLevel(this.run) >= WEAPON_MAX_LEVEL);
  }

  updateCounterThreats(dt) {
    const run = this.run;
    if (!run || run.bossAlive || run.bossSpawned) return;
    const artilleryActive = this.counterProtocolActive() || run.bossKills >= 3;
    if (!artilleryActive) return;
    run.artilleryClock -= dt;
    if (run.artilleryClock > 0 || run.telegraphs.some((telegraph) => telegraph.kind === "artillery")) return;
    this.queueArtillery();
    run.artilleryClock = 10 + Math.random() * 2;
  }

  queueArtillery() {
    const run = this.run;
    if (!run || run.telegraphs.some((telegraph) => telegraph.kind === "artillery" || telegraph.kind === "global-strike")) return false;
    const targetX = clamp(run.x + (Math.random() - 0.5) * 70, 52, WIDTH - 52);
    run.telegraphs.push({
      kind: "artillery",
      x: targetX,
      radius: 46,
      time: 1.15,
      duration: 1.15,
      fired: false
    });
    run.texts.push({ x: targetX, y: FORMATION_Y - 72, text: "戰區砲擊", color: "#ff506d", life: 1.1 });
    return true;
  }

  updateStageFlow() {
    const run = this.run;
    const protocol = protocolForRun(run);
    const sectorStep = run.scene % 3;
    const zone = zoneForRun(run);
    const sectorDuration = 24 + Math.min(5, run.bossKills * 0.8) + (sectorStep === 1 ? 2 : 0);

    if (sectorStep < 2 && run.sceneTime >= sectorDuration) {
      run.scene += 1;
      run.sceneTime = 0;
      run.stageBanner = 2.2;
      run.spawnClock = 0.9;
      run.gateClock = 4.5;
      run.eventClock = 7;
      run.hazardClock = 6.5 * protocol.hazardInterval;
      run.artilleryClock = 8 + Math.random() * 2;
      run.enemies.length = 0;
      this.clearBullets();
      run.gates.length = 0;
      run.telegraphs.length = 0;
      const nextZone = zoneForRun(run);
      this.alert(nextZone.name, nextZone.accent, `威脅 ${run.bossKills + 1}・${nextZone.rule}`);
      return;
    }

    const bossArrivalTime = 24 + Math.min(6, run.bossKills);
    if (sectorStep === 2 && run.sceneTime >= bossArrivalTime && !run.bossSpawned && !run.bossAlive) {
      this.spawnBoss();
    }

    if (!run.bossAlive && !run.bossSpawned && run.spawnClock <= 0) {
      this.spawnWave();
      run.spawnClock = Math.max(
        0.42,
        1.28 - sectorStep * 0.13 - run.sceneTime * 0.006 - Math.min(0.36, run.bossKills * 0.045)
      ) * protocol.spawnInterval;
    }

    if (!run.bossAlive && !run.bossSpawned && run.gateClock <= 0 && run.sceneTime < sectorDuration - 4) {
      this.spawnGatePair();
      run.gateClock = (10.5 + Math.random() * 2.5) * (1 - 0.04 * (this.profile.research.luck || 0));
    }

    if (!run.bossAlive && run.eventClock <= 0) {
      this.spawnEvent();
      run.eventClock = (10 + Math.random() * 4) / Math.max(0.55, protocol.supplyRate);
    }

    // Difficulty ramp (plan C). A brand-new account climbs: first round has no
    // zone hazards at all, second round arms one of the three scene slots,
    // third round arms two, and from the fourth round everything is live.
    // Once the account has cleared Moloch even once it is marked graduated and
    // skips the ramp entirely. MAX deployment always runs at full intensity.
    const hazardsArmed = run.maxDeploymentActive || this.profile.hazardGraduated
      ? true
      : run.bossKills === 0
        ? false
        : run.bossKills === 1 || run.bossKills === 2
          ? run.hazardRoundPicks.includes(run.scene % 3)
          : true;

    if (!run.bossAlive && !run.bossSpawned && zone.hazard && hazardsArmed && run.sceneTime >= 5 && run.hazardClock <= 0) {
      this.queueZoneHazard(zone);
      const base = zone.id === "skyfront" ? 7.5 : zone.id === "foundry" ? 8.5 : 10;
      run.hazardClock = (base + Math.random() * 2.5) * protocol.hazardInterval;
    }
  }

  queueZoneHazard(zone = zoneForRun(this.run)) {
    const run = this.run;
    if (!run || !zone?.hazard || run.telegraphs.some((item) =>
      BLOCKING_TELEGRAPH_KINDS.includes(item.kind))) return false;
    if (zone.hazard === "heat-lane") {
      const x = clamp(run.x + (Math.random() - 0.5) * 80, 58, WIDTH - 58);
      run.telegraphs.push({ kind: "heat-lane", x, radius: 54, time: 1.35, duration: 1.35, fired: false });
      this.alert("熔爐洩壓", zone.accent, "離開橙紅熱區");
    } else if (zone.hazard === "frost-wall") {
      const safeCenters = [76, WIDTH / 2, WIDTH - 76];
      const safeX = safeCenters[Math.floor(Math.random() * safeCenters.length)];
      run.telegraphs.push({ kind: "frost-wall", safeX, safeRadius: 57, time: 1.6, duration: 1.6, fired: false });
      this.alert("極寒脈衝", zone.accent, "指揮官進入藍色安全通道");
    } else if (zone.hazard === "air-raid") {
      run.telegraphs.push({ kind: "air-raid", x: run.x, radius: 42, time: 0.95, duration: 0.95, fired: false });
      this.alert("高空鎖定", zone.accent, "立即離開瞄準區");
    } else if (zone.hazard === "shore-barrage") {
      // Two fixed columns from the flanks — the safe answer is always the
      // centre, which suits the opening zone where players are still learning.
      run.telegraphs.push({
        kind: "shore-barrage",
        leftX: WIDTH * 0.24,
        rightX: WIDTH * 0.76,
        radius: 46,
        time: 1.5,
        duration: 1.5,
        fired: false
      });
      this.alert("灘頭炮擊", zone.accent, "退回中央安全走廊");
    } else if (zone.hazard === "armor-barrage") {
      // Three random narrow lanes; the gaps between them shift every time.
      const lanes = [];
      for (let index = 0; index < 3; index += 1) lanes.push(38 + Math.random() * (WIDTH - 76));
      run.telegraphs.push({ kind: "armor-barrage", lanes, radius: 30, time: 1.25, duration: 1.25, fired: false });
      this.alert("裝甲彈幕", zone.accent, "穿越砲擊帶間的窄縫");
    } else if (zone.hazard === "air-superiority") {
      // Wide circle locked onto wherever the player stands, with a long tell —
      // punishes standing still rather than demanding precision.
      run.telegraphs.push({ kind: "air-superiority", x: run.x, radius: 62, time: 1.7, duration: 1.7, fired: false });
      this.alert("空優轟炸", zone.accent, "立即撤出立體打擊區");
    }
    return true;
  }

  enemyScale(type) {
    const run = this.run;
    const tier = run.bossKills;
    const protocol = protocolForRun(run);
    if (type === "boss") return (1 + tier * 0.22 + tier * tier * 0.022) * protocol.enemyHp;
    return (1 + tier * 0.14 + tier * tier * 0.012 + zoneForRun(run).difficulty * 0.045) * protocol.enemyHp;
  }

  spawnEnemy(type, x = 30 + Math.random() * (WIDTH - 60), y = -55) {
    const base = ENEMY_STATS[type];
    const scale = this.enemyScale(type);
    const hp = base.hp * scale;
    const armor = type === "shield"
      ? hp * 0.55
      : type === "tank"
        ? hp * 0.22
        : type === "boss"
          ? hp * 0.16
          : 0;
    const tier = this.run.bossKills;
    const protocol = protocolForRun(this.run);
    const speedScale = type === "boss" ? 1 : 1 + Math.min(0.3, tier * 0.035);
    const fireScale = 1 - Math.min(0.34, tier * 0.045);
    this.run.enemies.push({
      x,
      y,
      r: base.radius,
      hp,
      maxHp: hp,
      speed: base.speed * speedScale,
      type,
      shootCd: (0.8 + Math.random() * 1.5) * fireScale * protocol.fireInterval,
      phase: Math.random() * 6,
      armor,
      flash: 0,
      frozen: 0,
      escaped: false
    });
  }

  spawnFlankTurret() {
    const run = this.run;
    const maximum = this.counterProtocolActive() || run.bossKills >= 4 ? 2 : 1;
    if (run.enemies.filter((enemy) => enemy.flanker && enemy.hp > 0).length >= maximum) return false;
    const leftOccupied = run.enemies.some((enemy) => enemy.flanker && enemy.x < WIDTH / 2 && enemy.hp > 0);
    const rightOccupied = run.enemies.some((enemy) => enemy.flanker && enemy.x > WIDTH / 2 && enemy.hp > 0);
    const left = rightOccupied || (!leftOccupied && Math.random() < 0.5);
    this.spawnEnemy("turret", left ? 55 : WIDTH - 55, 128);
    const turret = run.enemies.at(-1);
    turret.flanker = true;
    turret.speed = 0;
    turret.shootCd = 0.55;
    return true;
  }

  spawnArmorBreaker() {
    const run = this.run;
    if (run.enemies.some((enemy) => enemy.armorBreaker && enemy.hp > 0)) return false;
    this.spawnEnemy("sniper", 70 + Math.random() * (WIDTH - 140), 112);
    const sniper = run.enemies.at(-1);
    sniper.armorBreaker = true;
    sniper.shootCd = 0.72;
    run.texts.push({ x: sniper.x, y: sniper.y + 38, text: "爆甲狙擊", color: "#dd73ff", life: 0.9 });
    return true;
  }

  spawnWave() {
    const stage = zoneForRun(this.run).id;
    const roll = Math.random();
    if (stage === "harbor") {
      if (roll < 0.28) for (let index = 0; index < 4; index += 1) this.spawnEnemy("trooper", 70 + index * 83, -35 - index * 14);
      else if (roll < 0.52) for (let index = 0; index < 3; index += 1) this.spawnEnemy("rusher", 90 + index * 105, -40 - index * 24);
      else if (roll < 0.75) {
        this.spawnEnemy("shield", 135);
        this.spawnEnemy("shield", 255);
      } else {
        this.spawnEnemy("turret", WIDTH / 2);
        this.spawnEnemy("trooper", 80);
        this.spawnEnemy("trooper", WIDTH - 80);
      }
    } else if (stage === "canyon") {
      if (Math.random() < 0.17) this.spawnEnemy("sniper");
      if (roll < 0.3) {
        this.spawnEnemy("tank", WIDTH / 2);
        this.spawnEnemy("trooper", 75);
        this.spawnEnemy("trooper", WIDTH - 75);
      } else if (roll < 0.58) {
        this.spawnEnemy("turret", 105);
        this.spawnEnemy("turret", WIDTH - 105);
      } else if (roll < 0.78) {
        for (let index = 0; index < 5; index += 1) this.spawnEnemy(index % 2 ? "rusher" : "trooper", 48 + index * 73, -35 - index * 18);
      } else {
        this.spawnEnemy("gunship", WIDTH / 2);
        this.spawnEnemy("shield", 95);
        this.spawnEnemy("shield", WIDTH - 95);
      }
    } else if (stage === "capital") {
      if (Math.random() < 0.17) this.spawnEnemy("sniper");
      if (roll < 0.28) {
        this.spawnEnemy("gunship", 115);
        this.spawnEnemy("gunship", WIDTH - 115);
      } else if (roll < 0.52) {
        this.spawnEnemy("elite", WIDTH / 2);
        this.spawnEnemy("rusher", 65);
        this.spawnEnemy("rusher", WIDTH - 65);
      } else if (roll < 0.76) {
        this.spawnEnemy("tank", 112);
        this.spawnEnemy("tank", WIDTH - 112);
      } else {
        for (let index = 0; index < 6; index += 1) this.spawnEnemy(index < 3 ? "shield" : "trooper", 42 + index * 61, -30 - (index % 3) * 20);
      }
    } else if (stage === "foundry") {
      if (roll < 0.25) {
        this.spawnEnemy("tank", WIDTH / 2);
        this.spawnEnemy("turret", 78);
        this.spawnEnemy("turret", WIDTH - 78);
      } else if (roll < 0.5) {
        this.spawnEnemy("elite", WIDTH / 2);
        this.spawnEnemy("shield", 104);
        this.spawnEnemy("shield", WIDTH - 104);
      } else if (roll < 0.75) {
        for (let index = 0; index < 5; index += 1) this.spawnEnemy(index % 2 ? "rusher" : "tank", 46 + index * 74, -45 - index * 16);
      } else {
        this.spawnEnemy("turret", 72);
        this.spawnEnemy("turret", WIDTH / 2);
        this.spawnEnemy("turret", WIDTH - 72);
      }
    } else if (stage === "snowfield") {
      if (Math.random() < 0.27) this.spawnEnemy("sniper");
      if (roll < 0.28) {
        for (let index = 0; index < 4; index += 1) this.spawnEnemy("shield", 62 + index * 88, -35 - index * 16);
      } else if (roll < 0.55) {
        this.spawnEnemy("elite", 126);
        this.spawnEnemy("elite", WIDTH - 126);
      } else if (roll < 0.78) {
        this.spawnEnemy("tank", WIDTH / 2);
        this.spawnEnemy("sniper", 74);
        this.spawnEnemy("sniper", WIDTH - 74);
      } else {
        for (let index = 0; index < 6; index += 1) this.spawnEnemy(index < 2 ? "rusher" : "shield", 42 + index * 61, -35 - (index % 2) * 24);
      }
    } else {
      if (roll < 0.3) {
        this.spawnEnemy("gunship", 90);
        this.spawnEnemy("gunship", WIDTH / 2);
        this.spawnEnemy("gunship", WIDTH - 90);
      } else if (roll < 0.56) {
        this.spawnEnemy("elite", WIDTH / 2);
        this.spawnEnemy("gunship", 92);
        this.spawnEnemy("gunship", WIDTH - 92);
      } else if (roll < 0.78) {
        for (let index = 0; index < 5; index += 1) this.spawnEnemy(index % 2 ? "gunship" : "rusher", 48 + index * 73, -42 - index * 20);
      } else {
        this.spawnEnemy("sniper", WIDTH / 2);
        this.spawnEnemy("elite", 100);
        this.spawnEnemy("elite", WIDTH - 100);
      }
    }

    const tier = this.run.bossKills;
    if (tier > 0 && Math.random() < Math.min(0.65, 0.2 + tier * 0.07)) {
      this.spawnEnemy(tier >= 3 && Math.random() < 0.35 ? "shield" : "rusher");
    }
    if (tier >= 2 && Math.random() < Math.min(0.26, 0.06 + tier * 0.025)) {
      this.spawnEnemy("elite", WIDTH / 2, -85);
    }
    const counterProtocol = this.counterProtocolActive();
    if ((tier >= 1 || counterProtocol) && Math.random() < (counterProtocol ? 0.3 : 0.18)) {
      this.spawnFlankTurret();
    }
    if ((tier >= 2 || counterProtocol) && Math.random() < (counterProtocol ? 0.22 : 0.14)) {
      this.spawnArmorBreaker();
    }
  }

  spawnEvent() {
    const roll = Math.random();
    const supplyRate = protocolForRun(this.run).supplyRate;
    const eliteThreshold = 0.34;
    const supplyThreshold = eliteThreshold + 0.33 * supplyRate;
    if (roll < eliteThreshold) {
      this.spawnEnemy("elite", WIDTH / 2, -75);
      this.alert("王牌攔截隊", "#ff6278", "擊破可回收高額軍備");
    } else if (roll < supplyThreshold) {
      this.run.drops.push(
        { x: 130, y: -20, kind: "reinforce", value: 1, life: 10 },
        { x: 260, y: -42, kind: "air", value: 12, life: 10 }
      );
      this.alert("戰術空投", "#69f4c5", "士兵 +1・技能充能 +12");
    } else {
      this.spawnEnemy("tank", 115, -70);
      this.spawnEnemy("tank", WIDTH - 115, -105);
      this.alert("裝甲縱隊", "#ffc15e", "雙重坦克突破");
    }
  }

  gateChoice(kind, value, label, sub, color, effect, extra = {}) {
    return { kind, value, label, sub, color, effect, ...extra };
  }

  selectUpgradeChoices() {
    const run = this.run;
    const cap = armorCap(this.profile.research);
    const currentArmor = effectiveArmor(run);
    const armorRatio = cap > 0 ? currentArmor / cap : 0;
    const squadRatio = run.squad / MAX_SQUAD;
    const requestedFirepower = Math.random() < 0.25 ? 2 : 1;
    const firepowerAmount = Math.min(requestedFirepower, WEAPON_MAX_LEVEL - run.weapon.level);
    const armorAmount = armorRatio <= 0.25 ? 2 : 1;
    const squadAmount = squadRatio <= 0.25 ? 3 : 2;
    const candidates = [];

    if (firepowerAmount > 0) {
      candidates.push({
        weight: 4,
        choice: this.gateChoice(
          "firepower",
          firepowerAmount,
          `LV +${firepowerAmount}`,
          firepowerAmount === 1 ? "武器火力" : "極限升級",
          "#ff7c62",
          `最高升至 LV.${WEAPON_MAX_LEVEL}`
        )
      });
    }
    if (currentArmor < cap || (run.maxDeploymentActive && run.armor < cap)) {
      candidates.push({
        weight: armorRatio <= 0.25 ? 2.4 : armorRatio <= 0.5 ? 1.4 : armorRatio <= 0.8 ? 0.65 : 0.25,
        choice: this.gateChoice("armor", armorAmount, `+${armorAmount}`, "裝甲修復", "#ffd166", "僅危急裝甲可修復2點")
      });
    }
    candidates.push({
      weight: run.squad >= MAX_SQUAD ? 0.15 : squadRatio <= 0.25 ? 2.2 : squadRatio <= 0.5 ? 1.4 : squadRatio <= 0.75 ? 0.8 : 0.3,
      choice: this.gateChoice("squad", squadAmount, `+${squadAmount}`, squadAmount === 3 ? "危急增援" : "小隊增援", "#59f0bd", "常態僅補充2名士兵")
    });
    candidates.push({
      weight: run.airstrike < 100 ? 2 : 0.4,
      choice: this.gateChoice("air", 25, "+25", "技能充能", "#7dc8ff", "指揮官技能能量立即提高")
    });

    const selected = [];
    let available = [...candidates];
    const guaranteedFirepower = run.weapon.level < WEAPON_MAX_LEVEL && run.firepowerGateMisses >= 3;
    if (guaranteedFirepower) {
      const firepower = available.find((candidate) => candidate.choice.kind === "firepower");
      if (firepower) {
        selected.push(firepower.choice);
        available = available.filter((candidate) => candidate !== firepower);
      }
    }
    while (selected.length < 2 && available.length) {
      const candidate = weightedItem(available);
      selected.push(candidate.choice);
      available = available.filter((item) => item !== candidate);
    }

    if (run.weapon.level >= WEAPON_MAX_LEVEL) run.firepowerGateMisses = 0;
    else if (selected.some((choice) => choice.kind === "firepower")) run.firepowerGateMisses = 0;
    else run.firepowerGateMisses += 1;
    if (Math.random() < 0.5) selected.reverse();
    return selected;
  }

  spawnGatePair() {
    const run = this.run;
    const pair = ++run.gateSeq;
    const luck = this.profile.research.luck || 0;
    const roll = Math.random();
    let choices;

    if (roll < 0.18 + luck * 0.005) {
      const amount = run.squad <= 9 ? 3 : 2;
      choices = [
        this.gateChoice("squad", amount, `+${amount}`, "增援士兵", "#59f0bd", `兵力立即增加 ${amount}`),
        this.gateChoice("multiply", 1.2, "×1.2", "小隊整編", "#64e8ff", "依現有兵力增加，最多3名", { cap: 3 })
      ];
    } else if (roll < 0.55) {
      const available = Object.keys(WEAPONS).filter((id) => id !== run.weapon.id);
      const first = randomItem(available);
      const second = randomItem(available.filter((id) => id !== first));
      choices = [first, second].map((id) => this.gateChoice(
        "weapon",
        1,
        WEAPONS[id].icon,
        WEAPONS[id].name,
        WEAPONS[id].color,
        WEAPONS[id].desc,
        { weapon: id }
      ));
    } else choices = this.selectUpgradeChoices();

    choices.forEach((choice, index) => {
      run.gates.push({
        ...choice,
        pair,
        x: index === 0 ? 8 : WIDTH / 2 + 4,
        y: -82,
        w: WIDTH / 2 - 12,
        h: 74,
        used: false
      });
    });
  }

  updateGates(dt) {
    const run = this.run;
    for (const gate of run.gates) {
      gate.y += 86 * dt;
      const reachedDecisionLine = gate.y + gate.h >= FORMATION_Y - 58;
      if (reachedDecisionLine && !run.cycleGateSeen[gate.pair]) {
        run.cycleGateSeen[gate.pair] = true;
        run.cycleGatePairsEligible += 1;
      }
      if (!gate.used && reachedDecisionLine && gate.y < FORMATION_Y - 4 && run.x >= gate.x && run.x <= gate.x + gate.w) {
        this.applyGate(gate);
      }
    }
  }

  applyGate(gate) {
    const run = this.run;
    if (!run.cycleGateSeen[gate.pair]) {
      run.cycleGateSeen[gate.pair] = true;
      run.cycleGatePairsEligible += 1;
    }
    if (!run.cycleGateChosen[gate.pair]) {
      run.cycleGateChosen[gate.pair] = true;
      run.cycleGatePairsChosen += 1;
    }
    for (const item of run.gates) if (item.pair === gate.pair) item.used = true;
    if (gate.kind === "squad") run.squad += gate.value;
    else if (gate.kind === "multiply") {
      const target = Math.max(run.squad + 1, Math.round(run.squad * gate.value));
      run.squad += Math.min(gate.cap || 3, target - run.squad);
      this.queueAchievement("gate");
    } else if (gate.kind === "weapon") {
      run.weapon.id = gate.weapon;
      if (!run.cycleWeapons.includes(gate.weapon)) run.cycleWeapons.push(gate.weapon);
    } else if (gate.kind === "firepower") {
      const previousLevel = run.weapon.level;
      run.weapon.level = Math.min(WEAPON_MAX_LEVEL, run.weapon.level + gate.value);
      if (previousLevel < WEAPON_MAX_LEVEL && run.weapon.level === WEAPON_MAX_LEVEL) {
        this.alert("敵軍反制協議", "#ff5c91", `偵測到武器MAX・爆甲狙擊、側翼砲塔與戰區砲擊啟用`);
        run.artilleryClock = Math.min(run.artilleryClock, 7);
        this.audio?.effect("ultimate");
      }
    } else if (gate.kind === "armor") addArmor(run, gate.value, this.profile);
    else if (gate.kind === "air") run.airstrike = Math.min(100, run.airstrike + gate.value);

    run.squad = Math.min(MAX_SQUAD, run.squad);
    run.maxSquad = Math.max(run.maxSquad, run.squad);
    if (run.mission === "formation") run.missionProgress = Math.min(run.missionTarget, run.maxSquad);
    this.checkMission();
    if (run.maxSquad >= 30) this.queueAchievement("formation");
    run.texts.push({
      x: run.x,
      y: FORMATION_Y - 70,
      text: `${gate.sub} ${gate.label}`,
      color: gate.color,
      life: 1.15,
      big: true
    });
    this.particles(run.x, FORMATION_Y - 30, gate.color, 34, 230);
    run.shake = 8;
    this.audio?.effect("gate");
  }

  updateDrops(dt) {
    const run = this.run;
    for (const drop of run.drops) {
      drop.y += 58 * dt;
      drop.life -= dt;
      if (drop.y > FORMATION_Y - 40 && drop.y < FORMATION_Y + 70 && Math.abs(drop.x - run.x) < 78) {
        drop.life = 0;
        if (drop.kind === "reinforce") {
          run.squad = Math.min(MAX_SQUAD, run.squad + drop.value);
          run.maxSquad = Math.max(run.maxSquad, run.squad);
          run.texts.push({ x: run.x, y: FORMATION_Y - 42, text: `士兵 +${drop.value}`, color: "#69ffc8", life: 0.75 });
        } else {
          run.airstrike = Math.min(100, run.airstrike + drop.value);
          run.texts.push({ x: run.x, y: FORMATION_Y - 42, text: `空襲 +${drop.value}`, color: "#ffdb70", life: 0.75 });
        }
        this.particles(drop.x, drop.y, drop.kind === "reinforce" ? "#6affc5" : "#ffd56a", 18, 150);
        this.audio?.effect("drop");
      }
    }
  }

  firePlayerWeapon() {
    const run = this.run;
    if (!run.enemies.some(isTargetableEnemy)) return;
    const weapon = WEAPONS[run.weapon.id];
    const shooterCount = Math.min(run.squad, weapon.shooters);
    const offsets = formationOffsets(shooterCount, shooterCount);
    const damage = effectiveBulletDamage(run, this.profile);
    const isMax = effectiveWeaponLevel(run) >= WEAPON_MAX_LEVEL;
    const volley = { weapon: run.weapon.id, kills: 0 };

    for (let index = 0; index < offsets.length; index += 1) {
      const offset = offsets[index];
      const x = run.x + offset.x;
      const y = FORMATION_Y + offset.y - 12;
      if (run.weapon.id === "shotgun") {
        const pellets = isMax ? 3 : 2;
        for (let pellet = 0; pellet < pellets; pellet += 1) {
          const centered = pellet - (pellets - 1) / 2;
          this.pushPlayerBullet(x, y, centered * (44 + (index % 3) * 4), -weapon.speed, damage, {
            radius: 2.8,
            life: weapon.life,
            color: weapon.color,
            volley
          });
        }
      } else {
        const spread = run.weapon.id === "minigun" ? (Math.random() - 0.5) * (isMax ? 20 : 40) : 0;
        this.pushPlayerBullet(x, y, spread, -weapon.speed, damage, {
          radius: run.weapon.id === "rocket" ? 5 : run.weapon.id === "railgun" ? (isMax ? 7 : 4) : run.weapon.id === "laser" ? (isMax ? 3.2 : 2) : 2.5,
          life: weapon.life,
          color: weapon.color,
          splash: run.weapon.id === "rocket" ? 58 * (isMax ? 1.35 : 1) : 0,
          pierce: run.weapon.id === "laser" || run.weapon.id === "railgun",
          volley
        });
        if (run.weapon.id === "rifle" && isMax) {
          this.pushPlayerBullet(x + 5, y + 3, 0, -weapon.speed, damage * 0.5, {
            radius: 2,
            life: weapon.life,
            color: "#d9fbff",
            volley
          });
        }
      }
      if (index % 3 === 0 && run.particles.length < MAX_COMBAT_PARTICLES) run.particles.push({
        x,
        y: y - 4,
        vx: (Math.random() - 0.5) * 18,
        vy: -80,
        life: 0.13,
        maxLife: 0.13,
        size: 2.5,
        color: weapon.color
      });
    }
    this.audio?.shot(run.weapon.id);
  }

  pushPlayerBullet(x, y, vx, vy, damage, options = {}) {
    const bullet = this.playerBulletPool.pop() || {};
    bullet.x = x;
    bullet.y = y;
    bullet.vx = vx;
    bullet.vy = vy;
    bullet.damage = damage;
    bullet.r = options.radius || 2.5;
    bullet.life = options.life || 1.2;
    bullet.color = options.color || "#fff";
    bullet.enemy = false;
    bullet.weapon = options.weapon || this.run.weapon.id;
    bullet.splash = options.splash || 0;
    bullet.pierce = Boolean(options.pierce);
    bullet.volley = options.volley || null;
    bullet.killCount = 0;
    bullet.masteryHitCount = 0;
    if (bullet.pierce) {
      if (bullet.hits) bullet.hits.clear();
      else bullet.hits = new Set();
    } else {
      bullet.hits = null;
    }
    this.run.bullets.push(bullet);
  }

  recyclePlayerBullet(bullet) {
    if (bullet.enemy || this.playerBulletPool.length >= 512) return;
    bullet.hits?.clear();
    bullet.volley = null;
    this.playerBulletPool.push(bullet);
  }

  clearBullets() {
    if (!this.run) return;
    for (const bullet of this.run.bullets) this.recyclePlayerBullet(bullet);
    this.run.bullets.length = 0;
  }

  updateBullets(dt) {
    for (const bullet of this.run.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.enemy) {
        const hitRadius = 24 + Math.min(54, Math.ceil(Math.sqrt(Math.max(1, this.run.squad))) * 7);
        if (circlesOverlap(bullet.x, bullet.y, bullet.r, this.run.x, FORMATION_Y + 28, hitRadius)) {
          bullet.life = 0;
          this.damagePlayer(Math.ceil(bullet.damage), bullet.armorBreak ? { armorBreak: true, armorDamage: bullet.armorDamage || 3 } : undefined);
        }
      }
    }
  }

  resolvePlayerBullets() {
    const run = this.run;
    for (const bullet of run.bullets) {
      if (bullet.enemy || bullet.life <= 0) continue;
      for (const enemy of run.enemies) {
        if (!isTargetableEnemy(enemy)
          || !circlesOverlap(bullet.x, bullet.y, bullet.r, enemy.x, enemy.y, enemy.r)) continue;
        if (bullet.pierce) {
          if (bullet.hits.has(enemy)) continue;
          bullet.hits.add(enemy);
          this.recordWeaponHit(bullet, enemy);
        }
        const critical = Math.random() < critChance(run, this.profile);
        const damage = bullet.damage * (critical ? 2.4 : 1);
        this.applyEnemyDamage(enemy, damage, critical);
        enemy.hitColor = bullet.color;
        enemy.hitWeapon = bullet.weapon;
        if (bullet.splash > 0) {
          for (const nearby of run.enemies) {
            if (nearby !== enemy && isTargetableEnemy(nearby)
              && squaredDistance(nearby, enemy) <= bullet.splash * bullet.splash) {
              this.applyEnemyDamage(nearby, damage * 0.58, false);
              nearby.hitColor = bullet.color;
              nearby.hitWeapon = "rocket";
              if (nearby.hp <= 0) {
                this.recordWeaponKill(bullet, nearby);
                this.killEnemy(nearby);
              }
            }
          }
          this.particles(enemy.x, enemy.y, bullet.color, 26, 250);
        }
        if (!bullet.pierce) bullet.life = 0;
        if (enemy.hp <= 0) {
          this.recordWeaponKill(bullet, enemy);
          this.killEnemy(enemy);
        }
        if (!bullet.pierce) break;
      }
    }
  }

  recordWeaponHit(bullet, enemy) {
    if (!bullet || bullet.weapon !== "laser" || enemy.type === "boss") return;
    bullet.masteryHitCount += 1;
    if (bullet.masteryHitCount >= WEAPON_MASTERY.laserPierces) this.queueAchievement("laser");
  }

  recordWeaponKill(bullet, enemy) {
    const run = this.run;
    if (!run || !bullet || enemy.type === "boss") return;
    const weapon = bullet.weapon;
    bullet.killCount += 1;
    if (bullet.volley) bullet.volley.kills += 1;

    if (weapon === "rifle") {
      run.weaponMastery.rifleChain += 1;
      if (run.weaponMastery.rifleChain >= WEAPON_MASTERY.rifleKills) this.queueAchievement("weapon_rifle");
    } else {
      run.weaponMastery.rifleChain = 0;
    }

    if (weapon === "shotgun" && bullet.volley?.kills >= WEAPON_MASTERY.shotgunVolleyKills) {
      this.queueAchievement("weapon_shotgun");
    } else if (weapon === "rocket" && bullet.killCount >= WEAPON_MASTERY.rocketProjectileKills) {
      this.queueAchievement("weapon_rocket");
    } else if (weapon === "minigun") {
      if (run.weaponMastery.minigunClock <= 0) {
        run.weaponMastery.minigunClock = WEAPON_MASTERY.minigunWindow;
        run.weaponMastery.minigunKills = 0;
      }
      run.weaponMastery.minigunKills += 1;
      if (run.weaponMastery.minigunKills >= WEAPON_MASTERY.minigunKills) this.queueAchievement("weapon_minigun");
    } else if (weapon === "railgun" && bullet.killCount >= WEAPON_MASTERY.railgunProjectileKills) {
      this.queueAchievement("weapon_railgun");
    }
  }

  applyEnemyDamage(enemy, rawDamage, critical) {
    let damage = rawDamage;
    if (enemy.type === "boss" && this.run.enemies.some((target) => target.bossGuard && target.hp > 0)) {
      damage *= 0.3;
      if ((enemy.guardNotice || 0) <= 0) {
        enemy.guardNotice = 0.4;
        this.run.texts.push({ x: enemy.x, y: enemy.y + 16, text: "護盾減傷 70%", color: "#8eeeff", life: 0.45 });
      }
    }
    if (enemy.armor > 0) {
      const blocked = Math.min(enemy.armor, damage);
      enemy.armor -= blocked;
      damage -= blocked;
    }
    enemy.hp -= damage;
    enemy.flash = 0.08;
    if (critical) {
      if (enemy.type === "boss" && this.run.commander === "hunter") {
        this.run.bossCriticalHits += 1;
        if (this.run.bossCriticalHits >= 8) this.queueAchievement("huntercrit8");
      }
      if (this.run.texts.length < MAX_COMBAT_TEXTS) {
        this.run.texts.push({ x: enemy.x, y: enemy.y - 14, text: "爆擊", color: "#b98cff", life: 0.4 });
      }
      this.queueAchievement("crit");
    }
  }

  updateParticles(dt) {
    const run = this.run;
    for (const particle of run.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.965;
      particle.vy *= 0.965;
      particle.life -= dt;
    }
    for (const text of run.texts) {
      text.y -= 32 * dt;
      text.life -= dt;
    }
  }

  updateEnemies(dt) {
    const run = this.run;
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.phase += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.frozen = Math.max(0, enemy.frozen - dt);

      if (enemy.type === "boss") {
        this.updateBoss(enemy, dt);
        continue;
      }

      if (enemy.bossGuard) {
        const boss = run.enemies.find((target) => target.type === "boss" && target.hp > 0);
        if (!boss) enemy.hp = 0;
        else {
          enemy.x = boss.x + enemy.guardSide * 76;
          enemy.y = boss.y + 43 + Math.sin(enemy.phase * 3) * 5;
        }
        continue;
      }

      if (enemy.frozen <= 0) enemy.shootCd -= dt;
      const stopY = enemy.type === "turret"
        ? 165
        : enemy.type === "tank"
          ? 145
          : enemy.type === "gunship"
            ? 118
            : enemy.type === "elite"
              ? 145
              : enemy.type === "sniper"
                ? 150
                : 999;

      if (enemy.y < stopY) {
        const slow = run.commander === "frost" ? 0.82 : 1;
        enemy.y += enemy.speed * dt * slow * (enemy.frozen > 0 ? 0 : 1);
      }
      if (enemy.type === "rusher") enemy.x += Math.sin(enemy.phase * 6) * 62 * dt;
      if (enemy.type === "gunship" && enemy.y >= stopY) enemy.x += Math.sin(enemy.phase * 2.3) * 75 * dt;

      if (VEHICLES.has(enemy.type) && enemy.shootCd <= 0 && enemy.y > 30 && enemy.frozen <= 0) {
        this.fireEnemyAtPlayer(enemy);
        const cooldownScale = 1 - Math.min(0.36, run.bossKills * 0.045);
        enemy.shootCd = (enemy.type === "sniper" ? 1.8 : enemy.type === "elite" ? 0.9 : 1.25 + Math.random() * 0.6)
          * cooldownScale * protocolForRun(run).fireInterval;
      }

      if (enemy.y > FORMATION_Y + 52 && !enemy.escaped) {
        enemy.escaped = true;
        enemy.hp = 0;
        this.damagePlayer(enemy.type === "tank" || enemy.type === "elite" ? 3 : 1);
      }
    }
  }

  updateBoss(boss, dt) {
    const run = this.run;
    boss.battleClock = (boss.battleClock || 0) + dt;
    if (boss.frozen > 0) return;
    boss.shootCd -= dt;
    boss.specialCd -= dt;
    boss.guardNotice = Math.max(0, (boss.guardNotice || 0) - dt);
    if (boss.y < 108) {
      const entrySpeed = 72 + Math.min(24, run.bossKills * 3);
      boss.y = Math.min(108, boss.y + entrySpeed * dt * (run.commander === "frost" ? 0.82 : 1));
    }
    else if (boss.chassis === "leviathan") {
      boss.x = WIDTH / 2 + Math.sin(boss.phase * (run.bossPhase === 3 ? 2.15 : 1.35)) * (run.bossPhase === 3 ? 136 : 112);
      boss.y = 104 + Math.sin(boss.phase * 1.8) * 9;
    } else if (boss.chassis === "moloch") {
      boss.x = WIDTH / 2 + Math.sin(boss.phase * 0.54) * (run.bossPhase === 3 ? 82 : 48);
      boss.y = 112 + Math.sin(boss.phase * 0.7) * 4;
    } else {
      boss.x = WIDTH / 2 + Math.sin(boss.phase * (run.bossPhase === 3 ? 1.6 : 0.8)) * (run.bossPhase === 3 ? 118 : 78);
    }

    const ratio = boss.hp / boss.maxHp;
    const phase = ratio < 0.34 ? 3 : ratio < 0.7 ? 2 : 1;
    if (phase !== run.bossPhase) {
      const previousPhase = run.bossPhase;
      run.bossPhase = phase;
      run.bossPhaseVisual = 0.75;
      run.shake = 17;
      const chassis = BOSS_CHASSIS[boss.chassis] || BOSS_CHASSIS.babel;
      const phaseDetail = boss.chassis === "leviathan"
        ? (phase === 3 ? "超音速獵殺" : "機翼解鎖")
        : boss.chassis === "moloch"
          ? (phase === 3 ? "爐心暴走" : "熔核外露")
          : (phase === 3 ? "核心過載" : "裝甲分離");
      this.alert(`${chassis.shortName}・戰鬥階段 ${phase}`, chassis.color, phaseDetail);
      for (let reached = previousPhase + 1; reached <= phase; reached += 1) {
        const reinforcement = Math.max(1, Math.round(2 * protocolForRun(run).supplyRate));
        run.drops.push({
          x: reached === 2 ? 120 : WIDTH - 120,
          y: -20 - (reached - previousPhase - 1) * 26,
          kind: "reinforce",
          value: reinforcement,
          life: 10
        });
      }
      if (phase >= 2 && boss.modifiers?.includes("guard") && !boss.guardSpawned) {
        this.spawnBossGuards(boss);
      }
    }

    this.updateBossGlobalStrike(boss);

    if (boss.shootCd <= 0 && boss.y >= -25) boss.shootCd = this.fireBossVolley(boss, boss.y < 96);

    const specialPatterns = (boss.modifiers || []).filter((modifier) => modifier !== "guard" && modifier !== "barrage");
    if (boss.specialCd <= 0 && boss.y >= 76) {
      if (boss.chassis === "leviathan") this.queueLeviathanCrossfire(boss);
      else if (boss.chassis === "moloch") this.queueMolochVents();
      else if (specialPatterns.length) {
        const pattern = specialPatterns[boss.specialIndex % specialPatterns.length];
        boss.specialIndex += 1;
        if (pattern === "assault") this.spawnBossAssault(boss);
        else if (pattern === "overdrive") this.fireBossOverdrive(boss);
      }
      boss.specialCd = Math.max(4.1, (7.4 - run.bossKills * 0.22) * protocolForRun(run).fireInterval);
    }
  }

  bossBullet(boss, angle, speed, {
    x = boss.x,
    y = boss.y + 30,
    damage = 1,
    radius = 5,
    color = "#ff596d"
  } = {}) {
    this.run.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      r: radius,
      life: 4,
      color,
      enemy: true,
      splash: 0
    });
  }

  fireBossVolley(boss, entering = false) {
    const run = this.run;
    const protocol = protocolForRun(run);
    const threatSpeed = (1 + Math.min(0.36, run.bossKills * 0.045)) * protocol.projectileSpeed;
    const threatCooldown = (1 - Math.min(0.34, run.bossKills * 0.038)) * protocol.fireInterval;
    const barrageBonus = !entering && boss.modifiers?.includes("barrage") ? (run.bossPhase >= 2 ? 2 : 1) : 0;

    if (boss.chassis === "leviathan") {
      const count = (entering ? 4 : run.bossPhase === 1 ? 6 : run.bossPhase === 2 ? 8 : 10) + barrageBonus;
      for (let index = 0; index < count; index += 1) {
        const wing = index % 2 ? 58 : -58;
        const originX = boss.x + wing;
        const aimed = Math.atan2(FORMATION_Y - boss.y, run.x - originX);
        const spread = (Math.floor(index / 2) - (count / 4 - 0.5)) * 0.085;
        this.bossBullet(boss, aimed + spread, (205 + run.bossPhase * 16) * threatSpeed, {
          x: originX,
          y: boss.y + 18,
          damage: run.bossPhase === 3 ? 2 : 1,
          radius: 4.5,
          color: "#72c8ff"
        });
      }
      if (!entering && run.bossPhase >= 2 && Math.random() < 0.2) {
        this.spawnEnemy("gunship", boss.x, boss.y + 25);
      }
      return (entering ? 1.05 : run.bossPhase === 3 ? 0.62 : run.bossPhase === 2 ? 0.78 : 1.02)
        * threatCooldown * (boss.modifiers?.includes("barrage") ? 0.88 : 1);
    }

    if (boss.chassis === "moloch") {
      const count = (entering ? 3 : run.bossPhase === 1 ? 4 : run.bossPhase === 2 ? 6 : 8) + barrageBonus;
      const aimed = Math.atan2(FORMATION_Y - boss.y, run.x - boss.x);
      for (let index = 0; index < count; index += 1) {
        const spread = (index - (count - 1) / 2) * 0.155;
        this.bossBullet(boss, aimed + spread, (142 + run.bossPhase * 14) * threatSpeed, {
          damage: (run.bossPhase >= 2 ? 2 : 1) + (run.bossKills >= 7 ? 1 : 0),
          radius: run.bossPhase === 3 ? 7.5 : 6.5,
          color: "#ff9a4f"
        });
      }
      return (entering ? 1.3 : run.bossPhase === 3 ? 0.92 : run.bossPhase === 2 ? 1.12 : 1.45)
        * threatCooldown * (boss.modifiers?.includes("barrage") ? 0.88 : 1);
    }

    const count = (entering ? 3 : run.bossPhase === 1 ? 5 : run.bossPhase === 2 ? 8 : 12) + barrageBonus;
    const start = Math.atan2(FORMATION_Y - boss.y, run.x - boss.x) - (count - 1) * 0.095;
    for (let index = 0; index < count; index += 1) {
      this.bossBullet(boss, start + index * 0.19, (150 + run.bossPhase * 20) * threatSpeed, {
        damage: (run.bossPhase === 3 ? 2 : 1) + (run.bossKills >= 7 ? 1 : 0),
        radius: run.bossPhase === 3 ? 6 : 5
      });
    }
    const assaultChance = boss.modifiers?.includes("assault") ? 0.42 : 0.18;
    if (!entering && run.bossPhase >= 2 && Math.random() < assaultChance) {
      this.spawnEnemy(run.bossPhase === 3 ? "elite" : "rusher", boss.x - 32, boss.y + 30);
      this.spawnEnemy("rusher", boss.x + 32, boss.y + 30);
    }
    const baseCooldown = entering ? 1.15 : run.bossPhase === 3 ? 0.72 : run.bossPhase === 2 ? 0.96 : 1.28;
    const overdrive = boss.modifiers?.includes("overdrive") && run.bossPhase === 3 ? 0.78 : 1;
    return baseCooldown * threatCooldown * overdrive * (boss.modifiers?.includes("barrage") ? 0.86 : 1);
  }

  queueLeviathanCrossfire(boss) {
    const run = this.run;
    if (!run || run.telegraphs.some((telegraph) => [
      "global-strike",
      "heat-lane",
      "frost-wall",
      "air-raid",
      LEVIATHAN_CROSSFIRE_KIND
    ].includes(telegraph.kind))) return false;

    const phaseThree = run.bossPhase === 3;
    const count = phaseThree ? 3 : 2;
    const minimumAnchor = phaseThree ? 112 : 54;
    const targetAnchor = clamp(run.x + (Math.random() - 0.5) * 36, minimumAnchor, WIDTH - minimumAnchor);
    let targets;
    if (phaseThree) {
      const spacing = 82 + Math.random() * 14;
      targets = [targetAnchor - spacing, targetAnchor, targetAnchor + spacing];
    } else {
      const direction = targetAnchor < WIDTH / 2 ? 1 : targetAnchor > WIDTH / 2 ? -1 : Math.random() < 0.5 ? -1 : 1;
      const spacing = 88 + Math.random() * 18;
      targets = [targetAnchor, targetAnchor + direction * spacing];
    }
    const wingOffsets = count === 3 ? [-68, 0, 68] : [-64, 64];
    const beams = targets.map((targetX, index) => ({
      originX: clamp(boss.x + wingOffsets[index], 18, WIDTH - 18),
      originY: boss.y + 18,
      targetX: clamp(targetX, 42, WIDTH - 42),
      targetY: FORMATION_Y + 28,
      radius: phaseThree ? 22 : 25
    }));
    const protocol = protocolForRun(run);
    const duration = Math.max(
      0.68,
      ((phaseThree ? 0.96 : 1.14) - Math.min(0.24, run.bossKills * 0.025)) * Math.max(0.82, protocol.fireInterval)
    );
    run.telegraphs.push({
      kind: LEVIATHAN_CROSSFIRE_KIND,
      beams,
      phase: run.bossPhase,
      time: duration,
      duration,
      linger: 0,
      fired: false
    });
    this.alert("利維坦・變軌獵殺", "#79c9ff", "射線已鎖定・離開藍色預警軌跡");
    return true;
  }

  queueMolochVents() {
    const run = this.run;
    if (run.telegraphs.length) return false;
    const safeLeft = Math.random() < 0.5;
    const columns = safeLeft ? [195, 318] : [72, 195];
    for (const x of columns) {
      run.telegraphs.push({ kind: "heat-lane", x, radius: 45, time: 1.45, duration: 1.45, fired: false, bossAttack: true });
    }
    this.alert("摩洛克・熔核噴發", "#ff914d", safeLeft ? "撤往左側安全區" : "撤往右側安全區");
    return true;
  }

  bossModifiers(tier) {
    const sequence = ["assault", "guard", "barrage", "overdrive"];
    if (tier <= 0) return [];
    if (tier <= 3) return [sequence[tier - 1]];
    return [...new Set([sequence[(tier - 1) % sequence.length], sequence[(tier + 1) % sequence.length]])];
  }

  bossModifierLabel(modifiers) {
    const names = {
      assault: "突擊增援",
      guard: "護盾核心",
      barrage: "高壓彈幕",
      overdrive: "核心過載"
    };
    return modifiers.map((modifier) => names[modifier]).join("＋");
  }

  spawnBossGuards(boss) {
    boss.guardSpawned = true;
    for (const side of [-1, 1]) {
      this.spawnEnemy("shield", boss.x + side * 76, boss.y + 43);
      const guard = this.run.enemies.at(-1);
      guard.bossGuard = true;
      guard.guardSide = side;
      guard.speed = 0;
    }
    this.alert("護盾核心展開", "#8eeeff", "先擊破左右護衛；Boss受到70%減傷");
  }

  spawnBossAssault(boss) {
    const type = this.run.bossPhase >= 3 ? "elite" : "gunship";
    this.spawnEnemy(type, boss.x - 82, boss.y + 28);
    this.spawnEnemy("rusher", boss.x + 64, boss.y + 35);
    this.alert("突擊增援", "#ff9b62", "敵軍混編部隊進場");
  }

  bossGlobalStrikePhases(bossOrdinal) {
    if (bossOrdinal <= 1) return [3];
    if (bossOrdinal === 2) return [2, 3];
    return [1, 2, 3];
  }

  bossGlobalStrikeWarning(bossOrdinal) {
    if (bossOrdinal <= 1) return 2.4;
    if (bossOrdinal <= 3) return 2.2;
    if (bossOrdinal <= 5) return 1.9;
    return 1.6;
  }

  updateBossGlobalStrike(boss) {
    const run = this.run;
    if (!run || !run.bossAlive || boss.hp <= 0 || boss.y < 76) return;
    const bossOrdinal = run.bossKills + 1;
    boss.globalStrikePhases ||= [];
    boss.globalStrikeEnrageNext ??= GLOBAL_STRIKE_ENRAGE_START;
    const phaseEligible = this.bossGlobalStrikePhases(bossOrdinal).includes(run.bossPhase)
      && !boss.globalStrikePhases.includes(run.bossPhase);
    if (phaseEligible && this.queueBossGlobalStrike(boss)) {
      boss.globalStrikePhases.push(run.bossPhase);
      return;
    }
    if (bossOrdinal >= 6 && boss.battleClock >= boss.globalStrikeEnrageNext
      && this.queueBossGlobalStrike(boss, { enrage: true })) {
      boss.globalStrikeEnrageNext = boss.battleClock + GLOBAL_STRIKE_ENRAGE_INTERVAL;
    }
  }

  queueBossGlobalStrike(boss, { enrage = false } = {}) {
    const run = this.run;
    if (!run || !run.bossAlive || !boss || boss.hp <= 0) return false;
    const sinceLastStrike = boss.battleClock - (boss.globalStrikeLastAt ?? -Infinity);
    if (sinceLastStrike < GLOBAL_STRIKE_MIN_INTERVAL) return false;
    if (run.telegraphs.some((telegraph) =>
      GLOBAL_STRIKE_BLOCKERS.includes(telegraph.kind))) return false;
    const duration = this.bossGlobalStrikeWarning(run.bossKills + 1);
    run.telegraphs.push({
      kind: "global-strike",
      time: duration,
      duration,
      enrage,
      fired: false
    });
    boss.globalStrikeLastAt = boss.battleClock;
    this.alert(enrage ? "狂暴・全域殲滅" : "全域殲滅充能", "#ff3d5d", "技能可中斷・命中損失30%當前兵力");
    this.audio?.effect("global-charge", { duration, enrage });
    return true;
  }

  fireBossOverdrive(boss) {
    const run = this.run;
    const count = 15;
    const speed = 205 * (1 + Math.min(0.3, run.bossKills * 0.035)) * protocolForRun(run).projectileSpeed;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * (0.18 + index * (0.64 / (count - 1)));
      run.bullets.push({
        x: boss.x,
        y: boss.y + 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: run.bossKills >= 7 ? 2 : 1,
        r: 5.5,
        life: 4,
        color: "#ffb45f",
        enemy: true,
        splash: 0
      });
    }
    run.shake = 14;
    this.alert("核心過載", "#ffb45f", "廣域放射攻擊");
  }

  updateTelegraphs(dt) {
    const run = this.run;
    for (const telegraph of run.telegraphs) {
      if (telegraph.fired) {
        if (telegraph.kind === LEVIATHAN_CROSSFIRE_KIND) telegraph.linger = Math.max(0, telegraph.linger - dt);
        continue;
      }
      telegraph.time -= dt;
      if (telegraph.time > 0) continue;
      telegraph.fired = true;
      if (telegraph.kind === "global-strike") {
        this.particles(WIDTH / 2, FORMATION_Y, "#ff3858", 110, 430);
        run.shake = Math.max(run.shake, 25);
        this.audio?.effect("global-impact");
        this.damagePlayer(0, {
          directSquadFraction: GLOBAL_STRIKE_DAMAGE_FRACTION,
          undodgeable: true,
          ignoreHitInvuln: true,
          hitLabel: "全域殲滅"
        });
      } else if (telegraph.kind === "artillery") {
        this.particles(telegraph.x, FORMATION_Y + 18, "#ff506d", 48, 330);
        run.shake = Math.max(run.shake, 16);
        if (Math.abs(run.x - telegraph.x) <= telegraph.radius) {
          this.damagePlayer(0, {
            directSquadFraction: 0.5,
            undodgeable: true,
            ignoreHitInvuln: true,
            hitLabel: "砲擊直擊"
          });
        }
      } else if (telegraph.kind === "heat-lane") {
        this.particles(telegraph.x, FORMATION_Y + 18, "#ff7b47", 58, 360);
        run.shake = Math.max(run.shake, 15);
        if (Math.abs(run.x - telegraph.x) <= telegraph.radius) {
          this.damagePlayer(3, { undodgeable: true, ignoreHitInvuln: true, hitLabel: "熱區灼傷" });
        }
      } else if (telegraph.kind === "frost-wall") {
        this.particles(run.x, FORMATION_Y, "#b9f4ff", 62, 300);
        run.shake = Math.max(run.shake, 13);
        if (Math.abs(run.x - telegraph.safeX) > telegraph.safeRadius) {
          this.damagePlayer(0, {
            directSquadFraction: 0.25,
            undodgeable: true,
            ignoreHitInvuln: true,
            hitLabel: "極寒脈衝"
          });
        }
      } else if (telegraph.kind === "air-raid") {
        this.particles(telegraph.x, FORMATION_Y + 12, "#91bdff", 48, 390);
        run.shake = Math.max(run.shake, 17);
        if (Math.abs(run.x - telegraph.x) <= telegraph.radius) {
          this.damagePlayer(2, {
            armorBreak: true,
            armorDamage: 4,
            undodgeable: true,
            ignoreHitInvuln: true,
            hitLabel: "空襲命中"
          });
        }
      } else if (telegraph.kind === "shore-barrage") {
        this.particles(telegraph.leftX, FORMATION_Y + 18, "#6eeeff", 46, 340);
        this.particles(telegraph.rightX, FORMATION_Y + 18, "#6eeeff", 46, 340);
        run.shake = Math.max(run.shake, 15);
        const inLeft = Math.abs(run.x - telegraph.leftX) <= telegraph.radius;
        const inRight = Math.abs(run.x - telegraph.rightX) <= telegraph.radius;
        if (inLeft || inRight) {
          this.damagePlayer(3, { undodgeable: true, ignoreHitInvuln: true, hitLabel: "灘頭炮擊" });
        }
      } else if (telegraph.kind === "armor-barrage") {
        for (const lane of telegraph.lanes) this.particles(lane, FORMATION_Y + 18, "#ffc05f", 40, 320);
        run.shake = Math.max(run.shake, 16);
        if (telegraph.lanes.some((lane) => Math.abs(run.x - lane) <= telegraph.radius)) {
          this.damagePlayer(3, { undodgeable: true, ignoreHitInvuln: true, hitLabel: "裝甲彈幕" });
        }
      } else if (telegraph.kind === "air-superiority") {
        this.particles(telegraph.x, FORMATION_Y + 12, "#ff6b78", 64, 400);
        run.shake = Math.max(run.shake, 18);
        if (Math.abs(run.x - telegraph.x) <= telegraph.radius) {
          this.damagePlayer(3, {
            armorBreak: true,
            armorDamage: 6,
            undodgeable: true,
            ignoreHitInvuln: true,
            hitLabel: "空優轟炸"
          });
        }
      } else if (telegraph.kind === LEVIATHAN_CROSSFIRE_KIND) {
        for (const beam of telegraph.beams) {
          this.particles(beam.targetX, FORMATION_Y + 18, "#8ad7ff", 34, 300);
        }
        run.shake = Math.max(run.shake, telegraph.phase === 3 ? 18 : 14);
        this.audio?.effect("ultimate");
        if (telegraph.beams.some((beam) => Math.abs(run.x - beam.targetX) <= beam.radius)) {
          this.damagePlayer(telegraph.phase === 3 ? 3 : 2, {
            undodgeable: true,
            ignoreHitInvuln: true,
            hitLabel: "變軌射線"
          });
        }
        telegraph.linger = 0.22;
      }
    }
    run.telegraphs = run.telegraphs.filter((telegraph) => !telegraph.fired
      || (telegraph.kind === LEVIATHAN_CROSSFIRE_KIND && telegraph.linger > 0));
  }

  fireEnemyAtPlayer(enemy) {
    const run = this.run;
    const dx = run.x - enemy.x;
    const dy = FORMATION_Y - enemy.y;
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    const threatSpeed = 1 + Math.min(0.34, run.bossKills * 0.04);
    const speed = (enemy.type === "sniper" ? 260 : enemy.type === "elite" ? 220 : 190)
      * threatSpeed * protocolForRun(run).projectileSpeed;
    const armorBreak = Boolean(enemy.armorBreaker);
    run.bullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: dx / magnitude * speed,
      vy: dy / magnitude * speed,
      damage: armorBreak ? 1 : enemy.type === "sniper" ? 3 : enemy.type === "tank" || enemy.type === "elite" ? 2 : 1,
      armorDamage: armorBreak ? 3 : undefined,
      armorBreak,
      r: armorBreak ? 6 : enemy.type === "sniper" ? 5 : 4,
      life: 4,
      color: armorBreak ? "#dd73ff" : enemy.type === "sniper" ? "#ffb15b" : "#ff5e71",
      enemy: true,
      splash: 0
    });
  }

  damagePlayer(amount, {
    armorBreak = false,
    armorDamage = amount,
    directSquadFraction = 0,
    undodgeable = false,
    ignoreHitInvuln = false,
    hitLabel = ""
  } = {}) {
    const run = this.run;
    if (!run || run.gameOver || run.hardInvuln > 0 || (!ignoreHitInvuln && run.invuln > 0)) return;
    if (!undodgeable && Math.random() < dodgeChance(this.profile)) {
      run.invuln = 0.25;
      run.texts.push({ x: run.x, y: FORMATION_Y - 35, text: "格擋!", color: "#ffb3c8", life: 0.6 });
      return;
    }
    let remaining = directSquadFraction > 0 ? 0 : amount;
    let armorLost = 0;
    let squadLost = 0;
    if (directSquadFraction > 0) {
      squadLost = Math.min(run.squad, Math.max(1, Math.ceil(run.squad * directSquadFraction)));
      run.squad -= squadLost;
      run.texts.push({
        x: run.x,
        y: FORMATION_Y - 48,
        text: `${hitLabel || "隊員"} -${squadLost}`,
        color: "#ff506d",
        life: 1,
        big: true
      });
    } else if (effectiveArmor(run) > 0) {
      const absorbed = Math.min(effectiveArmor(run), armorBreak ? armorDamage : remaining);
      const contractLost = Math.min(run.contractArmor || 0, absorbed);
      run.contractArmor = Math.max(0, (run.contractArmor || 0) - contractLost);
      run.armor = Math.max(0, run.armor - (absorbed - contractLost));
      armorLost = absorbed;
      remaining = armorBreak ? 0 : remaining - absorbed;
      run.texts.push({ x: run.x, y: FORMATION_Y - 35, text: `裝甲 -${absorbed}`, color: "#ffd16d", life: 0.75 });
    }
    if (remaining > 0) {
      run.squad -= remaining;
      squadLost = remaining;
      run.texts.push({ x: run.x, y: FORMATION_Y - 35, text: `隊員 -${remaining}`, color: "#ff6d78", life: 0.8 });
    }
    if (armorLost > 0 || squadLost > 0) {
      run.regenClock = 3;
      if (run.bossAlive) run.bossDamageTaken += armorLost + squadLost;
    }
    run.invuln = squadLost > 0 ? SQUAD_HIT_INVULN_SECONDS : ARMOR_HIT_INVULN_SECONDS;
    run.shake = 12;
    navigator.vibrate?.(25);
    this.audio?.effect("hit");

    if (run.squad <= 0) {
      if (run.commander === "phoenix" && !run.revived) {
        run.revived = true;
        run.squad = 8;
        addArmor(run, 3, this.profile);
        run.invuln = 1.6;
        run.hardInvuln = 1.6;
        run.texts.push({ x: run.x, y: FORMATION_Y - 70, text: "鳳凰重生", color: "#ff7a59", life: 1.2, big: true });
        this.queueAchievement("revive");
        this.audio?.effect("revive");
      } else this.finishRun(false);
    }
  }

  checkMission() {
    const run = this.run;
    if (run.missionDone || run.missionProgress < run.missionTarget) return;
    run.missionDone = true;
    run.segmentCredits += 12;
    this.alert("戰術任務完成", "#83ffc5", "額外軍備 +12");
  }

  killEnemy(enemy, source = "weapon") {
    const run = this.run;
    if (enemy.counted) return;
    enemy.counted = true;
    enemy.hp = 0;
    const multiplier = Math.max(1, Math.floor(1 + run.combo / 14));
    const points = ENEMY_STATS[enemy.type].score * multiplier;
    const scoredPoints = Math.round(points * protocolForRun(run).scoreMultiplier);
    run.score += scoredPoints;
    run.segmentScore += points;
    run.kills += 1;
    run.combo += 1;
    run.comboClock = 2.6;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    this.addSegmentDaily("kills", 1);
    this.addSegmentDaily("score", points);
    this.addSegmentDaily("combo", run.combo, "max");
    if (VEHICLES.has(enemy.type)) this.addSegmentDaily("vehicles", 1);
    if (source !== "weapon" && enemy.type !== "boss") run.weaponMastery.rifleChain = 0;

    if (run.commander === "reaper" && enemy.type !== "boss" && Math.random() < 0.05) {
      const previousSquad = run.squad;
      run.squad = Math.min(MAX_SQUAD, run.squad + 1);
      const gained = run.squad - previousSquad;
      if (gained > 0) {
        run.maxSquad = Math.max(run.maxSquad, run.squad);
        run.commanderCounters.reaperRecruits += gained;
        run.texts.push({ x: enemy.x, y: enemy.y, text: `死神徵兵 ${Math.min(8, run.commanderCounters.reaperRecruits)}/8`, color: "#ff4d6d", life: 0.7 });
        if (run.commanderCounters.reaperRecruits >= 8) this.queueAchievement("reaper8");
      }
    }
    if (run.commander === "raider" && enemy.type !== "boss"
      && run.commanderChallenge.type === "raider" && run.commanderChallenge.clock > 0) {
      run.commanderChallenge.kills += 1;
      if (run.commanderChallenge.kills >= 20) this.queueAchievement("raider20");
    }
    if (enemy.type === "sniper") this.queueAchievement("sniperkill");
    this.checkScoreAchievements();
    for (const achievement of BATTLE_ACHIEVEMENTS) {
      if (achievement.comboTarget && run.combo >= achievement.comboTarget) this.queueAchievement(achievement.id);
    }

    if (source === "weapon") {
      const charge = enemy.type === "boss" ? 0 : enemy.type === "elite" ? 12 : enemy.type === "tank" || enemy.type === "gunship" ? 6 : 2;
      run.airstrike = Math.min(100, run.airstrike + charge * airGainMultiplier(this.profile));
    }
    if (run.mission === "combo") run.missionProgress = Math.min(run.missionTarget, run.combo);
    if (run.mission === "armor" && VEHICLES.has(enemy.type)) run.missionProgress += 1;
    this.checkMission();

    if (source === "weapon" && enemy.type !== "boss" && run.fury <= 0 && run.furyLock <= 0) {
      run.furyChain += 1;
      run.furyChainClock = 2.6;
    }
    if (run.furyChain >= FURY_COMBO_TARGET && run.fury <= 0 && run.furyLock <= 0) {
      run.fury = run.commander === "nova" ? 7 : 5.5;
      run.furyChain = 0;
      run.furyChainClock = 0;
      run.furyLock = run.fury + FURY_COOLDOWN_SECONDS;
      this.alert("火力狂熱", "#ffda67", `自然連破${FURY_COMBO_TARGET}・全隊齊射`);
      this.queueAchievement("fury");
    }

    const color = enemy.type === "boss" ? "#ff5a6f" : enemy.type === "tank" || enemy.type === "turret" ? "#ffae55" : "#ff765f";
    this.particles(enemy.x, enemy.y, color, enemy.type === "boss" ? 110 : enemy.type === "elite" || enemy.type === "tank" ? 34 : 15, enemy.type === "boss" ? 420 : 190);
    run.shake = enemy.type === "boss" ? 24 : Math.min(9, run.shake + 2);

    if (source === "weapon" && enemy.type !== "boss") {
      const dropRoll = Math.random();
      const supplyRate = protocolForRun(run).supplyRate;
      if (run.reinforceDropCooldown <= 0 && dropRoll < 0.03 * supplyRate) {
        run.drops.push({ x: enemy.x, y: enemy.y, kind: "reinforce", value: run.bossAlive ? 2 : 1, life: 8 });
        run.reinforceDropCooldown = 12;
      } else if (run.energyDropCooldown <= 0 && dropRoll < 0.08 * supplyRate) {
        run.drops.push({ x: enemy.x, y: enemy.y, kind: "air", value: 10, life: 8 });
        run.energyDropCooldown = 8;
      }
    }
    if (enemy.type === "elite") run.segmentCredits += 10;
    if (enemy.type === "boss") this.handleBossDefeat();
    else this.audio?.effect("kill");
  }

  spawnBoss() {
    const run = this.run;
    run.telegraphs.length = 0;
    this.spawnEnemy("boss", WIDTH / 2, -110);
    const boss = run.enemies.at(-1);
    const chassis = bossChassisForOrdinal(run.bossKills + 1);
    boss.chassis = chassis.id;
    run.bossChassis = chassis.id;
    const chassisHealth = chassis.id === "leviathan" ? 0.94 : chassis.id === "moloch" ? 1.16 : 1;
    boss.maxHp *= chassisHealth;
    boss.hp = boss.maxHp;
    boss.modifiers = this.bossModifiers(run.bossKills);
    boss.modifierLabel = this.bossModifierLabel(boss.modifiers);
    boss.shootCd = 0.65 * protocolForRun(run).fireInterval;
    boss.specialCd = 4.8 * protocolForRun(run).fireInterval;
    boss.specialIndex = 0;
    boss.guardSpawned = false;
    boss.guardNotice = 0;
    boss.battleClock = 0;
    boss.globalStrikePhases = [];
    boss.globalStrikeLastAt = -Infinity;
    boss.globalStrikeEnrageNext = GLOBAL_STRIKE_ENRAGE_START;
    run.bossSpawned = true;
    run.bossAlive = true;
    run.bossPhase = 1;
    run.bossCriticalHits = 0;
    run.bossDamageTaken = 0;
    run.shake = 18;
    this.alert(
      chassis.name,
      chassis.color,
      boss.modifierLabel ? `威脅 ${run.bossKills + 1}・${boss.modifierLabel}` : `威脅 ${run.bossKills + 1}・標準戰型`
    );
    this.audio?.effect("boss");
  }

  handleBossDefeat() {
    const run = this.run;
    const protocol = protocolForRun(run);
    const unassisted = run.cycleSupportCount === 0 && !run.cycleMaxDeploymentUsed;
    const perfectGates = !run.cycleMaxDeploymentUsed
      && run.cycleGatePairsEligible >= PERFECT_GATE_MINIMUM
      && run.cycleGatePairsChosen === run.cycleGatePairsEligible;
    const flawlessBoss = run.bossDamageTaken <= 0;
    const lowSquadBoss = run.squad <= 3;
    run.bossAlive = false;
    run.bossSpawned = false;
    run.bossChassis = null;
    run.bossKills += 1;
    // Fastest-clear record: stamped the moment the third boss (Moloch) falls,
    // but the run deliberately keeps going — this is an endless grinder, so
    // ending it here would cost the player their score. The record survives
    // even if the run later ends in defeat.
    if (run.bossKills >= 3 && !run.firstClearAchieved) {
      run.firstClearAchieved = true;
      run.firstClearElapsed = run.elapsed;
      // Clearing once graduates the account: every future run gets full zone
      // hazards from the first round instead of climbing the ramp again.
      if (!this.profile.hazardGraduated) {
        this.profile.hazardGraduated = true;
        saveProfile(this.profile);
        this.onSave(this.profile);
      }
    }
    run.scene += 1;
    run.zoneRoute = buildZoneRoute(run.bossKills, run.zoneRoute, run.routeSeed);
    if (run.bossKills === 1) run.hazardRoundPicks = pickHazardRounds(1);
    else if (run.bossKills === 2) run.hazardRoundPicks = pickHazardRounds(2);
    run.sceneTime = 0;
    run.enemies.length = 0;
    this.clearBullets();
    run.gates.length = 0;
    run.drops.length = 0;
    run.telegraphs.length = 0;
    run.stageBanner = 2.4;
    run.segmentCredits += 18 + run.bossKills * 7;
    run.score += Math.round(1200 * protocol.scoreMultiplier);
    if (unassisted) {
      run.score += Math.round(1200 * NO_SUPPORT_BOSS_SCORE_BONUS * protocol.scoreMultiplier);
      this.addSegmentStat("unsupportedBosses", 1);
    }
    run.segmentScore += 1200;
    this.addSegmentDaily("bosses", 1);
    if (this.profile.stats.lastBossCommander !== run.commander) this.addSegmentDaily("rotation", 1);
    if (run.commander === "warden" && effectiveArmor(run) >= armorCap(this.profile.research)) this.queueAchievement("wardenmax");
    if (perfectGates) this.addSegmentStat("perfectGateRounds", 1);
    if (flawlessBoss) this.queueAchievement("flawlessboss");
    if (lowSquadBoss) this.queueAchievement("lastthree");
    if (run.cycleWeapons.length >= Object.keys(WEAPONS).length) this.queueAchievement("arsenal6");
    if (run.bossKills >= 2) this.queueAchievement("sixzones");
    if (run.threatProtocol !== "standard") this.queueAchievement(`protocol_${run.threatProtocol}`);
    this.queueAchievement("boss");
    if (run.bossKills >= 3) this.queueAchievement("warmachine");
    this.checkScoreAchievements();
    run.combo = 0;
    run.comboClock = 0;
    run.fury = 0;
    run.furyChain = 0;
    run.furyChainClock = 0;
    run.furyLock = 0;
    run.commanderChallenge = { type: null, clock: 0, kills: 0 };
    run.weaponMastery = { rifleChain: 0, minigunKills: 0, minigunClock: 0 };
    run.bossCriticalHits = 0;
    this.commitSegment(true);
    run.maxDeploymentActive = false;
    run.maxDeploymentCancelable = false;
    run.contractArmor = 0;
    run.cycleMaxDeploymentUsed = false;
    run.supportUsed = { medical: false, firepower: false, charge: false };
    run.cycleSupportCount = 0;
    run.cycleGatePairsEligible = 0;
    run.cycleGatePairsChosen = 0;
    run.cycleGateSeen = {};
    run.cycleGateChosen = {};
    run.cycleWeapons = [run.weapon.id];
    run.bossDamageTaken = 0;
    run.checkpointOrdinal += 1;
    run.checkpointReady = true;
    this.profile.checkpoint = serializeRun(run);
    saveProfile(this.profile);
    this.onSave(this.profile);
    run.safeExitClock = SAFE_EXIT_SECONDS;
    navigator.vibrate?.([60, 40, 60, 40, 140]);
    this.audio?.effect("victory");
    this.onEvent("safe-exit", { seconds: SAFE_EXIT_SECONDS });
  }

  commitSegment(bossCheckpoint = false) {
    const run = this.run;
    const baseCredits = Math.floor(run.segmentScore / 850) + run.segmentCredits + (bossCheckpoint ? 35 + run.bossKills * 5 : 0);
    const payout = Math.max(0, Math.round(baseCredits * creditMultiplier(run, this.profile)));
    this.profile.credits += payout;
    this.profile.best = Math.max(this.profile.best, run.score);
    this.profile.stats.bestCombo = Math.max(this.profile.stats.bestCombo || 0, run.maxCombo || 0);
    this.profile.stats.totalKills += run.kills - (run.committedKills || 0);
    run.committedKills = run.kills;
    if (bossCheckpoint) {
      this.profile.stats.totalBosses += 1;
      this.profile.stats.commanderBossWins[run.commander] = (this.profile.stats.commanderBossWins[run.commander] || 0) + 1;
      this.profile.stats.threatBossWins[run.threatProtocol] = (this.profile.stats.threatBossWins[run.threatProtocol] || 0) + 1;
      this.profile.stats.lastBossCommander = run.commander;
      addDailyCommander(this.profile, run.commander);
    }

    for (const [id, value] of Object.entries(run.segmentStats || {})) {
      this.profile.stats[id] = (this.profile.stats[id] || 0) + value;
    }
    for (const [id, value] of Object.entries(run.segmentSkillUses || {})) {
      this.profile.stats.commanderSkillUses[id] = (this.profile.stats.commanderSkillUses[id] || 0) + value;
    }

    for (const [id, value] of Object.entries(run.segmentDaily)) {
      if (id === "combo") setDailyProgress(this.profile, id, value);
      else addDailyProgress(this.profile, id, value);
    }
    for (const id of run.segmentAchievements) unlockAchievement(this.profile, id);
    const achievementPayout = grantAchievementRewards(this.profile, run.segmentAchievements);

    run.segmentScore = 0;
    run.segmentCredits = 0;
    run.segmentDaily = {};
    run.segmentAchievements = [];
    run.segmentStats = { perfectGateRounds: 0, unsupportedBosses: 0, maxDeploymentUses: 0 };
    run.segmentSkillUses = {};
    run.resultCredits += payout + achievementPayout;
    saveProfile(this.profile);
    this.onSave(this.profile);
    return payout + achievementPayout;
  }

  continueAfterBoss() {
    const run = this.run;
    if (!run) return;
    this.lockMaxDeployment();
    const protocol = protocolForRun(run);
    run.safeExitClock = 0;
    run.spawnClock = 0.8;
    run.gateClock = 5;
    run.eventClock = 9;
    run.hazardClock = 6.5 * protocol.hazardInterval;
    run.artilleryClock = 8 + Math.random() * 2;
    run.stageBanner = 2.2;
    const zone = zoneForRun(run);
    this.alert(zone.name, zone.accent, `檢查點 ${run.checkpointOrdinal}・${zone.rule}`);
    this.onEvent("safe-exit-closed");
  }

  enterResearchCheckpoint() {
    if (!this.run || this.run.safeExitClock <= 0) return false;
    this.run.safeExitClock = 0;
    this.profile.checkpoint = serializeRun(this.run);
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.pause();
    this.onEvent("research-checkpoint", { forced: false });
    return true;
  }

  useSupport(id) {
    const run = this.run;
    const support = SUPPORTS[id];
    const cost = supportCost(id, run?.bossKills || 0);
    if (!run || !support || run.supportUsed[id] || this.profile.credits < cost || !this.playing || run.safeExitClock > 0) return false;
    this.profile.credits -= cost;
    run.supportUsed[id] = true;
    run.cycleSupportCount += 1;
    if (this.profile.checkpoint?.commander === run.commander) {
      this.profile.checkpoint.supportUsed ||= { medical: false, firepower: false, charge: false };
      this.profile.checkpoint.supportUsed[id] = true;
      this.profile.checkpoint.cycleSupportCount = run.cycleSupportCount;
    }
    if (id === "medical") {
      addArmor(run, 4, this.profile);
      run.squad = Math.min(MAX_SQUAD, run.squad + 6);
      run.maxSquad = Math.max(run.maxSquad, run.squad);
      run.invuln = Math.max(run.invuln, 1.2);
      run.hardInvuln = Math.max(run.hardInvuln, 1.2);
    } else if (id === "firepower") run.fury = Math.max(run.fury, 6);
    else run.airstrike = Math.min(100, run.airstrike + 40);
    run.texts.push({ x: run.x, y: FORMATION_Y - 70, text: support.name, color: support.color, life: 1, big: true });
    this.addSegmentDaily("supports", 1);
    saveProfile(this.profile);
    this.onSave(this.profile);
    navigator.vibrate?.(30);
    this.audio?.effect("support");
    return true;
  }

  purchaseMaxDeployment() {
    const run = this.run;
    if (!run || !allResearchMax(this.profile) || run.maxDeploymentActive || !run.checkpointReady
      || (this.playing && run.safeExitClock <= 0)) return 0;
    const cost = maxDeploymentCost(run.commander, run.bossKills);
    if (this.profile.credits < cost) return 0;
    this.profile.credits -= cost;
    run.maxDeploymentActive = true;
    run.maxDeploymentCancelable = true;
    run.cycleMaxDeploymentUsed = true;
    run.contractArmor = Math.max(0, armorCap(this.profile.research) - run.armor);
    run.segmentStats.maxDeploymentUses = (run.segmentStats.maxDeploymentUses || 0) + 1;
    this.queueAchievement("fullsortie");
    this.profile.checkpoint = serializeRun(run);
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.alert("滿級出擊已預約", "#ffd166", `下一戰區前可取消・武器LV.9／裝甲MAX・◆${cost}`);
    return cost;
  }

  cancelMaxDeployment() {
    const run = this.run;
    if (!run || !run.maxDeploymentActive || !run.maxDeploymentCancelable || !run.checkpointReady
      || (this.playing && run.safeExitClock <= 0)) return 0;
    const refund = maxDeploymentCost(run.commander, run.bossKills);
    this.profile.credits += refund;
    run.maxDeploymentActive = false;
    run.maxDeploymentCancelable = false;
    run.cycleMaxDeploymentUsed = false;
    run.contractArmor = 0;
    run.segmentStats.maxDeploymentUses = Math.max(0, (run.segmentStats.maxDeploymentUses || 0) - 1);
    run.segmentAchievements = run.segmentAchievements.filter((id) => id !== "fullsortie");
    this.profile.checkpoint = serializeRun(run);
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.alert("滿級出擊已取消", "#ff9a6b", `軍備點全額退還・◆${refund}`);
    return refund;
  }

  lockMaxDeployment() {
    const run = this.run;
    if (!run || !run.maxDeploymentActive || !run.maxDeploymentCancelable) return false;
    run.maxDeploymentCancelable = false;
    this.profile.checkpoint = serializeRun(run);
    saveProfile(this.profile);
    this.onSave(this.profile);
    return true;
  }

  useCommanderSkill() {
    const run = this.run;
    if (!run || run.airstrike < 100 || run.skillCooldown > 0 || !this.playing || run.safeExitClock > 0) return false;
    const interruptedGlobalStrike = run.telegraphs.some((telegraph) => telegraph.kind === "global-strike");
    if (interruptedGlobalStrike) run.telegraphs = run.telegraphs.filter((telegraph) => telegraph.kind !== "global-strike");
    run.airstrike = 0;
    run.skillCooldown = COMMANDER_SKILL_COOLDOWN_SECONDS;
    run.skillVisual = 0.72;
    run.shake = 24;
    run.bullets = run.bullets.filter((bullet) => !bullet.enemy);
    const commander = COMMANDERS[run.commander];
    run.segmentSkillUses[run.commander] = (run.segmentSkillUses[run.commander] || 0) + 1;
    this.queueAchievement(`skill_${run.commander}`);
    const fieldDamage = {
      nova: 1000,
      viper: 820,
      frost: 600,
      hunter: 900,
      reaper: 950,
      engineer: 650,
      warden: 500,
      raider: 650,
      phoenix: 500,
      atlas: 540
    }[run.commander] || 540;

    if (interruptedGlobalStrike) {
      run.texts.push({ x: WIDTH / 2, y: HEIGHT * 0.3, text: "全域攻擊中斷", color: commander.color, life: 1.25, big: true });
      this.audio?.effect("global-interrupt");
    }

    if (run.commander === "engineer") {
      run.commanderCounters.engineerSkills += 1;
      run.segmentCredits += 6;
      if (run.commanderCounters.engineerSkills >= 3) this.queueAchievement("logistics3");
    }
    if (run.commander === "atlas") {
      const cap = armorCap(this.profile.research);
      const previousArmor = effectiveArmor(run);
      addArmor(run, 6, this.profile);
      if (previousArmor < cap && effectiveArmor(run) >= cap) this.queueAchievement("fullarmor");
    }
    if (run.commander === "nova") run.fury = Math.max(run.fury, 5);
    if (run.commander === "raider") {
      run.fury = Math.max(run.fury, 6);
      run.commanderChallenge = { type: "raider", clock: 6, kills: 0 };
    }
    if (run.commander === "warden") {
      run.invuln = Math.max(run.invuln, 3);
      run.hardInvuln = Math.max(run.hardInvuln, 3);
    }
    if (run.commander === "phoenix") run.squad = Math.min(MAX_SQUAD, run.squad + 10);
    this.queueAchievement("airstrike");

    let novaKills = 0;
    for (const enemy of run.enemies.filter(isTargetableEnemy)) {
      const damage = enemy.type === "boss" ? commander.bossDamage : fieldDamage;
      enemy.hp -= damage;
      if (run.commander === "frost" && enemy.hp > 0) {
        enemy.frozen = Math.max(enemy.frozen, 2.8);
        if (enemy.type === "boss") this.queueAchievement("frozen");
      }
      if (enemy.hp <= 0) {
        if (run.commander === "viper" && enemy.type === "boss") this.queueAchievement("thunderboss");
        if (run.commander === "nova" && enemy.type !== "boss") {
          novaKills += 1;
          if (novaKills >= 6) this.queueAchievement("nova6");
        }
        this.killEnemy(enemy, "skill");
        if (run.safeExitClock > 0) break;
      }
    }
    run.texts.push({ x: WIDTH / 2, y: HEIGHT * 0.38, text: commander.special, color: commander.color, life: 1.4, big: true });
    this.particles(WIDTH / 2, HEIGHT * 0.4, commander.color, 130, 430);
    this.audio?.effect("airstrike");
    return true;
  }

  forceRetreat() {
    if (!this.run) return null;
    if (!this.profile.checkpoint) {
      this.run = null;
      this.playing = false;
      this.onEvent("run-abandoned", { noCheckpoint: true });
      return null;
    }
    this.run = restoreRun(this.profile.checkpoint, this.profile);
    this.playing = false;
    this.onEvent("research-checkpoint", { forced: true });
    return this.run;
  }

  finishRun(victory = false) {
    const run = this.run;
    if (!run || run.gameOver) return;
    run.gameOver = true;
    this.playing = false;
    this.commitSegment(false);
    this.profile.stats.totalRuns += 1;
    clearCheckpoint(this.profile);
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.onEvent("result", { victory, run });
  }

  abandonCheckpoint() {
    clearCheckpoint(this.profile);
    this.run = null;
    this.playing = false;
    saveProfile(this.profile);
    this.onSave(this.profile);
    this.onEvent("run-abandoned", { noCheckpoint: false });
  }

  cleanup() {
    const run = this.run;
    let write = 0;
    for (const bullet of run.bullets) {
      const minimumY = bullet.enemy ? -120 : -12;
      if (bullet.life > 0 && bullet.y > minimumY && bullet.y < HEIGHT + 120
        && bullet.x > -100 && bullet.x < WIDTH + 100) run.bullets[write++] = bullet;
      else this.recyclePlayerBullet(bullet);
    }
    run.bullets.length = write;

    write = 0;
    for (const enemy of run.enemies) if (enemy.hp > 0 && !enemy.escaped) run.enemies[write++] = enemy;
    run.enemies.length = write;
    write = 0;
    for (const gate of run.gates) if (gate.y < HEIGHT + 90) run.gates[write++] = gate;
    run.gates.length = write;
    write = 0;
    for (const drop of run.drops) if (drop.life > 0 && drop.y < HEIGHT + 70) run.drops[write++] = drop;
    run.drops.length = write;
    write = 0;
    for (const telegraph of run.telegraphs) {
      if (!telegraph.fired && telegraph.time > 0) run.telegraphs[write++] = telegraph;
    }
    run.telegraphs.length = write;
    write = 0;
    for (const particle of run.particles) if (particle.life > 0) run.particles[write++] = particle;
    run.particles.length = Math.min(write, MAX_COMBAT_PARTICLES);
    write = 0;
    for (const text of run.texts) if (text.life > 0) run.texts[write++] = text;
    if (write > MAX_COMBAT_TEXTS) {
      const offset = write - MAX_COMBAT_TEXTS;
      for (let index = 0; index < MAX_COMBAT_TEXTS; index += 1) run.texts[index] = run.texts[offset + index];
      write = MAX_COMBAT_TEXTS;
    }
    run.texts.length = write;
  }
}
