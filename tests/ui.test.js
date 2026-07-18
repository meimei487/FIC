import test from "node:test";
import assert from "node:assert/strict";

import { createProfile } from "../src/storage.js";
import {
  renderAchievements,
  renderArmory,
  renderDataManagement,
  renderMenu,
  renderPause,
  renderResetProfileConfirmation,
  renderSafeExit
} from "../src/ui.js";

test("只有從未出擊的玩家會顯示菜鳥出擊", () => {
  const profile = createProfile();
  const html = renderMenu(profile);

  assert.match(html, /class="menu overlay"/);
  assert.match(html, /class="primary menu-deploy-button"[^>]*><b>▶ 菜鳥出擊<\/b><\/button>/);
  assert.doesNotMatch(html, /<b>▶ 開始新一輪<\/b>/);
});

test("已看過簡報但尚未結算的玩家會顯示開始新一輪", () => {
  const profile = createProfile();
  profile.tutorialSeen = true;
  const html = renderMenu(profile);

  assert.match(html, /<b>▶ 開始新一輪<\/b><small class="new-run-note">不會清除研究、指揮官與成就<\/small>/);
  assert.doesNotMatch(html, /<b>▶ 菜鳥出擊<\/b>/);
});

test("死亡結算後無檢查點會顯示開始新一輪", () => {
  const profile = createProfile();
  profile.stats.totalRuns = 1;
  const html = renderMenu(profile);

  assert.match(html, /<b>▶ 開始新一輪<\/b><small class="new-run-note">/);
  assert.doesNotMatch(html, /<b>▶ 菜鳥出擊<\/b>/);
});

test("開始頁只提供資料管理入口，不直接暴露永久刪除按鈕", () => {
  const html = renderMenu(createProfile());
  assert.match(html, /data-action="data-management">資料管理/);
  assert.doesNotMatch(html, /data-action="request-profile-reset"/);
  assert.doesNotMatch(html, /data-action="hold-reset-profile"/);
});

test("首頁與暫停頁提供全螢幕控制並正確反映目前狀態", () => {
  const profile = createProfile();
  const menu = renderMenu(profile, { fullscreenSupported: true, fullscreenActive: false });
  assert.match(menu, /class="menu-fullscreen-toggle" data-action="toggle-fullscreen" aria-pressed="false">全螢幕/);

  const activeMenu = renderMenu(profile, { fullscreenSupported: true, fullscreenActive: true });
  assert.match(activeMenu, /aria-pressed="true">退出全螢幕/);

  const pause = renderPause(profile, {}, { fullscreenSupported: true, fullscreenActive: false });
  assert.match(pause, /data-action="toggle-fullscreen"/);
  assert.match(pause, /進入全螢幕/);

  const unsupported = renderMenu(profile, { fullscreenSupported: false, fullscreenActive: false });
  assert.doesNotMatch(unsupported, /data-action="toggle-fullscreen"/);
});

test("資料管理會列出永久進度，刪除確認必須長按3秒", () => {
  const profile = createProfile();
  profile.credits = 4321;
  profile.best = 98765;
  profile.unlocked.push("atlas");
  profile.research.damage = 3;
  profile.checkpoint = { bossKills: 2 };

  const management = renderDataManagement(profile);
  assert.match(management, /◆ 4,321/);
  assert.match(management, /2\/10/);
  assert.match(management, /3\/81/);
  assert.match(management, /Boss 2 後檢查點/);
  assert.match(management, /data-action="request-profile-reset"/);

  const confirmation = renderResetProfileConfirmation();
  assert.match(confirmation, /刪除後無法復原/);
  assert.match(confirmation, /舊版遷移資料/);
  assert.match(confirmation, /data-action="hold-reset-profile"/);
  assert.match(confirmation, /按住 3 秒永久刪除/);
  assert.match(confirmation, /放開按鈕會立即取消/);
});

