#!/usr/bin/env node
/*
  Checks the built single-file HTML, not the source.

  The source-level test (tests/entry-html.test.js) only proves index.html is
  written correctly. It says nothing about what Vite does to it afterwards —
  and Vite hoists the built module script into <head>, which pushes the whole
  ~23MB payload ahead of the loading screen and silently disables it.

  That failure mode passes every unit test, produces no warning, and still
  ships a working game. The only symptom is a blank page for the entire
  download, which is invisible on a fast connection with a warm cache. So it
  has to be asserted against the actual artifact.

  Runs as part of `npm run build`; a failure exits non-zero and stops the
  build before a broken file can be copied into docs/.
*/
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const distPath = fileURLToPath(new URL("../dist/index.html", import.meta.url));

let html;
try {
  html = readFileSync(distPath, "utf8");
} catch {
  console.error("verify-build: 找不到 dist/index.html，請先執行 vite build");
  process.exit(1);
}

const failures = [];

// pack-portable.mjs may replace dist/index.html with a compact gzip-payload
// build when no real audio is embedded. That artifact has its own boot screen
// and a different structure, so it gets its own checks.
if (html.includes('id="boot-status"')) {
  if (!/const J="[A-Za-z0-9+/=]{500,}"/.test(html)) {
    console.error("verify-build 失敗：\n\n  ✗ 可攜版的遊戲酬載是空的或過小——請確認 pack-portable 抓到的是 module script\n");
    process.exit(1);
  }
  console.log(`verify-build ✓  可攜版（${(statSync(distPath).size / 1024).toFixed(1)}KB）`);
  process.exit(0);
}

const bootIndex = html.indexOf('id="boot-loading"');
const inlineIndex = html.indexOf("<script>");
const moduleIndex = html.indexOf('<script type="module"');

if (bootIndex === -1) {
  failures.push("建置產物裡找不到 #boot-loading，載入畫面不會出現");
}
if (moduleIndex === -1) {
  failures.push("建置產物裡找不到 module script");
}

if (bootIndex !== -1 && moduleIndex !== -1 && bootIndex > moduleIndex) {
  failures.push(
    `載入畫面排在 module script 後面（#boot-loading @${bootIndex.toLocaleString()}，`
    + `script @${moduleIndex.toLocaleString()}）。\n`
    + "    玩家會盯著整整 23MB 的空白畫面，直到下載完才看到載入提示——那時已經沒有意義了。\n"
    + "    通常是 vite.config.js 的 keep-script-at-end-of-body 外掛失效或被移除。"
  );
}

if (inlineIndex !== -1 && moduleIndex !== -1 && inlineIndex > moduleIndex) {
  failures.push("載入進度腳本排在 module script 後面，下載期間不會執行，畫面會整段靜止");
}

// The loading screen only helps if it arrives early in the stream. Anything
// past a megabyte means it is effectively buried.
const EARLY_BYTES = 1_000_000;
if (bootIndex > EARLY_BYTES) {
  failures.push(
    `載入畫面位於第 ${bootIndex.toLocaleString()} bytes，太靠後了`
    + `（應在前 ${EARLY_BYTES.toLocaleString()} bytes 內）`
  );
}

if (failures.length) {
  console.error("\nverify-build 失敗：\n");
  for (const failure of failures) console.error("  ✗ " + failure);
  console.error("");
  process.exit(1);
}

const size = statSync(distPath).size;
console.log(
  `verify-build ✓  載入畫面 @${bootIndex.toLocaleString()} bytes`
  + `（總大小 ${(size / 1024 / 1024).toFixed(1)}MB 的 ${(bootIndex / size * 100).toFixed(2)}%）`
);
