export const VERSION = 8;
export const BUILD_VERSION = "8.5.3";
export const WIDTH = 390;
export const HEIGHT = 693;
export const FORMATION_Y = 535;
export const MAX_SQUAD = 36;
export const WEAPON_MAX_LEVEL = 9;
export const BASE_ARMOR_CAP = 14;
export const FURY_COMBO_TARGET = 30;
export const FURY_COOLDOWN_SECONDS = 10;
export const COMMANDER_SKILL_COOLDOWN_SECONDS = 10;
export const SAFE_EXIT_SECONDS = 10;
export const ARMOR_HIT_INVULN_SECONDS = 0.5;
export const SQUAD_HIT_INVULN_SECONDS = 0.85;
export const PERFECT_GATE_MINIMUM = 6;
export const NO_SUPPORT_BOSS_SCORE_BONUS = 0.2;

export const COMMANDER_ORDER = [
  "viper",
  "engineer",
  "atlas",
  "frost",
  "reaper",
  "nova",
  "phoenix",
  "raider",
  "warden",
  "hunter"
];

export const COMMANDERS = {
  hunter: {
    name: "影歌",
    callsign: "HUNTER",
    role: "精準射手",
    threat: 100,
    price: 1000,
    color: "#b98cff",
    art: "hunter",
    baseSquad: 6,
    baseArmor: 0,
    startWeapon: "rifle",
    special: "狙殺連線",
    bossDamage: 780,
    desc: "22%機率造成2.4倍爆擊，對單一Boss的爆發火力最高。"
  },
  warden: {
    name: "鐵衛",
    callsign: "WARDEN",
    role: "要塞守衛",
    threat: 96,
    price: 850,
    color: "#7dffb0",
    art: "warden",
    baseSquad: 7,
    baseArmor: 7,
    startWeapon: "rifle",
    special: "能量護盾",
    bossDamage: 380,
    desc: "裝甲會回充至個人上限，技能提供3秒無敵，生存能力最強。"
  },
  raider: {
    name: "疾風",
    callsign: "RAIDER",
    role: "高速突擊",
    threat: 93,
    price: 720,
    color: "#ff9d54",
    art: "raider",
    baseSquad: 7,
    baseArmor: 0,
    startWeapon: "rifle",
    special: "極速連射",
    bossDamage: 480,
    desc: "射擊間隔永久縮短22%，技能再進入6秒火力狂熱。"
  },
  phoenix: {
    name: "鳳凰",
    callsign: "PHOENIX",
    role: "戰場醫療",
    threat: 89,
    price: 600,
    color: "#ff7a59",
    art: "phoenix",
    baseSquad: 6,
    baseArmor: 0,
    startWeapon: "rifle",
    special: "戰場急救",
    bossDamage: 380,
    desc: "小隊歸零可原地復活一次，技能立即補充10名士兵。"
  },
  nova: {
    name: "星火",
    callsign: "NOVA",
    role: "爆破專家",
    threat: 85,
    price: 500,
    color: "#ff6d9f",
    art: "nova",
    baseSquad: 5,
    baseArmor: 0,
    startWeapon: "shotgun",
    special: "軌道風暴",
    bossDamage: 720,
    desc: "霰彈開局，火力狂熱時間延長，近距離爆發能力突出。"
  },
  reaper: {
    name: "夜鴉",
    callsign: "REAPER",
    role: "收割專家",
    threat: 80,
    price: 420,
    color: "#ff4d6d",
    art: "reaper",
    baseSquad: 6,
    baseArmor: 0,
    startWeapon: "rifle",
    special: "死神鐮刀",
    bossDamage: 700,
    desc: "非Boss擊殺有5%機率補充一名士兵，擅長利用Boss援軍續戰。"
  },
  frost: {
    name: "凍岩",
    callsign: "FROST",
    role: "凍原尖兵",
    threat: 75,
    price: 350,
    color: "#9fe8ff",
    art: "frost",
    baseSquad: 6,
    baseArmor: 0,
    startWeapon: "laser",
    special: "絕對零度",
    bossDamage: 450,
    desc: "敵軍移動速度降低18%，技能會讓Boss停止移動與攻擊2.8秒。"
  },
  viper: {
    name: "凌風",
    callsign: "VIPER",
    role: "火力指揮",
    threat: 72,
    price: 300,
    starter: true,
    color: "#61e6ff",
    art: "viper",
    baseSquad: 6,
    baseArmor: 1,
    startWeapon: "rifle",
    special: "雷霆空襲",
    bossDamage: 620,
    desc: "新手配發。全武器傷害提高12%，攻防與空襲表現均衡。"
  },
  atlas: {
    name: "泰坦",
    callsign: "ATLAS",
    role: "裝甲先鋒",
    threat: 65,
    price: 220,
    color: "#ffc55f",
    art: "atlas",
    baseSquad: 8,
    baseArmor: 4,
    startWeapon: "rifle",
    special: "鋼鐵天幕",
    bossDamage: 420,
    desc: "開局兵力與裝甲較高，技能補充6點裝甲，適合穩定推進。"
  },
  engineer: {
    name: "銲星",
    callsign: "ENGINEER",
    role: "後勤專家",
    threat: 55,
    price: 160,
    color: "#5fd8c9",
    art: "engineer",
    baseSquad: 6,
    baseArmor: 0,
    startWeapon: "rifle",
    special: "支援空投",
    bossDamage: 480,
    desc: "全武器傷害提高8%，實際戰鬥軍備收益提高30%。"
  }
};

