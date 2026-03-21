'use strict';

/* ── INVENTORY GRID ───────────────────────────────────────────── */
const INV_COLS          = 6;
const INV_ROWS          = 4;
const INV_SLOTS         = 24;
const STACK_MAX_DEFAULT = 5;

/* ── PITY SYSTEM ─────────────────────────────────────────────── */
const PITY_EPIC_THRESHOLD       = 30;
const PITY_LEGENDARY_THRESHOLD  = 100;

/* ── TASK DIFFICULTIES ───────────────────────────────────────── */
const TASK_DIFFICULTIES = [
  { id: 'micro',  label: 'Mikro',  icon: '·', xp:  50 },
  { id: 'normal', label: 'Normal', icon: '▸', xp: 100 },
  { id: 'hard',   label: 'Schwer', icon: '▲', xp: 250 },
];
function getTaskXP(d) { const f = TASK_DIFFICULTIES.find(x => x.id === d); return f ? f.xp : 100; }

/* ── XP & LEVEL ──────────────────────────────────────────────── */
const LEVEL_BASE_XP = 500;
function getXPForLevel(level) {
  if (level < 10)  return 500;
  if (level < 25)  return 750;
  if (level < 50)  return 1000;
  return 1000 + Math.floor((level - 50) / 5) * 100;
}

const CATEGORY_XP = {
  work: 250, private: 200, gaming: 150,
  daily_easy: 100, daily_medium: 200, daily_hard: 300,
  weekly: 200,
};

/* ── LEVEL CLASSES ───────────────────────────────────────────── */
const LEVEL_CLASSES = [
  { level: 1,   name: 'Anfänger'    },
  { level: 5,   name: 'Einsteiger'  },
  { level: 10,  name: 'Macher'      },
  { level: 20,  name: 'Grinder'     },
  { level: 35,  name: 'Veteran'     },
  { level: 50,  name: 'Pro'         },
  { level: 75,  name: 'Elite'       },
  { level: 100, name: 'Legende'     },
];
function getLevelClassName(lvl) {
  let cls = LEVEL_CLASSES[0];
  for (const c of LEVEL_CLASSES) { if (lvl >= c.level) cls = c; }
  return cls.name;
}
function getLevelClass(lvl) {
  for (const c of LEVEL_CLASSES) { if (lvl === c.level) return c; }
  return null;
}

/* ════════════════════════════════════════════════════════════════
   NEW CARD CATALOG — 11 cards
   ════════════════════════════════════════════════════════════════ */
