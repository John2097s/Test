/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  render.js — Render-Funktionen                               ║
 * ║                                                              ║
 * ║  Alle Funktionen die DOM-Elemente befüllen / aktualisieren.  ║
 * ║  Keine Spiellogik hier — nur Darstellung.                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const Render = {

  /* ── HEADER & GLOBALE ELEMENTE ──────────────────────────── */

  /**
   * Header-Elemente aktualisieren:
   * Level-Badge, Klassen-Name, XP-Zahlen, XP-Bar, Streak
   */
  updateHeader() {
    const threshold = getXPForLevel(state.level);
    const pct       = Math.min(100, (state.xp / threshold) * 100);
    const className = getLevelClassName(state.level);

    document.getElementById('h-lvl').textContent   = `LV ${state.level}`;
    document.getElementById('h-class').textContent = className;
    document.getElementById('h-xpn').textContent   = `${state.xp}/${threshold}`;
    document.getElementById('xp-fill').style.width = `${pct}%`;
    document.getElementById('xp-fill').setAttribute('aria-valuenow', pct);
    document.getElementById('h-streak').textContent = state.streak;

    // Timed boost indicator
    const boostEl = document.getElementById('h-boost');
    if (boostEl) {
      const charges = state.timedBoostCharges || 0;
      if (charges > 0) {
        boostEl.textContent  = `⌛×${state.timedBoostMult} (${charges})`;
        boostEl.style.display = '';
        boostEl.classList.add('timed-boost-active');
      } else {
        boostEl.style.display = 'none';
        boostEl.classList.remove('timed-boost-active');
      }
    }

    const safe = id => document.getElementById(id);
    if (safe('home-xp-fill'))   safe('home-xp-fill').style.width   = `${pct}%`;
    if (safe('home-xpn'))       safe('home-xpn').textContent       = `${state.xp} / ${threshold} XP`;
    if (safe('home-lvl-label')) safe('home-lvl-label').textContent = `LV ${state.level}`;
    if (safe('home-lvl-badge')) safe('home-lvl-badge').textContent = `LV ${state.level}`;
    if (safe('home-streak'))    safe('home-streak').textContent    = state.streak;
    if (safe('home-class'))     safe('home-class').textContent     = className;
    if (safe('home-title'))     safe('home-title').textContent     = Cosmetics.getTitle();
    if (safe('home-username'))  safe('home-username').textContent  = state.username;
    if (safe('home-avatar')) {
      safe('home-avatar').innerHTML = state.avatarData
        ? `<img src="${state.avatarData}" alt="Avatar">` : '⚔️';
    }
    this._updateDailyBtn();
  },

  /** Daily-Button auf Home markieren ob schon eingelöst */
  _updateDailyBtn() {
    const btn = document.getElementById('home-daily-btn');
    const sub = document.getElementById('daily-sub-txt');
    if (!btn) return;
    const claimed = state.dailyClaimedToday === todayISO();
    const day     = state.dailyLoginDay || 1;
    const nextDay = (day % 7) + 1;
    const next    = DAILY_LOGIN_REWARDS.find(r => r.day === nextDay);
    btn.classList.toggle('claimed', claimed);
    if (sub) {
      sub.textContent = claimed
        ? `✓ Heute eingelöst — Tag ${day}/7`
        : `Tag ${day}/7 — ${DAILY_LOGIN_REWARDS.find(r => r.day === day)?.label || 'Bonus'} warten!`;
    }
  },

  /**
   * Stat-Karten im Quest-Tab aktualisieren.
   */
  updateStats() {
    const el = id => document.getElementById(id);
    el('s-xp').textContent     = state.totalXP.toLocaleString('de-DE');
    el('s-done').textContent   = state.done;
    el('s-active').textContent = state.tasks.length;
    el('s-cards').textContent  = Cards.totalCards();
  },

  /* ── TASK-LISTE ─────────────────────────────────────────── */

  /** Renders a single custom task card — difficulty-first, no category */
  _taskHTML(task) {
    const card = task.cardId ? getCard(task.cardId) : null;
    const xp   = task.xp || CATEGORY_XP[task.category] || 100;
    const diff = TASK_DIFFICULTIES?.find(d => d.id === task.difficulty) || TASK_DIFFICULTIES?.[1];

    // Difficulty config
    const diffMap = {
      micro:  { label: 'Easy',   cls: 'diff-easy',   icon: '🟢' },
      normal: { label: 'Normal', cls: 'diff-normal',  icon: '🟡' },
      hard:   { label: 'Hard',   cls: 'diff-hard',    icon: '🔴' },
    };
    const d = diffMap[task.difficulty] || diffMap.normal;

    const cardBadge = card
      ? `<span class="task-card-applied ${card.rarity}">${card.icon} ${card.name}</span>`
      : (state.pendingCard
          ? `<span class="task-card-pending" title="Karte bereit">🃏 Bereit</span>`
          : '');

    return `<div class="task-card task-diff-card ${d.cls}" role="listitem" data-id="${task.id}">
      <div class="task-diff-stripe"></div>
      <div class="task-card-body">
        <div class="task-card-name" title="${this._esc(task.name)}">${this._esc(task.name)}</div>
        <div class="task-card-meta">
          <span class="task-diff-badge ${d.cls}">${d.icon} ${d.label}</span>
          <span class="task-xp-tag">⚡ ${xp} XP</span>
          ${cardBadge}
        </div>
      </div>
      <div class="task-card-actions">
        <button class="tact-btn tact-done" onclick="App.completeTask('${task.id}',event)" title="Erledigen">✓</button>
        <button class="tact-btn tact-skip" onclick="App.skipTask('${task.id}')" title="Überspringen">⏭</button>
        <button class="tact-btn tact-card" onclick="App.openCardModal('${task.id}')" title="Karte nutzen">🃏</button>
        <button class="tact-btn tact-del"  onclick="App.deleteTask('${task.id}')" title="Löschen">✕</button>
      </div>
    </div>`;
  },

  /**
   * Task-Liste rendern.
   * @param {string} [filter='all'] - Aktiver Kategorie-Filter
   */
  updateTasks(filter = 'all') {
    const list = document.getElementById('task-list');
    if (!list) return;

    // Filter by difficulty (not category)
    const tasks = filter === 'all'
      ? state.tasks
      : state.tasks.filter(t => t.difficulty === filter);

    // Update filter button active state
    document.querySelectorAll('.diff-ftab').forEach(b => {
      b.classList.toggle('on', b.dataset.diff === filter);
    });

    if (!tasks.length) {
      const msg = filter === 'all' ? 'Keine Custom Quests' : `Keine ${filter === 'micro' ? 'Easy' : filter === 'normal' ? 'Normal' : 'Hard'} Quests`;
      list.innerHTML = `<div class="empty-state">
        <span class="empty-ico">⚔️</span>
        <div class="empty-txt">${msg}</div>
        <div class="empty-sub">Erstelle deine erste Quest oben!</div>
      </div>`;
      return;
    }
    list.innerHTML = tasks.map(t => this._taskHTML(t)).join('');
    this.updateHomePreview();
  },

  /** Home-Screen: zeigt max. 5 Tasks als Vorschau */
  updateHomePreview() {
    const el = document.getElementById('home-task-preview');
    if (!el) return;
    const tasks = state.tasks.slice(0, 5);
    if (!tasks.length) {
      el.innerHTML = `<div class="empty-state" style="padding:24px 8px">
        <span class="empty-ico" style="font-size:32px">✅</span>
        <div class="empty-txt">Alle Quests erledigt!</div>
        <div class="empty-sub">Neue Quest im Tasks-Tab erstellen</div>
      </div>`;
      return;
    }
    el.innerHTML = tasks.map(t => this._taskHTML(t)).join('');
    if (state.tasks.length > 5) {
      el.innerHTML += `<div style="text-align:center;padding:10px;font-size:11px;color:var(--muted)">+ ${state.tasks.length - 5} weitere Quests</div>`;
    }
  },



  /**
   * Karten im Quest-Tab (Hand-Vorschau) und Karten-Tab aktualisieren.
   */
  updateCards() {
    // Only update hand-cards (legacy shim) and hand-total counter.
    // inv-cards-list is NOT used — grid is the sole card display.
    const handEl    = document.getElementById('hand-cards');
    const handTotal = document.getElementById('hand-total');
    if (handTotal) handTotal.textContent = Cards.totalCards();
    if (handEl) {
      const inv = Cards.getInventory();
      if (!inv.length) {
        handEl.innerHTML = '<span style="font-size:11px;color:var(--muted)">Keine Karten</span>';
      } else {
        handEl.innerHTML = inv.map(({ card, count }) =>
          `<span class="card-chip ${card.rarity}">${card.icon} ${card.name}${count > 1 ? ` <span class="chip-cnt">×${count}</span>` : ''}</span>`
        ).join('');
      }
    }
  },

  /**
   * Karten-Auswahl-Modal für eine Quest befüllen.
   * @param {string} taskId
   */
  renderCardModal(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const inv = Cards.getInventory();
    const opts = document.getElementById('card-opts');
    const sub  = document.getElementById('cm-sub');

    sub.textContent = `Quest: "${task.name}"`;

    if (!inv.length) {
      opts.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:16px 0">Keine Karten verfügbar. Schließe Quests ab um Karten zu verdienen!</div>';
      return;
    }

    opts.innerHTML = inv.map(({ card, count }) =>
      `<button class="card-opt" onclick="App.applyCard('${taskId}','${card.id}')" aria-label="Karte ${card.name} anwenden">
        <span class="card-opt-ico">${card.icon}</span>
        <div class="card-opt-info">
          <div class="card-opt-name r-${card.rarity}">${card.name}</div>
          <div class="card-opt-desc">${card.effect}</div>
        </div>
        <span class="card-opt-cnt">×${count}</span>
      </button>`
    ).join('');
  },

  /* ── ACHIEVEMENTS ────────────────────────────────────────── */

  /**
   * Achievement-Grid rendern.
   * @param {string} [filter='all']
   */
  updateAchievements(filter = 'all') {
    const grid = document.getElementById('ach-grid');
    if (!grid) return;

    let list = ACHIEVEMENTS;
    if (filter !== 'all') list = ACHIEVEMENTS.filter(a => a.category === filter);

    const total    = ACHIEVEMENTS.length;
    const done     = state.achievements.length;
    const summaryEl = document.getElementById('ach-progress-summary');
    if (summaryEl) summaryEl.textContent = `${done} / ${total} freigeschaltet`;

    grid.innerHTML = list.map(ach => {
      const unlocked = Achievements.isUnlocked(ach.id);
      const prog     = Achievements.getProgress(ach);
      const hidden   = ach.hidden && !unlocked;
      const rColor   = unlocked ? 'var(--green)' : 'var(--muted)';
      const unlockTag = ach.unlocks
        ? `<div class="ach-unlock-tag ${unlocked ? 'ach-unlock-done' : ''}">
             🔓 ${getCard(ach.unlocks)?.name || ach.unlocks} ${unlocked ? '✓' : 'freischalten'}
           </div>`
        : (ach.reward && !unlocked ? `<div class="ach-reward-tag">${ach.reward}</div>` : '');

      return `<div class="ach-card-full ${unlocked ? 'unlocked' : ''} ${hidden ? 'hidden-ach' : ''}" data-ach="${ach.id}">
        <div class="ach-card-top">
          <span class="ach-ico-lg">${hidden ? '❓' : ach.icon}</span>
          <div class="ach-card-info">
            <div class="ach-card-name">${hidden ? '???' : this._esc(ach.name)}</div>
            <div class="ach-card-desc">${hidden ? 'Geheimes Achievement' : this._esc(ach.desc)}</div>
            ${unlockTag}
          </div>
          ${unlocked ? '<span class="ach-done-check">✓</span>' : ''}
        </div>
        ${prog !== null && !unlocked ? `
          <div class="ach-prog-wrap">
            <div class="ach-prog"><div class="ach-prog-fill" style="width:${prog}%"></div></div>
            <span class="ach-prog-txt">${prog}%</span>
          </div>` : ''}
      </div>`;
    }).join('');

    this.updateAchFilters(filter);
  },

  updateAchFilters(active = 'all') {
    const el = document.getElementById('ach-filters');
    if (!el) return;
    const cats   = ['all','streak','tasks','gameplay','progression','special'];
    const labels = { all:'Alle', streak:'🔥 Streak', tasks:'✅ Tasks', gameplay:'🎮 Gameplay', progression:'⭐ Level', special:'👁 Geheim' };
    el.innerHTML = cats.map(c =>
      `<button class="ftab ${c === active ? 'on' : ''}" onclick="App.setAchFilter('${c}',this)">${labels[c]}</button>`
    ).join('');
  },

  /* ── REWARDS ────────────────────────────────────────────── */

  /**
   * Level-Rewards Liste rendern.
   */
  updateLevelRewards() {
    const el = document.getElementById('level-grid');
    if (!el) return;

    el.innerHTML = LEVEL_CLASSES.map(cls => {
      const reached = state.level >= cls.level;
      return `<div class="level-item ${reached ? 'reached' : ''}">
        <div class="li-lvl">${cls.level}</div>
        <div class="li-info">
          <div class="li-name">${cls.name}</div>
          <div class="li-rew">${cls.reward}</div>
        </div>
        <span>${reached ? '<span class="li-done">✓</span>' : '<span class="li-lock">🔒</span>'}</span>
      </div>`;
    }).join('');
  },

  /**
   * Streak-Rewards Liste rendern.
   */
  updateStreakRewards() {
    const el = document.getElementById('streak-grid');
    if (!el) return;

    el.innerHTML = STREAK_REWARDS.map(sr => {
      const claimed = state.claimedStreakRewards.includes(sr.streak);
      const reached = state.streak >= sr.streak;
      return `<div class="level-item ${claimed ? 'reached' : ''}">
        <div class="li-lvl" style="color:var(--amber)">🔥${sr.streak}</div>
        <div class="li-info">
          <div class="li-name">${sr.streak}-Tage Streak</div>
          <div class="li-rew">${sr.text}</div>
        </div>
        <span>${claimed ? '<span class="li-done">✓</span>' : reached ? '<span style="color:var(--cyan)">↑</span>' : '<span class="li-lock">🔒</span>'}</span>
      </div>`;
    }).join('');
  },

  /**
   * Cosmetic-Grid rendern.
   */
  updateCosmetics() {
    const el = document.getElementById('cosm-grid');
    if (!el) return;

    el.innerHTML = COSMETICS.map(cosm => {
      const unlocked = Cosmetics.isUnlocked(cosm.id);
      const equipped = Cosmetics.isEquipped(cosm.id);
      return `<div class="cosm-card ${unlocked ? 'unlocked' : ''} ${equipped ? 'equipped' : ''}"
        onclick="${unlocked ? `Cosmetics.equip('${cosm.id}')` : ''}"
        title="${cosm.unlockCondition}" aria-label="${cosm.name}">
        ${equipped ? '<span class="cosm-eq-badge">EQ</span>' : ''}
        <span class="cosm-ico">${cosm.icon}</span>
        <div class="cosm-name">${cosm.name}</div>
        <div class="${unlocked ? 'cosm-unlock' : 'cosm-lock'}">${unlocked ? (equipped ? '✓ Ausgerüstet' : 'Klick zum Anlegen') : cosm.unlockCondition}</div>
      </div>`;
    }).join('');
  },

  /* ── PROFIL ─────────────────────────────────────────────── */

  /**
   * Profil-Panel aktualisieren.
   */
  updateProfile() {
    const el  = id => document.getElementById(id);
    const thr = getXPForLevel(state.level);
    const pct = Math.min(100, (state.xp / thr) * 100);

    el('ph-name').textContent        = state.username;
    el('ph-class').textContent       = getLevelClassName(state.level);
    el('ph-title').textContent       = Cosmetics.getTitle();
    el('prof-xp-label').textContent  = `${state.xp} / ${thr} XP`;
    el('prof-xp-fill').style.width   = `${pct}%`;

    el('pp-xp').textContent     = state.totalXP.toLocaleString('de-DE');
    el('pp-lvl').textContent    = state.level;
    el('pp-done').textContent   = state.done;
    el('pp-skip').textContent   = state.skipped;
    el('pp-streak').textContent = state.streak;
    el('pp-ach').textContent    = state.achievements.length;

    const avatarEl = el('profile-avatar');
    if (state.avatarData) {
      avatarEl.innerHTML = `<img src="${state.avatarData}" alt="Profilbild">`;
    } else {
      avatarEl.textContent = '⚔️';
    }

    const achEl = el('profile-achievements');
    if (achEl) {
      const unlocked = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id));
      if (!unlocked.length) {
        achEl.innerHTML = '<div style="color:var(--muted);font-size:12px">Noch keine Achievements freigeschaltet</div>';
      } else {
        achEl.innerHTML = unlocked.map(a =>
          `<span style="font-size:18px" title="${a.name}">${a.icon}</span>`
        ).join(' ');
      }
    }
  },

  /* ── WEEKLY ─────────────────────────────────────────────── */

  /**
   * Weekly-Quest-Grid rendern.
   */
  /* ── DAILY TASKS ─────────────────────────────────────────── */

  /** Get today's 3 daily tasks (deterministic per day) */
  _getDailyTasks() {
    const today     = todayISO();
    const seed      = parseInt(today.replace(/-/g, ''), 10);
    const pool      = [...DAILY_TASK_POOL];
    // simple seeded shuffle — take first 3
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.abs((seed * (i + 1) * 2654435761) % (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let count = 3;
    if (typeof SkillTree !== 'undefined' && SkillTree.isUnlocked('daily_extra')) count = 4;
    return pool.slice(0, count);
  },

  updateDailyTasks() {
    const el = document.getElementById('daily-task-list');
    if (!el) return;

    const today = todayISO();
    if (state.dailyTasksDate !== today) {
      state.dailyTasksDone = [];
      state.dailyTasksDate = today;
      saveState();
    }

    const tasks    = this._getDailyTasks();
    const doneAll  = tasks.every(t => state.dailyTasksDone.includes(t.id));
    const doneCount = tasks.filter(t => state.dailyTasksDone.includes(t.id)).length;

    // Summary bar
    const summaryPct = Math.round((doneCount / tasks.length) * 100);

    el.innerHTML = `
      <div class="daily-summary">
        <div class="daily-summary-txt">
          <span>${doneCount}/${tasks.length} erledigt</span>
          ${doneAll ? '<span class="daily-all-done">✓ Alle Daily Quests abgeschlossen!</span>' : ''}
        </div>
        <div class="daily-summary-bar">
          <div class="daily-summary-fill" style="width:${summaryPct}%"></div>
        </div>
      </div>
      ${tasks.map(t => {
        const done = state.dailyTasksDone.includes(t.id);
        const xp   = CATEGORY_XP[t.xpKey] || 200;
        return `<div class="dquest-card ${done ? 'dquest-done' : ''}" data-id="${t.id}">
          <div class="dquest-left">
            <div class="dquest-ico">${t.icon}</div>
            <div class="dquest-info">
              <div class="dquest-name">${this._esc(t.name)}</div>
              <div class="dquest-meta">
                <span class="dquest-xp">⚡ ${xp} XP</span>
                <span class="dquest-no-card" title="Kein Karten-Einsatz bei Daily Quests">🚫🃏</span>
              </div>
            </div>
          </div>
          <div class="dquest-action">
            ${done
              ? `<span class="dquest-check">✓</span>`
              : `<button class="tact-btn tact-done" onclick="App.completeDailyTask('${t.id}')">✓</button>`
            }
          </div>
        </div>`;
      }).join('')}`;
  },

  /* ── WEEKLY CHALLENGES ────────────────────────────────────── */

  updateWeeklyChallengess() {
    const el = document.getElementById('weekly-challenges-list');
    if (!el) return;

    const week = Engine._currentWeekKey();
    const totalDone = WEEKLY_CHALLENGES.filter(ch => {
      const prog = state.weeklyProgress[ch.id];
      return prog?.completed && prog?.weekStart === week;
    }).length;

    el.innerHTML = `
      <div class="weekly-summary">
        <span>${totalDone}/${WEEKLY_CHALLENGES.length} abgeschlossen diese Woche</span>
      </div>
      ${WEEKLY_CHALLENGES.map(ch => {
        const prog  = state.weeklyProgress[ch.id];
        const steps = (prog?.weekStart === week ? prog.steps : 0);
        const done  = prog?.completed && prog?.weekStart === week;
        const pct   = Math.min(100, Math.round((steps / ch.steps) * 100));
        const loot  = LOOTBOX_DEFS[ch.loot];

        return `<div class="wquest-card ${done ? 'wquest-done' : ''}">
          <div class="wquest-top">
            <div class="wquest-ico">${ch.icon}</div>
            <div class="wquest-info">
              <div class="wquest-name">${this._esc(ch.name)}</div>
              <div class="wquest-rewards">
                <span class="wquest-xp">⚡ ${ch.xp * ch.steps} XP total</span>
                <span class="wquest-loot">${loot?.icon || '📦'} ${loot?.name || ch.loot}</span>
                <span class="wquest-card-ok" title="Karten-Einsatz erlaubt">🃏 OK</span>
              </div>
            </div>
            <div class="wquest-action">
              ${done
                ? `<span class="wquest-check">✓</span>`
                : `<button class="wquest-btn" onclick="Engine.advanceWeeklyChallenge('${ch.id}')">+1</button>`
              }
            </div>
          </div>
          <div class="wquest-prog-row">
            <div class="wquest-prog-track">
              <div class="wquest-prog-fill" style="width:${pct}%"></div>
            </div>
            <span class="wquest-prog-label">${steps}/${ch.steps}</span>
          </div>
        </div>`;
      }).join('')}`;
  },

  /** Combined weekly screen update */
  updateWeekly() {
    this.updateDailyTasks();
    this.updateWeeklyChallengess();
  },

  /* ── NOTIFICATIONS ──────────────────────────────────────── */

  /**
   * Notification-Liste rendern.
   */
  updateNotifications() {
    const el = document.getElementById('notif-list');
    if (!el) return;

    if (!state.notifications.length) {
      el.innerHTML = '<div class="notif-item" style="color:var(--muted)">Keine Benachrichtigungen</div>';
      return;
    }

    el.innerHTML = state.notifications.map(n =>
      `<div class="notif-item ${n.read ? '' : 'unread'}">${n.text}</div>`
    ).join('');
  },

  /* ── TOASTS ─────────────────────────────────────────────── */

  /**
   * Toast-Nachricht anzeigen.
   * @param {string} msg   - Nachrichtentext
   * @param {string} [type] - CSS-Klasse: 'xp' | 'card' | 'ach' | 'danger'
   * @param {number} [dur=3000] - Anzeigedauer in ms
   */
  toast(msg, type = '', dur = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;

    const container = document.getElementById('toast-container');
    container.appendChild(el);

    // Auto-entfernen
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, dur);
  },

  /* ── HILFSFUNKTIONEN ────────────────────────────────────── */

  /**
   * HTML-Zeichen escapen (verhindert XSS).
   * @param {string} str
   * @returns {string}
   */
  _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  },

  /** Kategorie-Label mit Emoji */
  _catLabel(cat) {
    return { work: '💼 Arbeit', private: '🏠 Privat', gaming: '🎮 Gaming', weekly: '📅 Weekly' }[cat] || cat;
  },

  /** Rarität-Label */
  _rarityLabel(r) {
    return { common: '⚪ Common', rare: '🔵 Rare', epic: '🟣 Epic', legendary: '🟡 Legendary' }[r] || r;
  },

  /**
   * Einfacher deterministischer Hash für wöchentliche Quest-Auswahl.
   * @param {string|number} val
   * @returns {number}
   */
  _hash(val) {
    let h = 0;
    const s = String(val);
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  },

  /* ── SIMPLE CARDS UI ─────────────────────────────────────── */

  /**
   * Einfaches Karten-Inventar rendern — verwendet neue .inv-card Klassen.
   */
  updateSimpleCards() {
    // Shows the pending card banner (card waiting for next task)
    this.updatePendingCardBanner();
  },

  updatePendingCardBanner() {
    const el = document.getElementById('active-card-banner');
    if (!el) return;
    const cardId = state.pendingCard;
    if (!cardId) { el.style.display = 'none'; return; }
    const card = getCard(cardId);
    if (!card) { el.style.display = 'none'; return; }
    const rColor = { common:'var(--common)', rare:'var(--rare)', epic:'var(--epic)', legendary:'var(--legendary)', mythic:'var(--cyan)' }[card.rarity] || 'var(--cyan)';
    el.style.display = '';
    el.innerHTML = `
      <span style="color:var(--cyan);font-family:var(--font-display);font-size:10px;letter-spacing:.1em">// NÄCHSTE KARTE</span>
      <span style="font-size:18px">${card.icon}</span>
      <span style="font-weight:600;color:${rColor}">${card.name}</span>
      <span style="color:var(--muted);font-size:11px">${card.effect}</span>
      <button onclick="state.pendingCard=null;state.pendingCardSlot=null;saveState();Render.updateSimpleCards();"
        style="margin-left:auto;font-size:11px;color:var(--red);padding:2px 8px;border:1px solid var(--red);border-radius:4px">✕</button>
    `;
  },

  updateActiveCardBanner() { this.updatePendingCardBanner(); },

  /**
   * Daily Reward Popup anzeigen.
   * @param {{ type: 'xp'|'card', xp?: number, label?: string }} result
   */
  showDailyPopup(result) {
    const el = document.getElementById('ov-daily');
    if (!el) return;

    const ico   = document.getElementById('daily-ico');
    const title = document.getElementById('daily-title');
    const sub   = document.getElementById('daily-sub');

    if (result.type === 'xp') {
      ico.textContent   = '🌅';
      title.textContent = '+100 XP';
      sub.textContent   = 'Daily Login Bonus! Komm morgen wieder.';
    } else {
      ico.textContent   = result.label?.split(' ')[0] || '🃏';
      title.textContent = result.label || 'Karte erhalten!';
      sub.textContent   = 'Daily Login Bonus! Komm morgen wieder.';
    }

    App.openOv('ov-daily');
  },

  /* ── SKILL TREE ──────────────────────────────────────────── */

  updateSkillPoints() { /* SkillTree removed */ },

  updateSkillTree() {
    const grid = document.getElementById('skill-tree-grid');
    if (grid) grid.innerHTML = `<div class="empty-state" style="padding:40px 16px">
      <span class="empty-ico">🌳</span>
      <div class="empty-txt">Skill Tree entfernt</div>
      <div class="empty-sub">Karten werden durch Lootboxen freigeschaltet</div>
    </div>`;
  },

  /**
   * Gesamte UI beim Start initialisieren — erweitert um Skill Tree.
   */
  /* ── DAILY 7-DAY LOGIN BOX ───────────────────────────────── */

  updateDaily7() {
    const el = document.getElementById('daily7-boxes');
    if (!el) return;
    const currentDay = state.dailyLoginDay || 1;
    const claimed    = state.dailyClaimedToday === todayISO();
    el.innerHTML = DAILY_LOGIN_REWARDS.map(r => {
      const isPast    = r.day < currentDay;
      const isCurrent = r.day === currentDay;
      const isFuture  = r.day > currentDay;
      let cls = 'day7-box';
      if (isPast)    cls += ' day7-past';
      if (isCurrent) cls += ' day7-current';
      if (isFuture)  cls += ' day7-future';
      return `<div class="${cls}" title="${r.label}">
        <div class="day7-num">D${r.day}</div>
        <div class="day7-ico">${isPast ? '✓' : r.icon}</div>
        <div class="day7-lbl">${r.day <= 4 ? r.label.split(' ').slice(-1)[0] : r.label.split(' ')[0]}</div>
      </div>`;
    }).join('');

    // Claim button
    const btn = document.getElementById('daily7-claim-btn');
    if (btn) {
      btn.disabled = claimed;
      btn.textContent = claimed ? `✓ Tag ${currentDay} eingelöst` : `Tag ${currentDay} einlösen`;
      btn.className   = claimed ? 'fbtn' : 'fbtn daily7-claim-active';
      btn.style.opacity = claimed ? '.55' : '1';
    }
  },

  /* ── INVENTORY SCREEN ────────────────────────────────────── */

  updateInventory() {
    // Grid is rendered by updateGridInventory().
    // Lootboxes rendered by updateLootboxInventory().
    // _renderInvCards() intentionally NOT called — grid IS the card display.
    this.updateLootboxInventory();
    this.updatePendingCardBanner();
  },

  updateLootboxInventory() {
    const el = document.getElementById('lootbox-inv-list');
    if (!el) return;

    const boxes = state.storedLootboxes || [];
    if (!boxes.length) {
      el.innerHTML = `<div class="lbox-empty">
        <span>📦</span>
        <div>Keine Lootboxen</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Schließe Achievements oder Weekly Challenges ab</div>
      </div>`;
      return;
    }

    // Sort by rarity order
    const order = ['basic','advanced','premium','mythic'];
    const sorted = [...boxes].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

    el.innerHTML = sorted.map(({ type, quantity }) => {
      const def = LOOTBOX_DEFS[type];
      if (!def) return '';
      const rarityClass = type === 'mythic' ? 'lbox-mythic' : type === 'premium' ? 'lbox-premium' : type === 'advanced' ? 'lbox-advanced' : 'lbox-basic';
      return `<div class="lbox-slot ${rarityClass}" onclick="Render.showLootboxPopup('${type}', event)">
        <div class="lbox-ico">${def.icon}</div>
        <div class="lbox-name">${def.name}</div>
        <div class="lbox-qty">×${quantity}</div>
      </div>`;
    }).join('');
  },

  showLootboxPopup(type, evt) {
    if (evt) evt.stopPropagation();
    const def = LOOTBOX_DEFS[type];
    if (!def) return;

    document.querySelector('.lbox-popup')?.remove();

    const entry = (state.storedLootboxes || []).find(b => b.type === type);
    if (!entry) return;

    // Build pool description
    const poolDesc = def.pool
      .filter(p => p.weight > 0)
      .map(p => {
        const totalW = def.pool.reduce((s, e) => s + e.weight, 0);
        const pct = Math.round((p.weight / totalW) * 100);
        const colors = { common:'var(--common)', rare:'var(--rare)', epic:'var(--epic)', legendary:'var(--legendary)', mythic:'var(--cyan)' };
        return `<span style="color:${colors[p.rarity]||'var(--text)'}">${p.rarity} ${pct}%</span>`;
      }).join('  ');

    const popup = document.createElement('div');
    popup.className = 'lbox-popup';
    popup.innerHTML = `
      <button class="lbox-popup-close" onclick="this.closest('.lbox-popup').remove()">×</button>
      <div class="lbox-popup-ico">${def.icon}</div>
      <div class="lbox-popup-name">${def.name}</div>
      <div class="lbox-popup-qty">×${entry.quantity} vorhanden</div>
      <div class="lbox-popup-cards">${def.cards} Karten pro Öffnung</div>
      <div class="lbox-popup-pool">${poolDesc}</div>
      <button class="lbox-popup-open" onclick="Cards.openStoredLoot('${type}');this.closest('.lbox-popup').remove()">
        📦 Öffnen
      </button>`;

    const cx = evt ? evt.clientX : window.innerWidth / 2;
    const cy = evt ? evt.clientY : window.innerHeight / 2;
    popup.style.setProperty('--popup-x', `${Math.max(115, Math.min(window.innerWidth - 115, cx))}px`);
    popup.style.setProperty('--popup-y', `${Math.max(160, Math.min(window.innerHeight - 160, cy))}px`);
    document.body.appendChild(popup);

    requestAnimationFrame(() => {
      const pw = popup.offsetWidth || 200, ph = popup.offsetHeight || 300;
      const x = Math.max(pw/2+10, Math.min(window.innerWidth-pw/2-10, cx));
      const y = Math.max(ph/2+10, Math.min(window.innerHeight-ph/2-10, cy));
      popup.style.setProperty('--popup-x', `${x}px`);
      popup.style.setProperty('--popup-y', `${y}px`);
    });
  },

  _renderInvCards() {
    // ── Advanced cards (from grid inventory) ──────────────────
    const el = document.getElementById('inv-cards-list');
    if (el) {
      const inv = Cards.getInventory();

      if (!inv.length) {
        el.innerHTML = `<div class="empty-state">
          <span class="empty-ico">🃏</span>
          <div class="empty-txt">Keine Karten</div>
          <div class="empty-sub">Schließe Achievements oder Weekly Challenges ab</div>
        </div>`;
      } else {
        el.innerHTML = inv.map(({ card, count }) => {
          const rColor = card.rarity === 'mythic'    ? 'var(--cyan)'
                       : card.rarity === 'legendary' ? 'var(--legendary)'
                       : card.rarity === 'epic'      ? 'var(--epic)'
                       : card.rarity === 'rare'      ? 'var(--rare)'
                       :                               'var(--common)';
          return `<div class="icard" data-card="${card.id}" style="--rc:${rColor}">
            <div class="icard-top">
              <span class="icard-ico">${card.icon}</span>
              <div class="icard-meta">
                <div class="icard-name">${this._esc(card.name)}</div>
                <div class="icard-rar">${card.rarity.toUpperCase()}</div>
              </div>
              <div class="icard-qty">×${count}</div>
            </div>
            <div class="icard-body" style="display:none">
              <div class="icard-desc">${this._esc(card.desc)}</div>
              <div class="icard-effect">${this._esc(typeof card.effect === 'string' ? card.effect : '')}</div>
            </div>
            <div class="icard-actions">
              <button class="icard-btn-info" onclick="Render.toggleInvDesc('${card.id}', this)">ℹ Info</button>
              <button class="icard-btn-use" onclick="App.useInventoryCard('${card.id}')">Benutzen</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    // ── Pending card display ───────────────────────────────────
    this.updatePendingCardBanner();
  },

  toggleInvDesc(cardId, btn) {
    const card = btn?.closest('.icard');
    if (!card) return;
    const body = card.querySelector('.icard-body');
    if (!body) return;
    const visible = body.style.display !== 'none' && body.style.display !== '';
    body.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? 'ℹ Info' : '✕ Info';
  },

  _renderInvCosmetics() {
    const groups = [
      { key: 'color',  label: '🎨 UI Farben',   equip: id => Cosmetics.equip(id) },
      { key: 'bg',     label: '🌆 Hintergrund',  equip: id => Cosmetics.equipBg(id) },
      { key: 'effect', label: '✨ Effekte',       equip: id => Cosmetics.equipEffect(id) },
      { key: 'frame',  label: '⬡ Avatar Rahmen', equip: id => Cosmetics.equip(id) },
      { key: 'title',  label: '🏷️ Titel',         equip: id => Cosmetics.equip(id) },
    ];

    groups.forEach(g => {
      const el = document.getElementById(`inv-cosm-${g.key}`);
      if (!el) return;
      const items = COSMETICS.filter(c => c.group === g.key);
      el.innerHTML = items.map(cosm => {
        const unlocked = Cosmetics.isUnlocked(cosm.id);
        const equipped = Cosmetics.isEquipped(cosm.id);
        return `<div class="cosm-card ${unlocked ? 'unlocked' : ''} ${equipped ? 'equipped' : ''}"
          onclick="${unlocked ? `Cosmetics.equip('${cosm.id}')` : ''}"
          title="${cosm.unlockCondition}">
          ${equipped ? '<span class="cosm-eq-badge">EQ</span>' : ''}
          <span class="cosm-ico">${cosm.icon}</span>
          <div class="cosm-name">${cosm.name}</div>
          <div class="${unlocked ? 'cosm-unlock' : 'cosm-lock'}">${unlocked ? (equipped ? '✓ Aktiv' : 'Tippen') : cosm.unlockCondition}</div>
        </div>`;
      }).join('');
    });
  },

  /* ── SHOP SCREEN ─────────────────────────────────────────── */

  updateShop() {
    const el = document.getElementById('shop-content');
    if (!el) return;
    el.innerHTML = `
      <div style="text-align:center;padding:48px 16px">
        <div style="font-size:52px;margin-bottom:16px">🛒</div>
        <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--cyan);letter-spacing:.1em;margin-bottom:8px">SHOP</div>
        <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px">Coming Soon</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.7;max-width:280px;margin:0 auto">
          Im Shop wirst du bald Karten, Cosmetics und Boosts kaufen können.<br>
          Wir arbeiten gerade daran! 🔨
        </div>
        <div style="margin-top:24px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <div class="hstat c1" style="width:100px"><div class="hstat-val">bald™</div><div class="hstat-lbl">Karten</div></div>
          <div class="hstat c3" style="width:100px"><div class="hstat-val">bald™</div><div class="hstat-lbl">Boosts</div></div>
          <div class="hstat c4" style="width:100px"><div class="hstat-val">bald™</div><div class="hstat-lbl">Cosmetics</div></div>
        </div>
      </div>`;
  },

  /* ── UPDATED COSMETICS (old profile rewards) ─────────────── */

  updateCosmetics() {
    const el = document.getElementById('cosm-grid');
    if (!el) return;
    // Show theme + frame only (compact for profile)
    const items = COSMETICS.filter(c => c.type === 'theme' || c.type === 'frame');
    el.innerHTML = items.map(cosm => {
      const unlocked = Cosmetics.isUnlocked(cosm.id);
      const equipped = Cosmetics.isEquipped(cosm.id);
      return `<div class="cosm-card ${unlocked ? 'unlocked' : ''} ${equipped ? 'equipped' : ''}"
        onclick="${unlocked ? `Cosmetics.equip('${cosm.id}')` : ''}"
        title="${cosm.unlockCondition}">
        ${equipped ? '<span class="cosm-eq-badge">EQ</span>' : ''}
        <span class="cosm-ico">${cosm.icon}</span>
        <div class="cosm-name">${cosm.name}</div>
        <div class="${unlocked ? 'cosm-unlock' : 'cosm-lock'}">${unlocked ? (equipped ? '✓ Ausgerüstet' : 'Klick zum Anlegen') : cosm.unlockCondition}</div>
      </div>`;
    }).join('');
  },

  /* ── SHOW DAILY POPUP (updated) ──────────────────────────── */

  showDailyPopup(result) {
    const el = document.getElementById('ov-daily');
    if (!el) return;

    const ico    = document.getElementById('daily-ico');
    const title  = document.getElementById('daily-title');
    const sub    = document.getElementById('daily-sub');
    const reward = result?.reward;

    if (ico)   ico.textContent   = reward?.icon  || '🌅';
    if (title) title.textContent = reward?.label || '+100 XP';
    if (sub)   sub.textContent   = `Tag ${result?.day || 1}/7 — Komm morgen für Tag ${((result?.day||1) % 7) + 1}!`;

    App.openOv('ov-daily');
  },

  /* ── GRID INVENTORY ──────────────────────────────────────── */

  updateGridInventory(context = 'profile') {
    // Render into profile grid AND overlay grid (if present)
    const targets = context === 'overlay'
      ? [{ el: document.getElementById('grid-inv-slots-overlay'), forTask: document.getElementById('inv-overlay')?.dataset.forTask || '' }]
      : [
          { el: document.getElementById('grid-inv-slots'), forTask: '' },
          { el: document.getElementById('grid-inv-slots-overlay'), forTask: document.getElementById('inv-overlay')?.dataset.forTask || '' },
        ];

    const slots   = Cards.getGridSlots();
    const lastIdx = state.lastUsedSlot;

    for (const { el, forTask } of targets) {
      if (!el) continue;
      el.innerHTML = slots.map((s, i) => {
        const isLast      = i === lastIdx && !s.isEmpty;
        const rarityKey   = s.card?.rarity || '';
        const rarityClass = rarityKey ? `inv-slot-${rarityKey}` : '';
        return `<div class="inv-slot ${s.isEmpty ? 'inv-slot-empty' : 'inv-slot-filled'} ${rarityClass} ${isLast ? 'inv-slot-lastused' : ''}"
          onclick="${s.isEmpty ? '' : `Render.showCardPopup(${i},'${this._esc(forTask)}',event)`}"
          data-slot="${i}"
          title="${s.card ? s.card.name : 'Leerer Slot'}">
          ${s.card ? `
            <span class="inv-slot-ico">${s.card.icon}</span>
            <span class="inv-slot-qty${s.quantity >= 5 ? ' inv-slot-maxqty' : ''}">${s.quantity}</span>
            ${isLast ? '<span class="inv-slot-last-badge">↩</span>' : ''}
          ` : ''}
        </div>`;
      }).join('');
    }

    // Last-used slot (profile only)
    const forTaskProfile = '';
    const luEl = document.getElementById('inv-lastused');
    if (luEl) this._updateLastUsedSlotEl(luEl, forTaskProfile);
    const luOvEl = document.getElementById('inv-lastused-overlay');
    if (luOvEl) this._updateLastUsedSlotEl(luOvEl, document.getElementById('inv-overlay')?.dataset.forTask || '');

    this._updatePityDisplay();
  },

  _updateLastUsedSlot(forTask) {
    const el = document.getElementById('inv-lastused');
    if (el) this._updateLastUsedSlotEl(el, forTask);
  },

  _updateLastUsedSlotEl(el, forTask) {
    const idx  = state.lastUsedSlot;
    const slot = idx !== null ? state.gridInventory?.[idx] : null;
    const card = slot?.cardId ? getCard(slot.cardId) : null;

    if (card && slot.quantity > 0) {
      el.innerHTML = `
        <div class="inv-slot inv-slot-filled inv-slot-${card.rarity} inv-slot-lastused-special"
          onclick="Render.showCardPopup(${idx}, '${this._esc(forTask)}', event)"
          title="Zuletzt verwendet: ${card.name}">
          <span class="inv-slot-ico">${card.icon}</span>
          <span class="inv-slot-qty">${slot.quantity}</span>
        </div>
        <div class="inv-lastused-label">Zuletzt</div>`;
    } else {
      el.innerHTML = `
        <div class="inv-slot inv-slot-empty inv-slot-lastused-special" title="Noch keine Karte verwendet">
        </div>
        <div class="inv-lastused-label">Zuletzt</div>`;
    }
  },

  _updatePityDisplay() {
    const epicEl  = document.getElementById('pity-epic-bar');
    const legEl   = document.getElementById('pity-leg-bar');
    const epicTxt = document.getElementById('pity-epic-txt');
    const legTxt  = document.getElementById('pity-leg-txt');
    if (!epicEl) return;

    const epicPct = Math.min(100, ((state.pityCounterEpic || 0) / PITY_EPIC_THRESHOLD) * 100);
    const legPct  = Math.min(100, ((state.pityCounterLegendary || 0) / PITY_LEGENDARY_THRESHOLD) * 100);

    epicEl.style.width = `${epicPct}%`;
    legEl.style.width  = `${legPct}%`;
    if (epicTxt) epicTxt.textContent = `${state.pityCounterEpic || 0}/${PITY_EPIC_THRESHOLD}`;
    if (legTxt)  legTxt.textContent  = `${state.pityCounterLegendary || 0}/${PITY_LEGENDARY_THRESHOLD}`;
  },

  /**
   * Show card detail popup over the grid.
   * @param {number} slotIdx
   * @param {string} forTask
   * @param {Event} evt
   */
  showCardPopup(slotIdx, forTask, evt) {
    if (evt) evt.stopPropagation();
    const slot = state.gridInventory?.[slotIdx];
    const card = slot?.cardId ? getCard(slot.cardId) : null;
    if (!card || !slot || slot.quantity <= 0) return;

    document.querySelector('.card-popup')?.remove();

    const rColor = { common:'var(--common)', rare:'var(--rare)', epic:'var(--epic)', legendary:'var(--legendary)', mythic:'var(--cyan)' }[card.rarity] || 'var(--text)';

    const popup = document.createElement('div');
    popup.className = `card-popup card-popup-${card.rarity}`;
    popup.dataset.slot = slotIdx;
    popup.innerHTML = `
      <button class="card-popup-close" onclick="this.closest('.card-popup').remove()">×</button>
      <div class="card-popup-ico">${card.icon}</div>
      <div class="card-popup-name" style="color:${rColor}">${card.name}</div>
      <div class="card-popup-rar" style="color:${rColor}">${card.rarity.toUpperCase()}</div>
      <div class="card-popup-qty" id="cpopup-qty-${slotIdx}">×${slot.quantity} im Inventar</div>
      <p class="card-popup-desc">${card.desc}</p>
      <p class="card-popup-effect">${card.effect}</p>
      <button class="card-popup-use" onclick="Render._useCardFromPopup(${slotIdx},'${this._esc(forTask||'')}',this)">
        ▶ Benutzen
      </button>`;

    // Pre-position before append
    const cx = evt ? evt.clientX : window.innerWidth / 2;
    const cy = evt ? evt.clientY : window.innerHeight / 2;
    popup.style.setProperty('--popup-x', `${Math.max(115, Math.min(window.innerWidth - 115, cx))}px`);
    popup.style.setProperty('--popup-y', `${Math.max(155, Math.min(window.innerHeight - 155, cy))}px`);
    document.body.appendChild(popup);

    // Refine with actual size
    requestAnimationFrame(() => {
      const pw = popup.offsetWidth || 210, ph = popup.offsetHeight || 310;
      const M = 10;
      popup.style.setProperty('--popup-x', `${Math.max(pw/2+M, Math.min(window.innerWidth-pw/2-M, cx))}px`);
      popup.style.setProperty('--popup-y', `${Math.max(ph/2+M, Math.min(window.innerHeight-ph/2-M, cy))}px`);
    });

    // Highlight slot
    const slotEl = document.querySelector(`[data-slot="${slotIdx}"]`);
    if (slotEl) {
      slotEl.classList.add('inv-slot-selected');
      setTimeout(() => slotEl?.classList.remove('inv-slot-selected'), 600);
    }
  },

  /** Called by popup's "Benutzen" button — animates, uses card, updates qty or closes popup */
  _useCardFromPopup(slotIdx, forTask, btn) {
    const slotEl = document.querySelector(`[data-slot="${slotIdx}"]`);

    // Animate slot
    if (slotEl) {
      slotEl.classList.add('inv-slot-using');
      setTimeout(() => slotEl?.classList.remove('inv-slot-using'), 350);
    }

    // Use the card
    Cards.useFromGrid(slotIdx, forTask || null);

    // Close the popup after use
    const popup = btn?.closest('.card-popup');
    if (popup) {
      popup.style.animation = 'cardPopupOut .18s ease forwards';
      setTimeout(() => popup.remove(), 180);
    }
  },

  /* ── initAll EXTENDED ────────────────────────────────────── */

  initAll() {
    this.updateHeader();
    this.updateStats();
    this.updateDailyTasks();       // default tab = daily
    this.updateHomePreview();
    this.updateCards();
    this.updatePendingCardBanner();
    this.updateAchievements();
    this.updateWeekly();
    this.updateProfile();
    this.updateLevelRewards();
    this.updateStreakRewards();
    this.updateCosmetics();
    this.updateNotifications();
    this.updateSkillTree();
    this.updateDaily7();
    this.updateInventory();
    this.updateLootboxInventory();
    this.updateGridInventory('profile');
    this.updateShop();
  },
};
