import {
  BATTLE_ACHIEVEMENTS,
  COMMANDERS,
  DAILY_POOL,
  RESEARCH_ORDER,
  THREAT_PROTOCOLS,
  VERSION,
  WEAPONS,
  allResearchMax,
  dailySelection,
  threatProtocolAvailable,
  todayKey
} from "./config.js";

const PROFILE_KEY = "firestorm-v6-profile";
const PROFILE_STORAGE_PREFIX = "firestorm-";
const LEGACY_PROFILE_KEYS = Object.freeze([
  "firestorm-credits",
  "firestorm-best",
  "firestorm-v5-unlocked",
  "firestorm-v5-selected",
  "firestorm-v5-research",
  "firestorm-v5-achievements",
  "firestorm-v5-tutorial",
  "firestorm-v5-savedrun",
  "firestorm-v5-daily"
]);

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function emptyResearch() {
  return Object.fromEntries(RESEARCH_ORDER.map((id) => [id, 0]));
}

export function createDaily(date = todayKey(), commanderCount = 1) {
  const tasks = dailySelection(date, { commanderCount }).map((task) => task.id);
  return {
    date,
    tasks,
    progress: Object.fromEntries(tasks.map((id) => [id, 0])),
    claimed: Object.fromEntries(tasks.map((id) => [id, false])),
    commanderUsage: [],
    bonusClaimed: false
  };
}

export function createProfile() {
  return {
    version: VERSION,
    credits: 0,
    best: 0,
    unlocked: ["viper"],
    selected: "viper",
    deployment: { protocol: "standard", max: false },
    research: emptyResearch(),
    achievements: [],
    achievementRewardsClaimed: [],
    daily: createDaily(),
    checkpoint: null,
    tutorialSeen: false,
    fullscreenPreferred: false,
    audio: true,
    musicVolume: 70,
    sfxVolume: 42,
    legacyRun: null,
    stats: {
      totalKills: 0,
      totalBosses: 0,
      totalRuns: 0,
      bestCombo: 0,
      perfectGateRounds: 0,
      unsupportedBosses: 0,
      maxDeploymentUses: 0,
      lastBossCommander: null,
      commanderBossWins: Object.fromEntries(Object.keys(COMMANDERS).map((id) => [id, 0])),
      commanderSkillUses: Object.fromEntries(Object.keys(COMMANDERS).map((id) => [id, 0])),
      threatBossWins: Object.fromEntries(Object.keys(THREAT_PROTOCOLS).map((id) => [id, 0]))
    }
  };
}

