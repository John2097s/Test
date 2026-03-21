'use strict';

const Cards = {

  _lootQueue:  [],
  _activeLoot: null,

  /* ── ADD / REMOVE ────────────────────────────────────────────── */
  addCard(cardId, qty = 1) {
    // Validate: card must be in unlock pool
    const pool = getUnlockedCardPool(state);
    if (!pool.includes(cardId)) return;

    const grid     = state.gridInventory;
    const maxStack = STACK_MAX_DEFAULT;
    let rem = qty;

    // 1. Top-up existing stacks of same card
    for (let i = 0; i < grid.length && rem > 0; i++) {
      if (grid[i].cardId === cardId && grid[i].quantity < maxStack) {
        const add = Math.min(maxStack - grid[i].quantity, rem);
        grid[i].quantity += add;
        rem -= add;
      }
    }
    // 2. Fill empty slots with new stacks
    for (let i = 0; i < grid.length && rem > 0; i++) {
      if (!grid[i].cardId) {
        const add = Math.min(maxStack, rem);
        grid[i] = { cardId, quantity: add };
        rem -= add;
      }
    }

    // Sync state.cards from grid (ground truth — prevents desync)
    this._syncStateCards();

    saveState();
    const card = getCard(cardId);
    if (card) {
      addNotification(`🃏 Neue Karte: <span class="r-${card.rarity}">${card.icon} ${card.name}</span>`);
      Render.toast(`${card.icon} ${card.name} erhalten!`, 'card');
    }
    Render.updateGridInventory();
    Render.updateStats();
  },

  /** Re-derive state.cards totals from grid (the single source of truth). */
  _syncStateCards() {
    const totals = {};
    for (const slot of state.gridInventory) {
      if (slot.cardId && slot.quantity > 0) {
        totals[slot.cardId] = (totals[slot.cardId] || 0) + slot.quantity;
      }
    }
    state.cards = totals;
  },

  removeFromSlot(slotIdx, qty = 1) {
    const grid = state.gridInventory;
    if (!grid[slotIdx]?.cardId) return;

    const removed = Math.min(qty, grid[slotIdx].quantity);
    grid[slotIdx].quantity -= removed;
    if (grid[slotIdx].quantity <= 0) {
      grid[slotIdx] = { cardId: null, quantity: 0 };
    }

    // Sync state.cards from grid (ground truth)
    this._syncStateCards();
    saveState();

    // Immediate grid rerender so popup sees fresh data
    Render.updateGridInventory();
    Render.updateStats();
  },

  totalCards() {
    return (state.gridInventory || []).reduce((s, slot) => s + slot.quantity, 0);
  },

  getInventory() {
    const merged = {};
    (state.gridInventory || []).forEach(slot => {
      if (slot.cardId) merged[slot.cardId] = (merged[slot.cardId] || 0) + slot.quantity;
    });
    const order = ['mythic','legendary','epic','rare','common'];
    return Object.entries(merged)
      .map(([id, count]) => { const card = getCard(id); return card ? { card, count } : null; })
      .filter(Boolean)
      .sort((a, b) => order.indexOf(a.card.rarity) - order.indexOf(b.card.rarity));
  },

  getGridSlots() {
    return (state.gridInventory || []).map((slot, idx) => ({
      slotIdx: idx,
      card: slot.cardId ? getCard(slot.cardId) : null,
      quantity: slot.quantity,
      isEmpty: !slot.cardId,
    }));
  },

  /* ── USE FROM GRID ───────────────────────────────────────────── */
  useFromGrid(slotIdx, forTaskId = null) {
    const grid = state.gridInventory;
    const slot = grid[slotIdx];
    if (!slot?.cardId) return;
    const card = getCard(slot.cardId);
    if (!card) return;

    state.lastUsedSlot = slotIdx;

    const overlay = document.getElementById('inv-overlay');
    const close = () => {
      if (overlay) {
        overlay.classList.add('closing');
        setTimeout(() => overlay.classList.remove('open', 'closing'), 300);
      }
    };

    // Apply card effect
    this._applyCardFromSlot(slotIdx, card, forTaskId);
    close();
  },

  _applyCardFromSlot(slotIdx, card, forTaskId) {
    state.cardsUsed++;

    // Shield: instant effect, no task needed
    if (card.type === 'shield') {
      state.shieldDays = Math.max(state.shieldDays, card.value);
      this.removeFromSlot(slotIdx);
      saveState();
      Render.toast(`🛡️ Shield aktiv! Streak geschützt.`, 'card');
      Render.updateGridInventory();
      Achievements.checkAll();
      return;
    }

    // Deck: draw 3 random cards
    if (card.type === 'deck') {
      this.removeFromSlot(slotIdx);
      saveState();
      Render.toast(`🃏 Deck! Ziehe ${card.value} Karten...`, 'card');
      for (let i = 0; i < card.value; i++) {
        setTimeout(() => {
          const rarity = this._weightedRarity([
            { rarity: 'common', weight: 50 },
            { rarity: 'rare',   weight: 35 },
            { rarity: 'epic',   weight: 14 },
            { rarity: 'legendary', weight: 1 },
          ]);
          this._addRandomCardOfRarity(rarity);
        }, i * 300);
      }
      Render.updateGridInventory();
      Achievements.checkAll();
      return;
    }

    // Cards that need a task: attach to task or set as pending
    if (forTaskId) {
      const task = state.tasks.find(t => t.id === forTaskId);
      if (task) {
        task.cardId   = card.id;
        task.cardSlot = slotIdx;
        this.removeFromSlot(slotIdx);
        saveState();
        Render.updateTasks();
        Render.updateGridInventory();
        Render.toast(`${card.icon} ${card.name} auf Quest gelegt!`, 'card');
        return;
      }
    }

    // No task context: set as pending active card
    state.pendingCard     = card.id;
    state.pendingCardSlot = slotIdx;
    saveState();
    Render.toast(`${card.icon} ${card.name} bereit — nächste Quest!`, 'card');
    Render.updateGridInventory();
    App.navTo('tasks');
    Achievements.checkAll();
  },

  /* ── CARD EFFECT ENGINE ──────────────────────────────────────── */
  // Called from App.completeTask with the card attached to a task
  applyEffect(card, baseXP, taskAddedAt) {
    state.cardsUsed++;
    const now = Date.now();

    switch (card.type) {

      case 'xp_mult':
        Render.toast(`${card.icon} ${card.name}! ×${card.value} XP`, 'card');
        return { xp: Math.round(baseXP * card.value), streakReset: false, blockNext: false };

      case 'chance': {
        const won = Math.random() < 0.5;
        if (won) {
          state.wonGamble = (state.wonGamble || 0) + 1;
          Render.toast(`${card.icon} Chance: Gewonnen! ×${card.value.win} XP 🎉`, 'card');
          return { xp: Math.round(baseXP * card.value.win), streakReset: false, blockNext: false };
        } else {
          Render.toast(`${card.icon} Chance: Verloren! ×${card.value.lose} XP 😬`, 'danger');
          return { xp: Math.round(baseXP * card.value.lose), streakReset: false, blockNext: false };
        }
      }

      case 'on_time': {
        const elapsed = now - (taskAddedAt || now);
        if (elapsed <= card.value.windowMs) {
          Render.toast(`${card.icon} On Time! ×${card.value.mult} XP ⚡`, 'card');
          return { xp: Math.round(baseXP * card.value.mult), streakReset: false, blockNext: false };
        } else {
          Render.toast(`${card.icon} On Time: Zu spät! Normal XP.`, 'danger');
          return { xp: baseXP, streakReset: false, blockNext: false };
        }
      }

      case 'overdrive': {
        Render.toast(`${card.icon} Overdrive! ×${card.value} XP — nächster Reward gesperrt! 🔥`, 'card');
        state.overdriveLock = true;
        return { xp: Math.round(baseXP * card.value), streakReset: false, blockNext: true };
      }

      case 'focus': {
        const lastDone = state.lastTaskCompletedAt || 0;
        const gap      = now - lastDone;
        if (!lastDone || gap >= card.value.windowMs) {
          Render.toast(`${card.icon} Focus! ×${card.value.mult} XP 🎯`, 'card');
          return { xp: Math.round(baseXP * card.value.mult), streakReset: false, blockNext: false };
        } else {
          Render.toast(`${card.icon} Focus: Bedingung nicht erfüllt! Normal XP.`, 'danger');
          return { xp: baseXP, streakReset: false, blockNext: false };
        }
      }

      case 'jackpot': {
        const mult = Math.floor(Math.random() * (card.value.max - card.value.min + 1)) + card.value.min;
        if (mult === 0) {
          Render.toast(`${card.icon} Jackpot: ×0 — Pech! 💀`, 'danger');
        } else if (mult >= 15) {
          Render.toast(`${card.icon} JACKPOT! ×${mult} XP! 🎰🎉`, 'card');
          state.wonGamble = (state.wonGamble || 0) + 1;
        } else {
          Render.toast(`${card.icon} Jackpot: ×${mult} XP 🎰`, 'card');
        }
        return { xp: Math.round(baseXP * mult), streakReset: false, blockNext: false };
      }

      case 'fate_split': {
        const won = Math.random() < 0.5;
        if (won) {
          state.wonGamble = (state.wonGamble || 0) + 1;
          Cards.queueLoot(card.value.win_loot);
          Render.toast(`🌌 Fate Split: TRIUMPH! ×${card.value.win_mult} XP + Lootbox! 🎉`, 'card');
          return { xp: Math.round(baseXP * card.value.win_mult), streakReset: false, blockNext: false };
        } else {
          Render.toast(`🌌 Fate Split: RUIN! 0 XP + Streak Reset 💀`, 'danger');
          return { xp: 0, streakReset: true, blockNext: false };
        }
      }

      default:
        return { xp: baseXP, streakReset: false, blockNext: false };
    }
  },

  /* ── LOOTBOX INVENTORY SYSTEM ───────────────────────────────── */

  /**
   * Store a lootbox in inventory instead of opening immediately.
   * This replaces the old queue/auto-open system.
   * @param {string} type - 'basic' | 'advanced' | 'premium' | 'mythic' | legacy aliases
   */
  queueLoot(type) {
    this.storeLoot(type);
  },

  storeLoot(type) {
    const def = LOOTBOX_DEFS[type];
    if (!def) return;

    if (!state.storedLootboxes) state.storedLootboxes = [];

    // Stack with existing entry of same type (max 99)
    const existing = state.storedLootboxes.find(b => b.type === type);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1);
    } else {
      state.storedLootboxes.push({ type, quantity: 1 });
    }

    saveState();
    addNotification(`📦 ${def.name} ins Inventar gelegt!`);
    Render.toast(`${def.icon} ${def.name} erhalten! Im Inventar öffnen.`, 'card');
    Render.updateLootboxInventory();
    Render.updateStats();
  },

  /**
   * Open one stored lootbox of given type.
   * Called from the lootbox popup "Öffnen" button.
   * @param {string} type
   */
  openStoredLoot(type) {
    if (!state.storedLootboxes) return;
    const entry = state.storedLootboxes.find(b => b.type === type);
    if (!entry || entry.quantity <= 0) {
      Render.toast('Keine Lootbox dieses Typs!', 'danger');
      return;
    }

    // Deduct BEFORE opening so it's safe even if page closes
    entry.quantity--;
    if (entry.quantity <= 0) {
      state.storedLootboxes = state.storedLootboxes.filter(b => b.type !== type);
    }
    saveState();
    Render.updateLootboxInventory();

    // Now open it — reuse existing modal
    this._currentLootType = type;
    this._showLootModal(type);
  },

  _showLootModal(type) {
    const def = LOOTBOX_DEFS[type];
    if (!def) return;

    document.getElementById('loot-title').textContent  = `// ${def.name}`;
    const boxEl = document.getElementById('loot-box');
    boxEl.textContent = def.icon;
    boxEl.className   = 'loot-box';
    document.getElementById('loot-hint').textContent    = 'Tippe die Box um sie zu öffnen!';
    document.getElementById('loot-hint').style.display  = 'block';
    document.getElementById('loot-results').style.display = 'none';
    document.getElementById('loot-results').innerHTML   = '';
    const btn = document.getElementById('loot-btn');
    btn.textContent = 'Öffnen!';
    btn.onclick = () => this.openLoot();
    this._currentLootType = type;
    App.openForcedOv('ov-loot');
  },

  shakeLoot() {
    const box = document.getElementById('loot-box');
    if (box) { box.classList.add('shaking'); setTimeout(() => box.classList.remove('shaking'), 500); }
  },

  openLoot() {
    const type = this._currentLootType;
    const def  = LOOTBOX_DEFS[type];
    if (!def) return;

    state.totalBoxesOpened = (state.totalBoxesOpened || 0) + 1;
    state.pityCounterEpic       = (state.pityCounterEpic       || 0) + 1;
    state.pityCounterLegendary  = (state.pityCounterLegendary  || 0) + 1;

    const box = document.getElementById('loot-box');
    if (box) {
      box.classList.add('shaking');
      setTimeout(() => {
        box.classList.remove('shaking');
        box.classList.add('loot-box-opened');
      }, 500);
    }

    const wonCards = [];
    for (let i = 0; i < def.cards; i++) {
      let rarity = this._weightedRarity(def.pool);

      if (state.pityCounterLegendary >= PITY_LEGENDARY_THRESHOLD) {
        rarity = 'legendary';
        state.pityCounterLegendary = 0;
        state.pityCounterEpic      = 0;
      } else if (state.pityCounterEpic >= PITY_EPIC_THRESHOLD && ['common','rare'].includes(rarity)) {
        rarity = 'epic';
        state.pityCounterEpic = 0;
      }

      const pool = CARD_CATALOG.filter(c => c.rarity === rarity && getUnlockedCardPool(state).includes(c.id));
      if (!pool.length) { i--; continue; }
      const card = pool[Math.floor(Math.random() * pool.length)];
      wonCards.push(card);
      this.addCard(card.id);
    }

    // Reveal animation
    const resultEl = document.getElementById('loot-results');
    resultEl.style.display = 'flex';
    wonCards.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = `loot-card-reveal ${card.rarity}`;
      el.style.animationDelay = `${i * 200}ms`;
      el.innerHTML = `<span class="loot-card-ico">${card.icon}</span><span>${card.name}</span>`;
      resultEl.appendChild(el);
    });

    document.getElementById('loot-hint').style.display = 'none';

    const btn = document.getElementById('loot-btn');
    btn.textContent = 'Einsammeln ✓';
    btn.onclick = () => App.closeForcedOv('ov-loot');

    addNotification(`📦 ${def.name} geöffnet: ${wonCards.map(c => c.name).join(', ')}`);
    saveState();
    Render.updateStats();
    Render.updateGridInventory();
    Achievements.checkAll();
  },

  _weightedRarity(pool) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    if (!total) return 'common';
    let r = Math.random() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e.rarity; }
    return pool[pool.length - 1].rarity;
  },

  _addRandomCardOfRarity(rarity) {
    const pool = CARD_CATALOG.filter(c => c.rarity === rarity && getUnlockedCardPool(state).includes(c.id));
    if (!pool.length) return;
    this.addCard(pool[Math.floor(Math.random() * pool.length)].id);
  },

  // NO card drops from tasks — only lootboxes
  rollDropChance() { /* disabled */ },

  // Legacy stubs (applySimpleCard used by old app.js completeTask)
  applySimpleCard(baseXP) { return { finalXP: baseXP, streakSafe: false }; },
  giveSimpleStarterCards() {},
};
