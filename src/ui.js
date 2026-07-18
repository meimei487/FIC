import {
  BATTLE_ACHIEVEMENTS,
  BOSS_CHASSIS,
  BUILD_VERSION,
  COMMANDERS,
  COMMANDER_ORDER,
  DAILY_POOL,
  FURY_COMBO_TARGET,
  RESEARCH,
  RESEARCH_ORDER,
  SAFE_EXIT_SECONDS,
  SUPPORTS,
  TACTICAL_MISSIONS,
  THREAT_PROTOCOLS,
  THREAT_PROTOCOL_ORDER,
  WEAPONS,
  WEAPON_MAX_LEVEL,
  allResearchMax,
  armorCap,
  maxDeploymentCost,
  researchCost,
  supportCost,
  threatProtocolAvailable,
  zoneForRun
} from "./config.js";
import { ART } from "./generated/art.js";
import { commanderBattleCount, commanderMilestoneCount, commanderSkillCount, researchMedalCount } from "./storage.js";
import { effectiveArmor, effectiveWeaponLevel, protocolForRun } from "./game/state.js";

function number(value) {
  return Math.floor(value || 0).toLocaleString();
}

function selectedCommander(profile, run) {
  return COMMANDERS[run?.commander || profile.selected] || COMMANDERS.viper;
}

function actionButton(action, text, className = "primary", extra = "") {
  return `<button class="${className}" data-action="${action}" ${extra}>${text}</button>`;
}

export function renderMenu(profile, { fullscreenSupported = true, fullscreenActive = false } = {}) {
  const commander = selectedCommander(profile);
  const hasCheckpoint = Boolean(profile.checkpoint);
  const hasDeployed = Boolean(profile.tutorialSeen) || (profile.stats?.totalRuns || 0) > 0;
  const deploymentLabel = hasDeployed ? "▶ 開始新一輪" : "▶ 菜鳥出擊";
  const protocol = THREAT_PROTOCOLS[profile.deployment?.protocol] || THREAT_PROTOCOLS.standard;
  const queuedMax = Boolean(profile.deployment?.max && allResearchMax(profile));
  const queuedCost = protocol.cost + (queuedMax ? maxDeploymentCost(profile.selected, 0) : 0);
  const squadImages = Array.from({ length: 7 }, (_, index) => `<img src="${ART[index === 0 ? commander.art : "viper"]}" alt="" />`).join("");
  return `
    <div class="menu overlay${hasCheckpoint ? " has-checkpoint" : ""}">
      <div class="eyebrow">FIRESTORM // IRON COLUMN // V${BUILD_VERSION}</div>
      <h1>火線暴走<em>鋼鐵縱隊</em></h1>
      <p class="tagline">直式小隊射擊・每一次選擇都改變火力</p>
      <div class="squad-hero" style="--hero:${commander.color}">
        <i></i><i></i><i></i>
        ${squadImages}
        <div><span>${commander.callsign}</span><b>${commander.name}</b><small>${commander.role}</small></div>
      </div>
      ${hasCheckpoint
        ? `<div class="menu-resume-row">
            ${actionButton("resume", "↻ 再續光榮")}
            ${actionButton("checkpoint-research", "研究整備", "secondary")}
          </div>
          ${actionButton("confirm-restart", "放棄戰線重新出擊", "danger ghost menu-restart")}`
        : `${actionButton(
          "new-run",
          `<b>${deploymentLabel}</b>${hasDeployed ? `<small class="new-run-note">不會清除研究、指揮官與成就</small>` : ""}`,
          "primary menu-deploy-button"
        )}`}
      <div class="menu-actions">
        <button data-action="armory">指揮中心</button>
        <button data-action="achievements">戰績成就</button>
        <button data-action="toggle-audio">${profile.audio ? "聲音 ON" : "聲音 OFF"}</button>
        ${fullscreenSupported
          ? `<button class="menu-fullscreen-toggle" data-action="toggle-fullscreen" aria-pressed="${fullscreenActive}">${fullscreenActive ? "退出全螢幕" : "全螢幕"}</button>`
          : ""}
        <strong>◆ ${number(profile.credits)}</strong>
      </div>
      <div class="audio-mixer ${profile.audio ? "" : "muted"}">
        <label><span>音樂</span><input type="range" min="0" max="100" step="1" value="${profile.musicVolume}" data-audio-channel="music" aria-label="音樂音量"><output>${profile.musicVolume}%</output></label>
        <label><span>音效</span><input type="range" min="0" max="100" step="1" value="${profile.sfxVolume}" data-audio-channel="sfx" aria-label="音效音量"><output>${profile.sfxVolume}%</output></label>
        <small>原創軍事電子配樂・槍聲獨立限量</small>
      </div>
      <div class="menu-meta">
        <div class="best">最高戰績 <b>${number(profile.best)}</b></div>
        <button class="data-management-link" data-action="data-management">資料管理</button>
      </div>
      ${!hasCheckpoint && allResearchMax(profile) ? `<p class="deployment-note" style="--contract:${protocol.color}">${protocol.name}${queuedMax ? "＋滿級出擊" : ""}｜出擊費 ◆${number(queuedCost)}</p>` : ""}
      ${hasCheckpoint ? `<p class="checkpoint-note">作戰進行中｜${commander.name}已鎖定，結束本輪前不能更換</p>` : ""}
      <p class="original-note">原創縱向小隊射擊・六大戰區・三型機甲Boss</p>
    </div>`;
}

