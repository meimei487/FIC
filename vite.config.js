import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Vite hoists the built `<script type="module">` into `<head>`, which puts the
 * whole ~23MB inline bundle ahead of everything else in the document. That
 * silently breaks the `#boot-loading` screen: the browser would have to stream
 * the entire bundle before it even reaches the markup for the loading hint, so
 * the player stares at a blank page for the full download and only sees the
 * hint at the moment it becomes useless.
 *
 * This moves the tag back to the end of `<body>` while it is still a small
 * `src="..."` reference — vite-plugin-singlefile then inlines it in place, so
 * the loading screen ends up ahead of the payload where it belongs.
 *
 * Guarded by tests/entry-html.test.js and scripts/verify-build.mjs: the failure
 * mode is invisible (the game still runs, just behind a blank screen), so it
 * has to be checked rather than assumed.
 */
function keepScriptAtEndOfBody() {
  return {
    name: "keep-script-at-end-of-body",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const match = html.match(/\s*<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/);
        if (!match) return html;
        const withoutScript = html.replace(match[0], "");
        return withoutScript.replace("</body>", `  ${match[0].trim()}\n  </body>`);
      }
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [keepScriptAtEndOfBody(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
