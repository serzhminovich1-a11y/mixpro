// ══════════════════════════════════════
//  БАРАХОЛКА — сетка объявлений ⇄ карточка (через ?listing=), тот же
//  паттерн list/detail, что у courses.js/forum.js. Публиковать может
//  любой залогиненный (как форум, без роли-фильтра, как курсы).
// ══════════════════════════════════════
const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;
let currentRole = null;
let nlImages = [];

const CATEGORY_LABELS = {
  mics: 'Микрофоны', monitors: 'Мониторы/акустика', interfaces: 'Аудиоинтерфейсы',
  headphones: 'Наушники', outboard: 'Аутборд', midi: 'MIDI-контроллеры',
  software: 'Плагины/софт', furniture: 'Мебель/акустика', other: 'Разное',
};

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function formatPrice(price, currency){ return Number(price).toLocaleString('ru-RU') + ' ' + (currency === 'RUB' ? '₽' : currency); }

async function logout(){ await SB.auth.signOut(); location.href = 'auth.html'; }

async function uploadMarketAsset(file){
  if (file.size > 10 * 1024 * 1024) throw new Error('Максимальный размер фото — 10 МБ');
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `market/${currentUid}/${Date.now()}_${safeName}`;
  const { error } = await SB.storage.from('posts').upload(path, file);
  if (error) throw error;
  const { data: pub } = SB.storage.from('posts').getPublicUrl(path);
  return pub.publicUrl;
}

// ── Список объявлений ──
function listingCardHtml(l){
  const img = l.image_urls && l.image_urls[0];
  return `<a href="marketplace.html?listing=${l.id}" class="mkt-card">
    <div class="mkt-card-img-wrap">
      <div class="mkt-card-img" style="${img ? `background-image:url('${img}')` : ''}">${img ? '' : 'Нет фото'}</div>
      ${l.status === 'sold' ? '<span class="mkt-badge-sold">Продано</span>' : ''}
    </div>
    <div class="mkt-card-body">
      <div class="mkt-card-title">${escapeHtml(l.title)}</div>
      <div class="mkt-card-price">${formatPrice(l.price, l.currency)}</div>
      <div class="mkt-card-meta"><span>${CATEGORY_LABELS[l.category] || l.category}</span><span>${l.condition === 'new' ? 'Новое' : 'Б/у'}</span></div>
    </div>
  </a>`;
}

async function renderListingGrid(){
  const categoryFilter = document.getElementById('categoryFilter').value;
  let query = SB.from('marketplace_listings').select('*').eq('status', 'active').order('created_at', { ascending: false });
  if (categoryFilter) query = query.eq('category', categoryFilter);
  const { data: listings } = await query;

  const grid = document.getElementById('listingGrid');
  if (!listings || !listings.length) { grid.innerHTML = '<div class="empty">Пока нет объявлений в этой категории</div>'; return; }
  grid.innerHTML = listings.map(listingCardHtml).join('');
  if (window.animateChildren) animateChildren(grid);
}

// ── Виджет загрузки нескольких фото ──
function renderImagePicker(){
  const picker = document.getElementById('nlImagePicker');
  const addBtn = document.getElementById('nlImageAddBtn');
  picker.querySelectorAll('.mkt-image-thumb').forEach(el => el.remove());
  nlImages.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'mkt-image-thumb';
    thumb.style.backgroundImage = `url('${url}')`;
    thumb.innerHTML = `<button type="button" data-i="${i}">✕</button>`;
    thumb.querySelector('button').addEventListener('click', () => { nlImages.splice(i, 1); renderImagePicker(); });
    picker.insertBefore(thumb, addBtn);
  });
  addBtn.disabled = nlImages.length >= 5;
}

function setupNewListingForm(){
  document.getElementById('newListingBtn').addEventListener('click', () => {
    document.getElementById('newListingForm').classList.toggle('open');
  });

  const fileInput = document.getElementById('nlImageInput');
  document.getElementById('nlImageAddBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []).slice(0, 5 - nlImages.length);
    const addBtn = document.getElementById('nlImageAddBtn');
    addBtn.disabled = true;
    for (const file of files) {
      try {
        const url = await uploadMarketAsset(file);
        nlImages.push(url);
      } catch (e) {
        alert('Не удалось загрузить фото: ' + e.message);
      }
    }
    fileInput.value = '';
    renderImagePicker();
  });

  document.getElementById('newListingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('nlStatus');
    const btn = document.getElementById('nlSubmit');
    const title = document.getElementById('nlTitle').value.trim();
    const price = parseFloat(document.getElementById('nlPrice').value);
    const condition = document.getElementById('nlCondition').value;
    const category = document.getElementById('nlCategory').value;
    const description = document.getElementById('nlDesc').value.trim();

    if (title.length < 3) { statusEl.textContent = 'Название — минимум 3 символа'; statusEl.className = 'form-status error'; return; }
    if (!(price >= 0)) { statusEl.textContent = 'Укажите цену'; statusEl.className = 'form-status error'; return; }

    btn.disabled = true;
    statusEl.textContent = '';
    const { data: inserted, error } = await SB.from('marketplace_listings').insert({
      user_id: currentUid, title, price, category, condition,
      description: description || null,
      image_urls: nlImages.length ? nlImages : null,
    }).select().single();
    btn.disabled = false;
    if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'form-status error'; return; }
    location.href = 'marketplace.html?listing=' + inserted.id;
  });
}