export function renderDataManagement(profile) {
  const research = researchMedalCount(profile);
  const checkpoint = profile.checkpoint ? `Boss ${profile.checkpoint.bossKills || 0} 後檢查點` : "目前沒有檢查點";
  return `
    <div class="data-management overlay">
      <div class="eyebrow">LOCAL SAVE CONTROL</div>
      <h2>資料管理</h2>
      <p class="data-intro">進度儲存在目前瀏覽器中；開始新一輪不會清除以下資料。</p>
      <div class="save-summary">
        <div><small>軍備點</small><b>◆ ${number(profile.credits)}</b></div>
        <div><small>最高戰績</small><b>${number(profile.best)}</b></div>
        <div><small>指揮官</small><b>${profile.unlocked.length}/10</b></div>
        <div><small>永久研究</small><b>${research}/81</b></div>
      </div>
      <div class="save-status">
        <span><small>作戰戰線</small><b>${checkpoint}</b></span>
        <span><small>永久成就</small><b>${profile.achievements.length} 項</b></span>
      </div>
      <div class="data-safety-note"><b>一般重新出擊不會重置存檔</b><span>只有下方的永久刪除流程能讓遊戲回到首次出擊狀態。</span></div>
      ${actionButton("request-profile-reset", "刪除全部進度", "danger data-delete")}
      ${actionButton("menu", "返回集結區", "ghost")}
    </div>`;
}

export function renderResetProfileConfirmation() {
  return `
    <div class="reset-profile-confirm overlay" role="dialog" aria-modal="true" aria-labelledby="reset-profile-title">
      <div class="reset-profile-mark">!</div>
      <div class="eyebrow">PERMANENT DATA ERASURE</div>
      <h2 id="reset-profile-title">永久刪除全部進度？</h2>
      <p>這不是放棄本輪，而是讓整個遊戲回到第一次開啟的狀態。</p>
      <div class="wipe-list">
        <div><i>◆</i><span><b>永久養成</b><small>軍備點、指揮官與81級研究</small></span></div>
        <div><i>★</i><span><b>所有戰績</b><small>成就、每日進度、最高分與統計</small></span></div>
        <div><i>↻</i><span><b>全部戰線</b><small>Boss檢查點、設定與舊版遷移資料</small></span></div>
      </div>
      <div class="irreversible-warning"><b>刪除後無法復原</b><span>放開按鈕會立即取消，不會誤刪。</span></div>
      <button class="hold-reset" data-action="hold-reset-profile" aria-describedby="hold-reset-help">
        <i aria-hidden="true"></i><span><b>按住 3 秒永久刪除</b><small id="hold-reset-help">持續按住直到進度條填滿</small></span>
      </button>
      ${actionButton("cancel-profile-reset", "保留存檔並返回", "ghost")}
    </div>`;
}

export function renderBriefing() {
  return `
    <div class="briefing overlay">
      <div class="eyebrow">COMMANDER BRIEFING</div>
      <h2>四個動作，掌控整條戰線</h2>
      <div class="briefing-grid">
        <div><i>↔</i><b>左右對準</b><span>拖曳或按方向鍵／A、D移動；武器自動向正前方直射</span></div>
        <div><i>×1.2</i><b>選擇戰術門</b><span>人數、武器、火力與裝甲立即生效</span></div>
        <div><i>▲</i><b>保住隊形</b><span>敵彈與衝撞會先消耗裝甲，再損失小隊成員</span></div>
        <div><i>☄</i><b>支援與技能</b><span>三種支援每輪各一次；右下充滿後施放指揮官技能</span></div>
      </div>
      ${actionButton("begin-battle", "明白，開始推進")}
    </div>`;
}