const CARD_CATALOG = [

  // ── COMMON ─────────────────────────────────────────────────────
  {
    id: 'xp_plus', name: 'XP+', icon: '⚡', rarity: 'common',
    desc: '+50% XP auf die nächste abgeschlossene Quest.',
    effect: '×1.5 XP',
    type: 'xp_mult', value: 1.5,
    unlockLevel: 1,
  },

  // ── RARE ───────────────────────────────────────────────────────
  {
    id: 'double_xp', name: '2x XP', icon: '🌀', rarity: 'rare',
    desc: 'Verdoppelt die XP der nächsten Quest.',
    effect: '×2 XP',
    type: 'xp_mult', value: 2,
    unlockLevel: 3,
  },
  {
    id: 'chance', name: 'Chance', icon: '🎲', rarity: 'rare',
    desc: '50%: ×2 XP — 50%: nur 50% XP.',
    effect: '50/50 Glücksspiel',
    type: 'chance', value: { win: 2.0, lose: 0.5 },
    unlockLevel: 5,
  },
  {
    id: 'on_time', name: 'On Time', icon: '⏱️', rarity: 'rare',
    desc: '×3 XP wenn die Quest innerhalb von 30 Minuten abgeschlossen wird.',
    effect: '×3 XP (30 Min Limit)',
    type: 'on_time', value: { mult: 3, windowMs: 30 * 60 * 1000 },
    unlockLevel: 7,
  },
  {
    id: 'deck', name: 'Deck', icon: '🃏', rarity: 'rare',
    desc: 'Ziehe 3 zufällige Karten aus dem Loot-Pool.',
    effect: '+3 Zufallskarten',
    type: 'deck', value: 3,
    unlockLevel: 10,
  },

  // ── EPIC ───────────────────────────────────────────────────────
  {
    id: 'triple_xp', name: '3x XP', icon: '🔱', rarity: 'epic',
    desc: 'Verdreifacht die XP der nächsten Quest.',
    effect: '×3 XP',
    type: 'xp_mult', value: 3,
    unlockLevel: 15,
  },
  {
    id: 'shield', name: 'Shield', icon: '🛡️', rarity: 'epic',
    desc: 'Verhindert einmalig einen Streak-Verlust.',
    effect: 'Streak geschützt',
    type: 'shield', value: 1,
    unlockAchievement: 'streak_7',
  },
  {
    id: 'overdrive', name: 'Overdrive', icon: '🔥', rarity: 'epic',
    desc: '+200% XP, aber der nächste Task-Reward ist deaktiviert.',
    effect: '×3 XP, nächster Reward gesperrt',
    type: 'overdrive', value: 3,
    unlockAchievement: 'task_50',
  },
  {
    id: 'focus', name: 'Focus', icon: '🎯', rarity: 'epic',
    desc: '+200% XP — aber NUR wenn in der letzten Stunde kein anderer Task abgeschlossen wurde.',
    effect: '×3 XP (Solo-Bedingung)',
    type: 'focus', value: { mult: 3, windowMs: 60 * 60 * 1000 },
    unlockAchievement: 'task_100',
  },

  // ── LEGENDARY ──────────────────────────────────────────────────
  {
    id: 'jackpot', name: 'Jackpot', icon: '🎰', rarity: 'legendary',
    desc: 'Zufälliger Multiplikator: 0× bis 20× XP.',
    effect: 'Random ×0–×20 XP',
    type: 'jackpot', value: { min: 0, max: 20 },
    unlockLevel: 25,
  },

  // ── MYTHIC ─────────────────────────────────────────────────────
  {
    id: 'fate_split', name: 'Fate Split', icon: '🌌', rarity: 'mythic',
    desc: '50%: 0 XP + Streak-Reset — 50%: ×10 XP + Bonus Lootbox.',
    effect: '50/50: Ruin oder Triumph',
    type: 'fate_split', value: { win_mult: 10, win_loot: 'advanced' },
    unlockLevel: 40,
  },
];

function getCard(id) { return CARD_CATALOG.find(c => c.id === id); }

/* ── CARD UNLOCK SYSTEM ──────────────────────────────────────── */
// Returns all card IDs currently available in loot pools based on player state
function getUnlockedCardPool(playerState) {
  const achUnlocked = getAchievementUnlockedCards(playerState);
  return CARD_CATALOG.filter(card => {
    // Achievement-gated cards (shield, overdrive, focus, deck)
    if (card.unlockAchievement) {
      return achUnlocked.has(card.id) || playerState.achievements?.includes(card.unlockAchievement);
    }
    // Level-gated cards
    if (card.unlockLevel && playerState.level < card.unlockLevel) return false;
    return true;
  }).map(c => c.id);
}

