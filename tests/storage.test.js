import test from "node:test";
import assert from "node:assert/strict";

import { BATTLE_ACHIEVEMENTS } from "../src/config.js";

import {
  PROFILE_KEY,
  addDailyCommander,
  claimDaily,
  clearAllProfileData,
  commanderBattleCount,
  commanderSkillCount,
  createProfile,
  loadProfile,
  saveProfile
} from "../src/storage.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  get length() {
    return this.values.size;
  }
}

test("舊版存檔可遷移，研究等級會安全限制在0到9", () => {
  const storage = new MemoryStorage({
    "firestorm-credits": "123",
    "firestorm-best": "4567",
    "firestorm-v5-unlocked": JSON.stringify(["viper", "atlas", "unknown"]),
    "firestorm-v5-selected": "atlas",
    "firestorm-v5-research": JSON.stringify({ damage: 99, armor: -3 })
  });
  const profile = loadProfile(storage);
  assert.equal(profile.credits, 123);
  assert.equal(profile.best, 4567);
  assert.deepEqual(profile.unlocked, ["viper", "atlas"]);
  assert.equal(profile.selected, "atlas");
  assert.equal(profile.research.damage, 9);
  assert.equal(profile.research.armor, 0);
  assert.equal(profile.musicVolume, 70);
  assert.equal(profile.sfxVolume, 42);
  assert.ok(storage.getItem(PROFILE_KEY));
});

test("每日獎勵不能重複領取", () => {
  const profile = createProfile();
  const id = profile.daily.tasks[0];
  profile.daily.progress[id] = Number.MAX_SAFE_INTEGER;
  const first = claimDaily(profile, id);
  const second = claimDaily(profile, id);
  assert.ok(first > 0);
  assert.equal(second, 0);
});

test("新版存檔可往返保存", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.credits = 777;
  saveProfile(profile, storage);
  assert.equal(loadProfile(storage).credits, 777);
});

test("全螢幕偏好會保存，非布林舊資料不會誤啟用", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.fullscreenPreferred = true;
  saveProfile(profile, storage);
  assert.equal(loadProfile(storage).fullscreenPreferred, true);

  const corrupted = JSON.parse(storage.getItem(PROFILE_KEY));
  corrupted.fullscreenPreferred = "true";
  storage.setItem(PROFILE_KEY, JSON.stringify(corrupted));
  assert.equal(loadProfile(storage).fullscreenPreferred, false);
});

test("砍掉重練會清除現行與所有舊版火線存檔，但不碰其他網站資料", () => {
  const storage = new MemoryStorage({
    "firestorm-credits": "999",
    "firestorm-v5-research": JSON.stringify({ damage: 9 }),
    "firestorm-obsolete-probe": "legacy",
    "other-game-profile": "keep"
  });
  const profile = createProfile();
  profile.credits = 8888;
  profile.best = 123456;
  profile.tutorialSeen = true;
  profile.unlocked.push("atlas");
  saveProfile(profile, storage);

  assert.equal(clearAllProfileData(storage), 4);
  assert.equal(storage.getItem("firestorm-credits"), null);
  assert.equal(storage.getItem("firestorm-v5-research"), null);
  assert.equal(storage.getItem("firestorm-obsolete-probe"), null);
  assert.equal(storage.getItem("other-game-profile"), "keep");

  const fresh = loadProfile(storage);
  assert.equal(fresh.credits, 0);
  assert.equal(fresh.best, 0);
  assert.equal(fresh.tutorialSeen, false);
  assert.deepEqual(fresh.unlocked, ["viper"]);
  assert.equal(fresh.checkpoint, null);
});

test("既有50連擊成就會補齊前階並補發一次獎勵且不會重複入帳", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.credits = 100;
  profile.achievements = ["combo50"];
  saveProfile(profile, storage);

  const first = loadProfile(storage);
  assert.equal(first.credits, 130);
  assert.ok(first.achievements.includes("combo20"));
  assert.equal(first.stats.bestCombo, 50);
  assert.ok(first.achievementRewardsClaimed.includes("combo20"));
  assert.ok(first.achievementRewardsClaimed.includes("combo50"));
  const second = loadProfile(storage);
  assert.equal(second.credits, 130);
});