export function renderHud(profile, run) {
  if (!run) return "";
  const zone = zoneForRun(run);
  const weapon = WEAPONS[run.weapon.id];
  const commander = COMMANDERS[run.commander];
  const mission = TACTICAL_MISSIONS[run.mission];
  const boss = run.enemies.find((enemy) => enemy.type === "boss" && enemy.hp > 0);
  const bossMeta = BOSS_CHASSIS[boss?.chassis] || BOSS_CHASSIS.babel;
  const protocol = protocolForRun(run);
  const cap = armorCap(profile.research);
  const armor = effectiveArmor(run);
  const armorText = armor >= cap ? "MAX" : `${Math.max(0, armor)}/${cap}`;
  const effectiveLevel = effectiveWeaponLevel(run);
  const weaponLevel = effectiveLevel >= WEAPON_MAX_LEVEL ? `MAX${run.maxDeploymentActive ? "＊" : ""}` : effectiveLevel;
  const furyStatus = run.fury > 0
    ? "狂熱發動"
    : run.furyLock > 0
      ? `冷卻 ${Math.ceil(run.furyLock)}s`
      : `狂熱 ${Math.min(FURY_COMBO_TARGET, run.furyChain)}/${FURY_COMBO_TARGET}`;
  const furyBanner = run.commanderChallenge.type === "raider" && run.commanderChallenge.clock > 0
    ? `極速連射 ${Math.min(20, run.commanderChallenge.kills)}/20`
    : "火力狂熱";
  const skillCooling = run.skillCooldown > 0;
  const skillReady = run.airstrike >= 100 && !skillCooling;
  const supports = Object.entries(SUPPORTS).map(([id, support]) => {
    const used = run.supportUsed[id];
    const cost = supportCost(id, run.bossKills);
    const affordable = profile.credits >= cost;
    return `
      <button class="support-action ${used ? "used" : ""} ${!used && affordable ? "available" : ""}"
        data-action="support" data-support="${id}" style="--support:${support.color}"
        ${used || !affordable ? "disabled" : ""} title="${support.tip}">
        <i>${support.icon}</i><b>${used ? "已使用" : support.name}</b><small>${used ? "本輪一次" : `◆${cost}`}</small>
      </button>`;
  }).join("");
  return `
    <div class="hud">
      <div class="hud-top">
        <div class="score-block"><span>COMBAT SCORE</span><strong>${number(run.score)}</strong></div>
        <div class="scene-stack"><b>${zone.name}</b><span>${protocol.name} ×${protocol.scoreMultiplier.toFixed(2)}・威脅 LV.${run.bossKills + 1}${effectiveLevel >= WEAPON_MAX_LEVEL ? "・反制中" : ""}</span></div>
        <div class="hud-actions">
          <button data-action="toggle-audio">${profile.audio ? "♫" : "×"}</button>
          <button data-action="pause">Ⅱ</button>
        </div>
      </div>
      ${boss ? "" : `<div class="mission-chip ${run.missionDone ? "done" : ""}"><i>${mission.icon}</i><b>${mission.name}</b><span>${Math.min(run.missionTarget, run.missionProgress)}/${run.missionTarget}</span></div>`}
      <div class="weapon-chip ${run.maxDeploymentActive ? "contract" : ""}" style="--weapon:${weapon.color}" title="${weapon.desc}${effectiveLevel >= WEAPON_MAX_LEVEL ? `｜${weapon.ultimate}` : ""}">
        <span>${weapon.icon}</span><b>${weapon.name}</b><em>LV.${weaponLevel}</em>
      </div>
      ${boss ? `<div class="boss-hud" style="--boss:${bossMeta.color}"><span>${bossMeta.name}｜威脅 ${run.bossKills + 1}・階段 ${run.bossPhase}${boss.modifierLabel ? `｜${boss.modifierLabel}` : ""}</span><div><i style="width:${Math.max(0, boss.hp / boss.maxHp * 100)}%"></i></div></div>` : ""}
      ${run.alert ? `<div class="combat-alert" style="--alert:${run.alertColor}">${run.alert}</div>` : ""}
      ${run.combo > 1 || run.furyChain > 0 || run.furyLock > 0 ? `<div class="combo"><small>COMBO</small>${run.combo}<em>${furyStatus}</em></div>` : ""}
      ${run.fury > 0 ? `<div class="fury-banner">${furyBanner} <b>${run.fury.toFixed(1)}s</b></div>` : ""}
      <div class="support-dock"><label>本輪支援 ${run.cycleSupportCount}/3</label>${supports}</div>
      <div class="armor-readout"><span>${run.maxDeploymentActive ? "合約裝甲" : "裝甲"} ${armor >= cap ? `容量 ${cap}` : ""}</span><strong>${armorText}</strong></div>
      <button class="airstrike-button ${skillReady ? "ready" : ""} ${skillCooling ? "cooling" : ""}" data-action="commander-skill"
        style="--charge:${Math.min(100, run.airstrike)}%;--commander:${commander.color}" ${skillReady ? "" : "disabled"}>
        <span>☄</span><b>${skillCooling ? "技能整備" : run.airstrike >= 100 ? commander.special : "技能充能"}</b><i>${skillCooling ? `${Math.ceil(run.skillCooldown)}s` : `${Math.floor(run.airstrike)}%`}</i>
      </button>
    </div>`;
}

export function renderSafeExit(profile, run) {
  const seconds = Math.max(0, Math.ceil(run.safeExitClock));
  const maxReady = allResearchMax(profile);
  const maxCost = maxDeploymentCost(run.commander, run.bossKills);
  const maxActive = Boolean(run.maxDeploymentActive);
  const maxCancelable = maxActive && run.maxDeploymentCancelable !== false;
  const maxAction = maxCancelable ? "cancel-cycle-max" : "purchase-cycle-max";
  const maxLabel = maxCancelable
    ? `取消滿級整備・退還 ◆${number(maxCost)}`
    : maxActive
      ? "下一輪滿級已鎖定"
      : `滿級出擊下一輪・◆${number(maxCost)}`;
  return `
    <div class="safe-exit overlay">
      <div class="safe-ring"><span>${seconds}</span><small>SECONDS</small></div>
      <div class="eyebrow">CHECKPOINT ESTABLISHED</div>
      <h2>Boss檢查點已建立</h2>
      <p>可返回指揮中心進行永久研究<br><b>本輪指揮官無法更換</b></p>
      <div class="safe-warning">${seconds}秒後研究整備窗口關閉，仍可暫停但不能正常退出</div>
      ${maxReady
        ? actionButton(maxAction, maxLabel, `secondary contract-buy${maxCancelable ? " contract-cancel" : ""}`, maxActive && !maxCancelable ? "disabled" : "")
        : ""}
      ${actionButton("enter-research", "進入研究室")}
      ${actionButton("continue-after-boss", "繼續下一戰區", "ghost")}
    </div>`;
}