/* ── LOOTBOX DEFINITIONS ─────────────────────────────────────── */
const LOOTBOX_DEFS = {

  // Basic Box — Level rewards, 30% chance on level-up
  basic: {
    name: 'Basic Box', icon: '📦', cards: 2,
    pool: [
      { rarity: 'common', weight: 70 },
      { rarity: 'rare',   weight: 30 },
    ],
  },

  // Advanced Box — Weekly challenges, Achievements
  advanced: {
    name: 'Advanced Box', icon: '🎁', cards: 3,
    pool: [
      { rarity: 'rare',      weight: 60 },
      { rarity: 'epic',      weight: 30 },
      { rarity: 'legendary', weight: 10 },
    ],
  },

  // Premium Box — Shop
  premium: {
    name: 'Premium Box', icon: '💎', cards: 3,
    pool: [
      { rarity: 'common',    weight: 40 },
      { rarity: 'rare',      weight: 30 },
      { rarity: 'epic',      weight: 20 },
      { rarity: 'legendary', weight:  9 },
      { rarity: 'mythic',    weight:  1 },
    ],
  },

  // Mythic Box — Ultra rare
  mythic: {
    name: 'Mythic Box', icon: '🌌', cards: 4,
    pool: [
      { rarity: 'epic',      weight: 60 },
      { rarity: 'legendary', weight: 30 },
      { rarity: 'mythic',    weight: 10 },
    ],
  },

  // Legacy aliases (existing code uses these names)
  small:     { name: 'Basic Box',    icon: '📦', cards: 2, pool: [{ rarity: 'common', weight: 70 }, { rarity: 'rare', weight: 30 }] },
  big:       { name: 'Advanced Box', icon: '🎁', cards: 3, pool: [{ rarity: 'rare', weight: 60 }, { rarity: 'epic', weight: 30 }, { rarity: 'legendary', weight: 10 }] },
  epic:      { name: 'Premium Box',  icon: '💎', cards: 3, pool: [{ rarity: 'common', weight: 40 }, { rarity: 'rare', weight: 30 }, { rarity: 'epic', weight: 20 }, { rarity: 'legendary', weight: 9 }, { rarity: 'mythic', weight: 1 }] },
  legendary: { name: 'Mythic Box',   icon: '🌌', cards: 4, pool: [{ rarity: 'epic', weight: 60 }, { rarity: 'legendary', weight: 30 }, { rarity: 'mythic', weight: 10 }] },
};

/* ── ACHIEVEMENTS ────────────────────────────────────────────── */
/*
 * reward field: shown in UI
 * unlocks field: card id added to loot pool (for unlock-gate cards)
 * grant function: executed when achievement fires
 *
 * Cards gated by achievement:
 *   shield    → streak_7
 *   overdrive → task_50
 *   focus     → task_100
 *   deck      → level_10 (level 10)
 */
