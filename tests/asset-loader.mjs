// Vite treats `.mp3`/`.wav`/`.ogg` imports as asset URLs at build time. Plain Node
// (used by `node --test`) has no such transform and throws ERR_UNKNOWN_FILE_EXTENSION.
// This loader hook stubs those imports out to an empty string so audio-assets.js can
// still be imported by the test runner; the actual audio pipeline is only exercised
// in the browser build.
const AUDIO_ASSET_PATTERN = /\.(mp3|wav|ogg)$/i;

export async function resolve(specifier, context, nextResolve) {
  if (AUDIO_ASSET_PATTERN.test(specifier)) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (AUDIO_ASSET_PATTERN.test(url)) {
    return { format: "module", source: "export default '';", shortCircuit: true };
  }
  return nextLoad(url, context);
}