function renderResearchGrid(profile) {
  return RESEARCH_ORDER.map((id) => {
    const item = RESEARCH[id];
    const level = profile.research[id] || 0;
    const cost = researchCost(id, level);
    const affordable = profile.credits >= cost;
    return `
      <button data-action="buy-research" data-research="${id}" style="--research:${item.color}"
        class="${level < 9 && affordable ? "affordable" : ""}" ${level >= 9 ? "disabled" : ""}>
        <i>${item.icon}</i><b>${item.name}</b><small class="research-desc">${item.desc}</small>
        <span>LV.${level}/9</span><em>${level >= 9 ? "研究完成" : `◆ ${cost}`}</em>
      </button>`;
  }).join("");
}

function renderDeploymentContracts(profile, { checkpointMode = false } = {}) {
  const researchReady = allResearchMax(profile);
  if (checkpointMode) {
    const snapshot = profile.checkpoint || {};
    const commander = COMMANDERS[snapshot.commander || profile.selected];
    const protocol = THREAT_PROTOCOLS[snapshot.threatProtocol] || THREAT_PROTOCOLS.standard;
    const active = Boolean(snapshot.maxDeploymentActive);
    const cancelable = active && snapshot.maxDeploymentCancelable !== false;
    const cost = maxDeploymentCost(snapshot.commander || profile.selected, snapshot.bossKills || 0);
    return `<section class="deployment-contracts checkpoint-contract" style="--contract:${protocol.color}">
      <div class="contract-heading"><span>NEXT CYCLE LOADOUT</span><b>${protocol.name}・指揮官 ${commander.name}</b></div>
      <p>${cancelable
        ? "滿級合約已預約：返回戰場前可取消並全額退還。"
        : active
          ? "滿級合約已鎖定：下一隻Boss前武器暫定LV.9、裝甲MAX。"
          : "可為下一個Boss循環簽署一次性滿級軍備合約。"}</p>
      ${researchReady
        ? actionButton(
          cancelable ? "cancel-cycle-max" : "purchase-cycle-max",
          cancelable ? `取消滿級整備・退還 ◆${number(cost)}` : active ? "下一輪滿級已鎖定" : `滿級出擊・◆${number(cost)}`,
          `contract-toggle${cancelable ? " contract-cancel" : ""}`,
          active && !cancelable ? "disabled" : ""
        )
        : `<small>九項研究全部LV.9後解鎖</small>`}
    </section>`;
  }

  const selectedProtocol = THREAT_PROTOCOLS[profile.deployment?.protocol] || THREAT_PROTOCOLS.standard;
  const maxQueued = Boolean(profile.deployment?.max && researchReady);
  const maxCost = maxDeploymentCost(profile.selected, 0);
  const totalCost = selectedProtocol.cost + (maxQueued ? maxCost : 0);
  const protocolCards = THREAT_PROTOCOL_ORDER.map((id) => {
    const protocol = THREAT_PROTOCOLS[id];
    const available = threatProtocolAvailable(profile, id);
    const active = selectedProtocol.id === id;
    const unlock = !researchReady
      ? "研究81/81後解鎖"
      : profile.best < protocol.unlockScore
        ? `最高戰績需 ${number(protocol.unlockScore)}`
        : protocol.cost > 0
          ? `每次出擊 ◆${number(protocol.cost)}`
          : "免費";
    return `<button data-action="select-protocol" data-protocol="${id}" class="protocol-card ${active ? "active" : ""} ${available ? "" : "locked"}"
      style="--contract:${protocol.color}" ${available ? "" : "disabled"}>
      <i>${protocol.icon}</i><span><b>${protocol.name}</b><small>${protocol.desc}</small></span><strong>${active ? "已選擇" : unlock}</strong>
    </button>`;
  }).join("");
  return `<section class="deployment-contracts ${researchReady ? "" : "locked"}" style="--contract:${selectedProtocol.color}">
    <div class="contract-heading"><span>ENDGAME CONTRACTS</span><b>出擊規格・本次費用 ◆${number(totalCost)}</b></div>
    <p>${researchReady ? "威脅協定提高戰績但不提高軍備結算；滿級出擊只維持到下一隻Boss。" : `永久研究 ${researchMedalCount(profile)}/81・全部完成後開放後期軍備合約。`}</p>
    <div class="protocol-list">${protocolCards}</div>
    <button data-action="toggle-max-deployment" class="max-deployment-toggle ${maxQueued ? "active" : ""}" ${researchReady ? "" : "disabled"}>
      <i>MAX</i><span><b>滿級出擊・極限軍備</b><small>所有武器暫定LV.9、裝甲MAX；兵力與技能照常</small></span>
      <strong>${maxQueued ? `已加入 ◆${number(maxCost)}` : `加購 ◆${number(maxCost)}`}</strong>
    </button>
  </section>`;
}

