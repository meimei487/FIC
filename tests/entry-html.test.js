import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entryHtml = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

test("進入點掛載 src/main.js", () => {
  assert.match(entryHtml, /<script type="module" src="\/src\/main\.js"><\/script>/);
});

test("載入提示必須排在 module script 之前", () => {
  const bootIndex = entryHtml.indexOf('id="boot-loading"');
  const scriptIndex = entryHtml.indexOf("<script type=\"module\"");

  assert.notEqual(bootIndex, -1, "找不到 #boot-loading 區塊");
  assert.notEqual(scriptIndex, -1, "找不到 module script");

  // 單檔建置會把整個遊戲連同音訊內嵌成一個巨大的 inline script。提示若排在
  // 它後面，要等 23MB 全部下載完才會被解析到，那時遊戲也載好了，等於形同
  // 虛設。順序錯了遊戲照樣能跑，只是回到白畫面，所以只能靠這個測試守住。
  assert.ok(
    bootIndex < scriptIndex,
    "載入提示排到 module script 後面了——建置後會退回白畫面，玩家要等整個 23MB 下載完才看得到東西"
  );
});

test("載入提示掛在 #root 內，會被應用掛載時自動取代", () => {
  const rootIndex = entryHtml.indexOf('id="root"');
  const bootIndex = entryHtml.indexOf('id="boot-loading"');
  assert.ok(rootIndex !== -1 && rootIndex < bootIndex, "#boot-loading 必須在 #root 之內");
});
