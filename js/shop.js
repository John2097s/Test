'use strict';

/**
 * shop.js — Shop & Currency System (v14)
 * Tabs: Coins Shop | Gems Shop | Premium | Cosmetics
 */

/* ══════════════════════════════════════════════════════════════
   DEFINITIONS
   ══════════════════════════════════════════════════════════════ */

const SHOP_COIN_BOXES = [
  { id:'basic',    name:'Basic Box',    icon:'📦', desc:'2 Karten · Common & Rare',        cost:100, rarity:'common', poolDesc:'Common 70% · Rare 30%',              boxKey:'basic'   },
  { id:'advanced', name:'Advanced Box', icon:'🎁', desc:'3 Karten · Rare bis Legendary',   cost:300, rarity:'rare',   poolDesc:'Rare 60% · Epic 30% · Legendary 10%', boxKey:'advanced'},
  { id:'elite',    name:'Elite Box',    icon:'💠', desc:'3 Karten · Epic bis Mythic',       cost:700, rarity:'epic',   poolDesc:'Epic 40% · Legendary 49% · Mythic 1%',boxKey:'premium' },
];

const SHOP_GEM_PACKS = [
  { id:'gems_200',  label:'200 Gems',  gems:200,  badge:null,      price:'1,99 €' },
  { id:'gems_550',  label:'550 Gems',  gems:550,  badge:'BELIEBT', price:'4,99 €' },
  { id:'gems_1200', label:'1200 Gems', gems:1200, badge:'BEST',    price:'9,99 €' },
];

const SHOP_MYTHIC_BOX = {
  id:'mythic_gem', name:'Mythic Box', icon:'🌌',
  desc:'1 Karte · Nur Legendary & Mythic',
  costGems:500, rarity:'mythic',
  poolDesc:'Legendary 50% · Mythic 50%',
  boxKey:'mythic',
};

const SHOP_PREMIUM = {
  costGems: 300,
  label: 'NEXUS PREMIUM',
  duration: 'Monatlich',
  benefits: [
    { icon:'⚡', text:'+10% XP auf alle Quests'         },
    { icon:'🪙', text:'+10% Coins auf alle Belohnungen' },
    { icon:'🎁', text:'+1 Bonus Daily Reward täglich'   },
    { icon:'👑', text:'Premium-Badge im Profil'          },
  ],
};

/* ══════════════════════════════════════════════════════════════
   LOOTBOX POOLS (corrected & rebalanced)
   ══════════════════════════════════════════════════════════════ */

const BOX_POOLS = {
  basic:    [{ rarity:'common', weight:70 }, { rarity:'rare', weight:30 }],
  small:    [{ rarity:'common', weight:70 }, { rarity:'rare', weight:30 }],
  advanced: [{ rarity:'rare', weight:60 }, { rarity:'epic', weight:30 }, { rarity:'legendary', weight:10 }],
  big:      [{ rarity:'rare', weight:60 }, { rarity:'epic', weight:30 }, { rarity:'legendary', weight:10 }],
  premium:  [{ rarity:'epic', weight:40 }, { rarity:'legendary', weight:49 }, { rarity:'mythic', weight:1 }],
  epic:     [{ rarity:'epic', weight:40 }, { rarity:'legendary', weight:49 }, { rarity:'mythic', weight:1 }],
  mythic:   [{ rarity:'legendary', weight:50 }, { rarity:'mythic', weight:50 }],
  legendary:[{ rarity:'legendary', weight:50 }, { rarity:'mythic', weight:50 }],
};

const BOX_CARD_COUNT = {
  basic:2, small:2, advanced:3, big:3, premium:3, epic:3, mythic:1, legendary:1,
};

