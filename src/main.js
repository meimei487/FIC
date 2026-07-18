import "./styles.css";
import { AudioSystem } from "./audio.js";
import {
  COMMANDERS,
  RESEARCH,
  THREAT_PROTOCOLS,
  WIDTH,
  allResearchMax,
  maxDeploymentCost,
  researchCost,
  threatProtocolAvailable
} from "./config.js";
import { CombatEngine } from "./game/combat.js";
import { GameRenderer } from "./game/render.js";
import {
  calculateFullscreenBattleLayout,
  relativeManeuverDelta,
  usesRelativePointerMovement
} from "./fullscreen-layout.js";
import {
  applyResearchDelta,
  migrateLegacyRun,
  serializeRun
} from "./game/state.js";
import {
  addDailyProgress,
  claimDaily,
  claimDailyBonus,
  clearAllProfileData,
  ensureDaily,
  loadProfile,
  saveProfile
} from "./storage.js";
import {
  renderAbandonConfirmation,
  renderAchievements,
  renderArmory,
  renderBriefing,
  renderDataManagement,
  renderHud,
  renderMenu,
  renderPause,
  renderResult,
  renderResetProfileConfirmation,
  renderRestartConfirmation,
  renderRetreatConfirmation,
  renderSafeExit
} from "./ui.js";

const PROFILE_RESET_HOLD_MS = 3000;
const FULLSCREEN_REENTRY_ACTIONS = new Set([
  "new-run",
  "begin-battle",
  "resume",
  "unpause",
  "continue-after-boss",
  "return-battle"
]);
const FULLSCREEN_BATTLE_MODES = new Set(["playing", "safe-exit", "paused", "retreat-confirm"]);

class FirestormApp {
  constructor(root) {
    this.root = root;
    this.profile = loadProfile();
    ensureDaily(this.profile);
    if (!this.profile.checkpoint && this.profile.legacyRun) {
      this.profile.checkpoint = migrateLegacyRun(this.profile.legacyRun, this.profile);
      this.profile.legacyRun = null;
      saveProfile(this.profile);
    }
    this.mode = "menu";
    this.previousMode = "menu";
    this.achievementTab = "daily";
    this.pointerActive = false;
    this.canvasPointerId = null;
    this.canvasPointerRelative = false;
    this.canvasLastX = 0;
    this.maneuverPointerId = null;
    this.maneuverLastX = 0;
    this.keys = new Set();
    this.lastFrame = performance.now();
    this.lastHudUpdate = 0;
    this.toastTimer = null;
    this.profileResetTimer = null;
    this.profileResetButton = null;
    this.resultRun = null;

    this.mount();
    this.audio = new AudioSystem({
      enabled: this.profile.audio,
      musicVolume: this.profile.musicVolume,
      sfxVolume: this.profile.sfxVolume
    });
    this.renderer = new GameRenderer(this.canvas, this.profile);
    this.engine = new CombatEngine(this.profile, {
      audio: this.audio,
      onEvent: (type, payload) => this.handleEngineEvent(type, payload),
      onSave: () => this.refreshChrome()
    });
    this.bindEvents();
    this.renderMode();
    requestAnimationFrame((time) => this.frame(time));
  }

