'use strict';

const Cards = {

  _lootQueue:  [],
  _activeLoot: null,

  /* ── ADD / REMOVE ────────────────────────────────────────────── */
  addCard(cardId, qty = 1) {
    // Validate: card must be in unlock pool
    const pool = getUnlockedCardPool(state);
    if (!pool.includes(cardId)) return;

    const grid = state.gridInventory;

    // Each card gets its own slot — no stacking
    let placed = 0;
    for (let i = 0; i < grid.length && placed < qty; i++) {
      if (!grid[i].cardId) {
        grid[i] = { cardId, quantity: 1 };
        placed++;
      }
    }

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

  removeFromSlot(slotIdx) {
    const grid = state.gridInventory;
    if (!grid[slotIdx]?.cardId) return;

    // Single-card slots — always clear the whole slot
    grid[slotIdx] = { cardId: null, quantity: 0 };

    this._syncStateCards();
    saveState();
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
    if (!slot?.cardId || slot.quantity <= 0) return;
    const card = getCard(slot.cardId);
    if (!card) return;

    // Always record which slot was used last (for the "Zuletzt" aside slot)
    state.lastUsedSlot = slotIdx;

    // Only close the task-selection overlay (not the card popup — it manages itself)
    const overlay = document.getElementById('inv-overlay');
    if (overlay?.classList.contains('open')) {
      overlay.classList.add('closing');
      setTimeout(() => overlay.classList.remove('open', 'closing'), 300);
    }

    this._applyCardFromSlot(slotIdx, card, forTaskId);
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

    // Reset to Phase 1 (box stage)
    this._revealQueue  = [];
    this._revealIndex  = 0;
    this._canClose     = false;

    const title  = document.getElementById('loot-title');
    const boxEl  = document.getElementById('loot-box');
    const hint   = document.getElementById('loot-hint');
    const btn    = document.getElementById('loot-btn');
    const stageBox    = document.getElementById('lr-stage-box');
    const stageReveal = document.getElementById('lr-stage-reveal');

    if (title)  title.textContent  = def.name;
    if (boxEl)  { boxEl.textContent = def.icon; boxEl.className = 'lr-box'; }
    if (hint)   { hint.textContent = 'Tippe die Box!'; hint.style.display = 'block'; }
    if (btn)    { btn.textContent = '📦 Öffnen'; btn.disabled = false; btn.onclick = () => this.openLoot(); }
    if (stageBox)    stageBox.classList.remove('lr-stage-hidden');
    if (stageReveal) stageReveal.classList.add('lr-stage-hidden');

    // Set box tint per lootbox type
    const glowEl = document.getElementById('lr-box-glow');
    const glowColors = {
      basic: 'rgba(120,144,156,.35)', advanced: 'rgba(41,121,255,.45)',
      premium: 'rgba(213,0,249,.5)', mythic: 'rgba(255,60,60,.55)',
      small: 'rgba(120,144,156,.35)', big: 'rgba(41,121,255,.45)',
      epic: 'rgba(213,0,249,.5)', legendary: 'rgba(255,60,60,.55)',
    };
    if (glowEl) glowEl.style.background = `radial-gradient(circle, ${glowColors[type] || 'rgba(0,229,255,.4)'} 0%, transparent 70%)`;

    // Start idle float animation
    if (boxEl) boxEl.classList.add('lr-box-idle');

    this._currentLootType = type;
    App.openForcedOv('ov-loot');
  },

  shakeLoot() {
    const box = document.getElementById('loot-box');
    if (!box) return;
    box.classList.remove('lr-box-idle');
    box.classList.add('lr-box-shaking');
    setTimeout(() => {
      box.classList.remove('lr-box-shaking');
      box.classList.add('lr-box-idle');
    }, 520);
  },

  openLoot() {
    const type = this._currentLootType;
    const def  = LOOTBOX_DEFS[type];
    if (!def) return;

    // ── ALL REWARD LOGIC UNCHANGED ────────────────────────────
    state.totalBoxesOpened = (state.totalBoxesOpened || 0) + 1;
    state.pityCounterEpic       = (state.pityCounterEpic       || 0) + 1;
    state.pityCounterLegendary  = (state.pityCounterLegendary  || 0) + 1;

    const wonCards = [];
    for (let i = 0; i < def.cards; i++) {
      let rarity = this._weightedRarity(def.pool);
      if (state.pityCounterLegendary >= PITY_LEGENDARY_THRESHOLD) {
        rarity = 'legendary'; state.pityCounterLegendary = 0; state.pityCounterEpic = 0;
      } else if (state.pityCounterEpic >= PITY_EPIC_THRESHOLD && ['common','rare'].includes(rarity)) {
        rarity = 'epic'; state.pityCounterEpic = 0;
      }
      const pool = CARD_CATALOG.filter(c => c.rarity === rarity && getUnlockedCardPool(state).includes(c.id));
      if (!pool.length) { i--; continue; }
      const card = pool[Math.floor(Math.random() * pool.length)];
      wonCards.push(card);
      this.addCard(card.id);
    }
    addNotification(`📦 ${def.name}: ${wonCards.map(c => c.name).join(', ')}`);
    saveState();
    Render.updateStats();
    Render.updateGridInventory();
    Achievements.checkAll();
    // ── END REWARD LOGIC ──────────────────────────────────────

    // Phase: burst animation on box, then transition to reveal
    const boxEl = document.getElementById('loot-box');
    const btn   = document.getElementById('loot-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (boxEl) {
      boxEl.classList.remove('lr-box-idle');
      boxEl.classList.add('lr-box-burst');
    }

    // Spawn box-burst particles
    this._spawnParticles('lr-particles', 18);

    setTimeout(() => {
      // Transition to reveal stage
      const stageBox    = document.getElementById('lr-stage-box');
      const stageReveal = document.getElementById('lr-stage-reveal');
      if (stageBox)    stageBox.classList.add('lr-stage-hidden');
      if (stageReveal) { stageReveal.classList.remove('lr-stage-hidden'); stageReveal.classList.add('lr-stage-entering'); setTimeout(() => stageReveal.classList.remove('lr-stage-entering'), 400); }

      // Start the per-card reveal queue
      this._revealQueue = wonCards;
      this._revealIndex = 0;
      this._showNextCard();
    }, 750);
  },

  _showNextCard() {
    const cards = this._revealQueue;
    const idx   = this._revealIndex;
    if (!cards.length) return;

    const card    = cards[idx];
    const isLast  = idx === cards.length - 1;
    const total   = cards.length;

    // Update counter
    const counter = document.getElementById('lr-counter');
    if (counter) counter.textContent = total > 1 ? `${idx + 1} / ${total}` : '';

    // Populate card
    const rColors = {
      common:'rgba(140,155,165,.9)', rare:'rgba(41,121,255,1)',
      epic:'rgba(213,0,249,1)', legendary:'rgba(255,179,0,1)', mythic:'rgba(255,60,60,1)',
    };
    const rLabel  = { common:'Common', rare:'Rare', epic:'Epic', legendary:'Legendary', mythic:'Mythic' };
    const rColor  = rColors[card.rarity] || '#fff';

    const cardEl  = document.getElementById('lr-card');
    const icoEl   = document.getElementById('lr-card-ico');
    const nameEl  = document.getElementById('lr-card-name');
    const rarEl   = document.getElementById('lr-card-rar');
    const descEl  = document.getElementById('lr-card-desc');
    const glowEl  = document.getElementById('lr-reveal-glow');
    const tapHint = document.getElementById('lr-tap-hint');
    const collectBtn = document.getElementById('lr-collect-btn');

    // Reset animation
    if (cardEl) {
      cardEl.className = `lr-card lr-rarity-${card.rarity}`;
      cardEl.style.setProperty('--r-color', rColor);
      void cardEl.offsetWidth; // force reflow
      cardEl.classList.add('lr-card-entering');
    }
    if (icoEl)  icoEl.textContent  = card.icon;
    if (nameEl) { nameEl.textContent = card.name; nameEl.style.color = rColor; }
    if (rarEl)  { rarEl.textContent = rLabel[card.rarity] || card.rarity; rarEl.style.color = rColor; rarEl.style.borderColor = rColor; }
    if (descEl) descEl.textContent = card.desc || '';

    // Glow behind card
    if (glowEl) {
      glowEl.className = `lr-reveal-glow lr-glow-${card.rarity}`;
      glowEl.style.setProperty('--r-color', rColor);
    }

    // Spawn reveal particles
    this._spawnParticles('lr-reveal-particles', card.rarity === 'mythic' || card.rarity === 'legendary' ? 28 : card.rarity === 'epic' ? 18 : 10);

    // Screen shake for high rarity
    if (card.rarity === 'legendary' || card.rarity === 'mythic') {
      const ov = document.getElementById('ov-loot');
      if (ov) {
        ov.classList.add('lr-screen-shake');
        setTimeout(() => ov.classList.remove('lr-screen-shake'), 500);
      }
    }

    // Show tap hint vs collect button
    if (tapHint)    { tapHint.style.display    = isLast ? 'none' : 'block'; }
    if (collectBtn) { collectBtn.classList.toggle('lr-hidden', !isLast); }

    // Tap anywhere on reveal stage to advance (not on button)
    const stageReveal = document.getElementById('lr-stage-reveal');
    if (stageReveal) {
      stageReveal.onclick = null;
      if (!isLast) {
        // Delay before allowing tap
        setTimeout(() => {
          stageReveal.onclick = (e) => {
            if (e.target.closest('#lr-collect-btn')) return;
            stageReveal.onclick = null;
            this._revealIndex++;
            this._showNextCard();
          };
        }, 900);
      }
    }
  },

  _spawnParticles(containerId, count = 12) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const colors = ['var(--cyan)', 'var(--amber)', 'var(--purple)', '#fff', 'var(--green)'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'lr-particle';
      const angle   = (360 / count) * i + (Math.random() - .5) * 30;
      const dist    = 60 + Math.random() * 100;
      const size    = 3 + Math.random() * 5;
      const color   = colors[Math.floor(Math.random() * colors.length)];
      const delay   = Math.random() * 200;
      const dur     = 500 + Math.random() * 400;
      p.style.cssText = `
        width:${size}px; height:${size}px; background:${color};
        border-radius:50%; position:absolute;
        top:50%; left:50%; transform:translate(-50%,-50%);
        animation: particleFly ${dur}ms ${delay}ms cubic-bezier(.2,.8,.4,1) forwards;
        --px: ${Math.cos(angle * Math.PI / 180) * dist}px;
        --py: ${Math.sin(angle * Math.PI / 180) * dist}px;
        pointer-events:none;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), dur + delay + 100);
    }
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
