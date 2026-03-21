/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  state.js — State Management                                 ║
 * ║                                                              ║
 * ║  Enthält: Spielstand-Objekt, Laden/Speichern,                ║
 * ║  Reset und Hilfsfunktionen.                                  ║
 * ║                                                              ║
 * ║  SPEICHERUNG: localStorage mit Key 'nexus_v3'                ║
 * ║  Zum Debuggen: localStorage.getItem('nexus_v3') in der       ║
 * ║  Browser-Konsole eingeben.                                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

/** localStorage-Schlüssel — bei Breaking Changes erhöhen */
const SAVE_KEY = 'nexus_v5';

/**
 * Standard-Spielstand.
 * Wird bei erstem Start oder nach Reset verwendet.
 * 
 * FELDER:
 *   xp           {number}   XP im aktuellen Level (zurückgesetzt bei Level-Up)
 *   level        {number}   Aktuelles Level
 *   totalXP      {number}   Gesamte XP aller Zeiten
 *   streak       {number}   Aktueller Streak in Tagen
 *   maxStreak    {number}   Höchster Streak aller Zeiten
 *   lastDate     {string|null} Letztes Datum der Aktivität (ISO-String)
 *   shieldDays   {number}   Restliche Schild-Schutz-Tage
 *   done         {number}   Gesamte abgeschlossene Quests
 *   skipped      {number}   Gesamte übersprungene Quests
 *   cardsUsed    {number}   Gesamte verwendete Karten
 *   weeklyDone   {number}   Gesamte abgeschlossene Weekly-Quests
 *   wonGamble    {number}   Gewonnene Glücksspiel-Karten
 *   todayDone    {number}   Heute abgeschlossene Quests
 *   todayDate    {string}   Datum für todayDone (Reset täglich)
 *   catDone      {object}   Quests per Kategorie { work, private, gaming }
 *   tasks        {Array}    Aktive Tasks des Nutzers
 *   weeklyTaken  {Array}    IDs der bereits übernommenen Weekly-Quests
 *   cards        {object}   Karten-Inventar { cardId: Anzahl }
 *   achievements {Array}    IDs freigeschalteter Achievements
 *   notifications {Array}   Benachrichtigungs-Einträge
 *   unreadNotifs  {number}  Anzahl ungelesener Notifications
 *   equipped     {object}   Ausgerüstete Cosmetics
 *   unlockedCosmetics {Array} IDs freigeschalteter Cosmetics
 *   claimedStreakRewards {Array} Bereits erhaltene Streak-Rewards
 *   username     {string}   Anzeigename des Nutzers
 *   avatarData   {string|null} Base64 Bild-Daten
 */
function defaultState() {
  return {
    xp:        0,
    level:     1,
    totalXP:   0,
    streak:    0,
    maxStreak: 0,
    lastDate:  null,
    shieldDays: 0,

    done:      0,
    skipped:   0,
    cardsUsed: 0,
    weeklyDone: 0,
    wonGamble:  0,
    todayDone:  0,
    todayDate:  null,

    catDone: { work: 0, private: 0, gaming: 0 },

    tasks:       [],
    weeklyTaken: [],

    cards: {},   // Format: { 'xp_boost_1': 3, 'double_xp': 1, ... }

    achievements: [],
    notifications: [],
    unreadNotifs: 0,

    equipped: {
      theme: 'theme-default',
      frame: 'frame-default',
      title: 'title-default',
    },
    unlockedCosmetics: ['theme-default', 'frame-default', 'title-default'],

    claimedStreakRewards: [],

    username:   'ABENTEURER',
    avatarData: null,

    // ── DAILY SYSTEM ────────────────────────────────────────
    lastLoginDate:     null,   // ISO date of last login bonus
    lastCompletedDate: null,   // ISO date of last quest completion (streak)

    // ── DAILY 7-DAY CYCLE ───────────────────────────────────
    dailyLoginDay:     1,      // current day in 7-day cycle (1–7)
    dailyLoginStreak:  0,      // consecutive login days
    dailyClaimedToday: null,   // ISO date — prevents double-claim

    // ── DAILY TASKS ─────────────────────────────────────────
    dailyTasksDate: null,      // ISO date when daily tasks were generated
    dailyTasksDone: [],        // Array of completed daily task IDs today

    // ── WEEKLY CHALLENGES ────────────────────────────────────
    // weeklyProgress[id] = { steps: N, completed: bool, weekStart: 'YYYY-WN' }
    weeklyProgress: {},
    weeklyCompletedChallenges: 0,  // total completed challenge count

    // ── CARD SYSTEM ──────────────────────────────────────────
    activeCard:          null,
    pendingCard:         null,
    pendingCardSlot:     null,
    overdriveLock:       false,
    lastTaskCompletedAt: null,
    simpleCards:         { xpBoost: 0, skip: 0, risk: 0, loot: 0 },
    skillPoints:         0,
    unlockedSkills:      [],

    // ── EXTENDED COSMETICS ───────────────────────────────────
    equippedBg:     'bg-default',
    equippedEffect: 'effect-none',

    // ── GRID INVENTORY (6×4 = 24 slots) ─────────────────────
    // Each slot: { cardId: string|null, quantity: number }
    // null means empty. Stack cap is STACK_MAX_DEFAULT (5).
    gridInventory: Array.from({ length: 24 }, () => ({ cardId: null, quantity: 0 })),
    lastUsedSlot: null,   // index of last used slot (for quick-reuse)

    // ── LOOTBOX INVENTORY ────────────────────────────────────
    // Stored lootboxes: [{ type: 'basic', quantity: 2 }, ...]
    storedLootboxes: [],

    // ── PITY SYSTEM ──────────────────────────────────────────
    totalBoxesOpened:      0,
    pityCounterEpic:       0,   // resets after PITY_EPIC_THRESHOLD
    pityCounterLegendary:  0,   // resets after PITY_LEGENDARY_THRESHOLD

    // ── TIMED XP BOOST ───────────────────────────────────────
    timedBoostMult:    1,     // active multiplier (1 = none)
    timedBoostCharges: 0,     // remaining charges
  };
}