export function renderArmory(profile, { checkpointMode = false } = {}) {
  const current = COMMANDERS[profile.checkpoint?.commander || profile.selected];
  const commanderCard = (id, rank = null) => {
    const commander = COMMANDERS[id];
    const unlocked = profile.unlocked.includes(id);
    const active = profile.selected === id;
    const canBuy = profile.credits >= commander.price;
    const status = active
      ? "已任命"
      : unlocked
        ? "任命"
        : `◆ ${commander.price}`;
    const ranking = commander.starter
      ? `初始配發｜${commander.callsign}・${commander.role}`
      : `#${rank} BOSS威脅 ${commander.threat}｜${commander.callsign}・${commander.role}`;
    return `
      <button data-action="commander" data-commander="${id}" class="${active ? "active" : ""} ${!unlocked && !canBuy ? "unaffordable" : ""} ${commander.starter ? "starter-unit" : ""}" style="--accent:${commander.color}">
        <img src="${ART[commander.art]}" alt="" />
        <span><small>${ranking}</small><b>${commander.name}</b><em>${commander.desc}</em><i><u style="width:${commander.threat}%"></u></i></span>
        <strong>${status}</strong>
      </button>`;
  };
  const commanderList = checkpointMode ? `
    <div class="locked-commander" style="--accent:${current.color}">
      <img src="${ART[current.art]}" alt="" />
      <span><small>機體鎖定｜${current.callsign}</small><b>${current.name}</b><em>本輪結束前無法招募或更換指揮官</em></span>
      <strong>LOCKED</strong>
    </div>` : `
    <div class="commander-list">
      ${commanderCard("viper")}
      <div class="roster-divider"><span>可招募戰機｜威脅與費用由低至高</span></div>
      ${COMMANDER_ORDER.filter((id) => id !== "viper").map((id, index) => commanderCard(id, index + 1)).join("")}
    </div>`;

  return `
    <div class="armory overlay">
      <div class="eyebrow">${checkpointMode ? "BETWEEN-BOSS REFIT" : "COMMAND CENTER"}</div>
      <h2>${checkpointMode ? "Boss後研究整備" : "指揮官與戰術研究"}</h2>
      ${checkpointMode ? `<div class="operation-lock">作戰進行中｜只能研究，不能更換機體</div>` : ""}
      <div class="credit-chip">◆ ${number(profile.credits)} 軍備點</div>
      ${renderDeploymentContracts(profile, { checkpointMode })}
      ${commanderList}
      <div class="research-title"><span>TACTICAL RESEARCH</span><b>永久研究・總進度 ${researchMedalCount(profile)}/81</b></div>
      <div class="research-grid">${renderResearchGrid(profile)}</div>
      ${checkpointMode
        ? actionButton("return-battle", "返回下一戰區") + actionButton("confirm-abandon", "結束整輪作戰並解除機體鎖定", "danger ghost")
        : actionButton("menu", "返回集結區", "ghost")}
    </div>`;
}

