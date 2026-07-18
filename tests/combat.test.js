import test from "node:test";
import assert from "node:assert/strict";

import {
  ARMOR_HIT_INVULN_SECONDS,
  BATTLE_ACHIEVEMENTS,
  COMMANDER_SKILL_COOLDOWN_SECONDS,
  FURY_COMBO_TARGET,
  FURY_COOLDOWN_SECONDS,
  RESEARCH_ORDER,
  SQUAD_HIT_INVULN_SECONDS,
  WEAPON_MAX_LEVEL,
  armorCap,
  maxDeploymentCost,
  supportCost
} from "../src/config.js";
import { CombatEngine } from "../src/game/combat.js";
import { effectiveArmor, effectiveWeaponLevel } from "../src/game/state.js";
import { createProfile } from "../src/storage.js";

function createEngine(commander = "viper") {
  const profile = createProfile();
  profile.selected = commander;
  profile.unlocked.push(commander);
  const events = [];
  const engine = new CombatEngine(profile, {
    onEvent: (type, payload) => events.push({ type, payload })
  });
  engine.start(commander);
  return { engine, profile, events };
}

function killTrooper(engine, y = 40) {
  engine.spawnEnemy("trooper", 195, y);
  const enemy = engine.run.enemies.at(-1);
  engine.killEnemy(enemy);
  return enemy;
}

test("玩家武器固定向正前方直射，不追蹤敵人", () => {
  const { engine } = createEngine();
  engine.run.enemies.push({ x: 20, y: 80, hp: 100, r: 12 });
  engine.firePlayerWeapon();
  const bullets = engine.run.bullets.filter((bullet) => !bullet.enemy);
  assert.ok(bullets.length > 0);
  assert.ok(bullets.every((bullet) => bullet.vx === 0 && bullet.vy < 0));
});

test("高壓優化不減少六種武器的單輪彈量", () => {
  const { engine } = createEngine();
  engine.run.squad = 36;
  engine.run.weapon.level = WEAPON_MAX_LEVEL;
  engine.spawnEnemy("boss", 195, 100);
  const expected = { rifle: 36, shotgun: 33, rocket: 5, laser: 9, minigun: 22, railgun: 4 };
  for (const [weapon, count] of Object.entries(expected)) {
    engine.clearBullets();
    engine.run.weapon.id = weapon;
    engine.firePlayerWeapon();
    assert.equal(engine.run.bullets.length, count, weapon);
  }
});

test("高射速玩家子彈會回收重用，特效數量有硬上限", () => {
  const { engine } = createEngine();
  engine.run.squad = 1;
  engine.run.weapon.id = "minigun";
  engine.spawnEnemy("boss", 195, 100);
  engine.firePlayerWeapon();
  const firstBullet = engine.run.bullets[0];
  firstBullet.life = 0;
  engine.cleanup();
  assert.equal(engine.run.bullets.length, 0);
  engine.firePlayerWeapon();
  assert.equal(engine.run.bullets[0], firstBullet);

  engine.particles(195, 200, "#fff", 1000);
  assert.equal(engine.run.particles.length, 360);
});

test("指揮官技能與Boss轉階會啟動短促美術演出", () => {
  const { engine } = createEngine();
  engine.run.airstrike = 100;
  assert.equal(engine.useCommanderSkill(), true);
  assert.ok(engine.run.skillVisual > 0);
  const skillVisual = engine.run.skillVisual;
  engine.update(0.1);
  assert.ok(engine.run.skillVisual < skillVisual);

  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.y = 108;
  boss.hp = boss.maxHp * 0.5;
  engine.updateBoss(boss, 0.016);
  assert.equal(engine.run.bossPhase, 2);
  assert.ok(engine.run.bossPhaseVisual > 0);
});

test("畫面外敵軍不會被預射子彈擊殺，玩家子彈離開上緣後清除", () => {
  const { engine } = createEngine();
  engine.spawnEnemy("trooper", 195, -40);
  const enemy = engine.run.enemies.at(-1);
  const initialHp = enemy.hp;

  engine.firePlayerWeapon();
  assert.equal(engine.run.bullets.length, 0);
  engine.pushPlayerBullet(enemy.x, enemy.y, 0, 0, 9999);
  engine.resolvePlayerBullets();
  assert.equal(enemy.hp, initialHp);

  enemy.y = 0;
  engine.run.bullets[0].y = 0;
  engine.resolvePlayerBullets();
  assert.equal(enemy.hp, 0);

  engine.run.bullets = [
    { x: 10, y: -20, vx: 0, vy: -100, life: 1, enemy: false },
    { x: 20, y: -20, vx: 0, vy: 100, life: 1, enemy: true }
  ];
  engine.cleanup();
  assert.equal(engine.run.bullets.length, 1);
  assert.equal(engine.run.bullets[0].enemy, true);
});

test("自然火力狂熱需要30連破，效果期間與冷卻期間不能替下一輪充能", () => {
  const { engine } = createEngine();
  for (let index = 0; index < FURY_COMBO_TARGET; index += 1) killTrooper(engine);

  assert.ok(engine.run.fury > 0);
  assert.ok(engine.run.furyLock >= engine.run.fury + FURY_COOLDOWN_SECONDS - 0.001);
  assert.equal(engine.run.furyChain, 0);
  assert.equal(engine.run.combo, FURY_COMBO_TARGET);

  for (let index = 0; index < 8; index += 1) killTrooper(engine);
  assert.equal(engine.run.furyChain, 0);
  engine.run.fury = 0;
  killTrooper(engine);
  assert.equal(engine.run.furyChain, 0);
  engine.run.furyLock = 0;
  killTrooper(engine);
  assert.equal(engine.run.furyChain, 1);
});

test("20與50連殺成就依COMBO解鎖，不受自然狂熱重置", () => {
  const { engine } = createEngine();
  for (let index = 0; index < 50; index += 1) killTrooper(engine);
  assert.ok(engine.run.segmentAchievements.includes("combo20"));
  assert.ok(engine.run.segmentAchievements.includes("combo50"));
  assert.equal(engine.run.combo, 50);
  assert.equal(engine.run.maxCombo, 50);
});