/** Aktueller Spielstand (globale Variable) */
let state = defaultState();

/**
 * Spielstand aus localStorage laden.
 * Falls kein Spielstand existiert → defaultState verwenden.
 * Fehlende Felder werden mit Defaults aufgefüllt (Migrations-Sicherheit).
 */
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      state = defaultState();
      return;
    }
    const parsed = JSON.parse(raw);
    // Merge: Standard-Felder mit gespeicherten Feldern zusammenführen
    // Neue Felder aus Updates werden automatisch mit Defaults aufgefüllt
    state = Object.assign(defaultState(), parsed);
    // Tief-merge für verschachtelte Objekte
    state.catDone  = Object.assign({ work: 0, private: 0, gaming: 0 }, parsed.catDone);
    state.equipped = Object.assign({ theme: 'theme-default', frame: 'frame-default', title: 'title-default' }, parsed.equipped);
    state.simpleCards = Object.assign({ xpBoost: 0, skip: 0, risk: 0, loot: 0 }, parsed.simpleCards);
    // v4 migrations
    if (!state.unlockedSkills)             state.unlockedSkills             = [];
    if (!state.skillPoints)                state.skillPoints                = 0;
    if (!state.lastWeeklyShield)           state.lastWeeklyShield           = null;
    if (!state.dailyLoginDay)              state.dailyLoginDay              = 1;
    if (state.dailyLoginStreak === undefined) state.dailyLoginStreak        = 0;
    if (!state.weeklyProgress)             state.weeklyProgress             = {};
    if (!state.weeklyCompletedChallenges)  state.weeklyCompletedChallenges  = 0;
    if (!state.dailyTasksDone)             state.dailyTasksDone             = [];
    if (!state.equippedBg)                 state.equippedBg                 = 'bg-default';
    if (!state.equippedEffect)             state.equippedEffect             = 'effect-none';
    // v5 migrations
    if (!state.gridInventory || state.gridInventory.length !== 24) {
      // Migrate old cards{} object into grid slots
      state.gridInventory = Array.from({ length: 24 }, () => ({ cardId: null, quantity: 0 }));
      let slotIdx = 0;
      for (const [cid, qty] of Object.entries(state.cards || {})) {
        if (slotIdx >= 24) break;
        const stacks = Math.ceil(qty / STACK_MAX_DEFAULT);
        let remaining = qty;
        for (let s = 0; s < stacks && slotIdx < 24; s++) {
          const q = Math.min(remaining, STACK_MAX_DEFAULT);
          state.gridInventory[slotIdx++] = { cardId: cid, quantity: q };
          remaining -= q;
        }
      }
    }
    if (state.lastUsedSlot === undefined)       state.lastUsedSlot           = null;
    if (!state.storedLootboxes)                state.storedLootboxes         = [];
    if (state.totalBoxesOpened === undefined)   state.totalBoxesOpened       = 0;
    if (state.pityCounterEpic === undefined)    state.pityCounterEpic        = 0;
    if (state.pityCounterLegendary === undefined) state.pityCounterLegendary = 0;
    if (state.timedBoostMult === undefined)     state.timedBoostMult         = 1;
    if (state.timedBoostCharges === undefined)  state.timedBoostCharges      = 0;
    // Migrate simpleCards into grid if not done yet
    if (state._simpleCardsMigrated !== true) {
      const sc = state.simpleCards || {};
      const defs = { xpBoost:'⚡', skip:'⏭️', risk:'🎲', loot:'🎁' };
      // Simple cards stay in simpleCards — they're a separate track
      state._simpleCardsMigrated = true;
    }

    // Always re-derive state.cards from gridInventory to fix any desync in old saves
    const gridTotals = {};
    for (const slot of state.gridInventory) {
      if (slot.cardId && slot.quantity > 0) {
        gridTotals[slot.cardId] = (gridTotals[slot.cardId] || 0) + slot.quantity;
      }
    }
    state.cards = gridTotals;
  } catch (e) {
    console.warn('[NEXUS] Spielstand konnte nicht geladen werden:', e);
    state = defaultState();
  }
}

