/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  achievements.js — Achievement System                        ║
 * ║                                                              ║
 * ║  Enthält: Alle Achievements prüfen, freischalten,            ║
 * ║  Modal anzeigen, Achievement-Tab Badge aktualisieren         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const Achievements = {

  /**
   * Alle Achievements prüfen und ggf. freischalten.
   * Wird nach jeder spielentscheidenden Aktion aufgerufen.
   */
  checkAll() {
    for (const ach of ACHIEVEMENTS) {
      // Schon freigeschaltet? Überspringen.
      if (state.achievements.includes(ach.id)) continue;

      // Bedingung prüfen
      let met = false;
      try {
        met = ach.check(state);
      } catch(e) {
        // check-Funktion könnte undefined-Zugriffe haben → sicher abfangen
        met = false;
      }

      if (met) this._unlock(ach);
    }

    // Tab-Badge aktualisieren
    this._updateBadge();
  },

  /**
   * Achievement freischalten.
   * @param {object} ach - Achievement-Objekt aus ACHIEVEMENTS
   */
  _unlock(ach) {
    state.achievements.push(ach.id);

    // Reward / grant
    if (ach.grant) {
      try { ach.grant(state); } catch(e) { console.warn('Achievement grant error:', e); }
    }

    // Show modal
    this._showModal(ach);

    // Notification
    const unlockNote = ach.unlocks ? ` 🔓 ${getCard(ach.unlocks)?.name || ach.unlocks} freigeschaltet!` : '';
    addNotification(`🏅 <strong>${ach.name}</strong> — ${ach.reward}${unlockNote}`);
    Render.toast(`🏅 ${ach.name} freigeschaltet!${unlockNote}`, 'ach');

    // Animate achievement card on the achievements screen
    const card = document.querySelector(`[data-ach="${ach.id}"]`);
    if (card) {
      card.classList.add('unlocked', 'just-unlocked');
      setTimeout(() => card.classList.remove('just-unlocked'), 800);
    }

    saveState();
    Render.updateProfile();
    // Refresh achievements screen if open
    Render.updateAchievements();
  },

  /**
   * Achievement-Modal anzeigen.
   * Eine Warteschlange wird nicht benötigt — Modals überschreiben sich.
   * @param {object} ach
   */
  _showModal(ach) {
    document.getElementById('am-ico').textContent  = ach.icon;
    document.getElementById('am-name').textContent = ach.name;
    document.getElementById('am-desc').textContent = ach.desc;
    document.getElementById('am-rew').textContent  = ach.reward;
    App.openForcedOv('ov-ach');
  },

  /**
   * Badge auf dem Achievement-Tab aktualisieren.
   * Zeigt Anzahl neu freigeschalteter Achievements.
   */
  _updateBadge() {
    const badge = document.getElementById('ach-badge');
    if (!badge) return;
    const newCount = state.achievements.length;
    // Als "neu" gilt: mehr als beim letzten bekannten Stand
    // (vereinfacht: immer versteckt, da kein "gesehen" Tracking)
    badge.style.display = 'none';
  },

  /**
   * Fortschritt eines Achievements in Prozent (0–100).
   * Für Achievements ohne Fortschrittsbalken gibt es null zurück.
   * @param {object} ach
   * @returns {number|null}
   */
  getProgress(ach) {
    if (ach.id.startsWith('streak_')) {
      const target = parseInt(ach.id.split('_')[1]);
      return Math.min(100, Math.round((state.streak / target) * 100));
    }
    if (ach.id.startsWith('task_')) {
      const target = parseInt(ach.id.split('_')[1]);
      return Math.min(100, Math.round((state.done / target) * 100));
    }
    if (ach.id.startsWith('boxes_')) {
      const target = parseInt(ach.id.split('_')[1]);
      return Math.min(100, Math.round(((state.totalBoxesOpened||0) / target) * 100));
    }
    if (ach.id.startsWith('cards_')) {
      const target = parseInt(ach.id.split('_')[1]);
      return Math.min(100, Math.round(((state.cardsUsed||0) / target) * 100));
    }
    if (ach.id.startsWith('level_')) {
      const target = parseInt(ach.id.split('_')[1]);
      return Math.min(100, Math.round((state.level / target) * 100));
    }
    if (ach.id.startsWith('xp_')) {
      const raw = ach.id.replace('xp_','');
      const target = raw.endsWith('k') ? parseInt(raw)*1000 : parseInt(raw);
      return Math.min(100, Math.round((state.totalXP / target) * 100));
    }
    return null;
  },

  /** true wenn Achievement mit dieser ID freigeschaltet */
  isUnlocked(id) {
    return state.achievements.includes(id);
  },
};