export const ZONES = [
  {
    id: "harbor",
    name: "破曉港區",
    code: "01 / BEACHHEAD",
    rule: "步兵集結・搶佔灘頭",
    top: "#54717b",
    bottom: "#172b31",
    accent: "#6eeeff",
    hazard: null,
    difficulty: 0
  },
  {
    id: "canyon",
    name: "赤砂峽谷",
    code: "02 / IRON CONVOY",
    rule: "裝甲縱隊・火力封鎖",
    top: "#8b5636",
    bottom: "#2b1d1b",
    accent: "#ffc05f",
    hazard: null,
    difficulty: 1
  },
  {
    id: "capital",
    name: "鋼鐵都城",
    code: "03 / LAST STAND",
    rule: "空地聯防・機甲決戰",
    top: "#364352",
    bottom: "#111823",
    accent: "#ff6b78",
    hazard: null,
    difficulty: 2
  },
  {
    id: "foundry",
    name: "熔爐工業帶",
    code: "04 / MOLTEN WORKS",
    rule: "熱區輪替・重甲壓境",
    top: "#783d2d",
    bottom: "#29120f",
    accent: "#ff824f",
    hazard: "heat-lane",
    difficulty: 3
  },
  {
    id: "snowfield",
    name: "零號雪原",
    code: "05 / WHITE SILENCE",
    rule: "寒流封鎖・進入安全通道",
    top: "#66889c",
    bottom: "#172730",
    accent: "#b9f4ff",
    hazard: "frost-wall",
    difficulty: 4
  },
  {
    id: "skyfront",
    name: "天穹防線",
    code: "06 / SKYBREAKER",
    rule: "空襲標記・交叉火網",
    top: "#3a5278",
    bottom: "#111a2e",
    accent: "#91bdff",
    hazard: "air-raid",
    difficulty: 5
  }
];

export const BOSS_CHASSIS = Object.freeze({
  babel: Object.freeze({
    id: "babel",
    name: "破城機甲・巴別",
    shortName: "巴別",
    color: "#ff6278",
    pattern: "fortress",
    music: "bossBabel"
  }),
  leviathan: Object.freeze({
    id: "leviathan",
    name: "空中母艦・利維坦",
    shortName: "利維坦",
    color: "#79c9ff",
    pattern: "carrier",
    music: "bossLeviathan"
  }),
  moloch: Object.freeze({
    id: "moloch",
    name: "熔核巨像・摩洛克",
    shortName: "摩洛克",
    color: "#ff914d",
    pattern: "forge",
    music: "bossMoloch"
  })
});

export const BOSS_CHASSIS_ORDER = Object.freeze(["babel", "leviathan", "moloch"]);

export function bossChassisForOrdinal(ordinal = 1) {
  const index = Math.max(0, Math.floor(ordinal) - 1) % BOSS_CHASSIS_ORDER.length;
  return BOSS_CHASSIS[BOSS_CHASSIS_ORDER[index]];
}

/**
 * Which of the three scene slots in a round get their zone hazard switched on.
 * Used for the newcomer ramp: round two gets one of three, round three gets two
 * of three, and from the fourth round on everything is live.
 */
export function pickHazardRounds(count) {
  const slots = [0, 1, 2];
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }
  return slots.slice(0, count);
}

