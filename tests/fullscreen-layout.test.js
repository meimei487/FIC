import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { HEIGHT, WIDTH } from "../src/config.js";
import {
  calculateFullscreenBattleLayout,
  relativeManeuverDelta,
  usesRelativePointerMovement
} from "../src/fullscreen-layout.js";
import { GameRenderer } from "../src/game/render.js";

test("390×844直式全螢幕平均利用上下多餘空間", () => {
  const layout = calculateFullscreenBattleLayout(390, 844, true);
  assert.equal(layout.active, true);
  assert.ok(layout.approachCss > 74 && layout.approachCss < 77);
  assert.ok(layout.controlDeckCss > 74 && layout.controlDeckCss < 77);
  assert.ok(Math.abs(layout.stageCss - (390 * HEIGHT / WIDTH + layout.approachCss)) < 0.001);
});

test("非全螢幕、橫式與過短視窗維持原戰場布局", () => {
  assert.equal(calculateFullscreenBattleLayout(390, 844, false).active, false);
  assert.equal(calculateFullscreenBattleLayout(844, 390, true).active, false);
  assert.equal(calculateFullscreenBattleLayout(390, 720, true).active, false);
});

test("超長螢幕限制操控台高度並把其餘空間交給接近戰線", () => {
  const layout = calculateFullscreenBattleLayout(390, 1000, true);
  assert.equal(layout.active, true);
  assert.ok(layout.controlDeckCss <= 390 * 0.24 + 0.001);
  assert.ok(layout.approachCss > layout.controlDeckCss);
});

test("下方機動區使用相對位移且不依起始觸點瞬移", () => {
  assert.equal(relativeManeuverDelta(0, 390), 0);
  assert.ok(Math.abs(relativeManeuverDelta(39, 390) - 43.68) < 0.001);
  assert.ok(Math.abs(relativeManeuverDelta(-39, 390) + 43.68) < 0.001);
  assert.equal(relativeManeuverDelta(20, 0), 0);
});

test("手機與觸控筆統一相對拖曳，只有滑鼠保留直接定位", () => {
  assert.equal(usesRelativePointerMovement("touch"), true);
  assert.equal(usesRelativePointerMovement("pen"), true);
  assert.equal(usesRelativePointerMovement(""), true);
  assert.equal(usesRelativePointerMovement("mouse"), false);
  assert.equal(usesRelativePointerMovement("MOUSE"), false);
});

test("渲染器延伸高度可逆且不改變390×693核心戰場", () => {
  const renderer = Object.create(GameRenderer.prototype);
  renderer.canvas = { width: 0, height: 0 };
  renderer.approachHeight = 0;
  renderer.viewHeight = HEIGHT;

  assert.equal(renderer.setApproachHeight(75.5), true);
  assert.equal(renderer.viewHeight, HEIGHT + 75.5);
  assert.equal(renderer.canvas.width, WIDTH);
  assert.equal(renderer.canvas.height, Math.round(HEIGHT + 75.5));
  assert.equal(renderer.setApproachHeight(75.5), false);

  assert.equal(renderer.setApproachHeight(0), true);
  assert.equal(renderer.viewHeight, HEIGHT);
  assert.equal(renderer.canvas.height, HEIGHT);
});

test("機動觸控區只保留單一實線分界並以中央圖示提示拖曳", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /\.maneuver-deck::before/);
  assert.match(styles, /\.maneuver-deck\s*\{[\s\S]*?border-top:\s*1px solid/);
  assert.match(styles, /\.maneuver-guide\s*\{[\s\S]*?justify-content:\s*center/);
});

test("首頁七機展示採1-2-4楔形隊列，不再留下中央尾兵", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /img:nth-of-type\(4\),[\s\S]*?img:nth-of-type\(7\)\s*\{[\s\S]*?top:\s*143px/);
  assert.match(styles, /img:nth-of-type\(7\)\s*\{[\s\S]*?right:\s*4%;[\s\S]*?left:\s*auto/);
});

import { inAppBrowserName } from "../src/fullscreen-layout.js";

function withUserAgent(ua, run) {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: ua },
    configurable: true
  });
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
}

test("認得出 LINE 的內建瀏覽器", () => {
  const ua = "Mozilla/5.0 (Linux; Android 12; GM1910 Build/SKQ1.211113.001; wv) "
    + "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.46 "
    + "Mobile Safari/537.36 Line/26.11.0/IAB";
  assert.equal(withUserAgent(ua, inAppBrowserName), "LINE");
});

test("認得出其他常見的內建瀏覽器", () => {
  assert.equal(withUserAgent("... [FBAN/FBIOS;FBAV/450.0]", inAppBrowserName), "Facebook");
  assert.equal(withUserAgent("... Instagram 300.0.0.0 Android", inAppBrowserName), "Instagram");
});

test("一般瀏覽器不會被誤判", () => {
  const chrome = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(withUserAgent(chrome, inAppBrowserName), null);
  assert.equal(withUserAgent(safari, inAppBrowserName), null);
});

test("沒有 navigator 時不會炸掉", () => {
  assert.equal(withUserAgent(undefined, inAppBrowserName), null);
});

import { renderMenu } from "../src/ui.js";
import { createProfile } from "../src/storage.js";

test("內建瀏覽器且未全螢幕時，提示玩家按全螢幕", () => {
  const html = renderMenu(createProfile(), { inAppBrowser: "LINE", fullscreenActive: false });
  assert.match(html, /class="inapp-note"/);
  assert.match(html, /LINE內建瀏覽器/);
  assert.match(html, /點上方「全螢幕」/);
});

test("已經在全螢幕時不再顯示提示——問題已經解決了", () => {
  const html = renderMenu(createProfile(), { inAppBrowser: "LINE", fullscreenActive: true });
  assert.doesNotMatch(html, /class="inapp-note"/);
});

test("一般瀏覽器不顯示提示", () => {
  const html = renderMenu(createProfile(), { inAppBrowser: null, fullscreenActive: false });
  assert.doesNotMatch(html, /class="inapp-note"/);
});

test("提示不再宣稱內建瀏覽器無法全螢幕", () => {
  const html = renderMenu(createProfile(), { inAppBrowser: "LINE", fullscreenActive: false });
  assert.doesNotMatch(html, /無法全螢幕|不支援全螢幕/);
});