function renderDailyTab(profile) {
  const dailyCards = profile.daily.tasks.map((id) => {
    const task = DAILY_POOL.find((item) => item.id === id);
    const progress = Math.min(task.target, profile.daily.progress[id] || 0);
    const complete = progress >= task.target;
    const claimed = profile.daily.claimed[id];
    return `
      <div class="daily-card ${claimed ? "done" : ""}">
        <i>${task.icon}</i>
        <span><small>DAILY OPERATION</small><b>${task.name}</b><em>${task.desc}・獎勵 ◆${task.reward}</em></span>
        ${claimed
          ? `<strong>已領取</strong>`
          : complete
            ? `<button data-action="claim-daily" data-daily="${id}">領取</button>`
            : `<strong>${number(progress)}/${number(task.target)}</strong>`}
        <div><i style="width:${progress / task.target * 100}%"></i></div>
      </div>`;
  }).join("");
  const allClaimed = profile.daily.tasks.every((id) => profile.daily.claimed[id]);
  const comboAchievements = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.comboTarget);
  const scoreAchievements = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.scoreTarget);
  const weaponAchievements = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.weaponMastery);
  const weaponMastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.weaponMeta);
  const battleAchievements = BATTLE_ACHIEVEMENTS.filter((achievement) => !achievement.comboTarget && !achievement.scoreTarget
    && !achievement.commander && !achievement.commanderMeta && !achievement.commanderSkill && !achievement.skillMeta
    && !achievement.weaponMastery && !achievement.weaponMeta);
  const comboCompleted = comboAchievements.filter((achievement) => profile.achievements.includes(achievement.id)).length;
  const scoreCompleted = scoreAchievements.filter((achievement) => profile.achievements.includes(achievement.id)).length;
  const weaponCompleted = weaponAchievements.filter((achievement) => profile.achievements.includes(achievement.id)).length;
  const battleCompleted = battleAchievements.filter((achievement) => profile.achievements.includes(achievement.id)).length;
  const comboMedals = comboAchievements.map((achievement) => {
    const done = profile.achievements.includes(achievement.id);
    const progress = Math.min(achievement.comboTarget, profile.stats.bestCombo || 0);
    return `<div class="combo-medal ${done ? "done" : ""}">
      <i>${achievement.comboTarget}</i>
      <span><b>${achievement.name}</b><small>${achievement.desc}</small><u><em style="width:${progress / achievement.comboTarget * 100}%"></em></u></span>
      <strong>${done ? `已領 ◆${achievement.reward}` : `${progress}/${achievement.comboTarget}・◆${achievement.reward}`}</strong>
    </div>`;
  }).join("");
  const scoreMedals = scoreAchievements.map((achievement) => {
    const done = profile.achievements.includes(achievement.id);
    const progress = Math.min(achievement.scoreTarget, profile.best || 0);
    return `<div class="combo-medal score-medal ${done ? "done" : ""}">
      <i>${achievement.icon}</i>
      <span><b>${achievement.name}</b><small>${achievement.desc}</small><u><em style="width:${progress / achievement.scoreTarget * 100}%"></em></u></span>
      <strong>${done ? `已領 ◆${achievement.reward}` : `${number(progress)}/${number(achievement.scoreTarget)}`}</strong>
    </div>`;
  }).join("");
  const battleMedals = battleAchievements.map((achievement) => {
    const done = profile.achievements.includes(achievement.id);
    const progress = achievement.stat ? Math.min(achievement.target, profile.stats[achievement.stat] || 0) : 0;
    return `<div class="${done ? "done" : ""}"><i>${achievement.icon}</i><span><b>${achievement.name}</b><small>${achievement.desc}</small></span><strong>${done ? "完成" : achievement.stat ? `${progress}/${achievement.target}` : "未解鎖"}</strong></div>`;
  }).join("");
  const weaponMedals = weaponAchievements.map((achievement) => {
    const done = profile.achievements.includes(achievement.id);
    return `<div class="${done ? "done" : ""}"><i>${achievement.icon}</i><span><b>${achievement.name}</b><small>${achievement.desc}</small></span><strong>${done ? `完成・◆${achievement.reward}` : `未解鎖・◆${achievement.reward}`}</strong></div>`;
  }).join("");
  const weaponMasteryDone = weaponMastery && profile.achievements.includes(weaponMastery.id);
  return `
    <p class="reset-note">每日任務於當地時間00:00重置</p>
    <div class="daily-stack">${dailyCards}</div>
    <div class="daily-bonus ${profile.daily.bonusClaimed ? "done" : ""}">
      <span><b>每日全勤補給</b><small>三項每日任務全部領取</small></span>
      ${profile.daily.bonusClaimed
        ? `<strong>已領取 ◆40</strong>`
        : allClaimed
          ? `<button data-action="claim-daily-bonus">領取 ◆40</button>`
          : `<strong>尚未完成</strong>`}
    </div>
    <p class="permanent-note"><b>以下為永久戰績</b><span>不會於每日00:00重置；完成後永久保留</span></p>
    <div class="section-label"><span>COMBO MILESTONES</span><b>連殺 ${comboCompleted}/${comboAchievements.length}・最高 ${number(profile.stats.bestCombo)}</b></div>
    <div class="combo-medal-list">${comboMedals}</div>
    <div class="section-label"><span>SCORE MILESTONES</span><b>積分 ${scoreCompleted}/${scoreAchievements.length}・最高 ${number(profile.best)}</b></div>
    <div class="combo-medal-list score-medal-list">${scoreMedals}</div>
    <div class="section-label"><span>WEAPON MASTERY</span><b>武器專精 ${weaponCompleted}/${weaponAchievements.length}</b></div>
    <div class="achievement-list weapon-mastery-list">${weaponMedals}
      <div class="weapon-mastery-meta ${weaponMasteryDone ? "done" : ""}"><i>${weaponMastery.icon}</i><span><b>${weaponMastery.name}</b><small>${weaponMastery.desc}</small></span><strong>${weaponMasteryDone ? `完成・◆${weaponMastery.reward}` : `${weaponCompleted}/6・◆${weaponMastery.reward}`}</strong></div>
    </div>
    <div class="section-label"><span>PERMANENT MEDALS</span><b>一般戰場勳章 ${battleCompleted}/${battleAchievements.length}</b></div>
    <div class="achievement-list">${battleMedals}</div>`;
}

