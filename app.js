let tableId = null;
let token = null;

let menuData = { categories: [], items: [] };
let activeCategoryId = null;

const cart = new Map(); // item_id -> { item, qty }
let historyPoll = null;

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2600);
}

function money(n) {
  return `${Number(n).toFixed(2)} €`;
}

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

async function api(endpoint, options = {}) {
  const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setTableInfo(id) {
  $('#currentTable').textContent = id;
  $('#pinGateTable').textContent = id;
  $('#tableInfo').classList.remove('hidden');
}

function showMenu() { $('#menuSection').classList.remove('hidden'); }
function openPinGate() { $('#pinGate').classList.remove('hidden'); }
function closePinGate() { $('#pinGate').classList.add('hidden'); }

function openCart() { $('#cartModal').classList.remove('hidden'); }
function closeCart() { $('#cartModal').classList.add('hidden'); }

function openOrderStatus() { $('#orderStatusModal').classList.remove('hidden'); }
function closeOrderStatus() { $('#orderStatusModal').classList.add('hidden'); }

function openHistory() { $('#historyModal').classList.remove('hidden'); }
function closeHistory() { $('#historyModal').classList.add('hidden'); }

function getTags(item) {
  try {
    if (!item.tags) return [];
    if (Array.isArray(item.tags)) return item.tags;
    return JSON.parse(item.tags);
  } catch {
    return [];
  }
}

function normalizeTag(t) {
  if (typeof t === 'string') return { text: t, color: '#3f6b3c' };
  if (t && typeof t === 'object') return { text: t.text || 'Tag', color: t.color || '#3f6b3c' };
  return { text: 'Tag', color: '#3f6b3c' };
}

function cartCountAndTotal() {
  let count = 0;
  let total = 0;
  for (const { item, qty } of cart.values()) {
    count += qty;
    total += qty * Number(item.price_eur);
  }
  return { count, total };
}

function renderCartBar() {
  const { count, total } = cartCountAndTotal();
  $('#cartCount').textContent = `${count} articol${count === 1 ? 'o' : 'i'}`;
  $('#cartTotal').textContent = money(total);
  $('#cartBar').classList.toggle('hidden', count === 0);
}

function renderCartModal() {
  const cont = $('#cartItems');
  cont.innerHTML = '';

  const entries = Array.from(cart.values());
  if (entries.length === 0) {
    cont.innerHTML = `<div class="hint">Il carrello è vuoto.</div>`;
    $('#cartModalTotal').textContent = money(0);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <div class="cart-item-name">${entry.item.name}</div>
        <div class="cart-item-price">${money(entry.item.price_eur)} · x${entry.qty}</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" data-act="dec">−</button>
        <div class="qty-display">${entry.qty}</div>
        <button class="qty-btn" data-act="inc">+</button>
      </div>
    `;
    row.querySelector('[data-act="dec"]').onclick = () => setQty(entry.item.id, entry.qty - 1);
    row.querySelector('[data-act="inc"]').onclick = () => setQty(entry.item.id, entry.qty + 1);
    cont.appendChild(row);
  }

  const { total } = cartCountAndTotal();
  $('#cartModalTotal').textContent = money(total);
}

function setQty(itemId, qty) {
  const existing = cart.get(itemId);
  if (!existing) return;
  if (qty <= 0) cart.delete(itemId);
  else cart.set(itemId, { ...existing, qty });
  renderAll();
}

function addOne(item) {
  const ex = cart.get(item.id);
  cart.set(item.id, { item, qty: (ex ? ex.qty : 0) + 1 });
  renderAll();
}

function removeOne(item) {
  const ex = cart.get(item.id);
  if (!ex) return;
  setQty(item.id, ex.qty - 1);
}

function getQty(itemId) {
  return cart.get(itemId)?.qty || 0;
}

function renderCategories() {
  const nav = $('#categoryNav');
  nav.innerHTML = '';
  const cats = menuData.categories || [];

  // "Tutte" opzionale: se vuoi, la riattivo
  // const allBtn = document.createElement('button');
  // allBtn.className = 'category-btn' + (!activeCategoryId ? ' active' : '');
  // allBtn.textContent = 'Tutte';
  // allBtn.onclick = () => { activeCategoryId = null; renderMenu(); renderCategories(); };
  // nav.appendChild(allBtn);

  for (const c of cats) {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (c.id === activeCategoryId ? ' active' : '');
    btn.textContent = c.name;
    btn.onclick = () => {
      activeCategoryId = c.id;
      renderMenu();
      renderCategories();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    nav.appendChild(btn);
  }
}

function renderMenu() {
  const container = $('#menuItems');
  container.innerHTML = '';

  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const cats = menuData.categories || [];
  const items = menuData.items || [];

  const filteredCats = activeCategoryId ? cats.filter(c => c.id === activeCategoryId) : cats;

  for (const cat of filteredCats) {
    const catWrap = document.createElement('div');
    catWrap.className = 'menu-category';
    catWrap.innerHTML = `<h2>${cat.name}</h2>`;

    const catItems = items.filter(i => i.category_id === cat.id && i.visible);
    const searched = q
      ? catItems.filter(i =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q)
        )
      : catItems;

    if (searched.length === 0) continue;

    for (const item of searched) {
      const qty = getQty(item.id);
      const tags = getTags(item).map(normalizeTag);

      const el = document.createElement('div');
      el.className = 'menu-item';

      const tagsHtml = tags.length
        ? `<div class="menu-item-tags">${tags
            .map(t => `<span class="tag" style="background:${t.color}">${t.text}</span>`)
            .join('')}</div>`
        : '';

      el.innerHTML = `
        <div class="menu-item-header">
          <div class="menu-item-name">${item.name}</div>
          <div class="menu-item-price">${money(item.price_eur)}</div>
        </div>
        ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
        ${tagsHtml}
        <div class="menu-item-footer">
          <div class="qty-control">
            <button class="qty-btn" data-act="dec">−</button>
            <div class="qty-display">${qty}</div>
            <button class="qty-btn" data-act="inc">+</button>
          </div>
        </div>
      `;

      el.querySelector('[data-act="inc"]').onclick = () => addOne(item);
      el.querySelector('[data-act="dec"]').onclick = () => removeOne(item);

      catWrap.appendChild(el);
    }

    container.appendChild(catWrap);
  }
}

function renderAll() {
  renderMenu();
  renderCartBar();
  renderCartModal();
}

// === STORICO ORDINI ===

function stateLabel(state) {
  if (state === 'richiesta') return 'Ricevuto';
  if (state === 'servito') return 'Servito';
  if (state === 'annullato') return 'Annullato';
  return state;
}

function stateBadgeColor(state) {
  if (state === 'servito') return '#3f6b3c';
  if (state === 'annullato') return '#b83a3a';
  return '#c89b5f'; // richiesta
}

async function loadHistory() {
  if (!token) return;

  const { orders } = await api(`/orders/mine?token=${encodeURIComponent(token)}`);

  const cont = $('#historyList');
  cont.innerHTML = '';

  if (!orders || orders.length === 0) {
    cont.innerHTML = `<div class="hint">Nessun ordine ancora inviato in questa sessione.</div>`;
    return;
  }

  for (const o of orders) {
    const wrap = document.createElement('div');
    wrap.className = 'cart-item';
    const when = new Date(o.created_at).toLocaleString('it-IT');

    const total = (o.items || []).reduce((sum, it) => sum + Number(it.unit_price_eur) * Number(it.quantity), 0);

    const itemsHtml = (o.items || [])
      .map(it => `<div class="cart-item-price">• ${it.item_name} x${it.quantity}</div>`)
      .join('');

    wrap.innerHTML = `
      <div style="flex:1">
        <div class="cart-item-name">Ordine · <span style="font-weight:900;color:${stateBadgeColor(o.state)}">${stateLabel(o.state)}</span></div>
        <div class="cart-item-price">${when}</div>
        <div style="margin-top:8px">${itemsHtml}</div>
        <div class="cart-item-price" style="margin-top:10px;font-weight:900">Totale: ${money(total)}</div>
      </div>
    `;

    cont.appendChild(wrap);
  }
}

function startHistoryPolling() {
  stopHistoryPolling();
  historyPoll = setInterval(() => {
    loadHistory().catch(() => {});
  }, 5000);
}

function stopHistoryPolling() {
  if (historyPoll) clearInterval(historyPoll);
  historyPoll = null;
}

// === PIN ===

async function doVerifyPin() {
  const pin = ($('#pinInput').value || '').trim();
  if (!/^\d{4}$/.test(pin)) {
    toast('Inserisci un PIN valido (4 cifre)');
    return;
  }

  try {
    const data = await api('/session/verify', {
      method: 'POST',
      body: JSON.stringify({ table_id: Number(tableId), pin })
    });

    token = data.token;

    sessionStorage.setItem('qr_token', token);
    sessionStorage.setItem('qr_table', String(tableId));

    closePinGate();
    showMenu();

    await loadMenu();
    await loadHistory(); // ✅ carica subito storico

    startHistoryPolling();

    toast('Accesso effettuato');
  } catch {
    toast('PIN errato o sessione chiusa');
  }
}

async function loadMenu() {
  menuData = await api('/menu');
  activeCategoryId = menuData.categories?.[0]?.id || null;
  renderCategories();
  renderAll();
}

async function submitOrder() {
  const entries = Array.from(cart.values());
  if (!token) {
    toast('Sessione non valida: reinserisci il PIN');
    openPinGate();
    return;
  }
  if (entries.length === 0) {
    toast('Il carrello è vuoto');
    return;
  }

  const items = entries.map(({ item, qty }) => ({
    item_id: item.id,
    name: item.name,
    quantity: qty,
    price_eur: Number(item.price_eur),
  }));

  try {
    await api('/orders', {
      method: 'POST',
      body: JSON.stringify({ token, items })
    });

    cart.clear();
    renderAll();
    closeCart();

    $('#orderStatusText').textContent = 'Grazie! Lo staff ha ricevuto la richiesta.';
    openOrderStatus();

    // ✅ aggiorna storico subito
    await loadHistory();
  } catch (e) {
    toast('Errore invio ordine: ' + e.message);
  }
}

function boot() {
  tableId = qsParam('table');
  if (!tableId) {
    toast('Manca il parametro ?table=');
    openPinGate();
    return;
  }

  setTableInfo(tableId);

  const savedToken = sessionStorage.getItem('qr_token');
  const savedTable = sessionStorage.getItem('qr_table');

  if (savedToken && savedTable === String(tableId)) {
    token = savedToken;
    closePinGate();
    showMenu();
    loadMenu()
      .then(loadHistory)
      .then(startHistoryPolling)
      .catch(() => openPinGate());
  } else {
    openPinGate();
  }

  $('#pinSubmit').onclick = doVerifyPin;
  $('#pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerifyPin(); });

  $('#viewCartBtn').onclick = () => { renderCartModal(); openCart(); };
  $('#closeCartBtn').onclick = closeCart;
  $('#submitOrderBtn').onclick = submitOrder;

  $('#closeOrderStatusBtn').onclick = () => { closeOrderStatus(); toast('Puoi ordinare altro'); };

  $('#searchInput').addEventListener('input', () => renderMenu());

  $('#cartModal').addEventListener('click', (e) => { if (e.target.id === 'cartModal') closeCart(); });
  $('#orderStatusModal').addEventListener('click', (e) => { if (e.target.id === 'orderStatusModal') closeOrderStatus(); });

  // storico
  $('#openHistoryBtn').onclick = async () => {
    openHistory();
    try { await loadHistory(); } catch {}
  };
  $('#refreshHistoryBtn').onclick = () => loadHistory().catch(() => {});
  $('#closeHistoryBtn').onclick = closeHistory;
  $('#historyModal').addEventListener('click', (e) => { if (e.target.id === 'historyModal') closeHistory(); });

  // pulizia polling se chiudi tab
  window.addEventListener('beforeunload', () => stopHistoryPolling());
}

boot();