const ACHIEVEMENTS = [

  // ── CONSISTENCY (Streak) ──────────────────────────────────────
  { id: 'streak_3', icon: '🔥', name: 'Erste Flamme', category: 'streak',
    desc: '3-Tage Streak aufbauen',
    reward: '+500 Bonus XP',
    check: s => s.streak >= 3,
    grant: s => { s.xp += 500; s.totalXP += 500; } },

  { id: 'streak_7', icon: '🛡️', name: 'Eine Woche!', category: 'streak',
    desc: '7-Tage Streak',
    reward: '🔓 Shield-Karte freigeschaltet',
    unlocks: 'shield',
    check: s => s.streak >= 7,
    grant: s => { /* shield unlocked via pool — no direct card */ } },

  { id: 'streak_14', icon: '🔥🔥', name: 'Zwei Wochen!', category: 'streak',
    desc: '14-Tage Streak',
    reward: '🎁 Advanced Box',
    check: s => s.streak >= 14,
    grant: s => { Cards.queueLoot('advanced'); } },

  { id: 'streak_30', icon: '⚡', name: 'Ein Monat!', category: 'streak',
    desc: '30-Tage Streak',
    reward: '🌌 Mythic Box',
    check: s => s.streak >= 30,
    grant: s => { Cards.queueLoot('mythic'); } },

  // ── PRODUCTIVITY (Tasks) ──────────────────────────────────────
  { id: 'task_10', icon: '✅', name: 'In den Rhythmus', category: 'tasks',
    desc: '10 Quests abschließen',
    reward: '📦 Basic Lootbox',
    check: s => s.done >= 10,
    grant: s => { Cards.queueLoot('basic'); } },

  { id: 'task_50', icon: '🔥', name: 'Overdrive!', category: 'tasks',
    desc: '50 Quests abschließen',
    reward: '🔓 Overdrive-Karte + Advanced Box',
    unlocks: 'overdrive',
    check: s => s.done >= 50,
    grant: s => { Cards.queueLoot('advanced'); } },

  { id: 'task_100', icon: '👑', name: 'Centurion', category: 'tasks',
    desc: '100 Quests abschließen',
    reward: '🔓 Focus-Karte + Premium Box',
    unlocks: 'focus',
    check: s => s.done >= 100,
    grant: s => { Cards.queueLoot('premium'); } },

  { id: 'task_500', icon: '🌟', name: 'Legende', category: 'tasks',
    desc: '500 Quests abschließen',
    reward: '🌌 Mythic Box',
    check: s => s.done >= 500,
    grant: s => { Cards.queueLoot('mythic'); } },

  // ── GAMEPLAY (Lootboxen & Karten) ────────────────────────────
  { id: 'boxes_5', icon: '📦', name: 'Sammler', category: 'gameplay',
    desc: '5 Lootboxen öffnen',
    reward: '+1000 Bonus XP',
    check: s => (s.totalBoxesOpened || 0) >= 5,
    grant: s => { s.xp += 1000; s.totalXP += 1000; } },

  { id: 'cards_10', icon: '🃏', name: 'Kartenspieler', category: 'gameplay',
    desc: '10 Karten benutzen',
    reward: '📦 Basic Lootbox',
    check: s => (s.cardsUsed || 0) >= 10,
    grant: s => { Cards.queueLoot('basic'); } },

  { id: 'cards_25', icon: '🎴', name: 'Kartenmeister', category: 'gameplay',
    desc: '25 Karten benutzen',
    reward: '🎁 Advanced Lootbox',
    check: s => (s.cardsUsed || 0) >= 25,
    grant: s => { Cards.queueLoot('advanced'); } },

  // ── PROGRESSION (Level) ───────────────────────────────────────
  { id: 'level_5', icon: '⭐', name: 'Aufsteiger', category: 'progression',
    desc: 'Level 5 erreichen',
    reward: '📦 Basic Lootbox',
    check: s => s.level >= 5,
    grant: s => { Cards.queueLoot('basic'); } },

  { id: 'level_10', icon: '🃏', name: 'Deck Meister', category: 'progression',
    desc: 'Level 10 erreichen',
    reward: '🔓 Deck-Karte freigeschaltet',
    unlocks: 'deck',
    check: s => s.level >= 10,
    grant: s => { /* deck card unlocked via pool */ } },

  { id: 'level_20', icon: '💎', name: 'Veteran', category: 'progression',
    desc: 'Level 20 erreichen',
    reward: '🎁 Advanced Lootbox',
    check: s => s.level >= 20,
    grant: s => { Cards.queueLoot('advanced'); } },

  // ── HIDDEN ────────────────────────────────────────────────────
  { id: 'lucky_gamble', icon: '🎰', name: 'Glücksgriff', category: 'special', hidden: true,
    desc: '???', reward: '🎁 Advanced Box',
    check: s => (s.wonGamble || 0) >= 1,
    grant: s => { Cards.queueLoot('advanced'); } },

  { id: 'first_task', icon: '👣', name: 'Erster Schritt', category: 'tasks', hidden: true,
    desc: '???', reward: '+200 Bonus XP',
    check: s => s.done >= 1,
    grant: s => { s.xp += 200; s.totalXP += 200; } },
];

/* ── ACHIEVEMENT UNLOCK HELPERS ──────────────────────────────── */
// Returns set of card IDs that are unlocked via achievements
function getAchievementUnlockedCards(playerState) {
  const unlocked = new Set();
  for (const ach of ACHIEVEMENTS) {
    if (ach.unlocks && playerState.achievements?.includes(ach.id)) {
      unlocked.add(ach.unlocks);
    }
  }
  return unlocked;
}