export function buildZoneRoute(completedBosses = 0, previousRoute = [], seed = 0) {
  const cycle = Math.max(0, Math.floor(completedBosses));
  if (cycle === 0) return [0, 1, 2];
  if (cycle === 1) return [3, 4, 5];

  let state = (Number(seed) >>> 0) ^ Math.imul(cycle + 1, 0x9e3779b1);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const route = ZONES.map((_, index) => index);
  for (let index = route.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [route[index], route[swap]] = [route[swap], route[index]];
  }
  const previousLast = Array.isArray(previousRoute) ? previousRoute.at(-1) : null;
  if (route[0] === previousLast) {
    const swap = route.findIndex((zone, index) => index > 0 && zone !== previousLast);
    [route[0], route[swap]] = [route[swap], route[0]];
  }
  return route.slice(0, 3);
}

export function zoneIndexForRun(run) {
  const scene = Math.max(0, Math.floor(Number(run?.scene) || 0));
  const slot = scene % 3;
  const route = Array.isArray(run?.zoneRoute) && run.zoneRoute.length === 3 ? run.zoneRoute : null;
  const candidate = route ? Number(route[slot]) : scene % ZONES.length;
  return Number.isInteger(candidate) && ZONES[candidate] ? candidate : scene % ZONES.length;
}

export function zoneForRun(run) {
  return ZONES[zoneIndexForRun(run)] || ZONES[0];
}

export const WEAPONS = {
  rifle: {
    name: "脈衝步槍",
    icon: "▰",
    rate: 0.24,
    damage: 7,
    color: "#75efff",
    speed: 660,
    life: 1.25,
    shooters: 18,
    desc: "火力均衡・射速中等",
    ultimate: "雙脈衝：追加一發50%傷害的直射彈"
  },
  shotgun: {
    name: "裂陣霰彈",
    icon: "⌁",
    rate: 0.42,
    damage: 6,
    color: "#ffbf67",
    speed: 600,
    life: 0.85,
    shooters: 11,
    desc: "近距雙發・扇形散射",
    ultimate: "裂陣風暴：每名士兵改為三發扇形彈"
  },
  rocket: {
    name: "蜂群火箭",
    icon: "↟",
    rate: 0.72,
    damage: 26,
    color: "#ff6e78",
    speed: 420,
    life: 1.7,
    shooters: 5,
    desc: "火力強・射速慢・範圍爆破",
    ultimate: "連鎖爆破：爆炸半徑提高35%"
  },
  laser: {
    name: "高能雷射",
    icon: "═",
    rate: 0.16,
    damage: 4,
    color: "#c48bff",
    speed: 900,
    life: 1.4,
    shooters: 9,
    desc: "單發較弱・射速快・直線貫穿",
    ultimate: "超導光束：光束加寬並提高20%傷害"
  },
  minigun: {
    name: "旋轉機炮",
    icon: "≡",
    rate: 0.1,
    damage: 3,
    color: "#a8ff6a",
    speed: 720,
    life: 1.1,
    shooters: 22,
    desc: "射速極快・單發較弱・輕微散射",
    ultimate: "紅線過載：射擊間隔再縮短15%"
  },
  railgun: {
    name: "磁軌砲",
    icon: "▮",
    rate: 1.1,
    damage: 58,
    color: "#ffe36a",
    speed: 1000,
    life: 1.6,
    shooters: 4,
    desc: "單發最強・射速最慢・直線貫穿",
    ultimate: "天穹貫穿：砲彈加寬並提高35%傷害"
  }
};

export const RESEARCH = {
  damage: {
    name: "彈藥工坊",
    icon: "✦",
    desc: "全武器傷害每級 +12%",
    color: "#ff8068",
    baseCost: 50
  },
  squad: {
    name: "動員中心",
    icon: "▲",
    desc: "開局增援每級 +1",
    color: "#61e7ff",
    baseCost: 46
  },
  armor: {
    name: "重裝甲塊",
    icon: "▣",
    desc: "開局裝甲與容量每級 +1",
    color: "#ffd16d",
    baseCost: 44
  },
  crit: {
    name: "瞄準鏡片",
    icon: "◎",
    desc: "全域爆擊率每級 +3%",
    color: "#b98cff",
    baseCost: 42
  },
  credits: {
    name: "後勤合約",
    icon: "◆",
    desc: "實戰軍備收益每級 +8%",
    color: "#5fd8c9",
    baseCost: 38
  },
  dodge: {
    name: "反應裝甲",
    icon: "⛊",
    desc: "受擊格擋率每級 +2%",
    color: "#ffb3c8",
    baseCost: 36
  },
  luck: {
    name: "偵察情報",
    icon: "✧",
    desc: "增援門出現率每級小幅提高",
    color: "#7dffb0",
    baseCost: 34
  },
  tactics: {
    name: "戰術數據鏈",
    icon: "⌬",
    desc: "空襲能量獲取每級 +7%",
    color: "#ffdd8a",
    baseCost: 32
  },
  air: {
    name: "戰術空軍",
    icon: "☄",
    desc: "開局空襲能量每級 +10",
    color: "#ffd166",
    baseCost: 28
  }
};

