/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  engine.js — Spiellogik                                      ║
 * ║                                                              ║
 * ║  Enthält: XP vergeben, Level-Up, Streak-Tracking,           ║
 * ║  Karten-Effekte anwenden, XP-Popup animieren                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const Engine = {

  /**
   * XP vergeben + Level-Up prüfen.
   * Dies ist die Kernfunktion des Spiels.
   * 
   * @param {number} baseXP   - Basis-XP (ohne Karten-Modifikation)
   * @param {string} [origin] - Woher kommen die XP? (für Notifications)
   * @param {Event}  [evt]    - Click-Event für XP-Popup Position
   */
  giveXP(baseXP, origin = '', evt = null) {
    let finalXP = baseXP;

    // Premium XP bonus (+10%)
    if (state.currencies?.premium) {
      finalXP = Math.round(finalXP * 1.1);
    }

    // Timed boost (legacy Time Warp card compatibility)
    if ((state.timedBoostCharges || 0) > 0) {
      finalXP = Math.round(finalXP * (state.timedBoostMult || 1));
      state.timedBoostCharges--;
      if (state.timedBoostCharges === 0) { state.timedBoostMult = 1; }
      saveState();
    }

    state.xp      += finalXP;
    state.totalXP += finalXP;

    this._showXPPopup(finalXP, evt);

    let threshold = getXPForLevel(state.level);
    while (state.xp >= threshold) {
      state.xp -= threshold;
      state.level++;
      this._onLevelUp(state.level);
      threshold = getXPForLevel(state.level);
    }

    Render.updateHeader();
    Render.updateStats();
    saveState();
    Achievements.checkAll();
  },

  /**
   * Wird bei jedem Level-Up aufgerufen.
   * Zeigt Modal, vergibt Rewards, Notifications.
   * @param {number} newLevel
   */
  _onLevelUp(newLevel) {
    const cls = LEVEL_CLASSES.reduce((acc, c) => newLevel >= c.level ? c : acc, LEVEL_CLASSES[0]);

    // Coin reward on level up (100–200 coins, premium +10%)
    const baseCoins = 100 + Math.floor(Math.random() * 101);
    const coinReward = state.currencies?.premium ? Math.round(baseCoins * 1.1) : baseCoins;
    if (!state.currencies) state.currencies = { coins: 0, gems: 0, premium: false };
    state.currencies.coins += coinReward;

    // 30% chance for Basic Box on every level-up
    const getsBox = Math.random() < 0.30;
    let rewardText = getsBox ? '📦 Basic Box!' : `+${newLevel * 10} Bonus XP`;
    rewardText += ` · 🪙+${coinReward}`;

    // Milestone unlocks (cosmetics at certain levels)
    const milestones = { 10: 'theme-golden', 25: 'theme-dark-matter', 50: 'frame-gold' };
    if (milestones[newLevel]) {
      Cosmetics.unlock(milestones[newLevel]);
      rewardText += ` + Cosmetic!`;
    }

    document.getElementById('lu-lvl').textContent   = newLevel;
    document.getElementById('lu-class').textContent = cls.name;
    document.getElementById('lu-rew').textContent   = rewardText;
    document.getElementById('lu-ico').textContent   = '🎉';
    App.openForcedOv('ov-lu');

    if (getsBox) {
      Cards.queueLoot('basic');
    } else {
      // XP bonus instead
      const bonus = newLevel * 10;
      state.xp      += bonus;
      state.totalXP += bonus;
    }

    if (typeof Render !== 'undefined') Render.updateCurrencyDisplay();
    addNotification(`🎉 Level Up! <strong>Level ${newLevel} — ${cls.name}</strong> — ${rewardText}`);
    Render.toast(`Level Up! LV ${newLevel} — ${cls.name}`, 'xp');
  },

  /**
   * Streak täglich aktualisieren.
   * Wird bei App-Start aufgerufen.
   * 
   * Logik:
   *   - Gestern aktiv + heute zum ersten Mal → Streak +1
   *   - Heute schon aktiv → Streak bleibt
   *   - Schild aktiv → kein Verlust
   *   - Mehr als 1 Tag inaktiv + kein Schild → Streak 0
   */
  tickStreak() {
    // Nutzt lastCompletedDate (ISO 'YYYY-MM-DD') als primäre Quelle.
    // Fällt auf lastDate (toDateString) zurück falls Migration noch läuft.
    const lastISO = state.lastCompletedDate || null;
    if (!lastISO) return;  // Noch nie eine Quest abgeschlossen

    const today    = todayISO();
    const daysDiff = Math.round((new Date(today) - new Date(lastISO)) / 86400000);

    if (daysDiff <= 1) return;  // 0=heute, 1=gestern → alles OK

    // Mehr als 1 Tag ohne Aktivität
    if (state.shieldDays > 0) {
      state.shieldDays = Math.max(0, state.shieldDays - daysDiff);
      Render.toast('🛡️ Schild hat deinen Streak gerettet!', '');
      addNotification('🛡️ Dein Streak wurde durch einen Schild gerettet!');
    } else {
      const lost = state.streak;
      state.streak = 0;
      if (lost > 0) {
        Render.toast(`😢 Streak verloren! ${lost} Tage waren es.`, 'danger');
        addNotification(`😢 ${lost}-Tage Streak verloren — neue Chance heute!`);
      }
    }
    Render.updateHeader();
    saveState();
  },

  /**
   * Streak nach erfolgreicher Aktivität erhöhen.
   * Nur einmal pro Tag.
   * 
   * KORRIGIERTE LOGIK (nutzt lastCompletedDate in ISO-Format):
   *   - Gleicher Tag    → Streak bleibt (noop)
   *   - Gestern         → Streak +1 ✅
   *   - Mehr als 1 Tag  → Streak = 1 (Reset auf 1, nicht 0)
   *   - Erster Task     → Streak = 1
   */
  advanceStreak() {
    const today = todayISO();                          // 'YYYY-MM-DD'
    const last  = state.lastCompletedDate;             // null oder 'YYYY-MM-DD'

    // Erster Task ever oder schon heute gezählt
    if (last === today) return;

    if (!last) {
      // Allererster Task
      state.streak = 1;
      state.maxStreak = Math.max(1, state.maxStreak);
      state.lastCompletedDate = today;
      state.lastDate = todayStr();  // Rückwärtskompatibilität mit tickStreak
      Render.toast('🔥 Streak gestartet!', 'xp');
      this._checkStreakRewards();
      Render.updateHeader();
      return;
    }

    // Tagesdifferenz berechnen (ISO-Strings sind direkt subrahierbar via Date)
    const daysDiff = Math.round(
      (new Date(today) - new Date(last)) / 86400000
    );

    if (daysDiff === 1) {
      // 🟢 Gestern aktiv → Streak erhöhen
      state.streak++;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
      if (state.streak > 1) {
        Render.toast(`🔥 ${state.streak} Tage Streak!`, 'xp');
      }
      this._checkStreakRewards();
    } else {
      // 🔴 Mehr als 1 Tag Pause → Streak auf 1 zurücksetzen (nicht 0, da heute aktiv)
      const lost = state.streak;
      state.streak = 1;
      if (lost > 1) {
        Render.toast(`😢 Streak verloren! War ${lost} Tage. Neuer Start!`, 'danger');
        addNotification(`😢 ${lost}-Tage Streak verloren — Neustart bei 1!`);
      }
    }

    state.lastCompletedDate = today;
    state.lastDate = todayStr();  // Rückwärtskompatibilität
    Render.updateHeader();
  },

  /**
   * Streak-Meilenstein-Rewards verteilen.
   * Jeder Reward wird nur einmal vergeben.
   */
  _checkStreakRewards() {
    for (const sr of STREAK_REWARDS) {
      if (state.streak >= sr.streak && !state.claimedStreakRewards.includes(sr.streak)) {
        state.claimedStreakRewards.push(sr.streak);
        Cards.queueLoot(sr.reward);
        addNotification(`🔥 ${sr.streak}-Tage Streak! ${sr.text} erhalten!`);
        Render.toast(`🔥 Streak Reward: ${sr.text}`, 'xp');
      }
    }
  },

  /**
   * Effekt einer Karte auf eine Quest anwenden.
   * Gibt die modifizierten XP zurück.
   * 
   * @param {object} card    - Karten-Objekt aus CARD_CATALOG
   * @param {number} baseXP  - Basis-XP der Quest
   * @param {Event}  [evt]   - Event für Popup-Position
   * @returns {number} Finale XP nach Karten-Effekt
   */
  applyCardEffect(card, baseXP, evt) {
    state.cardsUsed++;
    this._removeCard(card.id);

    switch (card.type) {

      case 'xp_mult':
        // XP mit Faktor multiplizieren (z.B. ×2, ×3, ×10)
        Render.toast(`${card.icon} ${card.name}: ×${card.value} XP!`, 'card');
        return Math.round(baseXP * card.value);

      case 'xp_bonus':
        // Fester Bonus zusätzlich zur Quest-XP
        Render.toast(`${card.icon} ${card.name}: +${card.value} Bonus XP!`, 'card');
        return baseXP + card.value;

      case 'skip':
        // Wird anders behandelt (in app.js)
        Render.toast(`${card.icon} ${card.name}: Quest übersprungen!`, 'card');
        return card.value;  // Trost-XP (0 oder 10)

      case 'shield':
        // Schild aktivieren (verhindert nächsten Streak-Verlust)
        state.shieldDays = Math.max(state.shieldDays, card.value);
        Render.toast(`${card.icon} Schild aktiv für ${card.value} Tag(e)!`, 'card');
        return baseXP;

      case 'loot':
        // Lootbox zur Queue hinzufügen
        Cards.queueLoot(card.value);
        Render.toast(`${card.icon} ${card.name}: Lootbox erhalten!`, 'card');
        return baseXP;

      case 'gamble': {
        // Glücksspiel-Mechanik
        const v = card.value;
        const won = Math.random() < (v.chance || 0.5);

        if (won) {
          state.wonGamble++;
          if (v.max_mult !== undefined) {
            // Jackpot: zufälliger Multiplikator
            const mult = v.min_mult + Math.floor(Math.random() * (v.max_mult - v.min_mult + 1));
            Render.toast(`🎰 JACKPOT! ×${mult} XP!`, 'card');
            return Math.round(baseXP * mult);
          }
          // Normale Gewinn-Multiplikation
          Render.toast(`${card.icon} Gewonnen! ×${v.win_mult} XP!`, 'card');
          return Math.round(baseXP * v.win_mult);
        } else {
          // Verloren
          if (v.lose_streak) {
            state.streak = Math.max(0, state.streak - v.lose_streak);
            Render.toast(`${card.icon} Verloren! -${v.lose_streak} Streak Tage!`, 'danger');
            Render.updateHeader();
          }
          const trost = v.lose_bonus || 0;
          Render.toast(`${card.icon} Verloren! ${trost > 0 ? `+${trost} Trost-XP` : 'Kein Bonus'}`, 'danger');
          return baseXP + trost;
        }
      }

      default:
        return baseXP;
    }
  },

  /**
   * Karte aus dem Inventar entfernen (nach Verwendung).
   * @param {string} cardId
   */
  _removeCard(cardId) {
    if (state.cards[cardId] > 1) {
      state.cards[cardId]--;
    } else {
      delete state.cards[cardId];
    }
  },

  /**
   * Floating XP-Popup am Click-Punkt anzeigen.
   * @param {number} xp   - Gewonnene XP
   * @param {Event}  [evt] - Click-Event für Position
   */
  _showXPPopup(xp, evt) {
    const el = document.createElement('div');
    el.className = 'xp-popup';
    el.textContent = `+${xp} XP`;

    const x = evt?.clientX ?? window.innerWidth / 2;
    const y = evt?.clientY ?? window.innerHeight / 2;
    el.style.left = `${x - 30}px`;
    el.style.top  = `${y - 10}px`;

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  },

  /**
   * Fortschritt einer Weekly Challenge um 1 Schritt erhöhen.
   * Vergibt XP pro Schritt. Bei Abschluss: Loot + Notification.
   * @param {string} challengeId
   */
  advanceWeeklyChallenge(challengeId) {
    const challenge = WEEKLY_CHALLENGES.find(c => c.id === challengeId);
    if (!challenge) return;

    const week = this._currentWeekKey();
    if (!state.weeklyProgress[challengeId]) {
      state.weeklyProgress[challengeId] = { steps: 0, completed: false, weekStart: week };
    }
    const prog = state.weeklyProgress[challengeId];

    // Neue Woche → Reset
    if (prog.weekStart !== week) {
      prog.steps     = 0;
      prog.completed = false;
      prog.weekStart = week;
    }

    if (prog.completed) {
      Render.toast('Challenge bereits diese Woche abgeschlossen!', '');
      return;
    }

    prog.steps++;
    this.giveXP(challenge.xp, 'weekly');

    if (prog.steps >= challenge.steps) {
      prog.completed = true;
      state.weeklyCompletedChallenges = (state.weeklyCompletedChallenges || 0) + 1;

      // Loot reward
      let lootType = challenge.loot || 'advanced';
      Cards.queueLoot(lootType);

      // Weekly coin reward: 300–800 coins, +10% if premium
      let weeklyCoins = 300 + Math.floor(Math.random() * 501);
      if (state.currencies?.premium) weeklyCoins = Math.round(weeklyCoins * 1.1);
      if (!state.currencies) state.currencies = { coins: 0, gems: 0, premium: false };
      state.currencies.coins += weeklyCoins;
      if (typeof Render !== 'undefined') Render.updateCurrencyDisplay();

      Render.toast(`🏆 Challenge "${challenge.name}" abgeschlossen! ${LOOTBOX_DEFS[lootType]?.icon} Lootbox! 🪙+${weeklyCoins}`, 'ach');
      addNotification(`🏆 Weekly Challenge abgeschlossen: <strong>${challenge.name}</strong> · 🪙+${weeklyCoins}`);
      Achievements.checkAll();
    }

    saveState();
    Render.updateWeekly();
  },

  /** Returns current ISO week key like '2026-W12' */
  _currentWeekKey() {
    const d   = new Date();
    const jan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan) / 86400000 + jan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  },
};