  mount() {
    this.root.innerHTML = `
      <main class="game-page">
        <section class="game-shell" aria-label="火線暴走：鋼鐵縱隊">
          <div class="battle-stage">
            <canvas class="game-canvas" aria-label="戰場"></canvas>
            <div class="hud-host"></div>
          </div>
          <div class="maneuver-deck" role="region" aria-label="全螢幕機動觸控區" aria-hidden="true">
            <div class="maneuver-guide" aria-hidden="true">
              <i>↔</i>
              <span><b>機動觸控區</b><small>左右相對拖曳</small></span>
            </div>
          </div>
          <div class="overlay-host"></div>
          <div class="toast" role="status" aria-live="polite"></div>
        </section>
        <aside class="desktop-note">
          <span>FIRESTORM // IRON COLUMN</span>
          <h2>對準戰線，打成一支鋼鐵洪流。</h2>
          <p>左右控制小隊直射，選擇武器與戰術門，穿越六種輪換戰區；在每次Boss擊破後進入研究整備，再以原機體繼續迎戰。</p>
          <div><b>1 → 36</b><small>從一支小隊，成長為完整鋼鐵縱隊</small></div>
        </aside>
      </main>`;
    this.canvas = this.root.querySelector("canvas");
    this.shell = this.root.querySelector(".game-shell");
    this.battleStage = this.root.querySelector(".battle-stage");
    this.maneuverDeck = this.root.querySelector(".maneuver-deck");
    this.hudHost = this.root.querySelector(".hud-host");
    this.overlayHost = this.root.querySelector(".overlay-host");
    this.toast = this.root.querySelector(".toast");
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled) return;
      if (button.dataset.action === "hold-reset-profile") {
        event.preventDefault();
        return;
      }
      if (FULLSCREEN_REENTRY_ACTIONS.has(button.dataset.action)) this.restoreFullscreenFromGesture();
      this.handleAction(button.dataset.action, button.dataset);
      this.audio.unlock();
    });

    this.root.addEventListener("input", (event) => {
      const slider = event.target.closest("[data-audio-channel]");
      if (!slider) return;
      this.setAudioLevel(slider.dataset.audioChannel, slider.value, false);
      if (this.profile.audio) this.audio.unlock();
      const output = slider.closest("label")?.querySelector("output");
      if (output) output.textContent = `${Math.round(Number(slider.value))}%`;
    });
    this.root.addEventListener("change", (event) => {
      const slider = event.target.closest("[data-audio-channel]");
      if (slider) this.setAudioLevel(slider.dataset.audioChannel, slider.value, true);
    });

    this.root.addEventListener("pointerdown", (event) => {
      const button = event.target.closest('[data-action="hold-reset-profile"]');
      if (!button || button.disabled || this.mode !== "reset-profile-confirm") return;
      event.preventDefault();
      try { button.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is optional. */ }
      this.beginProfileResetHold(button);
    });
    const cancelResetPointer = () => this.cancelProfileResetHold();
    this.root.addEventListener("pointerup", cancelResetPointer);
    this.root.addEventListener("pointercancel", cancelResetPointer);
    this.root.addEventListener("lostpointercapture", cancelResetPointer);
    this.root.addEventListener("contextmenu", (event) => {
      if (event.target.closest('[data-action="hold-reset-profile"]')) event.preventDefault();
    });
    this.root.addEventListener("keydown", (event) => {
      const button = event.target.closest?.('[data-action="hold-reset-profile"]');
      if (!button || event.repeat || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      this.beginProfileResetHold(button);
    });
    this.root.addEventListener("keyup", (event) => {
      if (event.target.closest?.('[data-action="hold-reset-profile"]') && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this.cancelProfileResetHold();
      }
    });
    const pointerMove = (event) => {
      if (!this.pointerActive || event.pointerId !== this.canvasPointerId || this.mode !== "playing") return;
      const rect = this.canvas.getBoundingClientRect();
      if (this.canvasPointerRelative) {
        const delta = relativeManeuverDelta(event.clientX - this.canvasLastX, rect.width);
        this.canvasLastX = event.clientX;
        if (delta && this.engine.run) this.engine.moveTo(this.engine.run.x + delta);
      } else {
        this.engine.moveTo((event.clientX - rect.left) / rect.width * WIDTH);
      }
    };
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.mode !== "playing" || this.pointerActive || this.maneuverPointerId !== null
        || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      this.restoreFullscreenFromGesture();
      this.pointerActive = true;
      this.canvasPointerId = event.pointerId;
      this.canvasPointerRelative = usesRelativePointerMovement(event.pointerType);
      this.canvasLastX = event.clientX;
      try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is optional. */ }
      if (!this.canvasPointerRelative) pointerMove(event);
      this.audio.unlock();
    });
    this.canvas.addEventListener("pointermove", pointerMove);
    const finishCanvasPointer = (event) => {
      if (event.pointerId !== this.canvasPointerId) return;
      this.pointerActive = false;
      this.canvasPointerId = null;
      this.canvasPointerRelative = false;
      this.canvasLastX = 0;
    };
    this.canvas.addEventListener("pointerup", finishCanvasPointer);
    this.canvas.addEventListener("pointercancel", finishCanvasPointer);
    this.canvas.addEventListener("lostpointercapture", finishCanvasPointer);

    const maneuverMove = (event) => {
      if (event.pointerId !== this.maneuverPointerId || this.mode !== "playing"
        || !this.shell.classList.contains("fullscreen-tactical-layout")) return;
      event.preventDefault();
      const rect = this.maneuverDeck.getBoundingClientRect();
      const delta = relativeManeuverDelta(event.clientX - this.maneuverLastX, rect.width);
      this.maneuverLastX = event.clientX;
      this.maneuverDeck.style.setProperty(
        "--maneuver-x",
        `${Math.max(0, Math.min(100, (event.clientX - rect.left) / Math.max(1, rect.width) * 100))}%`
      );
      if (delta && this.engine.run) this.engine.moveTo(this.engine.run.x + delta);
    };
    this.maneuverDeck.addEventListener("pointerdown", (event) => {
      if (this.mode !== "playing" || this.maneuverPointerId !== null || this.pointerActive
        || !this.shell.classList.contains("fullscreen-tactical-layout")
        || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      this.maneuverPointerId = event.pointerId;
      this.maneuverLastX = event.clientX;
      this.maneuverDeck.classList.add("active");
      const rect = this.maneuverDeck.getBoundingClientRect();
      this.maneuverDeck.style.setProperty(
        "--maneuver-x",
        `${Math.max(0, Math.min(100, (event.clientX - rect.left) / Math.max(1, rect.width) * 100))}%`
      );
      try { this.maneuverDeck.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is optional. */ }
      this.audio.unlock();
    });
    this.maneuverDeck.addEventListener("pointermove", maneuverMove);
    const finishManeuverPointer = (event) => {
      if (event.pointerId !== this.maneuverPointerId) return;
      this.resetManeuverInput();
    };
    this.maneuverDeck.addEventListener("pointerup", finishManeuverPointer);
    this.maneuverDeck.addEventListener("pointercancel", finishManeuverPointer);
    this.maneuverDeck.addEventListener("lostpointercapture", finishManeuverPointer);

    globalThis.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "a", "d"].includes(key)) event.preventDefault();
      this.keys.add(key);
      if (this.mode === "playing") this.audio.unlock();
      if (key === "escape" && this.mode === "playing") this.handleAction("pause", {});
    });
    globalThis.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    const fullscreenChanged = () => {
      this.updateFullscreenBattleLayout();
      if (["menu", "paused"].includes(this.mode)) this.renderMode();
      else this.refreshChrome();
      globalThis.requestAnimationFrame(() => this.updateFullscreenBattleLayout());
    };
    document.addEventListener("fullscreenchange", fullscreenChanged);
    document.addEventListener("webkitfullscreenchange", fullscreenChanged);
    globalThis.addEventListener("resize", () => this.updateFullscreenBattleLayout());
    globalThis.visualViewport?.addEventListener("resize", () => this.updateFullscreenBattleLayout());
    globalThis.addEventListener("blur", () => {
      this.cancelProfileResetHold();
      this.pointerActive = false;
      this.canvasPointerId = null;
      this.canvasPointerRelative = false;
      this.canvasLastX = 0;
      this.resetManeuverInput();
    });
  }

  frame(time) {
    const rawDelta = (time - this.lastFrame) / 1000;
    const delta = Math.min(0.05, rawDelta);
    this.lastFrame = time;
    this.renderer?.observeFrame(rawDelta);
    if (this.engine?.run && (this.mode === "playing" || this.mode === "safe-exit")) {
      const direction = (this.keys.has("arrowright") || this.keys.has("d") ? 1 : 0)
        - (this.keys.has("arrowleft") || this.keys.has("a") ? 1 : 0);
      if (direction) this.engine.moveTo(this.engine.run.x + direction * 220 * delta);
      this.engine.update(delta);
    }
    this.audio?.setGameState(this.engine?.run, this.mode);
    this.renderer?.render(this.engine?.run);
    if (time - this.lastHudUpdate > 90) {
      this.lastHudUpdate = time;
      this.refreshChrome();
    }
    requestAnimationFrame((next) => this.frame(next));
  }

  refreshChrome() {
    if (!this.engine) return;
    const showHud = ["playing", "safe-exit", "paused", "retreat-confirm"].includes(this.mode);
    this.hudHost.innerHTML = showHud ? renderHud(this.profile, this.engine.run) : "";
    if (this.mode === "safe-exit" && this.engine.run) {
      const safeExit = this.overlayHost.querySelector(".safe-exit");
      if (!safeExit) {
        this.overlayHost.innerHTML = renderSafeExit(this.profile, this.engine.run);
      } else {
        const seconds = Math.max(0, Math.ceil(this.engine.run.safeExitClock));
        const counter = safeExit.querySelector(".safe-ring span");
        const warning = safeExit.querySelector(".safe-warning");
        if (counter) counter.textContent = String(seconds);
        if (warning) warning.textContent = `${seconds}秒後研究整備窗口關閉，仍可暫停但不能正常退出`;
      }
    }
  }

  renderMode() {
    if (!this.engine) return;
    this.shell.dataset.mode = this.mode;
    this.updateFullscreenBattleLayout();
    let html = "";
    if (this.mode === "menu") html = renderMenu(this.profile, this.fullscreenViewState());
    else if (this.mode === "briefing") html = renderBriefing();
    else if (this.mode === "safe-exit") html = renderSafeExit(this.profile, this.engine.run);
    else if (this.mode === "armory") html = renderArmory(this.profile);
    else if (this.mode === "research") html = renderArmory(this.profile, { checkpointMode: true });
    else if (this.mode === "achievements") html = renderAchievements(this.profile, this.achievementTab);
    else if (this.mode === "data-management") html = renderDataManagement(this.profile);
    else if (this.mode === "reset-profile-confirm") html = renderResetProfileConfirmation();
    else if (this.mode === "paused") html = renderPause(this.profile, this.engine.run, this.fullscreenViewState());
    else if (this.mode === "retreat-confirm") html = renderRetreatConfirmation(this.profile);
    else if (this.mode === "abandon-confirm") html = renderAbandonConfirmation();
    else if (this.mode === "restart-confirm") html = renderRestartConfirmation();
    else if (this.mode === "result") html = renderResult(this.profile, this.resultRun || this.engine.run);
    this.overlayHost.innerHTML = html;
    this.refreshChrome();
  }

  setMode(mode) {
    if (mode !== "reset-profile-confirm") this.cancelProfileResetHold();
    if (mode !== "playing") {
      this.pointerActive = false;
      this.canvasPointerId = null;
      this.canvasPointerRelative = false;
      this.canvasLastX = 0;
      this.resetManeuverInput();
    }
    this.previousMode = this.mode;
    this.mode = mode;
    this.audio?.setGameState(this.engine?.run, this.mode);
    this.renderMode();
  }

  handleEngineEvent(type, payload = {}) {
    if (type === "safe-exit") this.setMode("safe-exit");
    else if (type === "safe-exit-closed") this.setMode("playing");
    else if (type === "research-checkpoint") this.setMode("research");
    else if (type === "result") {
      this.resultRun = payload.run;
      this.setMode("result");
    } else if (type === "run-abandoned") this.setMode("menu");
    else if (type === "achievement") this.showToast("戰場成就達成；抵達下一個Boss檢查點後永久保存");
  }

  handleAction(action, data) {
    if (action === "new-run") this.newRun();
    else if (action === "begin-battle") this.beginBattle();
    else if (action === "resume") this.resumeCheckpoint(false);
    else if (action === "checkpoint-research") this.resumeCheckpoint(true);
    else if (action === "confirm-restart") this.setMode("restart-confirm");
    else if (action === "cancel-restart") this.setMode("menu");
    else if (action === "restart-run") this.restartRun();
    else if (action === "armory") this.openArmory();
    else if (action === "achievements") this.setMode("achievements");
    else if (action === "data-management") this.setMode("data-management");
    else if (action === "request-profile-reset") this.setMode("reset-profile-confirm");
    else if (action === "cancel-profile-reset") this.setMode("data-management");
    else if (action === "menu") this.setMode("menu");
    else if (action === "toggle-audio") this.toggleAudio();
    else if (action === "toggle-fullscreen") this.toggleFullscreen();
    else if (action === "pause") this.pause();
    else if (action === "unpause") this.unpause();
    else if (action === "confirm-retreat") this.setMode("retreat-confirm");
    else if (action === "cancel-retreat") this.setMode("paused");
    else if (action === "force-retreat") this.forceRetreat();
    else if (action === "enter-research") this.engine.enterResearchCheckpoint();
    else if (action === "continue-after-boss") {
      this.engine.continueAfterBoss();
      this.setMode("playing");
    } else if (action === "return-battle") this.returnToBattle();
    else if (action === "confirm-abandon") this.setMode("abandon-confirm");
    else if (action === "cancel-abandon") this.setMode("research");
    else if (action === "abandon-run") this.engine.abandonCheckpoint();
    else if (action === "commander") this.handleCommander(data.commander);
    else if (action === "select-protocol") this.selectProtocol(data.protocol);
    else if (action === "toggle-max-deployment") this.toggleMaxDeployment();
    else if (action === "purchase-cycle-max") this.purchaseCycleMax();
    else if (action === "cancel-cycle-max") this.cancelCycleMax();
    else if (action === "buy-research") this.buyResearch(data.research);
    else if (action === "support") this.useSupport(data.support);
    else if (action === "commander-skill") this.engine.useCommanderSkill();
    else if (action === "achievement-tab") {
      this.achievementTab = data.tab;
      this.renderMode();
    } else if (action === "claim-daily") this.claimDaily(data.daily);
    else if (action === "claim-daily-bonus") this.claimDailyBonus();
  }

  newRun() {
    if (this.profile.checkpoint) {
      this.showToast("已有作戰檢查點；請先接續或結束目前戰線");
      return;
    }
    this.resultRun = null;
    const protocolId = this.profile.deployment?.protocol || "standard";
    const maxDeployment = Boolean(this.profile.deployment?.max);
    const protocol = THREAT_PROTOCOLS[protocolId] || THREAT_PROTOCOLS.standard;
    const totalCost = protocol.cost + (maxDeployment ? maxDeploymentCost(this.profile.selected, 0) : 0);
    const run = this.engine.start(this.profile.selected, { protocolId, maxDeployment });
    if (!run) {
      this.showToast(`軍備點不足，出擊還需要 ◆${Math.max(0, totalCost - this.profile.credits)}`);
      return;
    }
    this.profile.deployment.max = false;
    saveProfile(this.profile);
    if (this.profile.tutorialSeen) this.setMode("playing");
    else {
      this.engine.pause();
      this.setMode("briefing");
    }
  }

  restartRun() {
    if (this.profile.checkpoint) this.engine.abandonCheckpoint();
    this.resultRun = null;
    this.newRun();
  }

  beginBattle() {
    this.profile.tutorialSeen = true;
    saveProfile(this.profile);
    this.engine.unpause();
    this.setMode("playing");
  }

  resumeCheckpoint(researchOnly) {
    if (!this.profile.checkpoint) return;
    this.engine.resume(this.profile.checkpoint);
    if (researchOnly) {
      this.engine.pause();
      this.setMode("research");
    } else {
      this.engine.lockMaxDeployment();
      this.setMode("playing");
    }
  }

  openArmory() {
    if (this.profile.checkpoint) this.resumeCheckpoint(true);
    else this.setMode("armory");
  }

  pause() {
    if (this.mode !== "playing") return;
    this.engine.pause();
    this.setMode("paused");
  }

  unpause() {
    this.engine.unpause();
    this.setMode("playing");
  }

  forceRetreat() {
    const restored = this.engine.forceRetreat();
    if (restored && this.profile.checkpoint) this.setMode("research");
    else this.setMode("menu");
  }

  returnToBattle() {
    if (!this.profile.checkpoint) return;
    this.engine.resume(this.profile.checkpoint, "research");
    this.engine.lockMaxDeployment();
    this.setMode("playing");
  }

  fullscreenViewState() {
    const target = document.documentElement;
    return {
      fullscreenSupported: Boolean(target?.requestFullscreen || target?.webkitRequestFullscreen),
      fullscreenActive: Boolean(document.fullscreenElement || document.webkitFullscreenElement)
    };
  }

  updateFullscreenBattleLayout() {
    if (!this.shell || !this.maneuverDeck) return null;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
    const enabled = this.fullscreenViewState().fullscreenActive
      && FULLSCREEN_BATTLE_MODES.has(this.mode)
      && Boolean(this.engine?.run);
    const layout = calculateFullscreenBattleLayout(viewportWidth, viewportHeight, enabled);
    this.shell.classList.toggle("fullscreen-tactical-layout", layout.active);
    this.shell.style.setProperty("--approach-height", `${layout.approachCss.toFixed(3)}px`);
    this.shell.style.setProperty("--control-deck-height", `${layout.controlDeckCss.toFixed(3)}px`);
    this.shell.dataset.fullscreenBattle = layout.active ? "extended" : "standard";
    const operable = layout.active && this.mode === "playing";
    this.maneuverDeck.setAttribute("aria-hidden", String(!operable));
    this.renderer?.setApproachHeight(layout.approachLogical);
    if (!operable) this.resetManeuverInput();
    return layout;
  }

  resetManeuverInput() {
    this.maneuverPointerId = null;
    this.maneuverDeck?.classList.remove("active");
    this.maneuverDeck?.style.setProperty("--maneuver-x", "50%");
  }

  restoreFullscreenFromGesture() {
    if (!this.profile.fullscreenPreferred || this.fullscreenViewState().fullscreenActive) return;
    void this.enterFullscreen({ remember: false, silent: true });
  }

  async enterFullscreen({ remember = true, silent = false } = {}) {
    const target = document.documentElement;
    const standardRequest = target?.requestFullscreen;
    const webkitRequest = target?.webkitRequestFullscreen;
    if (!standardRequest && !webkitRequest) {
      if (remember) {
        this.profile.fullscreenPreferred = false;
        saveProfile(this.profile);
      }
      if (!silent) this.showToast("目前瀏覽器不支援網頁全螢幕；仍可在戰場相對拖曳操作");
      return false;
    }
    if (remember) {
      this.profile.fullscreenPreferred = true;
      saveProfile(this.profile);
    }
    if (this.fullscreenViewState().fullscreenActive) return true;
    try {
      if (standardRequest) await standardRequest.call(target, { navigationUI: "hide" });
      else await webkitRequest.call(target);
      try { await globalThis.screen?.orientation?.lock?.("portrait"); } catch { /* Locking is browser-dependent. */ }
      return true;
    } catch {
      if (!silent) this.showToast("瀏覽器未允許全螢幕；請直接點擊按鈕後再試一次");
      return false;
    } finally {
      if (["menu", "paused"].includes(this.mode)) this.renderMode();
    }
  }

  async exitFullscreen() {
    this.profile.fullscreenPreferred = false;
    saveProfile(this.profile);
    const standardExit = document.exitFullscreen;
    const webkitExit = document.webkitExitFullscreen;
    try {
      if (standardExit) await standardExit.call(document);
      else if (webkitExit) await webkitExit.call(document);
    } catch {
      this.showToast("瀏覽器暫時無法退出全螢幕");
    } finally {
      try { globalThis.screen?.orientation?.unlock?.(); } catch { /* Optional API. */ }
      if (["menu", "paused"].includes(this.mode)) this.renderMode();
    }
  }

  toggleFullscreen() {
    if (this.fullscreenViewState().fullscreenActive) void this.exitFullscreen();
    else void this.enterFullscreen();
  }

  toggleAudio() {
    this.profile.audio = !this.profile.audio;
    this.audio.setEnabled(this.profile.audio);
    saveProfile(this.profile);
    this.renderMode();
  }

  setAudioLevel(channel, value, persist = true) {
    const level = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (channel === "music") this.profile.musicVolume = level;
    else if (channel === "sfx") this.profile.sfxVolume = level;
    else return;
    this.audio.setMix(this.profile.musicVolume, this.profile.sfxVolume);
    if (persist) saveProfile(this.profile);
  }

  handleCommander(id) {
    if (this.profile.checkpoint || !COMMANDERS[id]) return;
    const commander = COMMANDERS[id];
    if (!this.profile.unlocked.includes(id)) {
      if (this.profile.credits < commander.price) {
        this.showToast(`軍備點不足，還需要 ◆${commander.price - this.profile.credits}`);
        return;
      }
      this.profile.credits -= commander.price;
      this.profile.unlocked.push(id);
      this.showToast(`${commander.name}已完成招募`);
    }
    this.profile.selected = id;
    saveProfile(this.profile);
    this.renderMode();
  }

  selectProtocol(id) {
    if (this.profile.checkpoint || !threatProtocolAvailable(this.profile, id)) return;
    this.profile.deployment ||= { protocol: "standard", max: false };
    this.profile.deployment.protocol = id;
    saveProfile(this.profile);
    this.showToast(`${THREAT_PROTOCOLS[id].name}已選擇；出擊時才扣款`);
    this.renderMode();
  }

  toggleMaxDeployment() {
    if (this.profile.checkpoint || !allResearchMax(this.profile)) return;
    this.profile.deployment ||= { protocol: "standard", max: false };
    this.profile.deployment.max = !this.profile.deployment.max;
    saveProfile(this.profile);
    this.showToast(this.profile.deployment.max ? "滿級出擊已加入；出擊時才扣款" : "已改回常規裝備");
    this.renderMode();
  }

  purchaseCycleMax() {
    const run = this.engine.run;
    if (!run || !allResearchMax(this.profile)) return;
    const cost = maxDeploymentCost(run.commander, run.bossKills);
    if (this.profile.credits < cost) {
      this.showToast(`軍備點不足，還需要 ◆${cost - this.profile.credits}`);
      return;
    }
    const paid = this.engine.purchaseMaxDeployment();
    if (!paid) return;
    this.showToast(`極限軍備合約已預約 ◆${paid}；返回戰場前可取消`);
    this.renderMode();
  }

  cancelCycleMax() {
    const refunded = this.engine.cancelMaxDeployment();
    if (!refunded) return;
    this.showToast(`滿級整備已取消；退還 ◆${refunded}`);
    this.renderMode();
  }

  buyResearch(id) {
    if (!RESEARCH[id]) return;
    const researchView = this.overlayHost.querySelector(".armory");
    const previousScroll = researchView?.scrollTop || 0;
    const current = this.profile.research[id] || 0;
    if (current >= 9) return;
    const cost = researchCost(id, current);
    if (this.profile.credits < cost) {
      this.showToast(`軍備點不足，還需要 ◆${cost - this.profile.credits}`);
      return;
    }
    this.profile.credits -= cost;
    this.profile.research[id] = current + 1;
    addDailyProgress(this.profile, "research", 1);
    if (this.mode === "research" && this.engine.run) {
      applyResearchDelta(this.engine.run, id, 1, this.profile);
      this.profile.checkpoint = serializeRun(this.engine.run);
    }
    saveProfile(this.profile);
    this.showToast(`${RESEARCH[id].name}升至 LV.${current + 1}`);
    this.renderMode();
    const restoredView = this.overlayHost.querySelector(".armory");
    if (restoredView) restoredView.scrollTop = previousScroll;
    this.overlayHost.querySelector(`[data-research="${id}"]`)?.focus({ preventScroll: true });
  }

  useSupport(id) {
    if (this.engine.useSupport(id)) this.refreshChrome();
  }

  claimDaily(id) {
    const reward = claimDaily(this.profile, id);
    if (reward) {
      saveProfile(this.profile);
      this.showToast(`每日任務獎勵已入庫 ◆${reward}`);
      this.renderMode();
    }
  }

  claimDailyBonus() {
    const reward = claimDailyBonus(this.profile);
    if (reward) {
      saveProfile(this.profile);
      this.showToast(`每日全勤補給已入庫 ◆${reward}`);
      this.renderMode();
    }
  }

  beginProfileResetHold(button) {
    if (this.mode !== "reset-profile-confirm" || this.profileResetTimer) return;
    this.profileResetButton = button;
    button.classList.add("holding");
    button.setAttribute("aria-busy", "true");
    const help = button.querySelector("small");
    if (help) help.textContent = "保持按住・放開立即取消";
    this.profileResetTimer = globalThis.setTimeout(() => this.completeProfileReset(), PROFILE_RESET_HOLD_MS);
  }

  cancelProfileResetHold() {
    if (this.profileResetTimer) globalThis.clearTimeout(this.profileResetTimer);
    this.profileResetTimer = null;
    const button = this.profileResetButton;
    this.profileResetButton = null;
    if (!button?.isConnected) return;
    button.classList.remove("holding");
    button.removeAttribute("aria-busy");
    const help = button.querySelector("small");
    if (help) help.textContent = "持續按住直到進度條填滿";
  }

  completeProfileReset() {
    this.profileResetTimer = null;
    const button = this.profileResetButton;
    this.profileResetButton = null;
    if (button?.isConnected) {
      button.classList.remove("holding");
      button.classList.add("completed");
      button.removeAttribute("aria-busy");
      const label = button.querySelector("b");
      if (label) label.textContent = "進度已刪除・重新啟動";
    }
    this.engine?.pause();
    this.audio?.setEnabled(false);
    clearAllProfileData();
    globalThis.location.reload();
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.add("show");
    this.toastTimer = setTimeout(() => this.toast.classList.remove("show"), 2400);
  }
}

const app = new FirestormApp(document.getElementById("root"));
if (import.meta.env.DEV) globalThis.__FIRESTORM__ = app;
