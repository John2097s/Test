'use strict';

let currentFilter   = 'all';
let currentAchFilter = 'all';
let currentRTab     = 'levels';
let currentScreen   = 'home';

const App = {

  /* ── INIT ───────────────────────────────────────── */
  init() {
    loadState();
    Cosmetics.applyAll();
    Engine.tickStreak();
    Render.initAll();
    this._bindEvents();
    Profile.initAvatarUpload();
    Profile.initNameInput();

    if (state.totalXP === 0 && Cards.totalCards() === 0) {
      this._giveStarterCards();
    }

    const dailyResult = checkDailyBonus();
    if (dailyResult) {
      // flush any loot queued before Cards was loaded
      (state._pendingLoot || []).forEach(l => Cards.queueLoot(l));
      state._pendingLoot = [];
      if (dailyResult.reward?.type === 'xp' || dailyResult.reward?.type === 'loot_sp') {
        let threshold = getXPForLevel(state.level);
        while (state.xp >= threshold) {
          state.xp -= threshold;
          state.level++;
          Engine._onLevelUp(state.level);
          threshold = getXPForLevel(state.level);
        }
        Render.updateHeader();
        saveState();
      }
      setTimeout(() => Render.showDailyPopup(dailyResult), 900);
    }

    SkillTree.checkDailyCardSkill();
    console.log('[NEXUS] ⚔️ Quest Manager geladen!');
  },

  _giveStarterCards() {
    // Give 1 starter Basic Box on first launch
    Cards.queueLoot('basic');
    Render.toast('🎁 Willkommen! Öffne deine erste Basic Box!', 'card', 4000);
  },

  /* ── EVENTS ─────────────────────────────────────── */
  _bindEvents() {
    document.getElementById('task-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.addTask();
    });

    document.getElementById('notif-btn').addEventListener('click', () => this.toggleNotif());
    document.getElementById('notif-clear-btn').addEventListener('click', () => {
      state.notifications = [];
      state.unreadNotifs  = 0;
      saveState();
      Render.updateNotifications();
      document.getElementById('notif-dot').style.display = 'none';
    });
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (resetState()) location.reload();
    });

    document.querySelectorAll('.overlay').forEach(ov => {
      ov.addEventListener('click', e => {
        if (e.target === ov && !this._forcedOvIds.has(ov.id)) this.closeOv(ov.id);
      });
    });
    document.addEventListener('click', e => {
      const panel = document.getElementById('notif-panel');
      const btn   = document.getElementById('notif-btn');
      if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const open = document.querySelector('.overlay.open:not(.forced-overlay)');
        if (open) this.closeOv(open.id);
      }
    });
  },

  /* ── NAVIGATION ─────────────────────────────────── */
  navTo(name) {
    currentScreen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('s-' + name);
    if (target) {
      target.classList.add('active');
      const body = target.closest('.screen-body');
      if (body) body.scrollTop = 0;
    }
    document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('bnav-' + name);
    if (btn) btn.classList.add('active');

    if (name === 'tasks') {
      const activeTab = App._currentQuestTab || 'daily';
      App.questTab(activeTab, null, true);
    }
    if (name === 'achievements') { Render.updateAchievements(currentAchFilter); }
    if (name === 'profile')      { Render.updateProfile(); Render.updateLevelRewards(); Render.updateStreakRewards(); Render.updateCosmetics(); Render.updateGridInventory(); }
    if (name === 'home')         { Render.updateHomePreview(); Render.updateHeader(); Render.updateDaily7(); }
    if (name === 'shop')         { Render.updateShop(); }
  },

  profileTab(tab, btn) {
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('on'));
    if (btn) btn.classList.add('on');
    document.querySelectorAll('.prof-tab-content').forEach(el => el.style.display = 'none');
    const el = document.getElementById(`ptab-content-${tab}`);
    if (el) el.style.display = '';
    if (tab === 'inventory') Render.updateGridInventory();
    if (tab === 'rewards')   { Render.updateLevelRewards(); Render.updateStreakRewards(); Render.updateCosmetics(); }
  },

  _currentQuestTab: 'daily',

  questTab(tab, btn, silent = false) {
    this._currentQuestTab = tab;

    // Update tab buttons
    document.querySelectorAll('.qtab').forEach(b => b.classList.remove('on'));
    if (btn) btn.classList.add('on');
    else {
      const b = document.getElementById(`qtab-${tab}`);
      if (b) b.classList.add('on');
    }

    // Show correct panel
    ['daily','weekly','custom'].forEach(t => {
      const p = document.getElementById(`qpanel-${t}`);
      if (p) p.style.display = t === tab ? '' : 'none';
    });

    // Refresh content
    if (tab === 'daily')  Render.updateDailyTasks();
    if (tab === 'weekly') Render.updateWeekly();
    if (tab === 'custom') Render.updateTasks(currentFilter);
  },

  /* legacy tab() shim for old render calls */
  tab(id, btn) { this.navTo(id.replace('p-', '')); },

  claimDailyFromHome() {
    const today   = todayISO();
    const claimed = state.dailyClaimedToday === today;
    if (claimed) {
      Render.toast('Heute bereits eingelöst!', '');
      return;
    }
    const result = checkDailyBonus();
    if (result) {
      // Flush pending loot (if Cards wasn't loaded during checkDailyBonus)
      (state._pendingLoot || []).forEach(l => Cards.queueLoot(l));
      state._pendingLoot = [];
      // Level-up check for XP rewards
      let threshold = getXPForLevel(state.level);
      while (state.xp >= threshold) {
        state.xp -= threshold;
        state.level++;
        Engine._onLevelUp(state.level);
        threshold = getXPForLevel(state.level);
      }
      saveState();
      Render.updateHeader();
      Render.updateStats();
      Render.updateDaily7();
      Render.showDailyPopup(result);
    }
  },

  completeDailyTask(taskId) {
    const today = todayISO();
    if (state.dailyTasksDate !== today) {
      state.dailyTasksDone = [];
      state.dailyTasksDate = today;
    }
    if (state.dailyTasksDone.includes(taskId)) return;

    const task = DAILY_TASK_POOL.find(t => t.id === taskId);
    if (!task) return;

    let xp = CATEGORY_XP[task.xpKey] || 200;
    // daily_boost skill
    if (typeof SkillTree !== 'undefined' && SkillTree.isUnlocked('daily_boost')) {
      xp = Math.round(xp * 1.25);
    }

    state.dailyTasksDone.push(taskId);
    state.done++;
    state.catDone = state.catDone || {};
    Engine.advanceStreak();
    Engine.giveXP(xp, 'daily');
    saveState();
    Render.updateDailyTasks();
    Render.updateHomePreview();
    Achievements.checkAll();
    Render.toast(`📅 Daily Task +${xp} XP!`, 'xp');
  },

  useInventoryCard(cardId) {
    const card = getCard(cardId);
    if (!card) { Render.toast('Unbekannte Karte!', 'danger'); return; }

    // Find a grid slot containing this card
    const slotIdx = state.gridInventory.findIndex(s => s.cardId === cardId && s.quantity > 0);
    if (slotIdx === -1) {
      Render.toast('Karte nicht im Inventar!', 'danger');
      return;
    }

    // Use through the proper slot-based system
    Cards.useFromGrid(slotIdx, null);
  },

  invTab(tab, btn) {
    document.querySelectorAll('#ptab-content-inventory .ftab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('inv-tab-cards').style.display      = tab === 'cards'     ? '' : 'none';
    document.getElementById('inv-tab-cosmetics').style.display  = tab === 'cosmetics' ? '' : 'none';
  },
  rtab(id, btn) {
    currentRTab = id;
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('r-levels').style.display = id === 'levels' ? '' : 'none';
    document.getElementById('r-streak').style.display = id === 'streak' ? '' : 'none';
    document.getElementById('r-cosm').style.display   = id === 'cosm'   ? '' : 'none';
  },

  /* ── TASKS ──────────────────────────────────────── */
  addTask() {
    const input = document.getElementById('task-input');
    const name  = input.value.trim();
    if (!name) { input.focus(); Render.toast('Bitte einen Quest-Namen eingeben!', 'danger'); return; }
    const diff  = document.getElementById('diff-sel')?.value || 'normal';
    const xp    = getTaskXP(diff);
    state.tasks.push({ id: genId(), name, category: 'custom', difficulty: diff, xp, cardId: null, addedAt: Date.now() });
    input.value = '';
    input.focus();
    saveState();
    Render.updateTasks(currentFilter);
    Render.updateStats();
    Render.updateHomePreview();
  },

  /** Open inventory overlay (optionally bound to a task for card selection) */
  openInventoryOverlay(forTaskId = null) {
    const el = document.getElementById('inv-overlay');
    if (!el) return;
    el.dataset.forTask = forTaskId || '';
    el.classList.add('open');
    Render.updateGridInventory('overlay');
  },

  closeInventoryOverlay() {
    const el = document.getElementById('inv-overlay');
    if (el) {
      el.classList.add('closing');
      setTimeout(() => el.classList.remove('open', 'closing'), 300);
    }
  },

  addWeekly(weeklyId, name, icon) {
    if (state.weeklyTaken.includes(weeklyId)) return;
    state.weeklyTaken.push(weeklyId);
    state.tasks.push({ id: genId(), name: `${icon} ${name}`, category: 'weekly', cardId: null, weeklyId, addedAt: Date.now() });
    saveState();
    Render.updateTasks(currentFilter);
    Render.updateWeekly();
    Render.updateStats();
    Render.updateHomePreview();
    Render.toast(`📅 "${name}" hinzugefügt!`, '');
  },

  completeTask(taskId, evt = null) {
    const idx  = state.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const task = state.tasks[idx];
    let baseXP = task.xp || CATEGORY_XP[task.category] || 100;

    // Track last completion time (for Focus card)
    const now = Date.now();
    const prevLastDone = state.lastTaskCompletedAt || 0;
    state.lastTaskCompletedAt = now;

    // Overdrive lock: skip XP
    if (state.overdriveLock) {
      state.overdriveLock = false;
      baseXP = 0;
      Render.toast('🔒 Overdrive: Reward gesperrt!', 'danger');
    }

    let streakReset = false;

    // Apply card effect
    const cardId   = task.cardId || state.pendingCard;
    const cardSlot = task.cardSlot ?? state.pendingCardSlot ?? null;

    if (cardId && baseXP > 0) {
      const card = getCard(cardId);
      if (card) {
        const result = Cards.applyEffect(card, baseXP, task.addedAt);
        baseXP      = result.xp;
        streakReset = result.streakReset;
        if (result.blockNext) state.overdriveLock = true;

        // Remove card from inventory
        if (cardSlot !== null && cardSlot !== undefined) {
          Cards.removeFromSlot(cardSlot);
        } else {
          // Remove from pending slot if set
          if (state.pendingCardSlot !== null && state.pendingCardSlot !== undefined) {
            Cards.removeFromSlot(state.pendingCardSlot);
          }
        }
      }
      // Clear pending card
      state.pendingCard     = null;
      state.pendingCardSlot = null;
    }

    if (streakReset) {
      state.streak = 0;
    } else {
      Engine.advanceStreak();
    }

    state.done++;
    state.catDone = state.catDone || {};
    state.catDone[task.category] = (state.catDone[task.category] || 0) + 1;
    if (task.category === 'weekly') state.weeklyDone++;

    const today = todayStr();
    if (state.todayDate !== today) { state.todayDone = 0; state.todayDate = today; }
    state.todayDone++;

    const taskEl = document.querySelector(`[data-id="${taskId}"]`);
    const finish = () => {
      state.tasks.splice(idx, 1);
      Engine.giveXP(baseXP, task.difficulty || task.category, evt);
      Render.updateTasks(currentFilter);
      Render.updateStats();
      Render.updateHomePreview();
      Render.updateGridInventory();
      if (task.weeklyId) Render.updateWeekly();
      saveState();
      Achievements.checkAll();
    };
    if (taskEl) { taskEl.classList.add('completing'); setTimeout(finish, 400); }
    else finish();
  },

  skipTask(taskId) {
    const idx  = state.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const task = state.tasks[idx];
    if (task.cardId) {
      const card = getCard(task.cardId);
      if (card && card.type === 'skip') {
        const trostXP = Engine.applyCardEffect(card, 0);
        if (trostXP > 0) Engine.giveXP(trostXP, 'skip');
      }
    }
    state.skipped++;
    state.tasks.splice(idx, 1);
    saveState();
    Render.updateTasks(currentFilter);
    Render.updateStats();
    Render.updateHomePreview();
    Render.toast('⏭️ Quest übersprungen', 'danger');
  },

  deleteTask(taskId) {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    const wt = state.tasks.filter(t => t.weeklyId).map(t => t.weeklyId);
    state.weeklyTaken = wt;
    saveState();
    Render.updateTasks(currentFilter);
    Render.updateStats();
    Render.updateHomePreview();
  },

  /* ── CARD MODAL ─────────────────────────────────── */
  openCardModal(taskId) {
    // Open the grid inventory overlay, bound to this task
    this.openInventoryOverlay(taskId);
  },

  applyCard(taskId, cardId) {
    const task = state.tasks.find(t => t.id === taskId);
    const card = getCard(cardId);
    if (!task || !card) return;
    task.cardId = cardId;
    saveState();
    this.closeOv('ov-card');
    Render.updateTasks(currentFilter);
    Render.toast(`🃏 ${card.icon} ${card.name} auf Quest gelegt!`, 'card');
  },

  /* ── FILTER ─────────────────────────────────────── */
  setFilt(val, btn) {
    currentFilter = val;
    document.querySelectorAll('#task-filters .diff-ftab').forEach(b => b.classList.remove('on'));
    if (btn) btn.classList.add('on');
    Render.updateTasks(val);
  },

  setAchFilter(val, btn) {
    currentAchFilter = val;
    Render.updateAchievements(val);
  },

  /* ── NOTIFICATIONS ──────────────────────────────── */
  toggleNotif() {
    const panel = document.getElementById('notif-panel');
    const btn   = document.getElementById('notif-btn');
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
      panel.classList.remove('open');
    } else {
      panel.classList.add('open');
      state.notifications.forEach(n => n.read = true);
      state.unreadNotifs = 0;
      document.getElementById('notif-dot').style.display = 'none';
      saveState();
      Render.updateNotifications();
    }
  },

  /* ── MODALS ─────────────────────────────────────── */
  openOv(id)  { document.getElementById(id)?.classList.add('open');    document.body.style.overflow = 'hidden'; },
  closeOv(id) { document.getElementById(id)?.classList.remove('open'); document.body.style.overflow = ''; },

  // Forced overlays — cannot be closed by clicking outside or ESC
  _forcedOvIds: new Set(['ov-loot', 'ov-lu', 'ov-ach']),
  openForcedOv(id)  {
    this._forcedOvIds.add(id);
    const el = document.getElementById(id);
    if (el) { el.classList.add('open', 'forced-overlay'); document.body.style.overflow = 'hidden'; }
  },
  closeForcedOv(id) {
    this._forcedOvIds.delete(id);
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open', 'forced-overlay'); document.body.style.overflow = ''; }
    Render.updateLootboxInventory();
  },

};

document.addEventListener('DOMContentLoaded', () => App.init());
