// Cliente App
let tableId = null;
let token = null;
let menu = { categories: [], items: [] };
let cart = {}; // { itemId: { item, quantity } }

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// API Helper
async function apiCall(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

// Toast
function toast(msg, duration = 3000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), duration);
}

// Parse URL
function parseUrl() {
  const params = new URLSearchParams(location.search);
  tableId = params.get('table');
  if (!tableId) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>Link non valido</h2><p>Scansiona il QR code del tavolo per ordinare.</p></div>';
    return false;
  }
  $('#pinGateTable').textContent = tableId;
  $('#currentTable').textContent = tableId;
  return true;
}

// PIN Gate
function showPinGate() {
  // Controlla se token salvato è ancora valido
  const savedToken = localStorage.getItem(`token_table_${tableId}`);
  if (savedToken) {
    token = savedToken;
    verifyToken();
  } else {
    $('#pinGate').classList.remove('hidden');
  }
}

async function verifyToken() {
  try {
    // Verifica se il token è ancora valido caricando il menu
    await loadMenu();
    $('#pinGate').classList.add('hidden');
    $('#menuSection').classList.remove('hidden');
    $('#tableInfo').classList.remove('hidden');
  } catch (e) {
    // Token non valido, richiedi PIN
    localStorage.removeItem(`token_table_${tableId}`);
    token = null;
    $('#pinGate').classList.remove('hidden');
  }
}

$('#pinSubmit').onclick = async () => {
  const pin = $('#pinInput').value.trim();
  if (!/^\d{4}$/.test(pin)) {
    toast('Inserisci un PIN di 4 cifre');
    return;
  }
  
  try {
    const response = await apiCall('/session/verify', {
      method: 'POST',
      body: JSON.stringify({ table_id: tableId, pin })
    });
    
    token = response.token;
    localStorage.setItem(`token_table_${tableId}`, token);
    
    $('#pinGate').classList.add('hidden');
    $('#menuSection').classList.remove('hidden');
    $('#tableInfo').classList.remove('hidden');
    
    await loadMenu();
    toast('Accesso consentito! 🎉');
  } catch (e) {
    toast('PIN non valido. Chiedi al cameriere il PIN corretto.');
    $('#pinInput').value = '';
  }
};

// Menu
async function loadMenu() {
  try {
    const data = await apiCall('/menu');
    menu = data;
    renderMenu();
  } catch (e) {
    toast('Errore caricamento menù: ' + e.message);
  }
}

function renderMenu() {
  renderCategories();
  renderAllItems();
}

function renderCategories() {
  const nav = $('#categoryNav');
  nav.innerHTML = '<button class="category-btn active" data-cat="all">Tutto</button>';
  
  menu.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = cat.name;
    btn.dataset.cat = cat.id;
    btn.onclick = () => {
      $$('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterByCategory(cat.id);
    };
    nav.appendChild(btn);
  });
  
  $$('.category-btn')[0].onclick = () => {
    $$('.category-btn').forEach(b => b.classList.remove('active'));
    $$('.category-btn')[0].classList.add('active');
    renderAllItems();
  };
}

function renderAllItems() {
  const container = $('#menuItems');
  container.innerHTML = '';
  
  menu.categories.forEach(cat => {
    const items = menu.items.filter(i => i.category_id === cat.id && i.visible);
    if (items.length === 0) return;
    
    const section = document.createElement('div');
    section.className = 'menu-category';
    section.innerHTML = `<h2>${cat.name}</h2>`;
    
    items.forEach(item => {
      section.appendChild(createMenuItem(item));
    });
    
    container.appendChild(section);
  });
}

function filterByCategory(catId) {
  const container = $('#menuItems');
  container.innerHTML = '';
  
  const cat = menu.categories.find(c => c.id === catId);
  const items = menu.items.filter(i => i.category_id === catId && i.visible);
  
  const section = document.createElement('div');
  section.className = 'menu-category';
  section.innerHTML = `<h2>${cat.name}</h2>`;
  
  items.forEach(item => {
    section.appendChild(createMenuItem(item));
  });
  
  container.appendChild(section);
}

function createMenuItem(item) {
  const card = document.createElement('div');
  card.className = 'menu-item';
  
  const tags = item.tags ? JSON.parse(item.tags) : [];
  const tagsHtml = tags.map(tag => {
    const className = tag.toLowerCase() === 'bio' ? 'tag bio' : 'tag';
    return `<span class="${className}">${tag}</span>`;
  }).join('');
  
  const qty = cart[item.id]?.quantity || 0;
  
  card.innerHTML = `
    <div class="menu-item-header">
      <div class="menu-item-name">${item.name}</div>
      <div class="menu-item-price">${parseFloat(item.price_eur).toFixed(2)} €</div>
    </div>
    ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
    ${tagsHtml ? `<div class="menu-item-tags">${tagsHtml}</div>` : ''}
    <div class="menu-item-footer">
      <div class="qty-control">
        <button class="qty-btn" data-act="minus" data-id="${item.id}">−</button>
        <div class="qty-display" data-id="${item.id}">${qty}</div>
        <button class="qty-btn" data-act="plus" data-id="${item.id}">+</button>
      </div>
    </div>
  `;
  
  card.querySelector('[data-act="plus"]').onclick = () => addToCart(item);
  card.querySelector('[data-act="minus"]').onclick = () => removeFromCart(item.id);
  
  return card;
}

// Carrello
function addToCart(item) {
  if (!cart[item.id]) {
    cart[item.id] = { item, quantity: 0 };
  }
  
  if (cart[item.id].quantity >= 10) {
    toast('Quantità massima per articolo: 10');
    return;
  }
  
  cart[item.id].quantity++;
  updateCart();
  toast(`${item.name} aggiunto al carrello`);
}