// ── Карточка объявления ──
async function renderDetail(listingId){
  const { data: listing } = await SB.from('marketplace_listings').select('*').eq('id', listingId).single();
  if (!listing) { location.href = 'marketplace.html'; return; }

  const { data: seller } = await SB.from('profiles').select('username, avatar_color').eq('id', listing.user_id).single();

  document.title = 'MIXPRO — ' + listing.title;
  const images = listing.image_urls || [];
  document.getElementById('detailMainImg').style.backgroundImage = images[0] ? `url('${images[0]}')` : '';
  document.getElementById('detailMainImg').textContent = images.length ? '' : 'Нет фото';
  document.getElementById('detailThumbs').innerHTML = images.map((img, i) => `<img src="${img}" class="${i === 0 ? 'active' : ''}" data-i="${i}">`).join('');
  document.querySelectorAll('.mkt-detail-thumbs img').forEach(img => {
    img.addEventListener('click', () => {
      document.getElementById('detailMainImg').style.backgroundImage = `url('${images[img.dataset.i]}')`;
      document.querySelectorAll('.mkt-detail-thumbs img').forEach(t => t.classList.remove('active'));
      img.classList.add('active');
    });
  });

  document.getElementById('detailTitle').textContent = listing.title + (listing.status === 'sold' ? ' (продано)' : '');
  document.getElementById('detailPrice').textContent = formatPrice(listing.price, listing.currency);
  document.getElementById('detailMeta').innerHTML = `<span>${CATEGORY_LABELS[listing.category] || listing.category}</span><span>${listing.condition === 'new' ? 'Новое' : 'Б/у'}</span><span>${new Date(listing.created_at).toLocaleDateString('ru-RU')}</span>`;
  document.getElementById('detailDesc').textContent = listing.description || '';

  const av = document.getElementById('sellerAvatar');
  av.style.background = (seller && seller.avatar_color) || 'var(--amber)';
  av.textContent = ((seller && seller.username) || '??').slice(0, 2).toUpperCase();
  document.getElementById('sellerName').textContent = (seller && seller.username) || '?';

  const isOwn = listing.user_id === currentUid;
  const actions = [];
  if (isOwn) {
    actions.push(`<button type="button" class="nav-btn" id="toggleSoldBtn">${listing.status === 'sold' ? 'Отметить активным' : 'Отметить проданным'}</button>`);
    actions.push(`<button type="button" class="nav-btn danger" id="deleteListingBtn">Удалить</button>`);
  } else {
    actions.push(`<a href="messages.html?to=${listing.user_id}" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center">Написать продавцу</a>`);
    actions.push(`<button type="button" class="nav-btn" id="reportListingBtn">Пожаловаться</button>`);
  }
  document.getElementById('detailActions').innerHTML = actions.join('');

  if (isOwn) {
    document.getElementById('toggleSoldBtn').addEventListener('click', async () => {
      const newStatus = listing.status === 'sold' ? 'active' : 'sold';
      const { error } = await SB.from('marketplace_listings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', listingId);
      if (error) { alert('Ошибка: ' + error.message); return; }
      await renderDetail(listingId);
    });
    document.getElementById('deleteListingBtn').addEventListener('click', async () => {
      if (!confirm('Удалить объявление? Отменить нельзя.')) return;
      const { error } = await SB.from('marketplace_listings').delete().eq('id', listingId);
      if (error) { alert('Не удалось удалить: ' + error.message); return; }
      location.href = 'marketplace.html';
    });
  } else {
    const reportBtn = document.getElementById('reportListingBtn');
    if (reportBtn) reportBtn.addEventListener('click', async () => {
      const reason = prompt('Почему жалуетесь на это объявление? (необязательно)', '');
      if (reason === null) return;
      reportBtn.disabled = true;
      const { error } = await SB.from('content_reports').insert({ reporter_id: currentUid, content_type: 'marketplace_listing', content_id: listingId, reason: reason || null });
      if (error) { alert(error.code === '23505' ? 'Вы уже жаловались на это объявление' : 'Не удалось отправить жалобу: ' + error.message); reportBtn.disabled = false; return; }
      reportBtn.textContent = 'Жалоба отправлена';
    });
  }
}

async function init(){
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).select().then(({ data, error }) => { if (error) console.error('last_seen_at update failed:', error); else if (!data || !data.length) console.warn('last_seen_at: 0 строк обновлено — возможно, истекла сессия'); });

  const { data: profile } = await SB.from('profiles').select('role, is_banned, ban_reason').eq('id', currentUid).single();
  if (window.enforceBanGate && enforceBanGate(SB, profile)) return;
  currentRole = profile ? profile.role : null;
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('adminLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);
  if (window.mountPmInbox) mountPmInbox(SB, document.getElementById('pmMount'), currentUid);

  document.getElementById('loading').style.display = 'none';

  const listingId = new URLSearchParams(location.search).get('listing');
  if (listingId) {
    const view = document.getElementById('detailView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '18px';
    await renderDetail(listingId);
  } else {
    const view = document.getElementById('listView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '20px';
    setupNewListingForm();
    renderImagePicker();
    document.getElementById('categoryFilter').addEventListener('change', renderListingGrid);
    await renderListingGrid();
  }
}

init();
