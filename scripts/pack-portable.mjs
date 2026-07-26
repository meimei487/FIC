import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

const outputPath = path.resolve(import.meta.dirname, "../dist/index.html");
const source = await fs.readFile(outputPath, "utf8");
// Must target the module script specifically. The document also contains a
// small classic <script> that drives the loading screen, and it appears first —
// matching "the first script tag" would package that instead of the game and
// happily emit a tiny, empty build.
const scriptMatch = source.match(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/i);
const styleMatch = source.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
const headMatch = source.match(/<head>([\s\S]*?)<script\b/i);

if (!scriptMatch || !styleMatch || !headMatch) {
  throw new Error("portable packer could not find the inlined module script, stylesheet, or document head");
}

const javascript = scriptMatch[1];
const stylesheet = styleMatch[1];
const javascriptPayload = gzipSync(javascript, { level: 9 }).toString("base64");
const stylesheetPayload = gzipSync(stylesheet, { level: 9 }).toString("base64");

const portable = `<!doctype html>
<html lang="zh-Hant">
  <head>${headMatch[1]}
    <style>
      html,body{width:100%;height:100%;margin:0;background:#070b0d;color:#dff;overflow:hidden}
      #root{width:100%;height:100%}.boot-screen{box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;padding:28px;text-align:center;font-family:system-ui,sans-serif;background:radial-gradient(circle at 50% 42%,#17383b,#070b0d 55%)}
      .boot-screen b{color:#6ff4ed;font-size:20px;letter-spacing:.14em}.boot-screen span{color:#91aaa9;font-size:12px}.boot-screen.error b{color:#ff777d}.boot-screen.error span{max-width:330px;line-height:1.7}
    </style>
  </head>
  <body>
    <div id="root"><div class="boot-screen" id="boot-status"><b>鋼鐵縱隊 // 系統載入中</b><span>正在展開離線戰場資料</span></div></div>
    <noscript><div class="boot-screen error"><b>瀏覽器未啟用 JavaScript</b><span>請允許 JavaScript 後重新開啟遊戲。</span></div></noscript>
    <script>
      (()=>{
        const J="${javascriptPayload}",C="${stylesheetPayload}",status=document.getElementById("boot-status");
        const fail=error=>{console.error(error);if(!status||!status.isConnected)return;status.classList.add("error");status.innerHTML="<b>戰場資料載入失敗</b><span>檔案可能未完整下載，或瀏覽器版本過舊。請重新下載後再開啟。</span>"};
        addEventListener("error",event=>fail(event.error||event.message));
        addEventListener("unhandledrejection",event=>fail(event.reason));
        const unpack=async payload=>{if(typeof DecompressionStream!=="function")throw new Error("DecompressionStream is unavailable");const bytes=Uint8Array.from(atob(payload),char=>char.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));return new TextDecoder().decode(await new Response(stream).arrayBuffer())};
        Promise.all([unpack(J),unpack(C)]).then(([javascript,stylesheet])=>{const style=document.createElement("style");style.textContent=stylesheet;document.head.append(style);const script=document.createElement("script");script.textContent=javascript+"\\n//# sourceURL=firestorm-iron-column.js";document.body.append(script)}).catch(fail);
      })();
    </script>
  </body>
</html>
`;

const maxPortableBytes = 160 * 1024;
const portableBytes = Buffer.byteLength(portable);
if (portableBytes > maxPortableBytes) {
  console.warn(
    `portable packer skipped: single-file HTML is ${portableBytes} bytes, over the ${maxPortableBytes} byte compact-portable budget ` +
    `(this happens once real audio assets are embedded via src/audio-assets.js). ` +
    `dist/index.html from the plain "vite build" step is still a complete, working, offline single-file game — it's just larger.`
  );
  process.exit(0);
}

const packedScript = portable.match(/const J="([A-Za-z0-9+/=]+)",C="([A-Za-z0-9+/=]+)"/);
if (!packedScript
  || gunzipSync(Buffer.from(packedScript[1], "base64")).toString() !== javascript
  || gunzipSync(Buffer.from(packedScript[2], "base64")).toString() !== stylesheet) {
  throw new Error("portable payload verification failed");
}

await fs.writeFile(outputPath, portable);
console.log(`portable single-file: ${portableBytes} bytes (limit ${maxPortableBytes})`);