function renderCommanderTab(profile) {
  const count = commanderMilestoneCount(profile);
  const fielded = commanderBattleCount(profile);
  const skillsUsed = commanderSkillCount(profile);
  const commanderAchievements = COMMANDER_ORDER
    .map((id) => BATTLE_ACHIEVEMENTS.find((achievement) => achievement.commander === id))
    .filter(Boolean);
  const commanderAchievementCount = commanderAchievements.filter((achievement) => profile.achievements.includes(achievement.id)).length;
  const mastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.commanderMeta);
  const masteryDone = mastery && profile.achievements.includes(mastery.id);
  const skillMastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.skillMeta);
  const skillMasteryDone = skillMastery && profile.achievements.includes(skillMastery.id);
  const commanderMedals = commanderAchievements.map((achievement) => {
    const commander = COMMANDERS[achievement.commander];
    const done = profile.achievements.includes(achievement.id);
    const unlocked = profile.unlocked.includes(achievement.commander);
    return `<div class="${done ? "done" : ""} ${unlocked ? "unlocked" : ""}" style="--accent:${commander.color}">
      <img src="${ART[commander.art]}" alt="" />
      <span><small>${commander.name}・${commander.callsign} 專屬</small><b>${achievement.name}</b><em>${achievement.desc}</em></span>
      <strong>${done ? "完成" : unlocked ? "未解鎖" : "尚未招募"}</strong>
    </div>`;
  }).join("");
  const skillCertificates = COMMANDER_ORDER.map((id) => {
    const commander = COMMANDERS[id];
    const achievement = BATTLE_ACHIEVEMENTS.find((item) => item.commanderSkill === id);
    const done = profile.achievements.includes(achievement.id);
    return `<div class="skill-certificate ${done ? "done" : ""}" style="--accent:${commander.color}">
      <img src="${ART[commander.art]}" alt="" /><span><b>${commander.name}</b><small>${commander.special}</small></span><strong>${done ? "☄ 已施放" : "未施放"}</strong>
    </div>`;
  }).join("");
  return `
    <div class="commander-summary-grid">
      <div class="achievement-summary"><strong>${count}/10</strong><span>已招募指揮官</span></div>
      <div class="achievement-summary field"><strong>${fielded}/10</strong><span>已完成Boss實戰</span></div>
    </div>
    <div class="milestone-grid">
      ${Array.from({ length: 10 }, (_, index) => {
        const amount = index + 1;
        const done = count >= amount;
        return `<div class="milestone ${done ? "done" : ""}"><i>${amount}</i><b>${amount === 10 ? "十全指揮" : `招募${amount}位`}</b><small>${done ? "成就完成" : `進度 ${count}/${amount}`}</small></div>`;
      }).join("")}
    </div>
    <div class="section-label"><span>FIELD CERTIFICATION</span><b>指揮官實戰 ${fielded}/10</b></div>
    <div class="commander-field-medal ${fielded >= 10 ? "done" : ""}">
      <i>⚔</i><span><b>十機實戰</b><small>10位指揮官都曾各自擊破至少1次Boss</small></span><strong>${fielded >= 10 ? "完成" : `${fielded}/10`}</strong>
    </div>
    <div class="section-label"><span>SKILL CERTIFICATION</span><b>技能實戰 ${skillsUsed}/10</b></div>
    <div class="skill-certificate-grid">${skillCertificates}</div>
    <div class="commander-field-medal skill-mastery ${skillMasteryDone ? "done" : ""}">
      <i>☄</i><span><b>${skillMastery.name}</b><small>${skillMastery.desc}</small></span><strong>${skillMasteryDone ? "完成" : `${skillsUsed}/10`}</strong>
    </div>
    <div class="section-label"><span>COMMANDER TACTICS</span><b>專屬成就 ${commanderAchievementCount}/${commanderAchievements.length}</b></div>
    <div class="commander-achievement-list">${commanderMedals}</div>
    <div class="commander-field-medal mastery ${masteryDone ? "done" : ""}">
      <i>10</i><span><b>${mastery.name}</b><small>${mastery.desc}</small></span><strong>${masteryDone ? "完成" : `${commanderAchievementCount}/10`}</strong>
    </div>
    <div class="portrait-grid">
      ${COMMANDER_ORDER.map((id) => {
        const unlocked = profile.unlocked.includes(id);
        const wins = profile.stats.commanderBossWins[id] || 0;
        return `<div class="${unlocked ? "done" : ""} ${wins > 0 ? "fielded" : ""}" style="--accent:${COMMANDERS[id].color}">
          ${wins > 0 ? `<b class="field-badge">⚔</b>` : ""}<img src="${ART[COMMANDERS[id].art]}" alt="" /><span>${COMMANDERS[id].name}</span><small>${wins > 0 ? `Boss ×${wins}` : unlocked ? "尚未實戰" : "未招募"}</small>
        </div>`;
      }).join("")}
    </div>
    <p class="portrait-legend"><span>彩色框＝已招募</span><span>⚔＝至少擊破1次Boss</span></p>`;
}

function renderResearchTab(profile) {
  const total = researchMedalCount(profile);
  return `
    <div class="achievement-summary"><strong>${total}/81</strong><span>研究成就總進度</span></div>
    <div class="research-achievements">
      ${RESEARCH_ORDER.map((id) => {
        const research = RESEARCH[id];
        const level = profile.research[id] || 0;
        return `<div class="research-medal-row" style="--research:${research.color}">
          <i>${research.icon}</i><span><b>${research.name}</b><small>${level}/9 完成</small></span>
          <div>${Array.from({ length: 9 }, (_, index) => `<em class="${level > index ? "done" : ""}">${index + 1}</em>`).join("")}</div>
        </div>`;
      }).join("")}
    </div>`;
}