export const RESEARCH_ORDER = [
  "damage",
  "squad",
  "armor",
  "crit",
  "credits",
  "dodge",
  "luck",
  "tactics",
  "air"
];

export const SUPPORTS = {
  medical: {
    icon: "♥",
    name: "醫療支援",
    color: "#7dffb0",
    cost: 80,
    tip: "+4裝甲・+6兵力・1.2秒無敵"
  },
  firepower: {
    icon: "⚡",
    name: "火力強化",
    color: "#ffd65e",
    cost: 60,
    tip: "6秒火力狂熱"
  },
  charge: {
    icon: "☄",
    name: "戰術充能",
    color: "#7dc8ff",
    cost: 40,
    tip: "空襲能量 +40"
  }
};

export function supportCost(id, completedBosses = 0) {
  const support = SUPPORTS[id];
  if (!support) return Infinity;
  const scaled = support.cost * (1 + Math.max(0, Math.floor(completedBosses)) * 0.4);
  return Math.max(5, Math.round(scaled / 5) * 5);
}

export const THREAT_PROTOCOLS = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    name: "標準協定",
    code: "STANDARD",
    icon: "◇",
    desc: "標準敵軍配置與戰績倍率",
    color: "#75efff",
    cost: 0,
    unlockScore: 0,
    scoreMultiplier: 1,
    enemyHp: 1,
    projectileSpeed: 1,
    fireInterval: 1,
    spawnInterval: 1,
    hazardInterval: 1,
    supplyRate: 1
  }),
  pressure: Object.freeze({
    id: "pressure",
    name: "高壓協定",
    code: "PRESSURE",
    icon: "Ⅰ",
    desc: "敵軍生命與彈速提高，戰績 ×1.25",
    color: "#ffbd5f",
    cost: 300,
    unlockScore: 250000,
    scoreMultiplier: 1.25,
    enemyHp: 1.15,
    projectileSpeed: 1.1,
    fireInterval: 0.94,
    spawnInterval: 0.92,
    hazardInterval: 0.9,
    supplyRate: 0.9
  }),
  iron: Object.freeze({
    id: "iron",
    name: "鐵血協定",
    code: "IRON BLOOD",
    icon: "Ⅱ",
    desc: "火網更密、補給更少，戰績 ×1.60",
    color: "#ff845f",
    cost: 900,
    unlockScore: 1000000,
    scoreMultiplier: 1.6,
    enemyHp: 1.3,
    projectileSpeed: 1.18,
    fireInterval: 0.88,
    spawnInterval: 0.85,
    hazardInterval: 0.78,
    supplyRate: 0.72
  }),
  extinction: Object.freeze({
    id: "extinction",
    name: "滅絕協定",
    code: "EXTINCTION",
    icon: "Ⅲ",
    desc: "極限敵軍與稀缺補給，戰績 ×2.20",
    color: "#ff4d70",
    cost: 2000,
    unlockScore: 10000000,
    scoreMultiplier: 2.2,
    enemyHp: 1.5,
    projectileSpeed: 1.28,
    fireInterval: 0.82,
    spawnInterval: 0.78,
    hazardInterval: 0.65,
    supplyRate: 0.48
  })
});

export const THREAT_PROTOCOL_ORDER = Object.freeze(["standard", "pressure", "iron", "extinction"]);

export function allResearchMax(profileOrResearch) {
  const research = profileOrResearch?.research || profileOrResearch || {};
  return RESEARCH_ORDER.every((id) => (research[id] || 0) >= 9);
}