function clampInt(value, minimum, maximum) {
  const number = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function sanitizeProfile(candidate) {
  const base = createProfile();
  const profile = { ...base, ...candidate, version: VERSION };
  profile.credits = Math.max(0, Math.floor(Number(profile.credits) || 0));
  profile.best = Math.max(0, Math.floor(Number(profile.best) || 0));
  profile.audio = profile.audio !== false;
  profile.fullscreenPreferred = profile.fullscreenPreferred === true;
  profile.musicVolume = clampInt(profile.musicVolume, 0, 100);
  profile.sfxVolume = clampInt(profile.sfxVolume, 0, 100);
  profile.unlocked = [...new Set(["viper", ...(Array.isArray(profile.unlocked) ? profile.unlocked : [])])]
    .filter((id) => COMMANDERS[id]);
  profile.selected = profile.unlocked.includes(profile.selected) ? profile.selected : "viper";
  profile.research = {
    ...emptyResearch(),
    ...(profile.research || {})
  };
  for (const id of RESEARCH_ORDER) profile.research[id] = clampInt(profile.research[id], 0, 9);
  const requestedProtocol = candidate?.deployment?.protocol;
  profile.deployment = {
    protocol: threatProtocolAvailable(profile, requestedProtocol) ? requestedProtocol : "standard",
    max: allResearchMax(profile) && Boolean(candidate?.deployment?.max)
  };
  const validAchievementIds = new Set(BATTLE_ACHIEVEMENTS.map((item) => item.id));
  profile.achievements = [...new Set(Array.isArray(profile.achievements) ? profile.achievements : [])]
    .filter((id) => validAchievementIds.has(id));
  const rewardAchievementIds = new Set(BATTLE_ACHIEVEMENTS.filter((item) => item.reward).map((item) => item.id));
  profile.achievementRewardsClaimed = [...new Set(Array.isArray(profile.achievementRewardsClaimed) ? profile.achievementRewardsClaimed : [])]
    .filter((id) => rewardAchievementIds.has(id));
  const candidateStats = candidate?.stats || {};
  const candidateWins = candidateStats.commanderBossWins || {};
  const candidateSkillUses = candidateStats.commanderSkillUses || {};
  const candidateThreatWins = candidateStats.threatBossWins || {};
  profile.stats = {
    totalKills: Math.max(0, Math.floor(Number(candidateStats.totalKills) || 0)),
    totalBosses: Math.max(0, Math.floor(Number(candidateStats.totalBosses) || 0)),
    totalRuns: Math.max(0, Math.floor(Number(candidateStats.totalRuns) || 0)),
    bestCombo: Math.max(0, Math.floor(Number(candidateStats.bestCombo) || 0)),
    perfectGateRounds: Math.max(0, Math.floor(Number(candidateStats.perfectGateRounds) || 0)),
    unsupportedBosses: Math.max(0, Math.floor(Number(candidateStats.unsupportedBosses) || 0)),
    maxDeploymentUses: Math.max(0, Math.floor(Number(candidateStats.maxDeploymentUses) || 0)),
    lastBossCommander: COMMANDERS[candidateStats.lastBossCommander] ? candidateStats.lastBossCommander : null,
    commanderBossWins: Object.fromEntries(Object.keys(COMMANDERS).map((id) => [
      id,
      Math.max(0, Math.floor(Number(candidateWins[id]) || 0))
    ])),
    commanderSkillUses: Object.fromEntries(Object.keys(COMMANDERS).map((id) => [
      id,
      Math.max(0, Math.floor(Number(candidateSkillUses[id]) || 0))
    ])),
    threatBossWins: Object.fromEntries(Object.keys(THREAT_PROTOCOLS).map((id) => [
      id,
      Math.max(0, Math.floor(Number(candidateThreatWins[id]) || 0))
    ]))
  };
  const achievedComboTarget = BATTLE_ACHIEVEMENTS.reduce((highest, achievement) => (
    achievement.comboTarget && profile.achievements.includes(achievement.id)
      ? Math.max(highest, achievement.comboTarget)
      : highest
  ), 0);
  for (const achievement of BATTLE_ACHIEVEMENTS) {
    if (achievement.comboTarget && achievement.comboTarget <= achievedComboTarget && !profile.achievements.includes(achievement.id)) {
      profile.achievements.push(achievement.id);
    }
  }
  profile.stats.bestCombo = Math.max(profile.stats.bestCombo, achievedComboTarget);
  for (const achievement of BATTLE_ACHIEVEMENTS) {
    if (achievement.scoreTarget && profile.best >= achievement.scoreTarget && !profile.achievements.includes(achievement.id)) {
      profile.achievements.push(achievement.id);
    }
    if (achievement.stat && (profile.stats[achievement.stat] || 0) >= achievement.target
      && !profile.achievements.includes(achievement.id)) {
      profile.achievements.push(achievement.id);
    }
    if (achievement.commanderSkill && (profile.stats.commanderSkillUses[achievement.commanderSkill] || 0) > 0
      && !profile.achievements.includes(achievement.id)) {
      profile.achievements.push(achievement.id);
    }
  }
  const provenSkillAchievements = {
    thunderboss: "viper",
    logistics3: "engineer",
    fullarmor: "atlas",
    frozen: "frost",
    nova6: "nova",
    raider20: "raider"
  };
  for (const [achievementId, commanderId] of Object.entries(provenSkillAchievements)) {
    if (!profile.achievements.includes(achievementId)) continue;
    const skillId = `skill_${commanderId}`;
    if (!profile.achievements.includes(skillId)) profile.achievements.push(skillId);
    profile.stats.commanderSkillUses[commanderId] = Math.max(1, profile.stats.commanderSkillUses[commanderId]);
  }
  const commanderAchievementIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commander).map((achievement) => achievement.id);
  const masteryAchievement = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.commanderMeta);
  if (masteryAchievement) {
    profile.achievements = profile.achievements.filter((id) => id !== masteryAchievement.id);
    if (commanderAchievementIds.length === Object.keys(COMMANDERS).length
      && commanderAchievementIds.every((id) => profile.achievements.includes(id))) {
      profile.achievements.push(masteryAchievement.id);
    }
  }
  const skillAchievementIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.commanderSkill).map((achievement) => achievement.id);
  const skillMastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.skillMeta);
  if (skillMastery) {
    profile.achievements = profile.achievements.filter((id) => id !== skillMastery.id);
    if (skillAchievementIds.length === Object.keys(COMMANDERS).length
      && skillAchievementIds.every((id) => profile.achievements.includes(id))) {
      profile.achievements.push(skillMastery.id);
    }
  }
  const weaponAchievementIds = BATTLE_ACHIEVEMENTS.filter((achievement) => achievement.weaponMastery)
    .map((achievement) => achievement.id);
  const weaponMastery = BATTLE_ACHIEVEMENTS.find((achievement) => achievement.weaponMeta);
  if (weaponMastery) {
    profile.achievements = profile.achievements.filter((id) => id !== weaponMastery.id);
    if (weaponAchievementIds.length === Object.keys(WEAPONS).length
      && weaponAchievementIds.every((id) => profile.achievements.includes(id))) {
      profile.achievements.push(weaponMastery.id);
    }
  }
  ensureDaily(profile);
  return profile;
}

