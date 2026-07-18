import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_ARMOR_CAP,
  BATTLE_ACHIEVEMENTS,
  BOSS_CHASSIS_ORDER,
  COMMANDER_ORDER,
  COMMANDERS,
  RESEARCH_ORDER,
  THREAT_PROTOCOL_ORDER,
  WEAPON_MAX_LEVEL,
  ZONES,
  allResearchMax,
  armorCap,
  bossChassisForOrdinal,
  buildZoneRoute,
  dailySelection,
  maxDeploymentCost,
  researchCost,
  supportCost,
  threatProtocolAvailable,
  zoneForRun
} from "../src/config.js";
import {
  applyResearchDelta,
  createRun,
  effectiveArmor,
  effectiveBulletDamage,
  effectiveWeaponLevel,
  formationOffsets,
  migrateLegacyRun,
  restoreRun,
  serializeRun
} from "../src/game/state.js";
import { formationFootprint, squadBadgeText } from "../src/game/render.js";
import { createProfile, researchMedalCount } from "../src/storage.js";

test("六戰區分成前後兩條首輪路線，無盡輪替固定可重現", () => {
  assert.equal(ZONES.length, 6);
  assert.equal(new Set(ZONES.map((zone) => zone.id)).size, 6);
  assert.deepEqual(buildZoneRoute(0), [0, 1, 2]);
  assert.deepEqual(buildZoneRoute(1), [3, 4, 5]);

  const previous = [3, 4, 5];
  const first = buildZoneRoute(2, previous, 0x13579bdf);
  const second = buildZoneRoute(2, previous, 0x13579bdf);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.notEqual(first[0], previous.at(-1));

  const run = { scene: 7, zoneRoute: first };
  assert.equal(zoneForRun(run), ZONES[first[1]]);
});

test("三種Boss機體依輪次循環，不會退回同一個外觀", () => {
  assert.deepEqual(BOSS_CHASSIS_ORDER, ["babel", "leviathan", "moloch"]);
  assert.deepEqual(
    [1, 2, 3, 4].map((ordinal) => bossChassisForOrdinal(ordinal).id),
    ["babel", "leviathan", "moloch", "babel"]
  );
});

test("戰區路線會寫入檢查點，舊檢查點則依Boss進度安全補路", () => {
  const profile = createProfile();
  const run = createRun(profile, "viper", () => 0.2);
  run.bossKills = 2;
  run.scene = 6;
  run.routeSeed = 0x2468ace0;
  run.zoneRoute = buildZoneRoute(2, [3, 4, 5], run.routeSeed);
  const restored = restoreRun(serializeRun(run), profile);
  assert.deepEqual(restored.zoneRoute, run.zoneRoute);
  assert.equal(restored.routeSeed, run.routeSeed);

  const legacy = serializeRun(run);
  legacy.bossKills = 1;
  legacy.scene = 3;
  delete legacy.routeSeed;
  delete legacy.zoneRoute;
  const migrated = restoreRun(legacy, profile);
  assert.equal(migrated.routeSeed, 0x51f15e);
  assert.deepEqual(migrated.zoneRoute, [3, 4, 5]);

  const v5Snapshot = migrateLegacyRun({ commander: "viper", bossKills: 1, scene: 3 }, profile);
  assert.deepEqual(v5Snapshot.zoneRoute, [3, 4, 5]);
});

test("初始機獨立，付費指揮官依Boss威脅與價格由低到高排列", () => {
  assert.equal(COMMANDER_ORDER[0], "viper");
  assert.equal(COMMANDERS.viper.starter, true);
  const commanders = COMMANDER_ORDER.slice(1).map((id) => COMMANDERS[id]);
  for (let index = 1; index < commanders.length; index += 1) {
    assert.ok(commanders[index - 1].threat <= commanders[index].threat);
    assert.ok(commanders[index - 1].price <= commanders[index].price);
  }
});

test("裝甲研究把個人上限從14提高到MAX 23", () => {
  assert.equal(armorCap({ armor: 0 }), BASE_ARMOR_CAP);
  assert.equal(armorCap({ armor: 9 }), 23);

  const profile = createProfile();
  profile.research.armor = 9;
  const run = createRun(profile, "warden", () => 0.25);
  assert.equal(run.armor, 16);

  run.armor = 22;
  applyResearchDelta(run, "armor", 1, profile);
  assert.equal(run.armor, 23);
});

test("動員研究每級只增加一名開局士兵，滿級不再直接灌入18人", () => {
  const profile = createProfile();
  profile.research.squad = 9;
  const run = createRun(profile, "viper", () => 0.25);
  assert.equal(run.squad, 15);

  applyResearchDelta(run, "squad", 1, profile);
  assert.equal(run.squad, 16);
});