test("研究滿級後指揮中心顯示威脅協定與一次性滿級出擊", () => {
  const profile = createProfile();
  for (const id of Object.keys(profile.research)) profile.research[id] = 9;
  profile.best = 10000000;
  profile.credits = 50000;
  const html = renderArmory(profile);
  assert.match(html, /ENDGAME CONTRACTS/);
  assert.match(html, /高壓協定/);
  assert.match(html, /滅絕協定/);
  assert.match(html, /滿級出擊・極限軍備/);
  assert.match(html, /加購 ◆1,100/);
});

test("Boss後整備窗口可直接購買下一輪滿級出擊", () => {
  const profile = createProfile();
  for (const id of Object.keys(profile.research)) profile.research[id] = 9;
  const run = { commander: "viper", bossKills: 1, safeExitClock: 10, maxDeploymentActive: false };
  const html = renderSafeExit(profile, run);
  assert.match(html, /10秒後研究整備窗口關閉/);
  assert.match(html, /data-action="purchase-cycle-max"/);
  assert.match(html, /滿級出擊下一輪・◆1,500/);
});

test("Boss後滿級出擊預約可在安全窗口與研究室取消", () => {
  const profile = createProfile();
  for (const id of Object.keys(profile.research)) profile.research[id] = 9;
  const run = {
    commander: "viper",
    bossKills: 1,
    safeExitClock: 10,
    maxDeploymentActive: true,
    maxDeploymentCancelable: true
  };
  const safeExit = renderSafeExit(profile, run);
  assert.match(safeExit, /data-action="cancel-cycle-max"/);
  assert.match(safeExit, /取消滿級整備・退還 ◆1,500/);
  assert.doesNotMatch(safeExit, /data-action="cancel-cycle-max" disabled/);

  profile.checkpoint = { ...run, threatProtocol: "standard" };
  const research = renderArmory(profile, { checkpointMode: true });
  assert.match(research, /返回戰場前可取消並全額退還/);
  assert.match(research, /data-action="cancel-cycle-max"/);
});

test("已返回戰場的滿級合約只顯示鎖定且不能取消", () => {
  const profile = createProfile();
  for (const id of Object.keys(profile.research)) profile.research[id] = 9;
  profile.checkpoint = {
    commander: "viper",
    bossKills: 1,
    maxDeploymentActive: true,
    maxDeploymentCancelable: false,
    threatProtocol: "standard"
  };
  const html = renderArmory(profile, { checkpointMode: true });
  assert.match(html, /下一輪滿級已鎖定/);
  assert.doesNotMatch(html, /data-action="cancel-cycle-max"/);
});

test("指揮官實戰以明確徽章與圖例顯示，不再只靠框線粗細", () => {
  const profile = createProfile();
  profile.stats.commanderBossWins.viper = 2;
  const html = renderAchievements(profile, "commanders");
  assert.match(html, /class="field-badge">⚔/);
  assert.match(html, /彩色框＝已招募/);
  assert.match(html, /⚔＝至少擊破1次Boss/);
});

test("每日戰績頁會獨立列出六種武器專精與六械宗師", () => {
  const html = renderAchievements(createProfile(), "daily");
  assert.match(html, /WEAPON MASTERY/);
  assert.match(html, /武器專精 0\/6/);
  assert.match(html, /脈衝紀律/);
  assert.match(html, /光束時代/);
  assert.match(html, /六械宗師/);
  assert.doesNotMatch(html, /裝備高能雷射/);
});

test("Boss檢查點仍優先顯示再續光榮", () => {
  const profile = createProfile();
  profile.tutorialSeen = true;
  profile.stats.totalRuns = 2;
  profile.checkpoint = {};
  const html = renderMenu(profile);

  assert.match(html, /class="menu overlay has-checkpoint"/);
  assert.match(html, />↻ 再續光榮<\/button>/);
  assert.doesNotMatch(html, /data-action="new-run"/);
});