function removeFromCart(itemId) {
  if (!cart[itemId]) return;
  
  cart[itemId].quantity--;
  if (cart[itemId].quantity <= 0) {
    delete cart[itemId];
  }
  
  updateCart();
}

function updateCart() {
  // Aggiorna quantità nei pulsanti
  Object.keys(cart).forEach(itemId => {
    const display = $(`.qty-display[data-id="${itemId}"]`);
    if (display) display.textContent = cart[itemId].quantity;
  });
  
  // Aggiorna contatori vuoti
  $$('.qty-display').forEach(display => {
    const id = display.dataset.id;
    if (!cart[id]) display.textContent = '0';
  });
  
  // Calcola totale
  const items = Object.values(cart);
  const count = items.reduce((sum, c) => sum + c.quantity, 0);
  const total = items.reduce((sum, c) => sum + c.quantity * parseFloat(c.item.price_eur), 0);
  
  if (count === 0) {
    $('#cartBar').classList.add('hidden');
  } else {
    $('#cartBar').classList.remove('hidden');
    $('#cartCount').textContent = `${count} ${count === 1 ? 'articolo' : 'articoli'}`;
    $('#cartTotal').textContent = `${total.toFixed(2)} €`;
  }
}

$('#viewCartBtn').onclick = () => {
  renderCartModal();
  $('#cartModal').classList.remove('hidden');
};

$('#closeCartBtn').onclick = () => {
  $('#cartModal').classList.add('hidden');
};

function renderCartModal() {
  const list = $('#cartItems');
  list.innerHTML = '';
  
  const items = Object.values(cart);
  let total = 0;
  
  items.forEach(({ item, quantity }) => {
    const subtotal = quantity * parseFloat(item.price_eur);
    total += subtotal;
    
    const card = document.createElement('div');
    card.className = 'cart-item';
    card.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${parseFloat(item.price_eur).toFixed(2)} € × ${quantity} = ${subtotal.toFixed(2)} €</div>
      </div>
      <div class="cart-item-actions">
        <button class="qty-btn" data-act="minus" data-id="${item.id}">−</button>
        <div class="qty-display">${quantity}</div>
        <button class="qty-btn" data-act="plus" data-id="${item.id}">+</button>
      </div>
    `;
    
    card.querySelector('[data-act="plus"]').onclick = () => { addToCart(item); renderCartModal(); };
    card.querySelector('[data-act="minus"]').onclick = () => { removeFromCart(item.id); renderCartModal(); };
    
    list.appendChild(card);
  });
  
  $('#cartModalTotal').textContent = `${total.toFixed(2)} €`;
}

$('#submitOrderBtn').onclick = async () => {
  const items = Object.values(cart);
  if (items.length === 0) {
    toast('Il carrello è vuoto');
    return;
  }
  
  // Controlla tetto massimo 200€
  const total = items.reduce((sum, c) => sum + c.quantity * parseFloat(c.item.price_eur), 0);
  if (total > 200) {
    toast('Tetto massimo ordine: 200 €. Riduci la quantità.');
    return;
  }
  
  try {
    const orderItems = items.map(({ item, quantity }) => ({
      item_id: item.id,
      name: item.name,
      quantity,
      price_eur: parseFloat(item.price_eur)
    }));
    
    await apiCall('/orders', {
      method: 'POST',
      body: JSON.stringify({ token, items: orderItems })
    });
    
    // Svuota carrello
    cart = {};
    updateCart();
    
    $('#cartModal').classList.add('hidden');
    showOrderStatus('richiesta');
  } catch (e) {
    if (e.message.includes('Invalid or closed session')) {
      toast('Sessione chiusa. Chiedi un nuovo PIN al cameriere.');
      localStorage.removeItem(`token_table_${tableId}`);
      location.reload();
    } else {
      toast('Errore invio ordine: ' + e.message);
    }
  }
};

// Stato ordine
function showOrderStatus(state) {
  const modal = $('#orderStatusModal');
  modal.classList.remove('hidden');
  
  const steps = ['richiesta', 'accettato', 'in-preparazione', 'servito'];
  const currentIndex = steps.indexOf(state);
  
  $$('.status-step').forEach((step, i) => {
    if (i <= currentIndex) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
  
  const messages = {
    richiesta: 'Il tuo ordine è stato ricevuto ed è in attesa di conferma.',
    accettato: 'Il tuo ordine è stato accettato dal personale.',
    'in-preparazione': 'Il tuo ordine è in preparazione. Arriva presto!',
    servito: 'Il tuo ordine è stato servito. Buon appetito! 🎊'
  };
  
  $('#orderStatusText').textContent = messages[state] || messages.richiesta;
}

$('#closeOrderStatusBtn').onclick = () => {
  $('#orderStatusModal').classList.add('hidden');
};

// Ricerca
$('#searchInput').oninput = (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderAllItems();
    return;
  }
  
  const container = $('#menuItems');
  container.innerHTML = '';
  
  const filtered = menu.items.filter(i => 
    i.visible && (
      i.name.toLowerCase().includes(query) ||
      (i.description && i.description.toLowerCase().includes(query))
    )
  );
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="hint" style="text-align:center;padding:40px">Nessun articolo trovato.</div>';
    return;
  }
  
  const section = document.createElement('div');
  section.className = 'menu-category';
  section.innerHTML = '<h2>Risultati ricerca</h2>';
  
  filtered.forEach(item => {
    section.appendChild(createMenuItem(item));
  });
  
  container.appendChild(section);
};

// Boot
if (parseUrl()) {
  showPinGate();
}
