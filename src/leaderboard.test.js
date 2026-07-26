import test from "node:test";
import assert from "node:assert/strict";

import { isPersonalRecord, sanitizeNickname, NICKNAME_MAX } from "../src/leaderboard.js";
import { createClientId, createProfile } from "../src/storage.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("暱稱會去除前後空白並截斷到上限", () => {
  assert.equal(sanitizeNickname("  縱隊指揮官  "), "縱隊指揮官");
  assert.equal(sanitizeNickname("A".repeat(40)).length, NICKNAME_MAX);
});

test("暱稱會濾掉可能破壞畫面的字元", () => {
  assert.equal(sanitizeNickname('<img src="x">'), "img src=x");
  assert.equal(sanitizeNickname("`back`'quote'"), "backquote");
});

test("空白或非字串暱稱會變成空字串", () => {
  assert.equal(sanitizeNickname("   "), "");
  assert.equal(sanitizeNickname(null), "");
  assert.equal(sanitizeNickname(undefined), "");
});

test("分數或Boss擊殺數突破個人紀錄會判定為新紀錄", () => {
  const best = { score: 1000, bossKills: 2, clearSeconds: 300 };
  assert.equal(isPersonalRecord(best, { score: 1001, bossKills: 0, victory: false }), true);
  assert.equal(isPersonalRecord(best, { score: 0, bossKills: 3, victory: false }), true);
  assert.equal(isPersonalRecord(best, { score: 1000, bossKills: 2, victory: false }), false);
});

test("更快的通關時間會判定為新紀錄，較慢的不會", () => {
  const best = { score: 1000, bossKills: 2, clearSeconds: 300 };
  assert.equal(isPersonalRecord(best, { score: 0, bossKills: 0, clearSeconds: 299, victory: true }), true);
  assert.equal(isPersonalRecord(best, { score: 0, bossKills: 0, clearSeconds: 301, victory: true }), false);
});

test("沒有通關就不看時間，即使數字比紀錄小", () => {
  const best = { score: 1000, bossKills: 2, clearSeconds: 300 };
  assert.equal(isPersonalRecord(best, { score: 0, bossKills: 0, clearSeconds: 10, victory: false }), false);
});

test("首次通關時舊紀錄為 null，一定算新紀錄", () => {
  const best = { score: 9999, bossKills: 9, clearSeconds: null };
  assert.equal(isPersonalRecord(best, { score: 0, bossKills: 0, clearSeconds: 900, victory: true }), true);
});

test("完全沒有個人紀錄時任何成績都算新紀錄", () => {
  assert.equal(isPersonalRecord(undefined, { score: 1, bossKills: 0, victory: false }), true);
  assert.equal(isPersonalRecord(null, { score: 0, bossKills: 1, victory: false }), true);
});

test("新存檔會產生合法的 client id 與空的個人紀錄", () => {
  const profile = createProfile();
  assert.match(profile.leaderboardClientId, UUID_PATTERN);
  assert.equal(profile.nickname, "");
  assert.deepEqual(profile.leaderboardBest, { score: 0, clearSeconds: null, bossKills: 0 });
  assert.equal(profile.hazardGraduated, false);
});

test("每次產生的 client id 都不同", () => {
  const ids = new Set(Array.from({ length: 50 }, () => createClientId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, UUID_PATTERN);
});