test("指揮官Boss實戰紀錄會安全補齊並計算不同機體", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.stats.commanderBossWins.viper = 2;
  profile.stats.commanderBossWins.atlas = 1;
  saveProfile(profile, storage);
  const loaded = loadProfile(storage);
  assert.equal(commanderBattleCount(loaded), 2);
  assert.equal(loaded.stats.commanderBossWins.hunter, 0);
});

test("全機精通會依十項專屬成就自動補齊且不能提前存在", () => {
  const commanderIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commander).map((achievement) => achievement.id);
  const completeStorage = new MemoryStorage();
  const complete = createProfile();
  complete.achievements = [...commanderIds];
  saveProfile(complete, completeStorage);
  assert.ok(loadProfile(completeStorage).achievements.includes("allmastery"));

  const incompleteStorage = new MemoryStorage();
  const incomplete = createProfile();
  incomplete.achievements = [...commanderIds.slice(0, -1), "allmastery"];
  saveProfile(incomplete, incompleteStorage);
  assert.equal(loadProfile(incompleteStorage).achievements.includes("allmastery"), false);
});

test("六械宗師只會在六種武器專精齊全時存在", () => {
  const weaponIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.weaponMastery).map((achievement) => achievement.id);
  const completeStorage = new MemoryStorage();
  const complete = createProfile();
  complete.achievements = [...weaponIds];
  saveProfile(complete, completeStorage);
  assert.ok(loadProfile(completeStorage).achievements.includes("weapon_mastery"));

  const incompleteStorage = new MemoryStorage();
  const incomplete = createProfile();
  incomplete.achievements = [...weaponIds.slice(0, -1), "weapon_mastery"];
  saveProfile(incomplete, incompleteStorage);
  assert.equal(loadProfile(incompleteStorage).achievements.includes("weapon_mastery"), false);
});

test("舊版光束時代成就獲得新獎勵且只補發一次", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.achievements = ["laser"];
  saveProfile(profile, storage);
  assert.equal(loadProfile(storage).credits, 30);
  assert.equal(loadProfile(storage).credits, 30);
});

test("舊最高戰績會回溯補齊積分里程碑，獎勵只入庫一次", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.credits = 100;
  profile.best = 1000000;
  saveProfile(profile, storage);

  const first = loadProfile(storage);
  assert.deepEqual(
    BATTLE_ACHIEVEMENTS.filter((item) => item.scoreTarget <= 1000000).map((item) => item.id)
      .every((id) => first.achievements.includes(id)),
    true
  );
  assert.equal(first.credits, 385);
  assert.equal(loadProfile(storage).credits, 385);
});

test("已證明施放過的舊指揮官專屬成就會回溯技能實戰", () => {
  const storage = new MemoryStorage();
  const profile = createProfile();
  profile.achievements = ["thunderboss", "logistics3"];
  saveProfile(profile, storage);
  const loaded = loadProfile(storage);
  assert.ok(loaded.achievements.includes("skill_viper"));
  assert.ok(loaded.achievements.includes("skill_engineer"));
  assert.equal(commanderSkillCount(loaded), 2);
});

test("後期出擊設定會驗證研究與最高戰績，不合資格時安全回標準", () => {
  const lockedStorage = new MemoryStorage();
  const locked = createProfile();
  locked.deployment = { protocol: "extinction", max: true };
  saveProfile(locked, lockedStorage);
  assert.deepEqual(loadProfile(lockedStorage).deployment, { protocol: "standard", max: false });

  const readyStorage = new MemoryStorage();
  const ready = createProfile();
  for (const id of Object.keys(ready.research)) ready.research[id] = 9;
  ready.best = 10000000;
  ready.deployment = { protocol: "extinction", max: true };
  saveProfile(ready, readyStorage);
  assert.deepEqual(loadProfile(readyStorage).deployment, { protocol: "extinction", max: true });
});

test("十機輪值每日進度只計算不同指揮官", () => {
  const profile = createProfile();
  profile.unlocked = Object.keys(profile.stats.commanderBossWins);
  profile.daily.tasks = ["allCommanders", "kills", "score"];
  profile.daily.progress = { allCommanders: 0, kills: 0, score: 0 };
  profile.daily.claimed = { allCommanders: false, kills: false, score: false };
  for (const id of Object.keys(profile.stats.commanderBossWins)) addDailyCommander(profile, id);
  addDailyCommander(profile, "viper");
  assert.equal(profile.daily.commanderUsage.length, 10);
  assert.equal(profile.daily.progress.allCommanders, 10);
});