export function renderAchievements(profile, tab = "daily") {
  const content = tab === "commanders" ? renderCommanderTab(profile) : tab === "research" ? renderResearchTab(profile) : renderDailyTab(profile);
  return `
    <div class="missions overlay">
      <div class="eyebrow">FIELD RECORDS</div>
      <h2>戰績與成就</h2>
      <div class="record-tabs">
        <button class="${tab === "daily" ? "active" : ""}" data-action="achievement-tab" data-tab="daily">每日／戰績</button>
        <button class="${tab === "commanders" ? "active" : ""}" data-action="achievement-tab" data-tab="commanders">指揮官系列</button>
        <button class="${tab === "research" ? "active" : ""}" data-action="achievement-tab" data-tab="research">研究 81</button>
      </div>
      <div class="record-content">${content}</div>
      ${actionButton("menu", "返回集結區", "ghost")}
    </div>`;
}

export function renderPause(profile, run, { fullscreenSupported = true, fullscreenActive = false } = {}) {
  const hasCheckpoint = Boolean(profile.checkpoint);
  return `
    <div class="pause overlay">
      <div class="pause-mark">Ⅱ</div>
      <div class="eyebrow">TACTICAL PAUSE</div>
      <h2>戰場已暫停</h2>
      <p>${hasCheckpoint ? `正常研究整備只能在Boss擊破後的${SAFE_EXIT_SECONDS}秒窗口進行。` : "尚未擊破第一隻Boss，目前沒有可返回的檢查點。"}</p>
      ${actionButton("unpause", "繼續作戰")}
      ${fullscreenSupported
        ? actionButton("toggle-fullscreen", fullscreenActive ? "退出全螢幕" : "進入全螢幕", "secondary fullscreen-toggle", `aria-pressed="${fullscreenActive}"`)
        : ""}
      ${actionButton("confirm-retreat", "強制撤退", "danger")}
    </div>`;
}

export function renderRetreatConfirmation(profile) {
  const hasCheckpoint = Boolean(profile.checkpoint);
  return `
    <div class="pause confirm overlay">
      <div class="result-mark">!</div>
      <div class="eyebrow">FORCED RETREAT</div>
      <h2>確定強制撤退？</h2>
      <p>${hasCheckpoint
        ? "你將回到上一次Boss擊破後的檢查點。此後取得的兵力、裝甲、武器等級、分數與未入庫戰果都會取消；已消耗的戰場支援軍備點不退還。"
        : "目前尚未建立Boss檢查點，強制撤退將失去本輪全部未入庫戰果。"}</p>
      ${actionButton("cancel-retreat", "繼續作戰")}
      ${actionButton("force-retreat", "確認強制撤退", "danger")}
    </div>`;
}

export function renderAbandonConfirmation() {
  return `
    <div class="pause confirm overlay">
      <div class="result-mark">×</div>
      <div class="eyebrow">END OPERATION</div>
      <h2>結束整輪作戰？</h2>
      <p>這會刪除目前Boss檢查點並解除機體鎖定。已入庫軍備點與永久研究會保留，但本輪將無法再接續。</p>
      ${actionButton("cancel-abandon", "返回研究室")}
      ${actionButton("abandon-run", "確認結束整輪", "danger")}
    </div>`;
}

export function renderRestartConfirmation() {
  return `
    <div class="pause confirm overlay">
      <div class="result-mark">!</div>
      <div class="eyebrow">RESTART OPERATION</div>
      <h2>放棄目前戰線？</h2>
      <p>只會刪除目前的Boss檢查點、機體鎖定與本輪戰況。軍備點、已招募指揮官、永久研究、成就及最高戰績全部保留；刪除後無法再續。</p>
      ${actionButton("cancel-restart", "保留戰線")}
      ${actionButton("restart-run", "確認放棄並開始新一輪", "danger")}
    </div>`;
}

export function renderResult(profile, run) {
  const commander = COMMANDERS[run.commander];
  const weapon = WEAPONS[run.weapon.id];
  const protocol = protocolForRun(run);
  const effectiveLevel = effectiveWeaponLevel(run);
  return `
    <div class="result overlay">
      <div class="result-mark">×</div>
      <div class="eyebrow">OPERATION ENDED</div>
      <h2>縱隊失去戰力</h2>
      <p>本輪已結算，機體鎖定解除。調整研究與指揮官後再次出擊。</p>
      <div class="result-stats">
        <div><span>戰績</span><b>${number(run.score)}</b></div>
        <div><span>Boss</span><b>${run.bossKills}</b></div>
        <div><span>軍備入庫</span><b>◆${number(run.resultCredits)}</b></div>
      </div>
      <div class="result-loadout"><span style="color:${commander.color}">${commander.callsign}</span><b>${weapon.name}</b><em>LV.${effectiveLevel >= WEAPON_MAX_LEVEL ? "MAX" : effectiveLevel}・${protocol.name}</em></div>
      ${actionButton("new-run", "開始新一輪")}
      ${actionButton("menu", "返回集結區", "ghost")}
    </div>`;
}