function migrateV5(storage) {
  const profile = createProfile();
  profile.credits = Math.max(0, Number(storage.getItem("firestorm-credits")) || 0);
  profile.best = Math.max(0, Number(storage.getItem("firestorm-best")) || 0);
  profile.unlocked = safeParse(storage.getItem("firestorm-v5-unlocked"), ["viper"]);
  profile.selected = storage.getItem("firestorm-v5-selected") || "viper";
  profile.research = {
    ...emptyResearch(),
    ...safeParse(storage.getItem("firestorm-v5-research"), {})
  };
  profile.achievements = safeParse(storage.getItem("firestorm-v5-achievements"), []);
  profile.tutorialSeen = storage.getItem("firestorm-v5-tutorial") === "1";
  profile.legacyRun = safeParse(storage.getItem("firestorm-v5-savedrun"), null);

  const oldDaily = safeParse(storage.getItem("firestorm-v5-daily"), null);
  if (oldDaily?.date === todayKey()) {
    profile.daily = createDaily(oldDaily.date);
    if (profile.daily.tasks.includes("kills")) {
      profile.daily.progress.kills = clampInt(oldDaily.progress, 0, 60);
      profile.daily.claimed.kills = Boolean(oldDaily.claimed);
    }
  }
  return profile;
}

export function loadProfile(storage = globalThis.localStorage) {
  const saved = safeParse(storage?.getItem(PROFILE_KEY), null);
  const profile = sanitizeProfile(saved || migrateV5(storage));
  grantAchievementRewards(profile);
  saveProfile(profile, storage);
  return profile;
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  if (!storage) return;
  profile.version = VERSION;
  storage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearAllProfileData(storage = globalThis.localStorage) {
  if (!storage?.removeItem) return 0;
  const keys = new Set([PROFILE_KEY, ...LEGACY_PROFILE_KEYS]);
  if (Number.isFinite(storage.length) && typeof storage.key === "function") {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PROFILE_STORAGE_PREFIX)) keys.add(key);
    }
  }
  let removed = 0;
  for (const key of keys) {
    if (storage.getItem?.(key) !== null) removed += 1;
    storage.removeItem(key);
  }
  return removed;
}