/* ── STREAK REWARDS ──────────────────────────────────────────── */
const STREAK_REWARDS = [
  { streak: 3,   reward: 'basic',    text: '📦 Basic Box'    },
  { streak: 7,   reward: 'advanced', text: '🎁 Advanced Box' },
  { streak: 14,  reward: 'advanced', text: '🎁 Advanced Box' },
  { streak: 30,  reward: 'premium',  text: '💎 Premium Box'  },
  { streak: 60,  reward: 'mythic',   text: '🌌 Mythic Box'   },
  { streak: 100, reward: 'mythic',   text: '🌌 Mythic Box'   },
];

/* ── WEEKLY CHALLENGES ───────────────────────────────────────── */
const WEEKLY_POOL = [
  { id: 'w1', icon: '🏃', name: '30 Min Sport'           },
  { id: 'w2', icon: '📚', name: 'Buch lesen (1 Kapitel)' },
  { id: 'w3', icon: '🧹', name: 'Zimmer aufräumen'        },
  { id: 'w4', icon: '🥗', name: 'Gesund essen heute'      },
  { id: 'w5', icon: '💧', name: '2L Wasser trinken'       },
  { id: 'w6', icon: '🧘', name: '10 Min Meditation'       },
  { id: 'w7', icon: '📝', name: 'Tagebuch schreiben'      },
  { id: 'w8', icon: '👥', name: 'Freunde kontaktieren'    },
  { id: 'w9', icon: '🎯', name: 'Ziel für morgen setzen'  },
];

const WEEKLY_CHALLENGES = [
  { id: 'wc1', icon: '🏃', name: '7 Tage Sport-Streak', steps: 7,  xp: 200, loot: 'advanced', category: 'fitness'  },
  { id: 'wc2', icon: '📚', name: 'Lese-Marathon',        steps: 5,  xp: 200, loot: 'basic',    category: 'learning' },
  { id: 'wc3', icon: '💧', name: 'Hydrations-Challenge', steps: 7,  xp: 150, loot: 'basic',    category: 'health'   },
  { id: 'wc4', icon: '🎯', name: 'Fokus-Woche',          steps: 5,  xp: 250, loot: 'advanced', category: 'work'     },
  { id: 'wc5', icon: '🌟', name: 'Meister-Challenge',    steps: 14, xp: 200, loot: 'premium',  category: 'special'  },
];

/* ── DAILY TASKS POOL ────────────────────────────────────────── */
const DAILY_TASK_POOL = [
  { id: 'd1',  icon: '🏃', name: '15 Min Sport',                xpKey: 'daily_easy'   },
  { id: 'd2',  icon: '💧', name: '2L Wasser trinken',           xpKey: 'daily_easy'   },
  { id: 'd3',  icon: '🛏️', name: 'Pünktlich ins Bett',          xpKey: 'daily_easy'   },
  { id: 'd4',  icon: '📚', name: '20 Min lesen',                xpKey: 'daily_medium' },
  { id: 'd5',  icon: '🧘', name: '10 Min Meditation',           xpKey: 'daily_medium' },
  { id: 'd6',  icon: '🥗', name: 'Gesunde Mahlzeit',            xpKey: 'daily_medium' },
  { id: 'd7',  icon: '📝', name: 'Tagebuch schreiben',          xpKey: 'daily_medium' },
  { id: 'd8',  icon: '🏋️', name: '30 Min Sport',                xpKey: 'daily_hard'   },
  { id: 'd9',  icon: '🧹', name: 'Wohnung aufräumen',           xpKey: 'daily_hard'   },
  { id: 'd10', icon: '🎯', name: '1h fokussiert arbeiten',      xpKey: 'daily_hard'   },
  { id: 'd11', icon: '🌿', name: 'Spaziergang 30 Min',          xpKey: 'daily_easy'   },
  { id: 'd12', icon: '📵', name: '2h kein Smartphone',          xpKey: 'daily_medium' },
];