test("九項研究各有九級，且高威脅研究成本更高", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  assert.equal(researchMedalCount(profile), 81);
  assert.ok(researchCost("damage", 0) > researchCost("air", 0));
  assert.equal(researchCost("damage", 8), 450);
});

test("武器戰術等級固定封頂9，永久火力研究仍獨立生效", () => {
  const baseProfile = createProfile();
  const baseRun = createRun(baseProfile, "viper", () => 0.2);
  baseRun.weapon = { id: "rifle", level: WEAPON_MAX_LEVEL };
  const baseDamage = effectiveBulletDamage(baseRun, baseProfile);

  const researchedProfile = createProfile();
  researchedProfile.research.damage = 9;
  const researchedRun = createRun(researchedProfile, "viper", () => 0.2);
  researchedRun.weapon = { id: "rifle", level: WEAPON_MAX_LEVEL };
  assert.ok(effectiveBulletDamage(researchedRun, researchedProfile) > baseDamage * 2);

  const snapshot = serializeRun({ ...researchedRun, weapon: { id: "rifle", level: 99 } });
  const restored = restoreRun(snapshot, researchedProfile);
  assert.equal(restored.weapon.level, WEAPON_MAX_LEVEL);
});

test("單輪指揮官成就計數會跨Boss檢查點保留，限時挑戰則重新開始", () => {
  const profile = createProfile();
  const run = createRun(profile, "engineer", () => 0.2);
  run.commanderCounters.engineerSkills = 2;
  run.commanderCounters.reaperRecruits = 7;
  run.firepowerGateMisses = 3;
  run.skillCooldown = 6;
  run.energyDropCooldown = 5;
  run.artilleryClock = 2;
  run.commanderChallenge = { type: "raider", clock: 4, kills: 12 };
  const restored = restoreRun(serializeRun(run), profile);
  assert.deepEqual(restored.commanderCounters, { engineerSkills: 2, reaperRecruits: 7 });
  assert.equal(restored.firepowerGateMisses, 3);
  assert.equal(restored.skillCooldown, 0);
  assert.equal(restored.energyDropCooldown, 0);
  assert.equal(restored.artilleryClock, 10);
  assert.equal(restored.invuln, 1);
  assert.equal(restored.hardInvuln, 1);
  assert.deepEqual(restored.commanderChallenge, { type: null, clock: 0, kills: 0 });
});

test("每日任務固定選出三項且同日期結果一致", () => {
  const first = dailySelection("2026-07-14").map((task) => task.id);
  const second = dailySelection("2026-07-14").map((task) => task.id);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.deepEqual(first, second);
});

test("輪值出擊只會進入擁有兩位以上指揮官的每日任務池", () => {
  const starter = dailySelection("2026-07-02", { commanderCount: 1 }).map((task) => task.id);
  const expanded = dailySelection("2026-07-02", { commanderCount: 2 }).map((task) => task.id);
  assert.equal(starter.includes("rotation"), false);
  assert.equal(expanded.includes("rotation"), true);
});

test("十機輪值每日任務只會對已招募全部指揮官的玩家開放", () => {
  const starterDates = Array.from({ length: 40 }, (_, index) => `2026-08-${String(index % 28 + 1).padStart(2, "0")}`);
  assert.ok(starterDates.every((date) => !dailySelection(date, { commanderCount: 9 }).some((task) => task.id === "allCommanders")));
  assert.ok(starterDates.some((date) => dailySelection(date, { commanderCount: 10 }).some((task) => task.id === "allCommanders")));
});

test("支援費用依Boss循環提高，醫療支援維持最高價格", () => {
  assert.deepEqual(
    ["medical", "firepower", "charge"].map((id) => supportCost(id, 0)),
    [80, 60, 40]
  );
  assert.deepEqual(
    ["medical", "firepower", "charge"].map((id) => supportCost(id, 2)),
    [145, 110, 70]
  );
});

test("研究81完成後依最高戰績逐級解鎖威脅協定", () => {
  const profile = createProfile();
  assert.equal(allResearchMax(profile), false);
  assert.equal(threatProtocolAvailable(profile, "pressure"), false);
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  profile.best = 250000;
  assert.equal(allResearchMax(profile), true);
  assert.deepEqual(THREAT_PROTOCOL_ORDER, ["standard", "pressure", "iron", "extinction"]);
  assert.equal(threatProtocolAvailable(profile, "pressure"), true);
  assert.equal(threatProtocolAvailable(profile, "iron"), false);
  profile.best = 10000000;
  assert.equal(threatProtocolAvailable(profile, "extinction"), true);
});