export function threatProtocolAvailable(profile, id) {
  const protocol = THREAT_PROTOCOLS[id];
  if (!protocol) return false;
  if (id === "standard") return true;
  return allResearchMax(profile) && (profile?.best || 0) >= protocol.unlockScore;
}

export function maxDeploymentCost(commanderId, completedBosses = 0) {
  const commander = COMMANDERS[commanderId] || COMMANDERS.viper;
  return 800 + commander.price + Math.max(0, Math.floor(completedBosses)) * 400;
}

export const TACTICAL_MISSIONS = {
  formation: {
    name: "擴編至25人",
    icon: "▲",
    target: 25,
    desc: "利用增援門擴張隊形"
  },
  combo: {
    name: "達成15連破",
    icon: "ϟ",
    target: 15,
    desc: "保持火力不中斷"
  },
  armor: {
    name: "摧毀4台載具",
    icon: "◆",
    target: 4,
    desc: "坦克、砲塔與武裝機均計入"
  }
};

export const BATTLE_ACHIEVEMENTS = [
  { id: "deploy", icon: "▲", name: "縱隊出擊", desc: "完成首次作戰部署" },
  { id: "gate", icon: "×1.2", name: "兵力整編", desc: "首次穿越比例增援門" },
  { id: "formation", icon: "30", name: "鋼鐵人海", desc: "單局小隊達到30人" },
  { id: "fury", icon: "ϟ", name: "火力狂熱", desc: "觸發一次自然火力狂熱" },
  { id: "airstrike", icon: "☄", name: "天火降臨", desc: "施放一次指揮官技能" },
  { id: "boss", icon: "★", name: "破城先鋒", desc: "擊破一座終局機甲堡壘" },
  { id: "combo20", icon: "20", name: "初入節奏", desc: "單次連擊數達到20", comboTarget: 20, reward: 10 },
  { id: "combo50", icon: "50", name: "連擊大師", desc: "單次連擊數達到50", comboTarget: 50, reward: 20 },
  { id: "combo100", icon: "100", name: "百連破陣", desc: "單次連擊數達到100", comboTarget: 100, reward: 35 },
  { id: "combo200", icon: "200", name: "鋼鐵收割", desc: "單次連擊數達到200", comboTarget: 200, reward: 55 },
  { id: "combo300", icon: "300", name: "無間火網", desc: "單次連擊數達到300", comboTarget: 300, reward: 80 },
  { id: "sniperkill", icon: "◆", name: "反狙擊手", desc: "擊殺一名敵方狙擊兵" },
  { id: "weapon_rifle", icon: "▰", name: "脈衝紀律", desc: "單次COMBO連續以脈衝步槍擊破30名非Boss敵軍", weaponMastery: "rifle", reward: 30 },
  { id: "weapon_shotgun", icon: "⌁", name: "裂陣齊射", desc: "同一次裂陣霰彈齊射擊破4名非Boss敵軍", weaponMastery: "shotgun", reward: 30 },
  { id: "weapon_rocket", icon: "↟", name: "蜂群殉爆", desc: "同一枚蜂群火箭擊破3名非Boss敵軍", weaponMastery: "rocket", reward: 30 },
  { id: "laser", icon: "═", name: "光束時代", desc: "同一束高能雷射貫穿4名非Boss敵軍", weaponMastery: "laser", reward: 30 },
  { id: "weapon_minigun", icon: "≡", name: "紅線壓制", desc: "8秒內以旋轉機炮擊破20名非Boss敵軍", weaponMastery: "minigun", reward: 30 },
  { id: "weapon_railgun", icon: "▮", name: "天穹貫穿", desc: "同一發磁軌砲擊破3名非Boss敵軍", weaponMastery: "railgun", reward: 30 },
  { id: "weapon_mastery", icon: "6", name: "六械宗師", desc: "完成六種武器的全部專精成就", weaponMeta: true, reward: 120 },
  { id: "crit", icon: "◎", name: "神射手", desc: "打出一次爆擊傷害" },
  { id: "score10k", icon: "10K", name: "戰功彪炳", desc: "單局分數達到10,000", scoreTarget: 10000, reward: 10 },
  { id: "score50k", icon: "50K", name: "百戰精銳", desc: "單局分數達到50,000", scoreTarget: 50000, reward: 20 },
  { id: "score100k", icon: "100K", name: "戰區王牌", desc: "單局分數達到100,000", scoreTarget: 100000, reward: 30 },
  { id: "score250k", icon: "250K", name: "高壓適格", desc: "單局分數達到250,000・解鎖高壓協定", scoreTarget: 250000, reward: 50 },
  { id: "score500k", icon: "500K", name: "不滅縱隊", desc: "單局分數達到500,000", scoreTarget: 500000, reward: 75 },
  { id: "score1m", icon: "1M", name: "鐵血統帥", desc: "單局分數達到1,000,000・解鎖鐵血協定", scoreTarget: 1000000, reward: 100 },
  { id: "score2500k", icon: "2.5M", name: "戰爭機器", desc: "單局分數達到2,500,000", scoreTarget: 2500000, reward: 150 },
  { id: "score5m", icon: "5M", name: "星火燎原", desc: "單局分數達到5,000,000", scoreTarget: 5000000, reward: 220 },
  { id: "score10m", icon: "10M", name: "滅絕授權", desc: "單局分數達到10,000,000・解鎖滅絕協定", scoreTarget: 10000000, reward: 300 },
  { id: "score25m", icon: "25M", name: "火線傳說", desc: "單局分數達到25,000,000", scoreTarget: 25000000, reward: 500 },
  { id: "score50m", icon: "50M", name: "戰史封神", desc: "單局分數達到50,000,000", scoreTarget: 50000000, reward: 750 },
  { id: "score100m", icon: "100M", name: "縱隊神話", desc: "單局分數達到100,000,000", scoreTarget: 100000000, reward: 1100 },
  { id: "warmachine", icon: "⚔", name: "機甲屠夫", desc: "單局擊破3座機甲堡壘" },
  { id: "allgates1", icon: "◇", name: "滴水不漏", desc: "單輪至少6組二選一全部取得", stat: "perfectGateRounds", target: 1, reward: 25, elite: true },
  { id: "allgates3", icon: "◇3", name: "全數回收", desc: "累積3輪完成全部二選一", stat: "perfectGateRounds", target: 3, reward: 55, elite: true },
  { id: "allgates10", icon: "◇10", name: "選擇支配者", desc: "累積10輪完成全部二選一", stat: "perfectGateRounds", target: 10, reward: 120, elite: true },
  { id: "nosupport1", icon: "×", name: "孤軍作戰", desc: "不使用戰場支援擊破1次Boss", stat: "unsupportedBosses", target: 1, reward: 25, elite: true },
  { id: "nosupport3", icon: "×3", name: "拒絕增援", desc: "累積3輪無支援擊破Boss", stat: "unsupportedBosses", target: 3, reward: 55, elite: true },
  { id: "nosupport10", icon: "×10", name: "鋼鐵意志", desc: "累積10輪無支援擊破Boss", stat: "unsupportedBosses", target: 10, reward: 120, elite: true },
  { id: "flawlessboss", icon: "0", name: "零損接敵", desc: "Boss戰中未損失裝甲或士兵並獲勝", reward: 45, elite: true },
  { id: "lastthree", icon: "3", name: "最後三人", desc: "僅剩3名以下士兵時擊破Boss", reward: 45, elite: true },
  { id: "arsenal6", icon: "6", name: "六械輪轉", desc: "單一Boss循環使用過全部6種武器", reward: 50 },
  { id: "sixzones", icon: "06", name: "六區遠征", desc: "單局完成六個不同戰區並擊破第二隻Boss", reward: 60 },
  { id: "protocol_pressure", icon: "Ⅰ", name: "高壓破城", desc: "在高壓協定下擊破Boss", reward: 60, elite: true },
  { id: "protocol_iron", icon: "Ⅱ", name: "鐵血破城", desc: "在鐵血協定下擊破Boss", reward: 100, elite: true },
  { id: "protocol_extinction", icon: "Ⅲ", name: "滅絕破城", desc: "在滅絕協定下擊破Boss", reward: 180, elite: true },
  { id: "fullsortie", icon: "MAX", name: "萬金一擲", desc: "首次簽署滿級出擊合約", reward: 30 },
  { id: "thunderboss", icon: "☄", name: "雷霆斬首", desc: "使用雷霆空襲擊破Boss", commander: "viper" },
  { id: "logistics3", icon: "◆", name: "後勤洪流", desc: "單輪使用支援空投3次", commander: "engineer" },
  { id: "fullarmor", icon: "▣", name: "滿載天幕", desc: "從非滿裝甲使用鋼鐵天幕補至MAX", commander: "atlas" },
  { id: "frozen", icon: "❄", name: "冰封戰場", desc: "使用絕對零度真正凍結Boss", commander: "frost" },
  { id: "reaper8", icon: "†", name: "死神徵兵", desc: "單輪透過被動實際補回8名士兵", commander: "reaper" },
  { id: "nova6", icon: "✦", name: "軌道清場", desc: "一次軌道風暴擊破6名非Boss敵軍", commander: "nova" },
  { id: "revive", icon: "♥", name: "鳳凰涅槃", desc: "單輪觸發一次原地復活", commander: "phoenix" },
  { id: "raider20", icon: "ϟ", name: "極速殲滅", desc: "一次極速連射期間擊破20名非Boss敵軍", commander: "raider" },
  { id: "wardenmax", icon: "⬡", name: "不破要塞", desc: "以MAX裝甲擊破Boss", commander: "warden", elite: true },
  { id: "huntercrit8", icon: "◎", name: "弱點鎖定", desc: "單場Boss戰對Boss造成8次爆擊", commander: "hunter" },
  { id: "allmastery", icon: "10", name: "全機精通", desc: "完成十位指揮官的全部專屬成就", commanderMeta: true },
  ...COMMANDER_ORDER.map((id) => ({
    id: `skill_${id}`,
    icon: "☄",
    name: `${COMMANDERS[id].name}・技能實戰`,
    desc: `施放一次專屬技能「${COMMANDERS[id].special}」`,
    commanderSkill: id,
    reward: 15
  })),
  { id: "allskills", icon: "☄10", name: "十機戰術鏈", desc: "十位指揮官都施放過專屬技能", skillMeta: true, reward: 100 }
];

