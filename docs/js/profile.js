const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const GAME_NAMES = { peak_master:'Peak Master', pan_trainer:'Pan Trainer', db_king:'dB King', reverb_wizard:'Reverb Wizard', dr_compressor:'Dr. Compressor' };

// Контурные SVG-иконки вместо эмодзи для достижений и служебных значков
function pIcon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
const ACHV_ICONS = {
  '🎚️': pIcon('<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'),
  '📚': pIcon('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'),
  '✅': pIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  '🏆': pIcon('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
};
const ACHV_ICON_DEFAULT = pIcon('<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>');
const ICON_LOCK = pIcon('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
const ICON_CHECK_SM = pIcon('<path d="M20 6 9 17l-5-5"/>');

// Пороги XP — должны совпадать с get_level_from_xp() в docs/supabase/migrations/001_lms_schema.sql
const XP_LEVELS = [
  { name:'Beginner',     min:0 },
  { name:'Intermediate', min:500 },
  { name:'Advanced',     min:2000 },
  { name:'Professional', min:5000 },
  { name:'Master',       min:12000 },
  { name:'Legend',       min:25000 },
];

function renderLevelXp(xp){
  xp = xp || 0;
  let current = XP_LEVELS[0], next = XP_LEVELS[1];
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].min) { current = XP_LEVELS[i]; next = XP_LEVELS[i+1] || null; }
  }
  document.getElementById('levelName').textContent = current.name;
  const pct = next ? Math.round(((xp - current.min) / (next.min - current.min)) * 100) : 100;
  document.getElementById('xpFill').style.width = pct + '%';
  document.getElementById('xpLabel').textContent = next
    ? xp.toLocaleString('ru') + ' / ' + next.min.toLocaleString('ru') + ' XP до ' + next.name
    : xp.toLocaleString('ru') + ' XP · максимальный уровень';
}

async function renderAchievements(uid){
  const grid = document.getElementById('achvGrid');
  const [{ data: all }, { data: earned }] = await Promise.all([
    SB.from('achievements').select('*').order('condition_value', { ascending: true }),
    SB.from('user_achievements').select('achievement_id, earned_at').eq('user_id', uid),
  ]);

  if (!all || all.length === 0) {
    grid.innerHTML = '<div class="empty">Достижений пока нет</div>';
    return;
  }
  const earnedMap = new Map((earned || []).map(e => [e.achievement_id, e.earned_at]));

  grid.innerHTML = '';
  all.forEach(a => {
    const earnedAt = earnedMap.get(a.id);
    const card = document.createElement('div');
    card.className = 'achv-card' + (earnedAt ? ' unlocked' : ' locked');
    const dateStr = earnedAt ? new Date(earnedAt).toLocaleDateString('ru-RU') : null;
    card.innerHTML = `
      <div class="achv-icon">${ACHV_ICONS[a.icon] || ACHV_ICON_DEFAULT}</div>
      <div class="achv-title">${a.title}</div>
      <div class="achv-desc">${a.description || ''}</div>
      <div class="achv-status">${earnedAt ? ICON_CHECK_SM + ' Получено ' + dateStr : ICON_LOCK + ' +' + a.xp_reward + ' XP'}</div>`;
    grid.appendChild(card);
  });
  if (window.animateChildren) animateChildren(grid);
}

const ICON_COVER_PLACEHOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

function workCard(p, viewerCtx){
  const card = document.createElement('div');
  card.className = 'work-card';
  const date = new Date(p.created_at).toLocaleDateString('ru-RU');
  const cover = p.cover_url
    ? `<img class="work-cover" src="${p.cover_url}" alt="">`
    : `<div class="work-cover work-cover-placeholder">${ICON_COVER_PLACEHOLDER}</div>`;
  card.innerHTML = `
    <div class="work-cover-wrap">${cover}</div>
    <div class="work-body-wrap">
      <div class="work-body"><div class="work-title">${p.title}</div><div class="work-meta">${date}</div></div>
      <div class="wp-mount"></div>
      <div class="pf-mount"></div>
    </div>`;

  createWavePlayer(p.file_url, card.querySelector('.wp-mount'), { size: 'lg' });
  mountProjectFeedback(SB, p, card.querySelector('.pf-mount'), viewerCtx);
  return card;
}