export function ensureDaily(profile, date = todayKey()) {
  if (!profile.daily || profile.daily.date !== date) {
    profile.daily = createDaily(date, profile.unlocked.length);
    return true;
  }
  const selected = dailySelection(date, { commanderCount: profile.unlocked.length }).map((task) => task.id);
  const eligibleIds = new Set(DAILY_POOL
    .filter((task) => profile.unlocked.length >= (task.minCommanders || 1))
    .map((task) => task.id));
  profile.daily.tasks = Array.isArray(profile.daily.tasks) && profile.daily.tasks.length === 3
    ? profile.daily.tasks.filter((id) => eligibleIds.has(id)).slice(0, 3)
    : selected;
  if (profile.daily.tasks.length !== 3) profile.daily.tasks = selected;
  profile.daily.progress ||= {};
  profile.daily.claimed ||= {};
  profile.daily.commanderUsage = [...new Set(Array.isArray(profile.daily.commanderUsage) ? profile.daily.commanderUsage : [])]
    .filter((id) => COMMANDERS[id]);
  for (const id of profile.daily.tasks) {
    profile.daily.progress[id] = Math.max(0, Number(profile.daily.progress[id]) || 0);
    profile.daily.claimed[id] = Boolean(profile.daily.claimed[id]);
  }
  profile.daily.bonusClaimed = Boolean(profile.daily.bonusClaimed);
  return false;
}

export function addDailyCommander(profile, commanderId) {
  ensureDaily(profile);
  if (!COMMANDERS[commanderId] || !profile.daily.tasks.includes("allCommanders")) return false;
  profile.daily.commanderUsage ||= [];
  if (profile.daily.commanderUsage.includes(commanderId)) return false;
  profile.daily.commanderUsage.push(commanderId);
  profile.daily.progress.allCommanders = Math.min(10, profile.daily.commanderUsage.length);
  return true;
}

export function addDailyProgress(profile, id, amount = 1) {
  ensureDaily(profile);
  if (!profile.daily.tasks.includes(id)) return false;
  const task = DAILY_POOL.find((item) => item.id === id);
  const previous = profile.daily.progress[id] || 0;
  profile.daily.progress[id] = Math.min(task.target, previous + amount);
  return profile.daily.progress[id] !== previous;
}

export function setDailyProgress(profile, id, value) {
  ensureDaily(profile);
  if (!profile.daily.tasks.includes(id)) return false;
  const task = DAILY_POOL.find((item) => item.id === id);
  const previous = profile.daily.progress[id] || 0;
  profile.daily.progress[id] = Math.min(task.target, Math.max(previous, value));
  return profile.daily.progress[id] !== previous;
}

export function claimDaily(profile, id) {
  ensureDaily(profile);
  if (!profile.daily.tasks.includes(id) || profile.daily.claimed[id]) return 0;
  const task = DAILY_POOL.find((item) => item.id === id);
  if ((profile.daily.progress[id] || 0) < task.target) return 0;
  profile.daily.claimed[id] = true;
  profile.credits += task.reward;
  return task.reward;
}

export function claimDailyBonus(profile) {
  ensureDaily(profile);
  if (profile.daily.bonusClaimed) return 0;
  if (!profile.daily.tasks.every((id) => profile.daily.claimed[id])) return 0;
  profile.daily.bonusClaimed = true;
  profile.credits += 40;
  return 40;
}

export function unlockAchievement(profile, id) {
  if (profile.achievements.includes(id)) return false;
  if (!BATTLE_ACHIEVEMENTS.some((achievement) => achievement.id === id)) return false;
  profile.achievements.push(id);
  return true;
}

export function grantAchievementRewards(profile, ids = profile.achievements) {
  profile.achievementRewardsClaimed ||= [];
  let reward = 0;
  for (const id of ids) {
    const achievement = BATTLE_ACHIEVEMENTS.find((item) => item.id === id);
    if (!achievement?.reward || !profile.achievements.includes(id) || profile.achievementRewardsClaimed.includes(id)) continue;
    profile.achievementRewardsClaimed.push(id);
    reward += achievement.reward;
  }
  profile.credits += reward;
  return reward;
}

export function commanderMilestoneCount(profile) {
  return Math.min(10, profile.unlocked.length);
}

export function commanderBattleCount(profile) {
  return Object.keys(COMMANDERS).filter((id) => (profile.stats.commanderBossWins[id] || 0) > 0).length;
}

export function commanderSkillCount(profile) {
  return Object.keys(COMMANDERS).filter((id) => profile.achievements.includes(`skill_${id}`)).length;
}

export function researchMedalCount(profile) {
  return RESEARCH_ORDER.reduce((sum, id) => sum + (profile.research[id] || 0), 0);
}

export function clearCheckpoint(profile) {
  profile.checkpoint = null;
  profile.legacyRun = null;
}

export function cloneSerializable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export { PROFILE_KEY };