export const DAILY_POOL = [
  { id: "kills", icon: "✦", name: "殲滅行動", desc: "擊破60名敵軍", target: 60, reward: 35 },
  { id: "score", icon: "◆", name: "戰功累積", desc: "累積15000分", target: 15000, reward: 30 },
  { id: "bosses", icon: "★", name: "破城任務", desc: "擊破1座Boss", target: 1, reward: 35 },
  { id: "vehicles", icon: "▣", name: "反裝甲作戰", desc: "摧毀8台載具", target: 8, reward: 28 },
  { id: "combo", icon: "ϟ", name: "火力連線", desc: "達成30連破", target: 30, reward: 25 },
  { id: "supports", icon: "♥", name: "呼叫支援", desc: "使用2種戰場支援", target: 2, reward: 22 },
  { id: "research", icon: "⌬", name: "技術突破", desc: "完成1次研究", target: 1, reward: 20 },
  {
    id: "rotation",
    icon: "↻",
    name: "輪值出擊",
    desc: "使用與上次擊破Boss不同的指揮官擊破1次Boss",
    target: 1,
    reward: 35,
    minCommanders: 2
  },
  {
    id: "allCommanders",
    icon: "10",
    name: "十機輪值",
    desc: "當日使用10位不同指揮官各擊破1次Boss",
    target: 10,
    reward: 90,
    minCommanders: 10,
    uniqueCommanders: true
  }
];