/**
 * Spielstand in localStorage speichern.
 * Wird nach jeder Änderung aufgerufen.
 */
function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[NEXUS] Spielstand konnte nicht gespeichert werden:', e);
  }
}

/**
 * Spielstand vollständig zurücksetzen.
 * Fragt vorher per Confirm-Dialog nach.
 * @returns {boolean} true wenn zurückgesetzt
 */
function resetState() {
  if (!confirm('⚠️ Wirklich alles zurücksetzen? Dein gesamter Fortschritt geht verloren!')) {
    return false;
  }
  localStorage.removeItem(SAVE_KEY);
  state = defaultState();
  saveState();
  return true;
}

/**
 * Generiert eine eindeutige ID für neue Tasks.
 * @returns {string}
 */
function genId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

/**
 * Gibt das heutige Datum als String zurück (für Streak-Vergleiche).
 * Format: 'Mon Mar 17 2026' (via toDateString)
 * @returns {string}
 */
function todayStr() {
  return new Date().toDateString();
}

/**
 * Gibt das heutige Datum als ISO-Datumsstring zurück (YYYY-MM-DD).
 * Wird für Daily-System und lastCompletedDate verwendet.
 * Vorteil gegenüber todayStr(): sortierbar, sprachunabhängig.
 * @returns {string}  z.B. '2026-03-18'
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Daily Login Bonus — 7-Tage-Zyklus.
 * Gibt das Reward-Objekt zurück oder false wenn schon heute eingelöst.
 * @returns {object|false}
 */
function checkDailyBonus() {
  const today = todayISO();
  if (state.dailyClaimedToday === today) return false;

  // Streak-Logik: gestern eingeloggt → streak++, sonst reset
  if (state.lastLoginDate) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);
    if (state.lastLoginDate === yesterdayISO) {
      state.dailyLoginStreak = (state.dailyLoginStreak || 0) + 1;
    } else if (state.lastLoginDate !== today) {
      state.dailyLoginStreak = 1;  // reset
    }
  } else {
    state.dailyLoginStreak = 1;
  }

  state.lastLoginDate    = today;
  state.dailyClaimedToday = today;

  // 7-Tage-Zyklus: Welcher Tag?
  const day    = ((state.dailyLoginDay - 1 + 1) % 7) + 1;  // advance day
  state.dailyLoginDay = day;

  const reward = DAILY_LOGIN_REWARDS.find(r => r.day === day) || DAILY_LOGIN_REWARDS[0];

  // Reward verteilen
  if (reward.type === 'xp') {
    const xp = reward.value;
    state.xp      += xp;
    state.totalXP += xp;
    addNotification(`🌅 Tag ${day} Login: <strong>+${xp} XP</strong>`);
  } else if (reward.type === 'card_simple') {
    const types = Array.isArray(reward.value) ? reward.value : [reward.value];
    types.forEach(t => {
      state.simpleCards[t] = (state.simpleCards[t] || 0) + 1;
    });
    addNotification(`🌅 Tag ${day} Login: <strong>${reward.label}</strong>`);
  } else if (reward.type === 'loot') {
    // Queue loot — SkillTree/Cards might not be loaded yet, defer
    if (typeof Cards !== 'undefined') Cards.queueLoot(reward.value);
    else state._pendingLoot = (state._pendingLoot || []).concat(reward.value);
    addNotification(`🌅 Tag ${day} Login: <strong>${reward.label}</strong>`);
  } else if (reward.type === 'loot_sp') {
    const v = reward.value;
    if (typeof Cards !== 'undefined') Cards.queueLoot(v.loot);
    else state._pendingLoot = (state._pendingLoot || []).concat(v.loot);
    state.skillPoints = (state.skillPoints || 0) + v.sp;
    addNotification(`🌅 Tag ${day} Login: <strong>${reward.label}</strong>`);
  }

  if (typeof SkillTree !== 'undefined') SkillTree.checkDailyCardSkill();

  saveState();
  return { day, reward, loginStreak: state.dailyLoginStreak };
}

/**
 * Fügt eine Notification zum Stapel hinzu.
 * @param {string} text - Nachrichtentext (kann HTML enthalten)
 */
function addNotification(text) {
  state.notifications.unshift({ text, read: false, ts: Date.now() });
  // Maximal 20 Notifications aufbewahren
  if (state.notifications.length > 20) state.notifications.pop();
  state.unreadNotifs++;
  // Roten Punkt auf der Bell anzeigen
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = 'block';
}