test("六種武器以實戰專精解鎖，取得高能雷射本身不再白送成就", () => {
  const { engine } = createEngine();
  engine.applyGate({ pair: "weapon-test", kind: "weapon", weapon: "laser", sub: "高能雷射", label: "切換" });
  assert.equal(engine.run.segmentAchievements.includes("laser"), false);

  const enemy = { type: "trooper" };
  const rifle = { weapon: "rifle", killCount: 0, volley: { weapon: "rifle", kills: 0 } };
  for (let index = 0; index < 30; index += 1) engine.recordWeaponKill(rifle, enemy);

  const shotgunVolley = { weapon: "shotgun", kills: 0 };
  for (let index = 0; index < 4; index += 1) {
    engine.recordWeaponKill({ weapon: "shotgun", killCount: 0, volley: shotgunVolley }, enemy);
  }

  const rocket = { weapon: "rocket", killCount: 0, volley: { weapon: "rocket", kills: 0 } };
  for (let index = 0; index < 3; index += 1) engine.recordWeaponKill(rocket, enemy);

  const laser = { weapon: "laser", masteryHitCount: 0 };
  for (let index = 0; index < 4; index += 1) engine.recordWeaponHit(laser, enemy);

  const minigun = { weapon: "minigun", killCount: 0, volley: { weapon: "minigun", kills: 0 } };
  for (let index = 0; index < 20; index += 1) engine.recordWeaponKill(minigun, enemy);

  const railgun = { weapon: "railgun", killCount: 0, volley: { weapon: "railgun", kills: 0 } };
  for (let index = 0; index < 3; index += 1) engine.recordWeaponKill(railgun, enemy);

  for (const id of ["weapon_rifle", "weapon_shotgun", "weapon_rocket", "laser", "weapon_minigun", "weapon_railgun", "weapon_mastery"]) {
    assert.ok(engine.run.segmentAchievements.includes(id), id);
  }
});

test("爆破與貫穿專精由同一枚實際投射物正確歸因", () => {
  const rocket = createEngine().engine;
  rocket.run.weapon.id = "rocket";
  for (let index = 0; index < 4; index += 1) rocket.spawnEnemy("trooper", 195, 100);
  rocket.pushPlayerBullet(195, 100, 0, 0, 9999, { weapon: "rocket", splash: 58 });
  rocket.resolvePlayerBullets();
  assert.ok(rocket.run.segmentAchievements.includes("weapon_rocket"));

  const laser = createEngine().engine;
  laser.run.weapon.id = "laser";
  for (let index = 0; index < 4; index += 1) laser.spawnEnemy("trooper", 195, 100);
  laser.pushPlayerBullet(195, 100, 0, 0, 1, { weapon: "laser", pierce: true });
  laser.resolvePlayerBullets();
  assert.ok(laser.run.segmentAchievements.includes("laser"));

  const railgun = createEngine().engine;
  railgun.run.weapon.id = "railgun";
  for (let index = 0; index < 3; index += 1) railgun.spawnEnemy("trooper", 195, 100);
  railgun.pushPlayerBullet(195, 100, 0, 0, 9999, { weapon: "railgun", pierce: true });
  railgun.resolvePlayerBullets();
  assert.ok(railgun.run.segmentAchievements.includes("weapon_railgun"));
});

test("凌風、銲星與泰坦專屬成就依各自技能條件判定", () => {
  const viper = createEngine("viper");
  viper.engine.run.airstrike = 100;
  viper.engine.spawnBoss();
  const boss = viper.engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.y = 100;
  boss.armor = 0;
  boss.hp = 100;
  viper.engine.useCommanderSkill();
  assert.ok(viper.profile.achievements.includes("thunderboss"));

  const engineer = createEngine("engineer");
  for (let index = 0; index < 3; index += 1) {
    engineer.engine.run.airstrike = 100;
    engineer.engine.run.skillCooldown = 0;
    engineer.engine.useCommanderSkill();
  }
  assert.equal(engineer.engine.run.commanderCounters.engineerSkills, 3);
  assert.ok(engineer.engine.run.segmentAchievements.includes("logistics3"));

  const atlas = createEngine("atlas");
  atlas.engine.run.armor = armorCap(atlas.profile.research) - 6;
  atlas.engine.run.airstrike = 100;
  atlas.engine.useCommanderSkill();
  assert.equal(atlas.engine.run.armor, armorCap(atlas.profile.research));
  assert.ok(atlas.engine.run.segmentAchievements.includes("fullarmor"));
});

test("凍岩必須真正凍結仍存活的Boss才完成冰封戰場", () => {
  const { engine } = createEngine("frost");
  engine.run.airstrike = 100;
  engine.useCommanderSkill();
  assert.equal(engine.run.segmentAchievements.includes("frozen"), false);

  engine.run.airstrike = 100;
  engine.run.skillCooldown = 0;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.y = 100;
  boss.armor = 0;
  engine.useCommanderSkill();
  assert.ok(boss.frozen > 0);
  assert.ok(engine.run.segmentAchievements.includes("frozen"));
});

test("夜鴉、星火與鳳凰專屬成就記錄實際玩法成果", () => {
  const reaper = createEngine("reaper");
  reaper.engine.run.commanderCounters.reaperRecruits = 7;
  reaper.engine.run.squad = 10;
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    killTrooper(reaper.engine);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(reaper.engine.run.commanderCounters.reaperRecruits, 8);
  assert.ok(reaper.engine.run.segmentAchievements.includes("reaper8"));

  const nova = createEngine("nova");
  for (let index = 0; index < 6; index += 1) {
    nova.engine.spawnEnemy("trooper", 45 + index * 55, 80);
    nova.engine.run.enemies.at(-1).hp = 1;
  }
  nova.engine.run.airstrike = 100;
  nova.engine.useCommanderSkill();
  assert.ok(nova.engine.run.segmentAchievements.includes("nova6"));

  const phoenix = createEngine("phoenix");
  phoenix.engine.run.squad = 1;
  phoenix.engine.run.invuln = 0;
  phoenix.engine.damagePlayer(1);
  assert.equal(phoenix.engine.run.revived, true);
  assert.ok(phoenix.engine.run.segmentAchievements.includes("revive"));
});

