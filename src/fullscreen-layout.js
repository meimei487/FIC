import { HEIGHT, WIDTH } from "./config.js";

const MIN_CONTROL_DECK_PX = 54;
const MAX_CONTROL_DECK_RATIO = 0.24;
const MIN_APPROACH_RATIO = 0.07;
const MANEUVER_SENSITIVITY = 1.12;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function calculateFullscreenBattleLayout(viewportWidth, viewportHeight, enabled = true) {
  const width = finitePositive(viewportWidth);
  const height = finitePositive(viewportHeight);
  const inactive = Object.freeze({
    active: false,
    approachCss: 0,
    approachLogical: 0,
    controlDeckCss: 0,
    stageCss: height
  });
  if (!enabled || !width || !height || height <= width) return inactive;

  const baseStageCss = width * HEIGHT / WIDTH;
  const extraCss = height - baseStageCss;
  if (extraCss <= 0) return inactive;

  const minimumDeck = Math.max(MIN_CONTROL_DECK_PX, width * 0.145);
  const maximumDeck = Math.max(minimumDeck, width * MAX_CONTROL_DECK_RATIO);
  const controlDeckCss = Math.min(maximumDeck, Math.max(minimumDeck, extraCss * 0.5));
  const approachCss = extraCss - controlDeckCss;
  if (approachCss < width * MIN_APPROACH_RATIO) return inactive;

  return Object.freeze({
    active: true,
    approachCss,
    approachLogical: approachCss * WIDTH / width,
    controlDeckCss,
    stageCss: height - controlDeckCss
  });
}

export function relativeManeuverDelta(deltaCss, deckWidthCss, sensitivity = MANEUVER_SENSITIVITY) {
  const delta = Number(deltaCss);
  const width = finitePositive(deckWidthCss);
  const gain = Number(sensitivity);
  if (!Number.isFinite(delta) || !width || !Number.isFinite(gain)) return 0;
  return delta / width * WIDTH * Math.max(0, gain);
}

export function usesRelativePointerMovement(pointerType) {
  return String(pointerType || "").toLowerCase() !== "mouse";
}

/**
 * Names the messaging app whose in-app browser we're running inside, or null.
 *
 * These WebViews cost the player real screen area even when fullscreen works
 * fine — LINE's non-retracting header leaves roughly 47px less than Chrome on
 * the same phone, and since the shell derives its width from available
 * height, the whole game renders about 9% smaller outside of fullscreen.
 *
 * Fullscreen itself is NOT reliably blocked by these WebViews — LINE's has
 * been confirmed to support it (document.fullscreenEnabled is true there, and
 * tapping the button works). Whether a specific host actually allows it is a
 * separate, real-time check (see fullscreenViewState() in main.js); this
 * function only identifies which app the player is in, so the menu can point
 * them at the fullscreen button as the fix rather than assuming they need to
 * leave the app entirely.
 */
export function inAppBrowserName() {
  const ua = globalThis.navigator?.userAgent || "";
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/\bMessenger\b/i.test(ua)) return "Messenger";
  return null;
}