async function renderWorksWall(uid, viewerCtx){
  const wall = document.getElementById('worksWall');
  const { data, error } = await SB.from('projects')
    .select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(6);

  if (error || !data || data.length === 0) {
    wall.innerHTML = '<div class="empty">Пока нет работ' + (viewerCtx.isOwn ? ' — <a href="portfolio.html" style="color:var(--cyan)">загрузи первую</a>' : '') + '</div>';
    return;
  }
  wall.innerHTML = '';
  data.forEach(p => wall.appendChild(workCard(p, viewerCtx)));
  if (window.animateChildren) animateChildren(wall);
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }

  const myUid = session.user.id;
  const uid = new URLSearchParams(location.search).get('user') || myUid;
  const isOwn = uid === myUid;

  // Профиль (свой или чужой — смотрим по ?user=)
  const { data: profile } = await SB.from('profiles').select('*').eq('id', uid).single();
  if (!profile) { location.href = 'auth.html'; return; }

  // Моя роль — нужна для прав вроде "Оставить разбор" (это всегда про
  // того, кто СЕЙЧАС смотрит страницу, не про владельца профиля).
  let myRole;
  if (isOwn) {
    myRole = profile.role;
  } else {
    const { data: myProfile } = await SB.from('profiles').select('role').eq('id', myUid).single();
    myRole = myProfile ? myProfile.role : null;
  }
  const viewerCtx = { currentUid: myUid, currentRole: myRole, isOwn };

  renderLevelXp(profile.xp);
  renderAchievements(uid);
  renderWorksWall(uid, viewerCtx);

  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(myRole)) {
    document.getElementById('adminUsersLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), myUid);

  if (!isOwn) {
    document.getElementById('shopPresets').style.display = 'none';
    document.getElementById('shopMerch').style.display = 'none';
    document.getElementById('worksWallLink').style.display = 'none';
  }

  // Аватар
  const av = document.getElementById('avatar');
  av.style.background = profile.avatar_color || '#4ade80';
  av.textContent = profile.username.slice(0,2).toUpperCase();

  document.getElementById('username').textContent = profile.username;
  document.getElementById('since').textContent = 'С нами с ' + new Date(profile.created_at).toLocaleDateString('ru-RU', {year:'numeric',month:'long'});

  // Все очки пользователя
  const { data: scores } = await SB.from('scores')
    .select('*').eq('user_id', uid).order('created_at', { ascending: false });

  if (scores && scores.length > 0) {
    const best = Math.max(...scores.map(s => s.score));
    const avgAcc = Math.round(scores.reduce((a,s) => a + s.accuracy, 0) / scores.length);
    const bestStreak = Math.max(...scores.map(s => s.streak));
    const pmBest = Math.max(...scores.filter(s => s.game === 'peak_master').map(s => s.score), 0);
    const ptBest = Math.max(...scores.filter(s => s.game === 'pan_trainer').map(s => s.score), 0);
    const dbBest = Math.max(...scores.filter(s => s.game === 'db_king').map(s => s.score), 0);
    const rvBest = Math.max(...scores.filter(s => s.game === 'reverb_wizard').map(s => s.score), 0);
    const dcBest = Math.max(...scores.filter(s => s.game === 'dr_compressor').map(s => s.score), 0);

    if (window.animateNumber) {
      animateNumber(document.getElementById('sBestScore'), best);
      animateNumber(document.getElementById('sGames'), scores.length, { format: n => Math.round(n) });
      animateNumber(document.getElementById('sAccuracy'), avgAcc, { format: n => Math.round(n) + '%' });
      animateNumber(document.getElementById('sBestStreak'), bestStreak, { format: n => Math.round(n) });
    } else {
      document.getElementById('sBestScore').textContent = best.toLocaleString('ru');
      document.getElementById('sGames').textContent = scores.length;
      document.getElementById('sAccuracy').textContent = avgAcc + '%';
      document.getElementById('sBestStreak').textContent = bestStreak;
    }
    document.getElementById('pmScore').textContent = pmBest.toLocaleString('ru');
    document.getElementById('ptScore').textContent = ptBest.toLocaleString('ru');
    document.getElementById('dbScore').textContent = dbBest.toLocaleString('ru');
    document.getElementById('rvScore').textContent = rvBest.toLocaleString('ru');
    document.getElementById('dcScore').textContent = dcBest.toLocaleString('ru');

    // История
    const tbody = document.getElementById('historyBody');
    const diffMap = { easy:'Легко', medium:'Средне', hard:'Сложно' };
    scores.slice(0, 20).forEach(s => {
      const tr = document.createElement('tr');
      const date = new Date(s.created_at).toLocaleDateString('ru-RU');
      const gameName = GAME_NAMES[s.game] || s.game;
      tr.innerHTML = `
        <td>${gameName}</td>
        <td style="color:var(--gold);font-weight:700">${s.score.toLocaleString('ru')}</td>
        <td>${s.accuracy}%</td>
        <td>${s.streak > 0 ? s.streak + '🔥' : s.streak}</td>
        <td><span class="diff-badge diff-${s.difficulty}">${diffMap[s.difficulty]||s.difficulty}</span></td>
        <td style="color:var(--muted2)">${date}</td>`;
      tbody.appendChild(tr);
    });
  } else {
    document.getElementById('historyBody').innerHTML = '<tr><td colspan="6" class="empty">Ещё нет сыгранных раундов — иди в тренажёр!</td></tr>';
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

init();