test("疾風、鐵衛與影歌專屬成就使用獨立戰鬥計數", () => {
  const raider = createEngine("raider");
  raider.engine.run.airstrike = 100;
  raider.engine.useCommanderSkill();
  for (let index = 0; index < 20; index += 1) killTrooper(raider.engine);
  assert.equal(raider.engine.run.commanderChallenge.kills, 20);
  assert.ok(raider.engine.run.segmentAchievements.includes("raider20"));

  const warden = createEngine("warden");
  warden.engine.run.armor = armorCap(warden.profile.research);
  warden.engine.run.bossAlive = true;
  warden.engine.handleBossDefeat();
  assert.ok(warden.profile.achievements.includes("wardenmax"));

  const hunter = createEngine("hunter");
  hunter.engine.spawnEnemy("boss", 195, 100);
  const boss = hunter.engine.run.enemies.at(-1);
  boss.armor = 0;
  for (let index = 0; index < 8; index += 1) hunter.engine.applyEnemyDamage(boss, 1, true);
  assert.equal(hunter.engine.run.bossCriticalHits, 8);
  assert.ok(hunter.engine.run.segmentAchievements.includes("huntercrit8"));
});

test("十項指揮官專屬成就完成後會解鎖全機精通", () => {
  const { engine } = createEngine();
  const commanderAchievements = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commander);
  for (const achievement of commanderAchievements) engine.queueAchievement(achievement.id);
  assert.equal(commanderAchievements.length, 10);
  assert.ok(engine.run.segmentAchievements.includes("allmastery"));
});

test("武器火力門在LV.9停止，不產生隱藏LV.10", () => {
  const { engine } = createEngine();
  engine.run.weapon.level = WEAPON_MAX_LEVEL;
  engine.run.gates = [{ pair: 1 }];
  engine.applyGate({
    pair: 1,
    kind: "firepower",
    value: 2,
    sub: "武器火力",
    label: "LV +2",
    color: "#fff"
  });
  assert.equal(engine.run.weapon.level, WEAPON_MAX_LEVEL);
});

test("升級門為不重複受控隨機，連續三次沒火力後下一次保底", () => {
  const { engine } = createEngine();
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.999;
    for (let index = 0; index < 3; index += 1) {
      const choices = engine.selectUpgradeChoices();
      assert.equal(new Set(choices.map((choice) => choice.kind)).size, 2);
      assert.equal(choices.some((choice) => choice.kind === "firepower"), false);
    }
    assert.equal(engine.run.firepowerGateMisses, 3);
    const guaranteed = engine.selectUpgradeChoices();
    assert.ok(guaranteed.some((choice) => choice.kind === "firepower"));
    assert.equal(engine.run.firepowerGateMisses, 0);

    engine.run.weapon.level = WEAPON_MAX_LEVEL;
    const afterMax = engine.selectUpgradeChoices();
    assert.equal(afterMax.some((choice) => choice.kind === "firepower"), false);
  } finally {
    Math.random = originalRandom;
  }
});

test("裝甲修復只有危急狀態給2，其餘只給1", () => {
  const { engine, profile } = createEngine();
  const cap = armorCap(profile.research);
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    const armorChoice = (armor) => {
      engine.run.armor = armor;
      engine.run.weapon.level = 1;
      return engine.selectUpgradeChoices().find((choice) => choice.kind === "armor");
    };
    assert.equal(armorChoice(Math.floor(cap * 0.2)).value, 2);
    assert.equal(armorChoice(Math.floor(cap * 0.4)).value, 1);
    assert.equal(armorChoice(Math.ceil(cap * 0.85)).value, 1);
  } finally {
    Math.random = originalRandom;
  }
});

