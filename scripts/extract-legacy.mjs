import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/extract-legacy.mjs <bundled-html>");

const html = fs.readFileSync(input, "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const artText = html.match(/globalThis\.__FIRESTORM_ART__=(\{[\s\S]*?\});<\/script>/)?.[1];

if (!css || !artText) throw new Error("Could not extract legacy CSS or artwork");

const root = path.resolve(import.meta.dirname, "..");
fs.mkdirSync(path.join(root, "src", "generated"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "generated", "legacy.css"), css);
fs.writeFileSync(
  path.join(root, "src", "generated", "art.js"),
  `export const ART = ${artText};\n`
);

console.log("Extracted legacy CSS and artwork");