export const ENEMY_STATS = {
  trooper: { hp: 52, speed: 44, radius: 14, score: 80 },
  rusher: { hp: 36, speed: 76, radius: 12, score: 100 },
  shield: { hp: 130, speed: 31, radius: 18, score: 180 },
  turret: { hp: 210, speed: 27, radius: 23, score: 260 },
  tank: { hp: 430, speed: 22, radius: 29, score: 520 },
  gunship: { hp: 300, speed: 29, radius: 26, score: 440 },
  elite: { hp: 680, speed: 25, radius: 30, score: 1100 },
  sniper: { hp: 90, speed: 16, radius: 16, score: 340 },
  boss: { hp: 9200, speed: 18, radius: 62, score: 9000 }
};

export function researchCost(id, currentLevel) {
  return RESEARCH[id].baseCost * (currentLevel + 1);
}

export function armorCap(research) {
  return BASE_ARMOR_CAP + (research.armor || 0);
}

export function todayKey(date = new Date()) {
  return date.toLocaleDateString("sv-SE");
}

export function dailySelection(dateKey, { commanderCount = 1 } = {}) {
  let seed = [...dateKey].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const pool = DAILY_POOL.filter((task) => commanderCount >= (task.minCommanders || 1));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const swap = Math.floor((seed / 233280) * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, 3);
}