test("技能擊殺不自我回充、不累積自然狂熱或掉落，並有10秒整備", () => {
  const { engine } = createEngine("viper");
  for (let index = 0; index < 4; index += 1) {
    engine.spawnEnemy("trooper", 80 + index * 70, 80);
    engine.run.enemies.at(-1).hp = 1;
  }
  engine.run.airstrike = 100;
  engine.run.furyChain = FURY_COMBO_TARGET - 1;
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(engine.useCommanderSkill(), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(engine.run.airstrike, 0);
  assert.equal(engine.run.furyChain, FURY_COMBO_TARGET - 1);
  assert.equal(engine.run.drops.length, 0);
  assert.equal(engine.run.skillCooldown, COMMANDER_SKILL_COOLDOWN_SECONDS);

  engine.run.airstrike = 100;
  assert.equal(engine.useCommanderSkill(), false);
  engine.run.skillCooldown = 0;
  assert.equal(engine.useCommanderSkill(), true);
});

test("武器擊殺依敵軍類型提供2、6、12點技能充能，Boss不提供充能", () => {
  const { engine } = createEngine();
  engine.run.airstrike = 0;
  for (const [type, charge] of [["trooper", 2], ["tank", 6], ["gunship", 6], ["elite", 12]]) {
    engine.spawnEnemy(type, 195, 80);
    const before = engine.run.airstrike;
    engine.killEnemy(engine.run.enemies.at(-1));
    assert.equal(engine.run.airstrike, before + charge);
  }

  const bossEngine = createEngine().engine;
  bossEngine.run.airstrike = 7;
  bossEngine.spawnBoss();
  bossEngine.killEnemy(bossEngine.run.enemies.find((enemy) => enemy.type === "boss"));
  assert.equal(bossEngine.run.airstrike, 7);
});

test("武器掉落調整為士兵3%與能量5%，並各自套用冷卻；技能擊殺不掉落", () => {
  const soldier = createEngine().engine;
  soldier.spawnEnemy("trooper", 195, 80);
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    soldier.killEnemy(soldier.run.enemies.at(-1));
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(soldier.run.drops.map(({ kind, value }) => ({ kind, value })), [{ kind: "reinforce", value: 1 }]);
  assert.equal(soldier.run.reinforceDropCooldown, 12);

  const energy = createEngine().engine;
  energy.spawnEnemy("trooper", 195, 80);
  try {
    Math.random = () => 0.05;
    energy.killEnemy(energy.run.enemies.at(-1));
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(energy.run.drops.map(({ kind, value }) => ({ kind, value })), [{ kind: "air", value: 10 }]);
  assert.equal(energy.run.energyDropCooldown, 8);

  const skill = createEngine().engine;
  skill.spawnEnemy("trooper", 195, 80);
  try {
    Math.random = () => 0;
    skill.killEnemy(skill.run.enemies.at(-1), "skill");
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(skill.run.drops.length, 0);
});

test("增援門常態只給2人，危急時最多3人，比例整編最多增加3人", () => {
  const { engine } = createEngine();
  const originalRandom = Math.random;
  try {
    engine.run.squad = 20;
    Math.random = () => 0;
    engine.spawnGatePair();
  } finally {
    Math.random = originalRandom;
  }
  const squadGate = engine.run.gates.find((gate) => gate.kind === "squad");
  const multiplyGate = engine.run.gates.find((gate) => gate.kind === "multiply");
  assert.equal(squadGate.value, 2);
  assert.equal(multiplyGate.value, 1.2);
  assert.equal(multiplyGate.cap, 3);

  engine.applyGate(multiplyGate);
  assert.equal(engine.run.squad, 23);

  const critical = createEngine().engine;
  critical.run.squad = 8;
  try {
    Math.random = () => 0;
    critical.spawnGatePair();
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(critical.run.gates.find((gate) => gate.kind === "squad").value, 3);
});

test("偵察研究滿級時增援門機率仍受控，不再超過五成", () => {
  const { engine, profile } = createEngine();
  profile.research.luck = 9;
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.3;
    engine.spawnGatePair();
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(engine.run.gates.every((gate) => gate.kind === "weapon"));
});

test("戰術空投只投下一名士兵與12點充能兩箱", () => {
  const { engine } = createEngine();
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.5;
    engine.spawnEvent();
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(engine.run.drops.map(({ kind, value }) => ({ kind, value })), [
    { kind: "reinforce", value: 1 },
    { kind: "air", value: 12 }
  ]);
});

test("裝甲受擊無敵縮短為0.5秒，傷到士兵仍為0.85秒；爆甲彈不穿透裝甲", () => {
  const { engine } = createEngine();
  engine.run.armor = 5;
  engine.run.squad = 12;
  engine.run.invuln = 0;
  engine.damagePlayer(1);
  assert.equal(engine.run.armor, 4);
  assert.equal(engine.run.squad, 12);
  assert.equal(engine.run.invuln, ARMOR_HIT_INVULN_SECONDS);

  engine.run.invuln = 0;
  engine.run.armor = 0;
  engine.damagePlayer(1);
  assert.equal(engine.run.squad, 11);
  assert.equal(engine.run.invuln, SQUAD_HIT_INVULN_SECONDS);

  engine.run.invuln = 0;
  engine.run.armor = 2;
  engine.damagePlayer(1, { armorBreak: true, armorDamage: 3 });
  assert.equal(engine.run.armor, 0);
  assert.equal(engine.run.squad, 11);
  assert.equal(engine.run.invuln, ARMOR_HIT_INVULN_SECONDS);

  engine.run.invuln = 0;
  engine.damagePlayer(1, { armorBreak: true, armorDamage: 3 });
  assert.equal(engine.run.squad, 10);
  assert.equal(engine.run.invuln, SQUAD_HIT_INVULN_SECONDS);
});

test("鐵衛受到實際傷害後必須完整避傷3秒才恢復裝甲", () => {
  const { engine, profile } = createEngine("warden");
  const cap = armorCap(profile.research);
  engine.run.armor = cap - 1;
  engine.run.regenClock = 0.1;
  engine.run.invuln = 0;
  engine.damagePlayer(1);
  assert.equal(engine.run.regenClock, 3);
  assert.equal(engine.run.armor, cap - 2);
  engine.updateWarden(2.9);
  assert.equal(engine.run.armor, cap - 2);
  engine.updateWarden(0.11);
  assert.equal(engine.run.armor, cap - 1);
});

test("火力MAX立即啟用側翼、爆甲與戰區砲擊反制", () => {
  const { engine, profile } = createEngine();
  engine.run.weapon.level = WEAPON_MAX_LEVEL;
  engine.run.artilleryClock = 0;
  engine.updateCounterThreats(0.01);
  assert.equal(engine.run.telegraphs.some((telegraph) => telegraph.kind === "artillery"), true);

  assert.equal(engine.spawnFlankTurret(), true);
  assert.equal(engine.run.enemies.some((enemy) => enemy.flanker), true);
  assert.equal(engine.spawnArmorBreaker(), true);
  const breaker = engine.run.enemies.find((enemy) => enemy.armorBreaker);
  engine.fireEnemyAtPlayer(breaker);
  const bullet = engine.run.bullets.at(-1);
  assert.equal(bullet.armorBreak, true);
  assert.equal(bullet.armorDamage, 3);

  engine.run.telegraphs = [{ kind: "artillery", x: engine.run.x, radius: 46, time: 0, fired: false }];
  profile.research.dodge = 9;
  engine.run.squad = 21;
  engine.run.armor = 4;
  engine.run.invuln = 0;
  engine.run.hardInvuln = 0;
  const originalRandom = Math.random;
  try {
    Math.random = () => 1;
    engine.damagePlayer(1);
    assert.equal(engine.run.squad, 21);
    assert.equal(engine.run.armor, 3);
    assert.equal(engine.run.invuln, ARMOR_HIT_INVULN_SECONDS);
    assert.equal(engine.run.hardInvuln, 0);

    Math.random = () => 0;
    engine.updateTelegraphs(0.01);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(engine.run.squad, 10);
  assert.equal(engine.run.armor, 3);
  assert.equal(engine.run.invuln, SQUAD_HIT_INVULN_SECONDS);
  assert.ok(engine.run.texts.some((text) => text.text === "砲擊直擊 -11"));
  assert.equal(engine.run.telegraphs.length, 0);
});

test("戰區砲擊尊重有效無敵，若只剩一人則可觸發鳳凰重生", () => {
  const protectedEngine = createEngine("warden").engine;
  protectedEngine.run.squad = 20;
  protectedEngine.run.armor = 10;
  protectedEngine.run.airstrike = 100;
  assert.equal(protectedEngine.useCommanderSkill(), true);
  assert.equal(protectedEngine.run.hardInvuln, 3);
  protectedEngine.run.telegraphs = [{ kind: "artillery", x: protectedEngine.run.x, radius: 46, time: 0, fired: false }];
  protectedEngine.updateTelegraphs(0.01);
  assert.equal(protectedEngine.run.squad, 20);
  assert.equal(protectedEngine.run.armor, 10);

  const phoenix = createEngine("phoenix").engine;
  phoenix.run.squad = 1;
  phoenix.run.armor = 8;
  phoenix.run.invuln = 0;
  phoenix.run.telegraphs = [{ kind: "artillery", x: phoenix.run.x, radius: 46, time: 0, fired: false }];
  phoenix.updateTelegraphs(0.01);
  assert.equal(phoenix.run.revived, true);
  assert.equal(phoenix.run.squad, 8);
  assert.equal(phoenix.run.armor, 11);
  assert.equal(phoenix.run.hardInvuln, 1.6);
});

test("第五隻Boss開始同時擁有兩種戰型詞綴", () => {
  const { engine } = createEngine();
  engine.run.bossKills = 4;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  assert.equal(boss.modifiers.length, 2);
});

test("三種Boss機體擁有各自的彈幕語彙與專屬攻擊", () => {
  const babel = createEngine().engine;
  babel.spawnBoss();
  const babelBoss = babel.run.enemies.find((enemy) => enemy.type === "boss");
  assert.equal(babelBoss.chassis, "babel");
  babelBoss.y = 108;
  babelBoss.shootCd = 0;
  babel.updateBoss(babelBoss, 0.016);
  assert.ok(babel.run.bullets.some((bullet) => bullet.color === "#ff596d"));

  const leviathan = createEngine().engine;
  leviathan.run.bossKills = 1;
  leviathan.spawnBoss();
  const leviathanBoss = leviathan.run.enemies.find((enemy) => enemy.type === "boss");
  assert.equal(leviathanBoss.chassis, "leviathan");
  leviathanBoss.y = 108;
  leviathanBoss.shootCd = 0;
  leviathanBoss.specialCd = 0;
  leviathan.updateBoss(leviathanBoss, 0.016);
  assert.ok(leviathan.run.bullets.some((bullet) => bullet.color === "#72c8ff"));
  assert.ok(leviathan.run.telegraphs.some((telegraph) => telegraph.kind === "leviathan-crossfire"));

  const moloch = createEngine().engine;
  moloch.run.bossKills = 2;
  moloch.spawnBoss();
  const molochBoss = moloch.run.enemies.find((enemy) => enemy.type === "boss");
  assert.equal(molochBoss.chassis, "moloch");
  molochBoss.y = 108;
  molochBoss.shootCd = 0;
  moloch.updateBoss(molochBoss, 0.016);
  assert.ok(moloch.run.bullets.some((bullet) => bullet.color === "#ff9a4f"));
  moloch.run.telegraphs = [];
  assert.equal(moloch.queueMolochVents(), true);
  assert.equal(moloch.run.telegraphs.length, 2);
  assert.ok(moloch.run.telegraphs.every((telegraph) => telegraph.kind === "heat-lane" && telegraph.bossAttack));
});

test("利維坦變軌射線會依玩家位置重算並在預警後按指揮官中心判定", () => {
  const { engine } = createEngine();
  engine.run.bossKills = 1;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.x = 195;
  boss.y = 108;
  engine.run.x = 82;

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    assert.equal(engine.queueLeviathanCrossfire(boss), true);
    const first = engine.run.telegraphs[0];
    const firstTargets = first.beams.map((beam) => beam.targetX);
    assert.equal(firstTargets[0], 82);
    assert.ok(first.beams.every((beam) => beam.originX > 12 && beam.originX < 378));

    engine.run.telegraphs = [];
    engine.run.x = 308;
    assert.equal(engine.queueLeviathanCrossfire(boss), true);
    const second = engine.run.telegraphs[0];
    const secondTargets = second.beams.map((beam) => beam.targetX);
    assert.equal(secondTargets[0], 308);
    assert.notDeepEqual(secondTargets, firstTargets);

    engine.run.armor = 6;
    engine.run.invuln = 0;
    engine.run.hardInvuln = 0;
    engine.run.x = second.beams[0].targetX;
    second.time = 0;
    engine.updateTelegraphs(0.01);
    assert.equal(engine.run.armor, 4);
    assert.equal(second.fired, true);
    assert.ok(second.linger > 0);
  } finally {
    Math.random = originalRandom;
  }
});

test("高階戰區環境攻擊以指揮官中心判定並維持不同傷害規則", () => {
  const heat = createEngine().engine;
  heat.run.x = 195;
  heat.run.squad = 20;
  heat.run.armor = 6;
  heat.run.invuln = 0;
  heat.run.hardInvuln = 0;
  heat.run.telegraphs = [{ kind: "heat-lane", x: 195, radius: 54, time: 0, fired: false }];
  heat.updateTelegraphs(0.01);
  assert.equal(heat.run.armor, 3);
  assert.equal(heat.run.squad, 20);

  const frost = createEngine().engine;
  frost.run.x = 195;
  frost.run.squad = 20;
  frost.run.armor = 8;
  frost.run.invuln = 0;
  frost.run.hardInvuln = 0;
  frost.run.telegraphs = [{ kind: "frost-wall", safeX: 76, safeRadius: 57, time: 0, fired: false }];
  frost.updateTelegraphs(0.01);
  assert.equal(frost.run.squad, 15);
  assert.equal(frost.run.armor, 8);

  const safe = createEngine().engine;
  safe.run.x = 76;
  safe.run.squad = 20;
  safe.run.telegraphs = [{ kind: "frost-wall", safeX: 76, safeRadius: 57, time: 0, fired: false }];
  safe.updateTelegraphs(0.01);
  assert.equal(safe.run.squad, 20);

  const raid = createEngine().engine;
  raid.run.x = 195;
  raid.run.squad = 20;
  raid.run.armor = 8;
  raid.run.invuln = 0;
  raid.run.hardInvuln = 0;
  raid.run.telegraphs = [{ kind: "air-raid", x: 195, radius: 42, time: 0, fired: false }];
  raid.updateTelegraphs(0.01);
  assert.equal(raid.run.armor, 4);
  assert.equal(raid.run.squad, 20);
});

test("Boss血量不受小隊人數與武器等級反向加成", () => {
  const first = createEngine().engine;
  first.run.scene = 2;
  first.run.squad = 1;
  first.run.weapon.level = 1;
  first.spawnBoss();
  const firstHp = first.run.enemies.find((enemy) => enemy.type === "boss").maxHp;

  const second = createEngine().engine;
  second.run.scene = 2;
  second.run.squad = 36;
  second.run.weapon.level = WEAPON_MAX_LEVEL;
  second.spawnBoss();
  const secondHp = second.run.enemies.find((enemy) => enemy.type === "boss").maxHp;

  assert.equal(firstHp, secondHp);
});

test("Boss後必須再通過三段戰區流程，不會22秒立刻遇到下一隻Boss", () => {
  const { engine } = createEngine();
  engine.run.bossKills = 1;
  engine.run.scene = 3;
  engine.run.sceneTime = 22;
  engine.updateStageFlow();
  assert.equal(engine.run.scene, 3);
  assert.equal(engine.run.bossAlive, false);

  engine.run.sceneTime = 30;
  engine.updateStageFlow();
  assert.equal(engine.run.scene, 4);
  engine.run.sceneTime = 30;
  engine.updateStageFlow();
  assert.equal(engine.run.scene, 5);
  engine.run.sceneTime = 30;
  engine.updateStageFlow();
  assert.equal(engine.run.bossAlive, true);
});

test("後續Boss威脅會提高生命並解鎖不同戰型", () => {
  const first = createEngine().engine;
  first.run.scene = 2;
  first.spawnBoss();
  const firstBoss = first.run.enemies.find((enemy) => enemy.type === "boss");

  const later = createEngine().engine;
  later.run.scene = 17;
  later.run.bossKills = 5;
  later.spawnBoss();
  const laterBoss = later.run.enemies.find((enemy) => enemy.type === "boss");

  assert.ok(laterBoss.maxHp > firstBoss.maxHp * 2);
  assert.equal(laterBoss.modifiers.length, 2);
  assert.ok(laterBoss.modifierLabel.length > 0);
});

test("Boss機體進入畫面時即可開始射擊", () => {
  const { engine } = createEngine();
  engine.run.scene = 2;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.y = -20;
  boss.shootCd = 0;
  engine.updateBoss(boss, 0.01);
  assert.ok(engine.run.bullets.some((bullet) => bullet.enemy));
});

test("護盾核心減少Boss承受傷害，全域殲滅只按整隊結算一次", () => {
  const { engine } = createEngine();
  engine.run.scene = 8;
  engine.run.bossKills = 2;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.armor = 0;
  engine.spawnBossGuards(boss);
  const before = boss.hp;
  engine.applyEnemyDamage(boss, 100, false);
  assert.equal(boss.hp, before - 30);

  engine.run.squad = 36;
  engine.run.armor = 9;
  engine.run.invuln = ARMOR_HIT_INVULN_SECONDS;
  engine.run.hardInvuln = 0;
  boss.battleClock = 10;
  assert.equal(engine.queueBossGlobalStrike(boss), true);
  engine.run.telegraphs[0].time = 0;
  engine.updateTelegraphs(0.01);
  assert.equal(engine.run.squad, 25);
  assert.equal(engine.run.armor, 9);
  assert.ok(engine.run.texts.some((text) => text.text === "全域殲滅 -11"));
  assert.equal(engine.run.bullets.filter((bullet) => bullet.enemy).length, 0);
  assert.equal(engine.run.telegraphs.length, 0);
});

test("全域殲滅依Boss階段增加次數並逐步縮短預警", () => {
  const { engine } = createEngine();
  assert.deepEqual(engine.bossGlobalStrikePhases(1), [3]);
  assert.deepEqual(engine.bossGlobalStrikePhases(2), [2, 3]);
  assert.deepEqual(engine.bossGlobalStrikePhases(3), [1, 2, 3]);
  assert.equal(engine.bossGlobalStrikeWarning(1), 2.4);
  assert.equal(engine.bossGlobalStrikeWarning(2), 2.2);
  assert.equal(engine.bossGlobalStrikeWarning(4), 1.9);
  assert.equal(engine.bossGlobalStrikeWarning(6), 1.6);

  engine.run.scene = 2;
  engine.spawnBoss();
  const firstBoss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  firstBoss.y = 108;
  engine.updateBossGlobalStrike(firstBoss);
  assert.equal(engine.run.telegraphs.length, 0);
  engine.run.bossPhase = 3;
  engine.updateBossGlobalStrike(firstBoss);
  assert.equal(engine.run.telegraphs[0].kind, "global-strike");
  assert.equal(engine.run.telegraphs[0].duration, 2.4);
});

test("第六隻Boss在45秒後進入狂暴，全域攻擊至少間隔8秒且不與砲擊重疊", () => {
  const { engine } = createEngine();
  engine.run.bossKills = 5;
  engine.run.scene = 17;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.y = 108;
  boss.globalStrikePhases = [1, 2, 3];
  boss.battleClock = 45;
  boss.globalStrikeLastAt = 30;
  engine.updateBossGlobalStrike(boss);
  assert.equal(engine.run.telegraphs[0].kind, "global-strike");
  assert.equal(engine.run.telegraphs[0].enrage, true);
  assert.equal(boss.globalStrikeEnrageNext, 57);

  engine.run.telegraphs = [];
  boss.battleClock = 52.9;
  assert.equal(engine.queueBossGlobalStrike(boss), false);
  boss.battleClock = 53;
  engine.run.telegraphs = [{ kind: "artillery", time: 1, fired: false }];
  assert.equal(engine.queueBossGlobalStrike(boss), false);
});

test("指揮官技能可中斷全域殲滅，真正無敵則能承受命中", () => {
  const interrupt = createEngine();
  interrupt.engine.run.bossKills = 2;
  interrupt.engine.spawnBoss();
  const interruptBoss = interrupt.engine.run.enemies.find((enemy) => enemy.type === "boss");
  interruptBoss.battleClock = 10;
  assert.equal(interrupt.engine.queueBossGlobalStrike(interruptBoss), true);
  interrupt.engine.run.airstrike = 100;
  assert.equal(interrupt.engine.useCommanderSkill(), true);
  assert.equal(interrupt.engine.run.telegraphs.some((telegraph) => telegraph.kind === "global-strike"), false);
  assert.ok(interrupt.engine.run.texts.some((text) => text.text === "全域攻擊中斷"));

  const protectedRun = createEngine("warden").engine;
  protectedRun.run.bossKills = 2;
  protectedRun.spawnBoss();
  const protectedBoss = protectedRun.run.enemies.find((enemy) => enemy.type === "boss");
  protectedRun.run.squad = 36;
  protectedRun.run.armor = 9;
  protectedRun.run.hardInvuln = 1;
  protectedBoss.battleClock = 10;
  assert.equal(protectedRun.queueBossGlobalStrike(protectedBoss), true);
  protectedRun.run.telegraphs[0].time = 0;
  protectedRun.updateTelegraphs(0.01);
  assert.equal(protectedRun.run.squad, 36);
  assert.equal(protectedRun.run.armor, 9);
});

test("Frost凍結期間Boss不移動也不射擊", () => {
  const { engine } = createEngine("frost");
  engine.run.scene = 2;
  engine.spawnBoss();
  const boss = engine.run.enemies.find((enemy) => enemy.type === "boss");
  boss.x = 90;
  boss.y = 108;
  boss.shootCd = 0;
  boss.frozen = 2;
  const before = { x: boss.x, y: boss.y, shootCd: boss.shootCd, bullets: engine.run.bullets.length };
  engine.updateEnemies(0.5);
  assert.equal(boss.x, before.x);
  assert.equal(boss.y, before.y);
  assert.equal(boss.shootCd, before.shootCd);
  assert.equal(engine.run.bullets.length, before.bullets);
});

test("三種戰場支援每個Boss循環各只能使用一次，醫療會遵守裝甲上限", () => {
  const { engine, profile } = createEngine();
  profile.credits = 500;
  profile.research.armor = 2;
  engine.run.armor = armorCap(profile.research) - 1;
  engine.run.squad = 10;

  assert.equal(engine.useSupport("medical"), true);
  assert.equal(profile.credits, 420);
  assert.equal(engine.run.armor, armorCap(profile.research));
  assert.equal(engine.run.squad, 16);
  assert.equal(engine.run.hardInvuln, 1.2);
  assert.equal(engine.run.supportUsed.medical, true);
  assert.equal(engine.useSupport("medical"), false);
  assert.equal(profile.credits, 420);

  assert.equal(engine.useSupport("firepower"), true);
  assert.equal(engine.useSupport("charge"), true);
  assert.deepEqual(engine.run.supportUsed, { medical: true, firepower: true, charge: true });

  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  assert.deepEqual(engine.run.supportUsed, { medical: false, firepower: false, charge: false });
  assert.equal(engine.run.cycleSupportCount, 0);
});

test("Boss後建立檢查點，強制撤退會回復檢查點而非目前戰況", () => {
  const { engine, profile, events } = createEngine();
  engine.run.scene = 2;
  engine.run.squad = 19;
  engine.run.weapon.level = 4;
  engine.run.bossAlive = true;
  engine.handleBossDefeat();

  assert.ok(profile.checkpoint);
  assert.deepEqual(engine.run.zoneRoute, [3, 4, 5]);
  assert.deepEqual(profile.checkpoint.zoneRoute, [3, 4, 5]);
  assert.equal(engine.run.safeExitClock, 10);
  assert.equal(events.at(-1).type, "safe-exit");
  assert.equal(events.at(-1).payload.seconds, 10);

  engine.continueAfterBoss();
  const creditsBeforeSupport = profile.credits;
  assert.equal(engine.useSupport("medical"), true);
  engine.run.squad = 2;
  engine.run.weapon.level = WEAPON_MAX_LEVEL;
  const restored = engine.forceRetreat();
  assert.equal(restored.squad, 19);
  assert.equal(restored.weapon.level, 4);
  assert.equal(restored.commander, "viper");
  assert.equal(restored.supportUsed.medical, true);
  assert.equal(profile.credits, creditsBeforeSupport - supportCost("medical", 1));
  assert.equal(engine.playing, false);
});

test("放棄唯一戰線只刪除檢查點，本輪外的永久進度全部保留", () => {
  const { engine, profile, events } = createEngine();
  profile.credits = 432;
  profile.unlocked.push("atlas");
  profile.research.damage = 4;
  profile.achievements.push("combo20");
  profile.best = 9876;
  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  const permanent = {
    credits: profile.credits,
    unlocked: [...profile.unlocked],
    damage: profile.research.damage,
    achievements: [...profile.achievements],
    best: profile.best
  };

  engine.abandonCheckpoint();

  assert.equal(profile.checkpoint, null);
  assert.equal(engine.run, null);
  assert.equal(profile.credits, permanent.credits);
  assert.deepEqual(profile.unlocked, permanent.unlocked);
  assert.equal(profile.research.damage, permanent.damage);
  assert.deepEqual(profile.achievements, permanent.achievements);
  assert.equal(profile.best, permanent.best);
  assert.equal(events.at(-1).type, "run-abandoned");
});

test("輪值每日任務只在更換指揮官擊破Boss時完成，並記錄每機實戰", () => {
  const { engine, profile } = createEngine();
  profile.unlocked.push("atlas");
  profile.daily.tasks = ["rotation", "kills", "score"];
  profile.daily.progress = { rotation: 0, kills: 0, score: 0 };
  profile.daily.claimed = { rotation: false, kills: false, score: false };
  profile.stats.lastBossCommander = "atlas";
  engine.run.bossAlive = true;
  engine.handleBossDefeat();

  assert.equal(profile.daily.progress.rotation, 1);
  assert.equal(profile.stats.lastBossCommander, "viper");
  assert.equal(profile.stats.commanderBossWins.viper, 1);

  const same = createEngine();
  same.profile.unlocked.push("atlas");
  same.profile.daily.tasks = ["rotation", "kills", "score"];
  same.profile.daily.progress = { rotation: 0, kills: 0, score: 0 };
  same.profile.daily.claimed = { rotation: false, kills: false, score: false };
  same.profile.stats.lastBossCommander = "viper";
  same.engine.run.bossAlive = true;
  same.engine.handleBossDefeat();
  assert.equal(same.profile.daily.progress.rotation, 0);
});

test("滿級出擊只覆蓋一個Boss循環，正常取得的武器成長會保留", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.credits = 5000;
  const engine = new CombatEngine(profile);
  const cost = maxDeploymentCost("viper", 0);
  engine.start("viper", { maxDeployment: true });

  assert.equal(profile.credits, 5000 - cost);
  assert.equal(engine.run.weapon.level, 1);
  assert.equal(effectiveWeaponLevel(engine.run), WEAPON_MAX_LEVEL);
  assert.equal(effectiveArmor(engine.run), armorCap(profile.research));
  assert.ok(engine.run.contractArmor > 0);

  const firepower = { pair: 1, kind: "firepower", value: 1, sub: "武器火力", label: "LV +1", color: "#fff" };
  engine.run.gates = [firepower];
  engine.applyGate(firepower);
  assert.equal(engine.run.weapon.level, 2);
  assert.equal(effectiveWeaponLevel(engine.run), WEAPON_MAX_LEVEL);

  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  assert.equal(engine.run.maxDeploymentActive, false);
  assert.equal(engine.run.contractArmor, 0);
  assert.equal(engine.run.weapon.level, 2);
  assert.equal(effectiveWeaponLevel(engine.run), 2);
  assert.equal(profile.stats.maxDeploymentUses, 1);
});

test("Boss檢查點滿級出擊可在整備期取消並全額退款", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.credits = 6000;
  const engine = new CombatEngine(profile);
  engine.start("viper");
  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  const before = profile.credits;
  const expected = maxDeploymentCost("viper", 1);

  assert.equal(engine.purchaseMaxDeployment(), expected);
  assert.equal(profile.credits, before - expected);
  assert.equal(profile.checkpoint.maxDeploymentActive, true);
  assert.equal(profile.checkpoint.maxDeploymentCancelable, true);
  assert.equal(effectiveWeaponLevel(engine.run), WEAPON_MAX_LEVEL);

  assert.equal(engine.cancelMaxDeployment(), expected);
  assert.equal(profile.credits, before);
  assert.equal(engine.run.maxDeploymentActive, false);
  assert.equal(engine.run.maxDeploymentCancelable, false);
  assert.equal(engine.run.contractArmor, 0);
  assert.equal(engine.run.cycleMaxDeploymentUsed, false);
  assert.equal(engine.run.segmentStats.maxDeploymentUses, 0);
  assert.equal(profile.checkpoint.maxDeploymentActive, false);
  assert.equal(effectiveWeaponLevel(engine.run), 1);
});

test("滿級出擊進入下一戰區後鎖定，強制撤退也不能退款", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.credits = 6000;
  const engine = new CombatEngine(profile);
  engine.start("viper");
  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  const before = profile.credits;
  const expected = maxDeploymentCost("viper", 1);

  assert.equal(engine.purchaseMaxDeployment(), expected);
  engine.continueAfterBoss();
  assert.equal(engine.run.maxDeploymentCancelable, false);
  assert.equal(profile.checkpoint.maxDeploymentCancelable, false);
  assert.equal(engine.cancelMaxDeployment(), 0);
  const restored = engine.forceRetreat();
  assert.equal(restored.maxDeploymentActive, true);
  assert.equal(restored.maxDeploymentCancelable, false);
  assert.equal(effectiveWeaponLevel(restored), WEAPON_MAX_LEVEL);
  assert.equal(profile.credits, before - expected);
  assert.equal(engine.cancelMaxDeployment(), 0);
});

test("進入Boss後研究室仍可取消尚未出擊的滿級預約", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.credits = 6000;
  const engine = new CombatEngine(profile);
  engine.start("viper");
  engine.run.bossAlive = true;
  engine.handleBossDefeat();
  const before = profile.credits;
  const expected = maxDeploymentCost("viper", 1);

  assert.equal(engine.purchaseMaxDeployment(), expected);
  assert.equal(engine.enterResearchCheckpoint(), true);
  assert.equal(engine.playing, false);
  assert.equal(engine.cancelMaxDeployment(), expected);
  assert.equal(profile.credits, before);
  assert.equal(profile.checkpoint.maxDeploymentActive, false);
});