/* ── DAILY LOGIN REWARDS ─────────────────────────────────────── */
const DAILY_LOGIN_REWARDS = [
  { day: 1, icon: '⚡', label: '+100 XP',           type: 'xp',          value: 100  },
  { day: 2, icon: '📦', label: 'Basic Box',          type: 'loot',        value: 'basic' },
  { day: 3, icon: '⚡', label: '+200 XP',           type: 'xp',          value: 200  },
  { day: 4, icon: '⚡', label: '+300 XP',           type: 'xp',          value: 300  },
  { day: 5, icon: '🎁', label: 'Advanced Box',       type: 'loot',        value: 'advanced' },
  { day: 6, icon: '⚡', label: '+400 XP',           type: 'xp',          value: 400  },
  { day: 7, icon: '💎', label: 'Premium Box + 1 SP', type: 'loot_sp',     value: { loot: 'premium', sp: 1 } },
];

/* ── COSMETICS ───────────────────────────────────────────────── */
const COSMETICS = [
  { id: 'theme-default',    type: 'theme', group: 'color', icon: '🌊', name: 'Nexus Standard',  cssClass: '',               unlockCondition: 'Standard',          unlocked: true },
  { id: 'theme-golden',     type: 'theme', group: 'color', icon: '🌅', name: 'Golden Dawn',     cssClass: 'theme-golden',   unlockCondition: 'Level 10',          unlocked: false },
  { id: 'theme-dark-matter',type: 'theme', group: 'color', icon: '🌑', name: 'Dark Matter',     cssClass: 'theme-dark-matter', unlockCondition: 'Level 25',       unlocked: false },
  { id: 'theme-plasma',     type: 'theme', group: 'color', icon: '⚡', name: 'Plasma',          cssClass: 'theme-plasma',   unlockCondition: '10.000 XP',         unlocked: false },
  { id: 'frame-default',    type: 'frame', group: 'frame', icon: '⬡',  name: 'Cyan Frame',      cssClass: '',               unlockCondition: 'Standard',          unlocked: true  },
  { id: 'frame-gold',       type: 'frame', group: 'frame', icon: '🟡', name: 'Gold Frame',      cssClass: 'frame-gold',     unlockCondition: 'Level 50',          unlocked: false },
  { id: 'title-default',    type: 'title', group: 'title', icon: '🏷️', name: 'Bereit für Großes', cssClass: '',             unlockCondition: 'Standard',          unlocked: true  },
  { id: 'title-grinder',    type: 'title', group: 'title', icon: '🏷️', name: 'Grinder',         cssClass: '',               unlockCondition: 'Level 20',          unlocked: false },
  { id: 'title-centurion',  type: 'title', group: 'title', icon: '🏷️', name: 'Centurion',       cssClass: '',               unlockCondition: '100 Quests',         unlocked: false },
  { id: 'bg-default',       type: 'background', group: 'bg', icon: '⬛', name: 'Void',           cssClass: '',               unlockCondition: 'Standard',          unlocked: true  },
  { id: 'bg-grid',          type: 'background', group: 'bg', icon: '⊞', name: 'Cyber Grid',     cssClass: 'bg-grid',        unlockCondition: 'Level 15',          unlocked: false },
  { id: 'effect-none',      type: 'effect', group: 'effect', icon: '○', name: 'Kein Effekt',    cssClass: '',               unlockCondition: 'Standard',          unlocked: true  },
  { id: 'effect-glow',      type: 'effect', group: 'effect', icon: '✦', name: 'Neon Glow',      cssClass: 'effect-glow',    unlockCondition: '7-Tage Streak',     unlocked: false },
];

/* ── SKILLS (stripped — SkillTree removed as per spec) ───────── */
const SKILLS = [];
const SKILL_CATEGORIES = {};

function getSkill(id) { return null; }

/* ── CARD DROP (disabled — cards only from lootboxes) ─────────── */
const CARD_DROP_CHANCE = 0;
const CARD_DROP_POOL   = [];
const LOOT_FROM_TASKS  = false;
