const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const DIFF_MAP = { easy:'Легко', medium:'Средне', hard:'Сложно', all:'Все' };
const GAME_MAP = { peak_master:'Peak Master', pan_trainer:'Pan Trainer', db_king:'dB King', reverb_wizard:'Reverb Wizard', dr_compressor:'Dr. Compressor' };
const MEDAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/></svg>';
const MEDAL = { 1:MEDAL_ICON, 2:MEDAL_ICON, 3:MEDAL_ICON };
let currentDiff = 'all';
let currentGame = 'all';
let myUserId = null;
let myUsername = null;

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (session) {
    myUserId = session.user.id;
    SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', myUserId);
    const { data: p } = await SB.from('profiles').select('username, role').eq('id', myUserId).single();
    if (p) {
      myUsername = p.username;
      document.getElementById('accountLinks').style.display = '';
      if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(p.role)) {
        document.getElementById('adminLink').style.display = '';
      }
      mountNotifications(SB, document.getElementById('notifMount'), myUserId);
    }
  }
  load();
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function load() {
  const tbody = document.getElementById('lbBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Загружаем...</td></tr>';

  let q = SB.from('scores').select('user_id, username, score, accuracy, rounds, difficulty, game');
  if (currentGame !== 'all') q = q.eq('game', currentGame);
  if (currentDiff !== 'all') q = q.eq('difficulty', currentDiff);
  q = q.order('score', { ascending: false }).limit(2000);
  const { data: rows, error } = await q;

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Ошибка загрузки рейтинга</td></tr>';
    return;
  }

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Пока никто не играл. Стань первым!</td></tr>';
    document.getElementById('yourRank').classList.remove('show');
    return;
  }

  // Лучший результат каждого игрока (по user_id)
  const seen = new Map();
  rows.forEach(r => {
    const prev = seen.get(r.user_id);
    if (!prev || r.score > prev.score) seen.set(r.user_id, r);
  });
  const top = [...seen.values()].sort((a,b) => b.score - a.score).slice(0, 50);

  // Моё место
  if (myUserId) {
    const myIdx = top.findIndex(r => r.user_id === myUserId);
    const myRow = top[myIdx];
    if (myRow) {
      document.getElementById('yourRank').classList.add('show');
      document.getElementById('yourRankVal').textContent = '#' + (myIdx + 1);
      document.getElementById('yourScore').textContent = myRow.score.toLocaleString('ru');
      document.getElementById('yourName').textContent = myUsername || myRow.username;
    } else {
      document.getElementById('yourRank').classList.remove('show');
    }
  }

  tbody.innerHTML = '';
  top.forEach((r, i) => {
    const rank = i + 1;
    const isMe = r.user_id === myUserId;
    const tr = document.createElement('tr');
    if (isMe) tr.className = 'you-row';
    const medal = MEDAL[rank] || '';
    const rankClass = rank === 1 ? 'rank gold' : rank === 2 ? 'rank silver' : rank === 3 ? 'rank bronze' : 'rank';
    const color = stringToColor(r.username);
    const initials = r.username.slice(0,2).toUpperCase();
    const gameLabel = GAME_MAP[r.game] || r.game;
    tr.innerHTML = `
      <td class="${rankClass}">${medal || rank}</td>
      <td><a class="username" href="profile.html?user=${r.user_id}">
        <div class="av-mini" style="background:${color}">${initials}</div>
        ${r.username}${isMe ? ' <span style="color:var(--cyan);font-size:10px">(ты)</span>' : ''}
      </a></td>
      <td class="score-val">${r.score.toLocaleString('ru')}</td>
      <td>${r.accuracy}%</td>
      <td>${r.rounds || '—'}</td>
      <td><span class="diff-badge diff-${r.difficulty}">${DIFF_MAP[r.difficulty]||r.difficulty}</span> · ${gameLabel}</td>`;
    tbody.appendChild(tr);
  });
  if (window.animateChildren) animateChildren(tbody);
}

function setGame(g, btn) {
  currentGame = g;
  document.querySelectorAll('.filter-row:first-of-type .f-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  load();
}

function setDiff(d, btn) {
  currentDiff = d;
  document.querySelectorAll('.filter-row:nth-of-type(2) .f-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  load();
}

function stringToColor(str) {
  const colors = ['#22d3ee','#a78bfa','#4ade80','#facc15','#f87171','#fb923c','#f472b6','#38bdf8'];
  let hash = 0;
  for (let c of str) hash = ((hash << 5) - hash) + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

init();