function rollRarity(pool) {
  const total = pool.reduce((s,e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e.weight; if (r <= 0) return e.rarity; }
  return pool[pool.length - 1].rarity;
}

function pickCardOfRarity(rarity) {
  const available = getUnlockedCardPool(state);
  const byRarity  = CARD_CATALOG.filter(c => c.rarity === rarity && available.includes(c.id));
  const pool      = byRarity.length ? byRarity : CARD_CATALOG.filter(c => available.includes(c.id));
  if (!pool.length) return CARD_CATALOG[0].id;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/* ══════════════════════════════════════════════════════════════
   SHOP MODULE
   ══════════════════════════════════════════════════════════════ */

const Shop = {

  _currentTab: 'coins',

  switchTab(tab) {
    this._currentTab = tab;
    document.querySelectorAll('.shop-tab-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.tab === tab)
    );
    document.querySelectorAll('.shop-tab-panel').forEach(p =>
      p.style.display = (p.dataset.tab === tab) ? '' : 'none'
    );
  },

  /* ── PURCHASES ────────────────────────────────────────────── */

  buyLootbox(id) {
    const def = SHOP_COIN_BOXES.find(b => b.id === id);
    if (!def) return;
    if (!state.currencies) state.currencies = { coins:0, gems:0, premium:false };
    if (state.currencies.coins < def.cost) {
      this._fb(`shop-fb-${id}`, '❌ Nicht genug Coins!', 'danger'); return;
    }
    state.currencies.coins -= def.cost;
    this._storeBox(def.boxKey);
    saveGame();
    Render.updateCurrencyDisplay();
    Render.updateLootboxInventory();
    this._refreshPanel('coins');
    this._fb(`shop-fb-${id}`, `✅ ${def.name} ins Inventar!`, 'success');
    addNotification(`🛒 ${def.icon} <strong>${def.name}</strong> gekauft!`);
    Render.toast(`${def.icon} ${def.name} gekauft!`, 'card');
  },

  buyMythicBox() {
    if (!state.currencies) state.currencies = { coins:0, gems:0, premium:false };
    if (state.currencies.gems < SHOP_MYTHIC_BOX.costGems) {
      this._fb('shop-fb-mythic', `❌ ${SHOP_MYTHIC_BOX.costGems - state.currencies.gems} Gems fehlen!`, 'danger'); return;
    }
    state.currencies.gems -= SHOP_MYTHIC_BOX.costGems;
    this._storeBox('mythic');
    saveGame();
    Render.updateCurrencyDisplay();
    Render.updateLootboxInventory();
    this._refreshPanel('gems');
    this._fb('shop-fb-mythic', '✅ Mythic Box ins Inventar!', 'success');
    addNotification('🌌 <strong>Mythic Box</strong> gekauft!');
    Render.toast('🌌 Mythic Box gekauft!', 'card');
  },

  buyGems(packId) {
    const pack = SHOP_GEM_PACKS.find(p => p.id === packId);
    if (!pack) return;
    if (!state.currencies) state.currencies = { coins:0, gems:0, premium:false };
    state.currencies.gems += pack.gems;
    saveGame();
    Render.updateCurrencyDisplay();
    this._refreshPanel('gems');
    this._fb(`shop-fb-${packId}`, `✅ +${pack.gems} Gems!`, 'success');
    addNotification(`💎 <strong>+${pack.gems} Gems</strong> hinzugefügt!`);
    Render.toast(`💎 +${pack.gems} Gems!`, 'xp');
  },

  buyPremium() {
    if (!state.currencies) state.currencies = { coins:0, gems:0, premium:false };
    if (state.currencies.premium) {
      this._fb('shop-fb-premium', '✅ Premium bereits aktiv!', 'success'); return;
    }
    if (state.currencies.gems < SHOP_PREMIUM.costGems) {
      this._fb('shop-fb-premium', `❌ ${SHOP_PREMIUM.costGems - state.currencies.gems} Gems fehlen!`, 'danger'); return;
    }
    state.currencies.gems   -= SHOP_PREMIUM.costGems;
    state.currencies.premium = true;
    saveGame();
    Render.updateCurrencyDisplay();
    this._refreshPanel('premium');
    addNotification('👑 <strong>NEXUS PREMIUM</strong> aktiviert!');
    Render.toast('👑 Premium aktiviert!', 'xp');
  },

  /* ── HELPERS ──────────────────────────────────────────────── */

  _storeBox(boxKey) {
    if (!state.storedLootboxes) state.storedLootboxes = [];
    const existing = state.storedLootboxes.find(b => b.type === boxKey);
    if (existing) existing.quantity++;
    else state.storedLootboxes.push({ type: boxKey, quantity: 1 });
  },

  _fb(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `shop-feedback shop-feedback--${type}`;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  },

  _refreshPanel(tab) {
    const el = document.getElementById(`shop-panel-${tab}`);
    if (!el) return;
    const map = {
      coins:     () => this._tplCoins(),
      gems:      () => this._tplGems(),
      premium:   () => this._tplPremium(),
      cosmetics: () => this._tplCosmetics(),
    };
    if (map[tab]) el.innerHTML = map[tab]();
  },

  /* ══════════════════════════════════════════════════════════
     RENDER — FULL SHOP
     ══════════════════════════════════════════════════════════ */

  renderShop() {
    return `
      <div class="shop-wrapper">
        <div class="shop-tabs">
          <button class="shop-tab-btn on" data-tab="coins"     onclick="Shop.switchTab('coins')">🪙 Coins</button>
          <button class="shop-tab-btn"    data-tab="gems"      onclick="Shop.switchTab('gems')">💎 Gems</button>
          <button class="shop-tab-btn"    data-tab="premium"   onclick="Shop.switchTab('premium')">👑 Premium</button>
          <button class="shop-tab-btn"    data-tab="cosmetics" onclick="Shop.switchTab('cosmetics')">🎨 Cosmetics</button>
        </div>
        <div class="shop-tab-panel" data-tab="coins"     id="shop-panel-coins">${this._tplCoins()}</div>
        <div class="shop-tab-panel" data-tab="gems"      id="shop-panel-gems"      style="display:none">${this._tplGems()}</div>
        <div class="shop-tab-panel" data-tab="premium"   id="shop-panel-premium"   style="display:none">${this._tplPremium()}</div>
        <div class="shop-tab-panel" data-tab="cosmetics" id="shop-panel-cosmetics" style="display:none">${this._tplCosmetics()}</div>
      </div>`;
  },

  /* ── COINS TAB ─────────────────────────────────────────────── */

  _tplCoins() {
    const coins = state.currencies?.coins || 0;
    const storedCount = (state.storedLootboxes || []).reduce((a,b) => a + b.quantity, 0);
    const RC = { common:'var(--common)', rare:'var(--rare)', epic:'var(--epic)' };

    const items = SHOP_COIN_BOXES.map(box => {
      const ok  = coins >= box.cost;
      const col = RC[box.rarity] || 'var(--cyan)';
      return `
        <div class="shop-item" style="--ia:${col}">
          <div class="shop-ia-bar"></div>
          <div class="shop-item-icon">${box.icon}</div>
          <div class="shop-item-body">
            <div class="shop-item-name">${box.name}</div>
            <div class="shop-item-desc">${box.desc}</div>
            <div class="shop-item-pool">${box.poolDesc}</div>
          </div>
          <div class="shop-item-aside">
            <div class="shop-price ${ok ? '' : 'shop-price--broke'}"><span>🪙</span>${box.cost.toLocaleString()}</div>
            <button class="shop-btn ${ok ? '' : 'shop-btn--off'}" onclick="Shop.buyLootbox('${box.id}')" ${ok ? '' : 'disabled'}>Kaufen</button>
            <div class="shop-feedback" id="shop-fb-${box.id}"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="shop-section-hd">🎰 Lootboxen kaufen</div>
      <p class="shop-hint">Mit Coins kaufen · landen im Inventar · öffne sie wann du willst</p>
      <div class="shop-list">${items}</div>
      ${storedCount > 0 ? `
        <div class="shop-inv-notice">
          📦 <strong>${storedCount}</strong> ungeöffnete Box${storedCount !== 1 ? 'en' : ''} im Inventar
          <button class="shop-inv-link" onclick="App.navTo('profile');setTimeout(()=>App.profileTab('inventory',document.querySelector('.ptab')),100)">Öffnen →</button>
        </div>` : ''}
      <div class="shop-earn-box">
        <div class="shop-earn-hd">🪙 So verdienst du Coins</div>
        <div class="shop-earn-row"><span>Quest abschließen</span><b>+10–40</b></div>
        <div class="shop-earn-row"><span>Daily Task</span><b>+50–100</b></div>
        <div class="shop-earn-row"><span>Weekly Challenge</span><b>+300–800</b></div>
        <div class="shop-earn-row"><span>Level Up</span><b>+100–200</b></div>
      </div>`;
  },

  /* ── GEMS TAB ──────────────────────────────────────────────── */

  _tplGems() {
    const gems = state.currencies?.gems || 0;
    const ok   = gems >= SHOP_MYTHIC_BOX.costGems;

    const mythicItem = `
      <div class="shop-item shop-item--mythic" style="--ia:var(--purple)">
        <div class="shop-ia-bar"></div>
        <div class="shop-item-icon">${SHOP_MYTHIC_BOX.icon}</div>
        <div class="shop-item-body">
          <div class="shop-item-name">${SHOP_MYTHIC_BOX.name} <span class="shop-badge shop-badge--mythic">EXKLUSIV</span></div>
          <div class="shop-item-desc">${SHOP_MYTHIC_BOX.desc}</div>
          <div class="shop-item-pool">${SHOP_MYTHIC_BOX.poolDesc}</div>
        </div>
        <div class="shop-item-aside">
          <div class="shop-price ${ok ? 'shop-price--gems' : 'shop-price--broke'}"><span>💎</span>${SHOP_MYTHIC_BOX.costGems}</div>
          <button class="shop-btn shop-btn--gem ${ok ? '' : 'shop-btn--off'}" onclick="Shop.buyMythicBox()" ${ok ? '' : 'disabled'}>Kaufen</button>
          <div class="shop-feedback" id="shop-fb-mythic"></div>
        </div>
      </div>`;

    const packItems = SHOP_GEM_PACKS.map(p => `
      <div class="shop-item" style="--ia:var(--cyan)">
        <div class="shop-ia-bar"></div>
        <div class="shop-item-icon">💎</div>
        <div class="shop-item-body">
          <div class="shop-item-name">${p.label} ${p.badge ? `<span class="shop-badge shop-badge--${p.badge.toLowerCase()}">${p.badge}</span>` : ''}</div>
          <div class="shop-item-desc">${p.gems.toLocaleString()} Gems sofort</div>
          <div class="shop-item-pool shop-item-pool--price">${p.price}</div>
        </div>
        <div class="shop-item-aside">
          <button class="shop-btn shop-btn--gem" onclick="Shop.buyGems('${p.id}')">+${p.gems} 💎</button>
          <div class="shop-feedback" id="shop-fb-${p.id}"></div>
        </div>
      </div>`).join('');

    return `
      <div class="shop-section-hd">🌌 Mythic Box</div>
      <p class="shop-hint">Nur mit Gems · 100% Legendary oder Mythic</p>
      <div class="shop-list">${mythicItem}</div>
      <div class="shop-section-hd" style="margin-top:22px">💎 Gems kaufen</div>
      <p class="shop-hint shop-hint--warn">⚠️ Testmodus — kein echtes Geld</p>
      <div class="shop-list">${packItems}</div>`;
  },

  /* ── PREMIUM TAB ───────────────────────────────────────────── */

  _tplPremium() {
    const cur     = state.currencies || { coins:0, gems:0, premium:false };
    const active  = cur.premium;
    const ok      = cur.gems >= SHOP_PREMIUM.costGems;

    return `
      <div class="shop-prem-card ${active ? 'shop-prem-card--on' : ''}">
        <div class="shop-prem-glow"></div>
        <div class="shop-prem-top">
          <span class="shop-prem-ico">👑</span>
          <div>
            <div class="shop-prem-name">NEXUS PREMIUM</div>
            <div class="shop-prem-sub">${SHOP_PREMIUM.duration} · ${SHOP_PREMIUM.costGems} 💎</div>
          </div>
          ${active ? '<div class="shop-prem-active-badge">✅ AKTIV</div>' : ''}
        </div>
        <div class="shop-prem-perks">
          ${SHOP_PREMIUM.benefits.map(b => `
            <div class="shop-prem-perk"><span>${b.icon}</span><span>${b.text}</span></div>`).join('')}
        </div>
        ${active
          ? `<div class="shop-prem-ok">🎉 Du genießt bereits alle Premium-Vorteile!</div>`
          : `<div class="shop-prem-buy">
               <div class="shop-price ${ok ? 'shop-price--gems' : 'shop-price--broke'}"><span>💎</span>${SHOP_PREMIUM.costGems}</div>
               <button class="shop-btn shop-btn--premium ${ok ? '' : 'shop-btn--off'}" onclick="Shop.buyPremium()" ${ok ? '' : 'disabled'}>
                 ${ok ? '👑 Aktivieren' : `❌ ${SHOP_PREMIUM.costGems - cur.gems} fehlen`}
               </button>
             </div>
             <div class="shop-feedback" id="shop-fb-premium"></div>
             ${!ok ? `<p class="shop-hint" style="margin-top:8px">→ Hol dir Gems im 💎 Gems-Tab</p>` : ''}`
        }
      </div>`;
  },

  /* ── COSMETICS TAB ─────────────────────────────────────────── */

  _tplCosmetics() {
    return `
      <div class="shop-coming">
        <div class="shop-coming-ico">🎨</div>
        <div class="shop-coming-title">Cosmetics</div>
        <div class="shop-coming-sub">Coming Soon</div>
        <p class="shop-coming-desc">Exklusive Designs für dein Profil — bald verfügbar.</p>
        <div class="shop-coming-chips">
          <span class="shop-coming-chip">🖼️ Hintergründe</span>
          <span class="shop-coming-chip">🎨 Themes</span>
          <span class="shop-coming-chip">✨ Karten-Effekte</span>
          <span class="shop-coming-chip">🏷️ Titel</span>
        </div>
      </div>`;
  },
};
