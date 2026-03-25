/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  cosmetics.js — Cosmetic & Theme System                      ║
 * ║                                                              ║
 * ║  Enthält: Cosmetics freischalten, ausrüsten,                 ║
 * ║  CSS-Klassen auf Body anwenden                               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const Cosmetics = {

  /**
   * Cosmetic freischalten.
   * @param {string} id - Cosmetic-ID aus COSMETICS
   */
  unlock(id) {
    if (state.unlockedCosmetics.includes(id)) return;

    state.unlockedCosmetics.push(id);
    saveState();

    const cosm = COSMETICS.find(c => c.id === id);
    if (cosm) {
      addNotification(`✨ Cosmetic freigeschaltet: <strong>${cosm.name}</strong>`);
      Render.toast(`✨ ${cosm.name} freigeschaltet!`, '');
      Render.updateCosmetics();
    }
  },

  /**
   * Cosmetic ausrüsten.
   * Setzt die entsprechende CSS-Klasse auf Body.
   * @param {string} id
   */
  equip(id) {
    const cosm = COSMETICS.find(c => c.id === id);
    if (!cosm) return;
    if (!state.unlockedCosmetics.includes(id)) return;
    const slot = cosm.type;
    const oldId = state.equipped[slot];
    if (oldId) {
      const old = COSMETICS.find(c => c.id === oldId);
      if (old?.cssClass) document.body.classList.remove(old.cssClass);
    }
    state.equipped[slot] = id;
    if (cosm.cssClass) document.body.classList.add(cosm.cssClass);
    saveState();
    Render.updateCosmetics();
    Render.updateProfile();
    Render.toast(`✅ ${cosm.name} ausgerüstet!`, '');
  },

  equipBg(id) {
    const cosm = COSMETICS.find(c => c.id === id);
    if (!cosm || !state.unlockedCosmetics.includes(id)) return;
    const old = COSMETICS.find(c => c.id === (state.equippedBg || 'bg-default'));
    if (old?.cssClass) document.body.classList.remove(old.cssClass);
    state.equippedBg = id;
    if (cosm.cssClass) document.body.classList.add(cosm.cssClass);
    saveState();
    Render.toast(`✅ ${cosm.name} ausgerüstet!`, '');
  },

  equipEffect(id) {
    const cosm = COSMETICS.find(c => c.id === id);
    if (!cosm || !state.unlockedCosmetics.includes(id)) return;
    const old = COSMETICS.find(c => c.id === (state.equippedEffect || 'effect-none'));
    if (old?.cssClass) document.body.classList.remove(old.cssClass);
    state.equippedEffect = id;
    if (cosm.cssClass) document.body.classList.add(cosm.cssClass);
    saveState();
    Render.toast(`✅ ${cosm.name} ausgerüstet!`, '');
  },

  applyAll() {
    const all = [
      ...Object.entries(state.equipped).map(([,id]) => id),
      state.equippedBg     || 'bg-default',
      state.equippedEffect || 'effect-none',
    ];
    all.forEach(id => {
      const cosm = COSMETICS.find(c => c.id === id);
      if (cosm?.cssClass) document.body.classList.add(cosm.cssClass);
    });
  },

  getTitle() {
    const id = state.equipped.title;
    const cosm = COSMETICS.find(c => c.id === id);
    return cosm ? cosm.name : 'Bereit für Großes';
  },

  isEquipped(id) {
    return Object.values(state.equipped).includes(id)
      || state.equippedBg === id
      || state.equippedEffect === id;
  },

  /** true wenn Cosmetic mit ID freigeschaltet */
  isUnlocked(id) {
    return state.unlockedCosmetics.includes(id);
  },
};
