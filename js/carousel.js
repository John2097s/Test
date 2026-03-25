'use strict';

/**
 * CardCarousel — horizontal swipeable card-selection overlay.
 * Replaces the old grid-in-overlay for card usage.
 *
 * Flow:
 *   App.openCardCarousel(forTaskId?) → builds slots → opens overlay
 *   User swipes / arrows to select → info panel updates
 *   User taps "Karte einsetzen" → animate → Cards.useFromGrid(slotIdx) → close
 */
const CardCarousel = {

  _forTaskId:    null,   // task we're assigning a card to (or null = pending)
  _slots:        [],     // [{slotIdx, card}]  — only filled grid slots
  _activeIndex:  0,      // which carousel item is centred
  _startX:       0,
  _dragging:     false,
  _lastUsedId:   null,   // card id of last used card (for auto-focus)

  /* ── OPEN ──────────────────────────────────────────────────── */
  open(forTaskId = null) {
    this._forTaskId = forTaskId;

    // Build slot list from grid (filled only)
    this._slots = Cards.getGridSlots()
      .filter(s => !s.isEmpty)
      .map(s => ({ slotIdx: s.slotIdx, card: s.card, quantity: s.quantity }));

    if (!this._slots.length) {
      Render.toast('Keine Karten im Inventar!', 'danger');
      return;
    }

    // Auto-focus last-used card or first
    let startIdx = 0;
    if (this._lastUsedId) {
      const found = this._slots.findIndex(s => s.card.id === this._lastUsedId);
      if (found >= 0) startIdx = found;
    }
    this._activeIndex = startIdx;

    // Build carousel DOM
    this._buildTrack();
    this._updateInfo();
    this._updateArrows();

    // Update title with task context
    const titleEl = document.getElementById('cco-title');
    if (titleEl) {
      if (forTaskId) {
        const task = state.tasks.find(t => t.id === forTaskId);
        titleEl.textContent = task ? `🃏 Karte für: ${task.name.slice(0,22)}` : '// KARTE WÄHLEN';
      } else {
        titleEl.textContent = '// KARTE WÄHLEN';
      }
    }

    // Show/hide empty hint
    const hint = document.getElementById('cco-empty-hint');
    const btn  = document.getElementById('cco-use-btn');
    if (hint) hint.style.display = 'none';
    if (btn)  btn.style.display  = '';

    // Slide up
    const sheet = document.getElementById('cco-sheet');
    const ov    = document.getElementById('card-carousel-overlay');
    if (!ov || !sheet) return;
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Bind swipe handlers
    this._bindSwipe();

    // Scroll to active card after render
    requestAnimationFrame(() => this._scrollToActive(false));
  },

  /* ── CLOSE ─────────────────────────────────────────────────── */
  close() {
    const sheet = document.getElementById('cco-sheet');
    const ov    = document.getElementById('card-carousel-overlay');
    if (!ov) return;
    if (sheet) sheet.classList.remove('open');
    setTimeout(() => {
      ov.classList.remove('open');
      document.body.style.overflow = '';
    }, 320);
    this._unbindSwipe();
  },

  /* ── BUILD TRACK ────────────────────────────────────────────── */
  _buildTrack() {
    const track = document.getElementById('cco-track');
    if (!track) return;

    track.innerHTML = this._slots.map((s, i) => {
      const rColor = this._rarityColor(s.card.rarity);
      return `<div class="cco-card" data-idx="${i}" onclick="CardCarousel._onCardClick(${i})"
          style="--rarity-color:${rColor}">
        <div class="cco-card-inner cco-rarity-${s.card.rarity}">
          <div class="cco-card-ico">${s.card.icon}</div>
          <div class="cco-card-name">${Render._esc ? Render._esc(s.card.name) : s.card.name}</div>
        </div>
      </div>`;
    }).join('');
  },

  _rarityColor(r) {
    return {
      common:    'rgba(140,155,165,.9)',
      rare:      'rgba(41,121,255,.95)',
      epic:      'rgba(213,0,249,.95)',
      legendary: 'rgba(255,179,0,1)',
      mythic:    'rgba(255,60,60,1)',
    }[r] || '#fff';
  },

  /* ── SCROLL / POSITION ──────────────────────────────────────── */
  _scrollToActive(animate = true) {
    const track = document.getElementById('cco-track');
    if (!track) return;

    const cards = track.querySelectorAll('.cco-card');
    cards.forEach((c, i) => {
      const diff = i - this._activeIndex;
      const scale = diff === 0 ? 1.08 : Math.max(0.78, 1 - Math.abs(diff) * 0.1);
      const opacity = diff === 0 ? 1 : Math.max(0.35, 1 - Math.abs(diff) * 0.28);
      c.style.transition = animate ? 'transform .28s cubic-bezier(.34,1.2,.64,1), opacity .22s ease' : 'none';
      c.style.transform  = `scale(${scale})`;
      c.style.opacity    = opacity;
      c.classList.toggle('cco-card-active', diff === 0);
    });

    // Scroll active card into center
    const activeCard = cards[this._activeIndex];
    if (activeCard) {
      const trackRect = track.getBoundingClientRect();
      const cardRect  = activeCard.getBoundingClientRect();
      const offset    = cardRect.left - trackRect.left - (trackRect.width / 2 - cardRect.width / 2);
      track.scrollBy({ left: offset, behavior: animate ? 'smooth' : 'instant' });
    }
  },

  /* ── NAVIGATION ─────────────────────────────────────────────── */
  shift(dir) {
    const next = this._activeIndex + dir;
    if (next < 0 || next >= this._slots.length) return;
    this._activeIndex = next;
    this._scrollToActive(true);
    this._updateInfo();
    this._updateArrows();
  },

  _onCardClick(idx) {
    if (idx === this._activeIndex) return; // already active
    this._activeIndex = idx;
    this._scrollToActive(true);
    this._updateInfo();
    this._updateArrows();
  },

  _updateArrows() {
    const l = document.getElementById('cco-arrow-l');
    const r = document.getElementById('cco-arrow-r');
    if (l) l.style.opacity = this._activeIndex > 0 ? '1' : '0.2';
    if (r) r.style.opacity = this._activeIndex < this._slots.length - 1 ? '1' : '0.2';
  },

  /* ── INFO PANEL ─────────────────────────────────────────────── */
  _updateInfo() {
    const s = this._slots[this._activeIndex];
    if (!s) return;
    const c = s.card;
    const rColor = this._rarityColor(c.rarity);
    const rarityLabel = { common:'Common', rare:'Rare', epic:'Epic', legendary:'Legendary', mythic:'Mythic' }[c.rarity] || c.rarity;

    const setEl = (id, val, style = '') => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; if (style) el.setAttribute('style', style); }
    };

    setEl('cco-info-name',   c.name, `color:${rColor}`);
    setEl('cco-info-rar',    rarityLabel, `color:${rColor};border-color:${rColor}`);
    setEl('cco-info-desc',   c.desc);
    setEl('cco-info-effect', c.effect);
  },

  /* ── USE SELECTED ───────────────────────────────────────────── */
  useSelected() {
    const s = this._slots[this._activeIndex];
    if (!s) return;

    const useBtn = document.getElementById('cco-use-btn');
    if (useBtn) { useBtn.disabled = true; useBtn.textContent = '⌛ …'; }

    // Animate the active card
    const track = document.getElementById('cco-track');
    const activeCardEl = track?.querySelector('.cco-card-active');
    if (activeCardEl) {
      activeCardEl.style.transition = 'transform .28s ease, opacity .28s ease, filter .28s ease';
      activeCardEl.style.transform  = 'scale(1.22)';
      activeCardEl.style.filter     = 'brightness(2) saturate(2)';
    }

    // Delay → apply effect → close
    setTimeout(() => {
      if (activeCardEl) {
        activeCardEl.style.transform = 'scale(0) rotate(15deg)';
        activeCardEl.style.opacity   = '0';
      }
      setTimeout(() => {
        // Record last used
        this._lastUsedId = s.card.id;
        state.lastUsedSlot = s.slotIdx;

        // Apply card via existing system
        Cards.useFromGrid(s.slotIdx, this._forTaskId || null);

        // Re-enable button and close
        if (useBtn) { useBtn.disabled = false; useBtn.textContent = '▶ Karte einsetzen'; }
        this.close();
      }, 150);
    }, 320);
  },

  /* ── SWIPE / DRAG ───────────────────────────────────────────── */
  _bindSwipe() {
    const track = document.getElementById('cco-track');
    if (!track) return;
    this._onTouchStart = (e) => {
      this._startX  = e.touches ? e.touches[0].clientX : e.clientX;
      this._dragging = true;
      this._dragStartIdx = this._activeIndex;
    };
    this._onTouchMove = (e) => {
      if (!this._dragging) return;
      const dx = (e.touches ? e.touches[0].clientX : e.clientX) - this._startX;
      if (Math.abs(dx) > 8 && e.cancelable) e.preventDefault();
    };
    this._onTouchEnd = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      const dx = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) - this._startX;
      if (Math.abs(dx) > 42) this.shift(dx < 0 ? 1 : -1);
    };
    track.addEventListener('touchstart',  this._onTouchStart, { passive: true });
    track.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
    track.addEventListener('touchend',    this._onTouchEnd,   { passive: true });
    track.addEventListener('mousedown',   this._onTouchStart);
    window.addEventListener('mouseup',    this._onTouchEnd);
  },

  _unbindSwipe() {
    const track = document.getElementById('cco-track');
    if (!track) return;
    track.removeEventListener('touchstart', this._onTouchStart);
    track.removeEventListener('touchmove',  this._onTouchMove);
    track.removeEventListener('touchend',   this._onTouchEnd);
    track.removeEventListener('mousedown',  this._onTouchStart);
    window.removeEventListener('mouseup',   this._onTouchEnd);
  },
};
