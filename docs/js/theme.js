// ══════════════════════════════════════
//   ТЕМЫ ОФОРМЛЕНИЯ — переключатель в шапке
// ══════════════════════════════════════
// Зависит от глобалов из main.js (SB, sbUser, sbProfile, vip, openVip) —
// поэтому этот файл должен подключаться ПОСЛЕ main.js. Мгновенное
// применение сохранённой темы (до какого-либо Supabase-запроса) уже
// произошло раньше — см. инлайн-скрипт в <head> index.html.

const THEMES = [
  { id:'default', name:'Обычная',           tier:'free', swatch:['#4ade80','#a78bfa','#0a0b16'] },
  { id:'brutal',  name:'Смело и графично',  tier:'vip',  swatch:['#2b2bff','#ff3d6e','#f5f3ea'] },
  { id:'hifi',    name:'Ретро хай-фай',     tier:'vip',  swatch:['#ff5a36','#ffb036','#221f22'] },
  { id:'neon',    name:'Неоновый аркадный', tier:'vip',  swatch:['#ff2e9a','#00e5ff','#1a0b3d'] },
];
const THEME_KEY = 'mixpro_theme';

// null = на этом устройстве ещё ни разу не выбирали тему (важно отличать
// от осознанно выбранной 'default' — см. syncThemeFromProfile)
function getSavedThemeRaw(){
  try { return localStorage.getItem(THEME_KEY); } catch(e){ return null; }
}
function getSavedTheme(){
  return getSavedThemeRaw() || 'default';
}

function applyThemeLocal(id){
  if (id && id !== 'default') document.documentElement.setAttribute('data-theme', id);
  else document.documentElement.removeAttribute('data-theme');
  window.dispatchEvent(new CustomEvent('mixpro:theme-changed', { detail:{ id: id || 'default' } }));
}

function renderThemePanel(){
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  const active = getSavedTheme();
  grid.innerHTML = THEMES.map(t=>{
    const locked = t.tier === 'vip' && !vip;
    const isActive = t.id === active;
    return `<button class="theme-swatch-btn${isActive?' active':''}${locked?' locked':''}" data-theme-id="${t.id}" title="${t.name}${locked?' — только VIP':''}">
      <span class="theme-swatch-dots">${t.swatch.map(c=>`<i style="background:${c}"></i>`).join('')}</span>
      <span class="theme-swatch-name">${t.name}</span>
      ${locked?'<svg class="theme-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>':''}
      ${isActive?'<svg class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>':''}
    </button>`;
  }).join('');
  grid.querySelectorAll('.theme-swatch-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>selectTheme(btn.dataset.themeId));
  });
}

async function selectTheme(id){
  const meta = THEMES.find(t=>t.id===id);
  if (!meta) return;
  if (meta.tier === 'vip' && !vip) { closeThemePanel(); openVip(); return; }
  applyThemeLocal(id);
  try { localStorage.setItem(THEME_KEY, id); } catch(e){}
  renderThemePanel();
  if (typeof sbUser !== 'undefined' && sbUser) {
    try { await SB.from('profiles').update({ active_theme: id }).eq('id', sbUser.id); } catch(e){}
  }
}

function toggleThemePanel(){
  const panel = document.getElementById('themePanel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeThemePanel();
  else openThemePanel();
}
function openThemePanel(){
  renderThemePanel();
  document.getElementById('themePanel').classList.add('open');
}
function closeThemePanel(){
  const panel = document.getElementById('themePanel');
  if (panel) panel.classList.remove('open');
}
document.addEventListener('click', e=>{
  const panel = document.getElementById('themePanel');
  const btn = document.getElementById('themeBtn');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeThemePanel();
});

// Вызывается из main.js после того, как известен профиль/VIP-статус.
// Правило: выбор, уже сделанный на ЭТОМ устройстве, сервер молча не
// перезаписывает (иначе если миграция в Supabase ещё не применена или
// запись на сервер не прошла, тема после каждой перезагрузки откатывалась
// бы обратно на дефолтную). С сервера подтягиваем тему только на
// "чистом" устройстве, где выбора ещё не было — это и даёт синхронизацию
// между устройствами. Единственное исключение — просевший VIP: тогда
// платную тему откатываем на бесплатную в любом случае.
async function syncThemeFromProfile(){
  if (typeof sbProfile === 'undefined' || !sbProfile) { renderThemePanel(); return; }
  const server = sbProfile.active_theme || 'default';
  const localRaw = getSavedThemeRaw();
  const local = localRaw || 'default';
  const localMeta = THEMES.find(t=>t.id===local);
  let target = local;
  if (localMeta && localMeta.tier === 'vip' && !vip) {
    // локально стоит платная тема (например, VIP закончился) — откатываем,
    // независимо от того, что записано на сервере
    target = 'default';
  } else if (localRaw === null && server !== local) {
    target = server;
  }
  if (target !== local) {
    applyThemeLocal(target);
    try { localStorage.setItem(THEME_KEY, target); } catch(e){}
  }
  renderThemePanel();
}

applyThemeLocal(getSavedTheme());
renderThemePanel();
