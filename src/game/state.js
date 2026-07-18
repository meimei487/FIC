import {
  COMMANDERS,
  FORMATION_Y,
  MAX_SQUAD,
  TACTICAL_MISSIONS,
  THREAT_PROTOCOLS,
  WEAPONS,
  WEAPON_MAX_LEVEL,
  WIDTH,
  ZONES,
  armorCap,
  buildZoneRoute
} from "../config.js";

function randomItem(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

export function commanderDamageMultiplier(commanderId) {
  if (commanderId === "viper") return 1.12;
  if (commanderId === "engineer") return 1.08;
  return 1;
}

export function damageResearchMultiplier(profile) {
  return 1 + (profile.research.damage || 0) * 0.12;
}

export function weaponLevelMultiplier(weaponId, level) {
  const step = weaponId === "shotgun" ? 0.16 : 0.18;
  return 1 + (Math.max(1, level) - 1) * step;
}

export function effectiveWeaponLevel(run) {
  return run?.maxDeploymentActive ? WEAPON_MAX_LEVEL : Math.max(1, run?.weapon?.level || 1);
}

export function protocolForRun(run) {
  return THREAT_PROTOCOLS[run?.threatProtocol] || THREAT_PROTOCOLS.standard;
}

export function effectiveArmor(run) {
  return Math.max(0, (Number(run?.armor) || 0) + (Number(run?.contractArmor) || 0));
}

export function addArmor(run, amount, profile) {
  if (!run || amount <= 0) return 0;
  const cap = armorCap(profile.research);
  const before = effectiveArmor(run);
  run.contractArmor = Math.max(0, Number(run.contractArmor) || 0);
  run.armor = Math.min(cap, Math.max(0, Number(run.armor) || 0) + amount);
  const overflow = Math.max(0, run.armor + run.contractArmor - cap);
  run.contractArmor = Math.max(0, run.contractArmor - overflow);
  return effectiveArmor(run) - before;
}

export function effectiveBulletDamage(run, profile, weaponId = run.weapon.id) {
  const weapon = WEAPONS[weaponId];
  const level = effectiveWeaponLevel(run);
  let multiplier = damageResearchMultiplier(profile)
    * commanderDamageMultiplier(run.commander)
    * weaponLevelMultiplier(weaponId, level);
  if (level >= WEAPON_MAX_LEVEL && weaponId === "laser") multiplier *= 1.2;
  if (level >= WEAPON_MAX_LEVEL && weaponId === "railgun") multiplier *= 1.35;
  return weapon.damage * multiplier;
}

export function effectiveFireInterval(run) {
  const weapon = WEAPONS[run.weapon.id];
  const level = effectiveWeaponLevel(run);
  let interval = weapon.rate / (1 + (level - 1) * 0.12);
  if (run.fury > 0) interval *= 0.48;
  if (run.commander === "raider") interval *= 0.78;
  if (level >= WEAPON_MAX_LEVEL && run.weapon.id === "minigun") interval *= 0.85;
  return Math.max(0.055, interval);
}

export function critChance(run, profile) {
  return Math.min(0.72, (profile.research.crit || 0) * 0.03 + (run.commander === "hunter" ? 0.22 : 0));
}

export function dodgeChance(profile) {
  return Math.min(0.4, (profile.research.dodge || 0) * 0.02);
}

export function airGainMultiplier(profile) {
  return 1 + (profile.research.tactics || 0) * 0.07;
}

export function creditMultiplier(run, profile) {
  return (1 + (profile.research.credits || 0) * 0.08)
    * (run.commander === "engineer" ? 1.3 : 1);
}

export function createRun(profile, commanderId = profile.selected, random = Math.random, options = {}) {
  const commander = COMMANDERS[commanderId] || COMMANDERS.viper;
  const missionId = randomItem(Object.keys(TACTICAL_MISSIONS), random);
  const squad = Math.min(MAX_SQUAD, commander.baseSquad + (profile.research.squad || 0));
  const cap = armorCap(profile.research);
  const armor = Math.min(cap, commander.baseArmor + (profile.research.armor || 0));
  const maxDeploymentActive = Boolean(options.maxDeployment);
  const threatProtocol = THREAT_PROTOCOLS[options.protocolId] ? options.protocolId : "standard";
  const routeSeed = Math.floor(random() * 0x100000000) >>> 0;

  return {
    id: `${Date.now().toString(36)}-${Math.floor(random() * 1e8).toString(36)}`,
    commander: commanderId,
    x: WIDTH / 2,
    squad,
    maxSquad: squad,
    armor,
    contractArmor: maxDeploymentActive ? Math.max(0, cap - armor) : 0,
    invuln: 0,
    hardInvuln: 0,
    revived: false,
    weapon: { id: commander.startWeapon, level: 1 },
    threatProtocol,
    maxDeploymentActive,
    maxDeploymentCancelable: false,
    cycleMaxDeploymentUsed: maxDeploymentActive,
    bullets: [],
    enemies: [],
    gates: [],
    drops: [],
    telegraphs: [],
    particles: [],
    texts: [],
    elapsed: 0,
    scene: 0,
    routeSeed,
    zoneRoute: buildZoneRoute(0, [], routeSeed),
    sceneTime: 0,
    fireClock: 0.1,
    spawnClock: 0.8,
    gateClock: 5,
    eventClock: 9,
    gateSeq: 0,
    score: 0,
    kills: 0,
    combo: 0,
    comboClock: 0,
    maxCombo: 0,
    fury: 0,
    furyChain: 0,
    furyChainClock: 0,
    furyLock: 0,
    airstrike: Math.min(100, 15 + (profile.research.air || 0) * 10),
    skillCooldown: 0,
    skillVisual: 0,
    shake: 0,
    stageBanner: 2.1,
    stageMessage: null,
    bossSpawned: false,
    bossAlive: false,
    bossChassis: null,
    bossPhase: 1,
    bossPhaseVisual: 0,
    bossKills: 0,
    alert: "",
    alertColor: commander.color,
    alertTime: 0,
    mission: missionId,
    missionProgress: 0,
    missionTarget: TACTICAL_MISSIONS[missionId].target,
    missionDone: false,
    supportUsed: { medical: false, firepower: false, charge: false },
    cycleSupportCount: 0,
    cycleGatePairsEligible: 0,
    cycleGatePairsChosen: 0,
    cycleGateSeen: {},
    cycleGateChosen: {},
    cycleWeapons: [commander.startWeapon],
    bossDamageTaken: 0,
    segmentScore: 0,
    segmentCredits: 0,
    segmentDaily: {},
    segmentAchievements: [],
    segmentStats: { perfectGateRounds: 0, unsupportedBosses: 0, maxDeploymentUses: maxDeploymentActive ? 1 : 0 },
    segmentSkillUses: {},
    commanderCounters: { engineerSkills: 0, reaperRecruits: 0 },
    commanderChallenge: { type: null, clock: 0, kills: 0 },
    weaponMastery: { rifleChain: 0, minigunKills: 0, minigunClock: 0 },
    bossCriticalHits: 0,
    reinforceDropCooldown: 0,
    energyDropCooldown: 0,
    artilleryClock: 10,
    hazardClock: 8,
    firepowerGateMisses: 0,
    safeExitClock: 0,
    checkpointReady: false,
    pendingNextScene: null,
    gameOver: false,
    resultCredits: 0,
    checkpointOrdinal: 0,
    committedKills: 0,
    regenClock: 3
  };
}

const SERIALIZED_FIELDS = [
  "id",
  "commander",
  "x",
  "squad",
  "maxSquad",
  "armor",
  "contractArmor",
  "revived",
  "weapon",
  "threatProtocol",
  "maxDeploymentActive",
  "maxDeploymentCancelable",
  "cycleMaxDeploymentUsed",
  "elapsed",
  "scene",
  "routeSeed",
  "zoneRoute",
  "sceneTime",
  "score",
  "kills",
  "maxCombo",
  "airstrike",
  "firepowerGateMisses",
  "bossKills",
  "mission",
  "missionProgress",
  "missionTarget",
  "missionDone",
  "supportUsed",
  "cycleSupportCount",
  "cycleGatePairsEligible",
  "cycleGatePairsChosen",
  "cycleGateSeen",
  "cycleGateChosen",
  "cycleWeapons",
  "bossDamageTaken",
  "segmentScore",
  "segmentCredits",
  "segmentDaily",
  "segmentAchievements",
  "segmentStats",
  "segmentSkillUses",
  "commanderCounters",
  "checkpointOrdinal",
  "committedKills",
  "resultCredits"
];

export function serializeRun(run) {
  const snapshot = {};
  for (const field of SERIALIZED_FIELDS) snapshot[field] = structuredClone(run[field]);
  return snapshot;
}

export function restoreRun(snapshot, profile) {
  const run = createRun(profile, snapshot.commander || profile.selected);
  for (const field of SERIALIZED_FIELDS) {
    if (snapshot[field] !== undefined) run[field] = structuredClone(snapshot[field]);
  }
  run.x = Number.isFinite(run.x) ? run.x : WIDTH / 2;
  run.squad = Math.max(1, Math.min(MAX_SQUAD, run.squad || 1));
  run.maxSquad = Math.max(run.squad, Math.min(MAX_SQUAD, run.maxSquad || run.squad));
  run.armor = Math.max(0, Math.min(armorCap(profile.research), run.armor || 0));
  run.maxDeploymentActive = Boolean(run.maxDeploymentActive);
  run.maxDeploymentCancelable = run.maxDeploymentActive
    && (snapshot.maxDeploymentCancelable === undefined || Boolean(snapshot.maxDeploymentCancelable));
  run.contractArmor = run.maxDeploymentActive
    ? Math.max(0, Math.min(armorCap(profile.research) - run.armor, Number(run.contractArmor) || 0))
    : 0;
  run.cycleMaxDeploymentUsed = Boolean(run.cycleMaxDeploymentUsed || run.maxDeploymentActive);
  run.weapon = {
    id: WEAPONS[run.weapon?.id] ? run.weapon.id : "rifle",
    level: Math.max(1, Math.min(WEAPON_MAX_LEVEL, run.weapon?.level || 1))
  };
  run.threatProtocol = THREAT_PROTOCOLS[run.threatProtocol] ? run.threatProtocol : "standard";
  run.supportUsed = {
    medical: Boolean(run.supportUsed?.medical),
    firepower: Boolean(run.supportUsed?.firepower),
    charge: Boolean(run.supportUsed?.charge)
  };
  run.cycleSupportCount = Math.max(0, Math.min(3, Math.floor(Number(run.cycleSupportCount) || Object.values(run.supportUsed).filter(Boolean).length)));
  run.cycleGatePairsEligible = Math.max(0, Math.floor(Number(run.cycleGatePairsEligible) || 0));
  run.cycleGatePairsChosen = Math.max(0, Math.min(run.cycleGatePairsEligible, Math.floor(Number(run.cycleGatePairsChosen) || 0)));
  run.cycleGateSeen = run.cycleGateSeen && typeof run.cycleGateSeen === "object" ? run.cycleGateSeen : {};
  run.cycleGateChosen = run.cycleGateChosen && typeof run.cycleGateChosen === "object" ? run.cycleGateChosen : {};
  run.cycleWeapons = [...new Set(Array.isArray(run.cycleWeapons) ? run.cycleWeapons : [run.weapon.id])].filter((id) => WEAPONS[id]);
  if (!run.cycleWeapons.includes(run.weapon.id)) run.cycleWeapons.push(run.weapon.id);
  run.bossDamageTaken = Math.max(0, Number(run.bossDamageTaken) || 0);
  run.segmentStats = {
    perfectGateRounds: Math.max(0, Math.floor(Number(run.segmentStats?.perfectGateRounds) || 0)),
    unsupportedBosses: Math.max(0, Math.floor(Number(run.segmentStats?.unsupportedBosses) || 0)),
    maxDeploymentUses: Math.max(0, Math.floor(Number(run.segmentStats?.maxDeploymentUses) || 0))
  };
  run.segmentSkillUses = Object.fromEntries(Object.entries(run.segmentSkillUses || {})
    .filter(([id]) => COMMANDERS[id])
    .map(([id, value]) => [id, Math.max(0, Math.floor(Number(value) || 0))]));
  run.routeSeed = Number.isFinite(Number(snapshot.routeSeed)) ? Number(snapshot.routeSeed) >>> 0 : 0x51f15e;
  const snapshotRoute = snapshot.zoneRoute;
  const validRoute = Array.isArray(snapshotRoute)
    && snapshotRoute.length === 3
    && new Set(snapshotRoute).size === 3
    && snapshotRoute.every((index) => Number.isInteger(index) && index >= 0 && index < ZONES.length);
  run.zoneRoute = validRoute
    ? structuredClone(snapshotRoute)
    : buildZoneRoute(run.bossKills || 0, [], run.routeSeed);
  run.bullets = [];
  run.enemies = [];
  run.gates = [];
  run.drops = [];
  run.telegraphs = [];
  run.particles = [];
  run.texts = [];
  run.invuln = 1;
  run.hardInvuln = 1;
  run.fireClock = 0.1;
  run.spawnClock = 0.8;
  run.gateClock = 5;
  run.eventClock = 9;
  run.combo = 0;
  run.comboClock = 0;
  run.fury = 0;
  run.furyChain = 0;
  run.furyChainClock = 0;
  run.furyLock = 0;
  run.skillCooldown = 0;
  run.skillVisual = 0;
  run.commanderCounters = {
    engineerSkills: Math.max(0, Number(run.commanderCounters?.engineerSkills) || 0),
    reaperRecruits: Math.max(0, Number(run.commanderCounters?.reaperRecruits) || 0)
  };
  run.commanderChallenge = { type: null, clock: 0, kills: 0 };
  run.weaponMastery = { rifleChain: 0, minigunKills: 0, minigunClock: 0 };
  run.bossCriticalHits = 0;
  run.reinforceDropCooldown = 0;
  run.energyDropCooldown = 0;
  run.artilleryClock = 10;
  run.hazardClock = 8;
  run.firepowerGateMisses = Math.max(0, Math.floor(Number(run.firepowerGateMisses) || 0));
  run.shake = 0;
  run.stageBanner = 2.1;
  run.stageMessage = null;
  run.bossSpawned = false;
  run.bossAlive = false;
  run.bossChassis = null;
  run.bossPhase = 1;
  run.bossPhaseVisual = 0;
  run.safeExitClock = 0;
  run.checkpointReady = true;
  run.gameOver = false;
  run.regenClock = 3;
  return run;
}

export function migrateLegacyRun(legacy, profile) {
  if (!legacy) return null;
  const run = createRun(profile, legacy.commander || profile.selected);
  Object.assign(run, {
    squad: legacy.squad ?? run.squad,
    maxSquad: legacy.maxSquad ?? legacy.squad ?? run.maxSquad,
    armor: legacy.armor ?? run.armor,
    weapon: {
      id: WEAPONS[legacy.weapon?.id] ? legacy.weapon.id : (WEAPONS[legacy.weapon] ? legacy.weapon : "rifle"),
      level: Math.min(WEAPON_MAX_LEVEL, legacy.weapon?.level || legacy.weaponLevel || 1)
    },
    scene: legacy.scene || 0,
    sceneTime: 0,
    score: legacy.score || 0,
    kills: legacy.kills || 0,
    airstrike: legacy.airstrike || 0,
    bossKills: legacy.bossKills || 0,
    elapsed: legacy.elapsed || 0,
    mission: TACTICAL_MISSIONS[legacy.mission] ? legacy.mission : run.mission,
    missionProgress: legacy.missionProgress || 0,
    missionTarget: legacy.missionTarget || run.missionTarget,
    missionDone: Boolean(legacy.missionDone),
    supportUsed: { medical: false, firepower: false, charge: false },
    checkpointReady: true
  });
  run.zoneRoute = buildZoneRoute(run.bossKills, [], run.routeSeed);
  run.armor = Math.min(armorCap(profile.research), run.armor);
  return serializeRun(run);
}

export function applyResearchDelta(run, id, amount, profile) {
  if (!run || amount <= 0) return;
  if (id === "squad") {
    run.squad = Math.min(MAX_SQUAD, run.squad + amount);
    run.maxSquad = Math.max(run.maxSquad, run.squad);
  } else if (id === "armor") {
    addArmor(run, amount, profile);
  } else if (id === "air") {
    run.airstrike = Math.min(100, run.airstrike + amount * 10);
  }
}

const formationCache = new Map();

export function formationOffsets(count, limit = MAX_SQUAD) {
  const total = Math.max(0, Math.min(Math.floor(count), limit));
  if (formationCache.has(total)) return formationCache.get(total);
  if (total === 0) {
    const empty = Object.freeze([]);
    formationCache.set(total, empty);
    return empty;
  }
  const columns = total > 24 ? 7 : total > 14 ? 6 : total > 7 ? 5 : 4;
  const soldierTotal = Math.max(0, total - 1);
  const soldiers = [];
  for (let index = 0; index < soldierTotal; index += 1) {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, soldierTotal - row * columns);
    const column = index % columns;
    soldiers.push({
      x: (column - (rowCount - 1) / 2) * 23,
      y: row * 23
    });
  }
  const rearY = soldierTotal > 0
    ? Math.max(...soldiers.map((offset) => offset.y)) + 23
    : 0;
  const formation = Object.freeze([{ x: 0, y: rearY }, ...soldiers]
    .map((offset) => Object.freeze(offset)));
  formationCache.set(total, formation);
  return formation;
}

export function playerHitY() {
  return FORMATION_Y + 28;
}