test("滿級出擊價格依指揮官與Boss輪次增加，臨時覆蓋不改寫真實等級", () => {
  const profile = createProfile();
  for (const id of RESEARCH_ORDER) profile.research[id] = 9;
  assert.equal(maxDeploymentCost("viper", 0), 1100);
  assert.equal(maxDeploymentCost("hunter", 0), 1800);
  assert.equal(maxDeploymentCost("viper", 3), 2300);

  const run = createRun(profile, "viper", () => 0.2, { maxDeployment: true });
  assert.equal(run.weapon.level, 1);
  assert.equal(effectiveWeaponLevel(run), WEAPON_MAX_LEVEL);
  assert.equal(effectiveArmor(run), armorCap(profile.research));
  const restored = restoreRun(serializeRun(run), profile);
  assert.equal(restored.maxDeploymentActive, true);
  assert.equal(effectiveWeaponLevel(restored), WEAPON_MAX_LEVEL);
  assert.equal(effectiveArmor(restored), armorCap(profile.research));
});

test("十全指揮不再重複出現在永久戰場勳章，連殺系列固定五階", () => {
  assert.equal(BATTLE_ACHIEVEMENTS.some((achievement) => achievement.id === "allcommanders"), false);
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.comboTarget).map((achievement) => achievement.comboTarget),
    [20, 50, 100, 200, 300]
  );
});

test("積分成就採十階里程碑，十位指揮官各有技能實戰成就", () => {
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.scoreTarget).map((achievement) => achievement.scoreTarget),
    [10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000]
  );
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commanderSkill).map((achievement) => achievement.commanderSkill),
    COMMANDER_ORDER
  );
  assert.equal(BATTLE_ACHIEVEMENTS.find((achievement) => achievement.skillMeta).id, "allskills");
});

test("六種武器各有實戰專精並以六械宗師收束", () => {
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.weaponMastery)
      .map((achievement) => achievement.weaponMastery),
    ["rifle", "shotgun", "rocket", "laser", "minigun", "railgun"]
  );
  assert.equal(BATTLE_ACHIEVEMENTS.find((achievement) => achievement.weaponMeta).id, "weapon_mastery");
  assert.match(BATTLE_ACHIEVEMENTS.find((achievement) => achievement.id === "laser").desc, /貫穿4名/);
});

test("十位指揮官各有一項專屬成就並設有全機精通", () => {
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commander).map(({ id, commander }) => ({ id, commander })),
    [
      { id: "thunderboss", commander: "viper" },
      { id: "logistics3", commander: "engineer" },
      { id: "fullarmor", commander: "atlas" },
      { id: "frozen", commander: "frost" },
      { id: "reaper8", commander: "reaper" },
      { id: "nova6", commander: "nova" },
      { id: "revive", commander: "phoenix" },
      { id: "raider20", commander: "raider" },
      { id: "wardenmax", commander: "warden" },
      { id: "huntercrit8", commander: "hunter" }
    ]
  );
  assert.equal(BATTLE_ACHIEVEMENTS.find((achievement) => achievement.commanderMeta).id, "allmastery");
  assert.equal(BATTLE_ACHIEVEMENTS.find((achievement) => achievement.id === "crit").commander, undefined);
});

test("指揮官固定在隊伍中央後排，士兵排列在前方", () => {
  const one = formationOffsets(1);
  assert.deepEqual(one, [{ x: 0, y: 0 }]);

  const formation = formationOffsets(10);
  assert.equal(formation.length, 10);
  assert.equal(formation[0].x, 0);
  assert.ok(formation.slice(1).every((offset) => offset.y < formation[0].y));
});

test("隊形邊界依實際人數計算，滿員徽章恢復顯示MAX", () => {
  const solo = formationFootprint(1);
  assert.equal(solo.radiusX, 21);
  assert.equal(solo.radiusY, 25);

  const squad = formationFootprint(10);
  assert.equal(squad.offsets.length, 10);
  assert.equal(squad.centerY, 24.5);
  assert.equal(squad.radiusX, 64.5);
  assert.equal(squad.radiusY, 46.5);

  const full = formationFootprint(36);
  assert.equal(full.centerY - full.radiusY, -22);
  assert.equal(full.radiusX, 87.5);
  assert.equal(squadBadgeText(35), "▲ 35/36");
  assert.equal(squadBadgeText(36), "▲ MAX");
});
