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

import { renderLeaderboard, renderMenu, renderResult } from "../src/ui.js";

function entry(overrides = {}) {
  return {
    client_id: "11111111-1111-4111-8111-111111111111",
    nickname: "測試員",
    score: 12345,
    boss_kills: 3,
    commander: "viper",
    clear_seconds: 754,
    victory: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function sampleRun(overrides = {}) {
  return {
    commander: "viper",
    weapon: { id: "rifle", level: 3 },
    score: 5000,
    bossKills: 2,
    resultCredits: 120,
    research: {},
    ...overrides
  };
}

test("主選單會提供排行榜入口", () => {
  assert.match(renderMenu(createProfile()), /data-action="open-leaderboard"/);
});

test("載入失敗與空榜是兩種不同訊息", () => {
  assert.match(renderLeaderboard(null), /排行榜載入失敗/);
  assert.match(renderLeaderboard([]), /目前還沒有人上榜/);
});

test("排行榜依分類顯示不同數值", () => {
  const rows = [entry()];
  assert.match(renderLeaderboard(rows, "score"), /leaderboard-score">12,345</);
  assert.match(renderLeaderboard(rows, "bosskills"), /leaderboard-score">3</);
  assert.match(renderLeaderboard(rows, "fastest"), /leaderboard-score">12:34</);
});

test("最快通關榜沒有時間時顯示破折號", () => {
  const html = renderLeaderboard([entry({ clear_seconds: null, victory: false })], "fastest");
  assert.match(html, /leaderboard-score">—</);
});

test("自己的那一列會被標記出來", () => {
  const mine = "11111111-1111-4111-8111-111111111111";
  assert.match(renderLeaderboard([entry()], "score", mine), /leaderboard-row mine/);
  assert.match(renderLeaderboard([entry()], "score", mine), /（你）/);
  assert.doesNotMatch(renderLeaderboard([entry()], "score", "22222222-2222-4222-8222-222222222222"), /leaderboard-row mine/);
});

test("沒有傳入 client id 時不會誤標任何一列", () => {
  assert.doesNotMatch(renderLeaderboard([entry()], "score", null), /leaderboard-row mine/);
});

test("目前分類的頁籤會是 active", () => {
  const html = renderLeaderboard([], "fastest");
  assert.match(html, /leaderboard-tab active" data-action="leaderboard-category" data-category="fastest"/);
  assert.match(html, /leaderboard-tab" data-action="leaderboard-category" data-category="score"/);
});

test("結算畫面帶有暱稱輸入與上傳按鈕，並預填既有暱稱", () => {
  const profile = createProfile();
  profile.nickname = "老兵";
  const html = renderResult(profile, sampleRun());
  assert.match(html, /id="nickname-input"[^>]*maxlength="16"/);
  assert.match(html, /value="老兵"/);
  assert.match(html, /data-action="submit-score"/);
});

test("首次通關的那一局，結算畫面會提示速通時間會一併上傳", () => {
  const html = renderResult(createProfile(), sampleRun({ firstClearAchieved: true, firstClearElapsed: 902 }));
  assert.match(html, /首次擊破 Moloch・速通耗時 15:02/);
});

test("沒有首次通關就不顯示速通提示", () => {
  assert.doesNotMatch(renderResult(createProfile(), sampleRun()), /速通耗時/);
});

import { renderAchievements } from "../src/ui.js";

function achievementsHtml(earned = []) {
  const profile = createProfile();
  profile.achievements = earned;
  profile.best = 0;
  return renderAchievements(profile, "daily");
}

test("全新帳號只看得到第一階積分里程碑", () => {
  const html = achievementsHtml([]);
  assert.match(html, /戰功彪炳/);
  assert.doesNotMatch(html, /百戰精銳/);
  assert.doesNotMatch(html, /縱隊神話/);
});

test("達成前兩階後，露出已達成的加上緊接的下一階", () => {
  const html = achievementsHtml(["score10k", "score50k"]);
  assert.match(html, /戰功彪炳/);
  assert.match(html, /百戰精銳/);
  assert.match(html, /戰區王牌/);
  assert.doesNotMatch(html, /高壓適格/);
});

test("最高階的隱藏天花板要全部達成才會現身", () => {
  const all = [
    "score10k", "score50k", "score100k", "score250k", "score500k", "score1m",
    "score2500k", "score5m", "score10m", "score25m", "score50m"
  ];
  assert.doesNotMatch(achievementsHtml(all.slice(0, 10)), /縱隊神話/);
  assert.match(achievementsHtml(all), /縱隊神話/);
});

test("積分區段標題不洩漏總共有幾階", () => {
  const html = achievementsHtml(["score10k"]);
  assert.match(html, /積分已達成 1 項/);
  assert.doesNotMatch(html, /積分 1\/1[0-9]/);
});