test("威脅協定提高敵軍與顯示戰績，但不放大軍備結算分數", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.best = 250000;
  profile.credits = 1000;
  const engine = new CombatEngine(profile);
  engine.start("viper", { protocolId: "pressure" });
  assert.equal(profile.credits, 700);

  engine.spawnEnemy("trooper", 195, 40);
  const enemy = engine.run.enemies.at(-1);
  assert.ok(enemy.maxHp > 52);
  engine.killEnemy(enemy);
  assert.equal(engine.run.score, 100);
  assert.equal(engine.run.segmentScore, 80);
});

test("完整取得六組二選一與無支援擊破會累積系列成就及分數獎勵", () => {
  const { engine, profile } = createEngine();
  engine.run.cycleGatePairsEligible = 6;
  engine.run.cycleGatePairsChosen = 6;
  engine.run.bossAlive = true;
  engine.handleBossDefeat();

  assert.equal(profile.stats.perfectGateRounds, 1);
  assert.equal(profile.stats.unsupportedBosses, 1);
  assert.ok(profile.achievements.includes("allgates1"));
  assert.ok(profile.achievements.includes("nosupport1"));
  assert.equal(engine.run.score, 1440);
});

test("滿級出擊不能代解高難度Boss與完美二選一成就", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.credits = 5000;
  profile.unlocked.push("warden");
  const engine = new CombatEngine(profile);
  engine.start("warden", { maxDeployment: true });
  engine.run.cycleGatePairsEligible = 6;
  engine.run.cycleGatePairsChosen = 6;
  engine.run.bossAlive = true;
  engine.handleBossDefeat();

  assert.equal(profile.achievements.includes("wardenmax"), false);
  assert.equal(profile.achievements.includes("allgates1"), false);
  assert.equal(profile.achievements.includes("nosupport1"), false);
  assert.equal(profile.achievements.includes("flawlessboss"), false);
  assert.equal(engine.run.score, 1200);
});

test("十位指揮官技能各有成就，最後一位會完成十機戰術鏈", () => {
  const profile = createProfile();
  profile.achievements = [
    "skill_viper", "skill_engineer", "skill_atlas", "skill_frost", "skill_reaper",
    "skill_nova", "skill_phoenix", "skill_raider", "skill_warden"
  ];
  profile.unlocked.push("hunter");
  const engine = new CombatEngine(profile);
  engine.start("hunter");
  engine.run.airstrike = 100;
  assert.equal(engine.useCommanderSkill(), true);
  assert.ok(engine.run.segmentAchievements.includes("skill_hunter"));
  assert.ok(engine.run.segmentAchievements.includes("allskills"));
});
