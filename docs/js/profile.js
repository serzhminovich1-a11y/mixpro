const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const GAME_NAMES = { peak_master:'Peak Master', pan_trainer:'Pan Trainer', db_king:'dB King', reverb_wizard:'Reverb Wizard', dr_compressor:'Dr. Compressor' };

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
      <div class="achv-icon">${a.icon || '🏅'}</div>
      <div class="achv-title">${a.title}</div>
      <div class="achv-desc">${a.description || ''}</div>
      <div class="achv-status">${earnedAt ? '✓ Получено ' + dateStr : '🔒 +' + a.xp_reward + ' XP'}</div>`;
    grid.appendChild(card);
  });
  if (window.animateChildren) animateChildren(grid);
}

function workCard(p){
  const card = document.createElement('div');
  card.className = 'work-card';
  const date = new Date(p.created_at).toLocaleDateString('ru-RU');
  const bars = Array.from({ length: 22 }, () => Math.round(3 + Math.random() * 13))
    .map(h => `<i style="height:${h}px"></i>`).join('');
  card.innerHTML = `
    <div class="work-thumb">${bars}<div class="work-play">▶</div></div>
    <div class="work-body"><div class="work-title">${p.title}</div><div class="work-meta">${date}</div></div>`;

  const audio = new Audio(p.file_url);
  const playBtn = card.querySelector('.work-play');
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audio.paused) {
      document.querySelectorAll('#worksWall .work-play').forEach(b => { if (b !== playBtn) b.textContent = '▶'; });
      document.dispatchEvent(new CustomEvent('pauseOtherWorks', { detail: audio }));
      audio.play();
      playBtn.textContent = '⏸';
    } else {
      audio.pause();
      playBtn.textContent = '▶';
    }
  });
  document.addEventListener('pauseOtherWorks', (e) => { if (e.detail !== audio) audio.pause(); });
  audio.addEventListener('ended', () => { playBtn.textContent = '▶'; });
  return card;
}

async function renderWorksWall(uid){
  const wall = document.getElementById('worksWall');
  const { data, error } = await SB.from('projects')
    .select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(6);

  if (error || !data || data.length === 0) {
    wall.innerHTML = '<div class="empty">Пока нет работ — <a href="portfolio.html" style="color:var(--cyan)">загрузи первую</a></div>';
    return;
  }
  wall.innerHTML = '';
  data.forEach(p => wall.appendChild(workCard(p)));
  if (window.animateChildren) animateChildren(wall);
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }

  const uid = session.user.id;

  // Профиль
  const { data: profile } = await SB.from('profiles').select('*').eq('id', uid).single();
  if (!profile) { location.href = 'auth.html'; return; }

  renderLevelXp(profile.xp);
  renderAchievements(uid);
  renderWorksWall(uid);

  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('adminUsersLink').style.display = '';
  }

  // Аватар
  const av = document.getElementById('avatar');
  av.style.background = profile.avatar_color || '#22d3ee';
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
