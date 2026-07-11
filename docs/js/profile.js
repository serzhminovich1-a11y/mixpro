const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const GAME_NAMES = { peak_master:'Peak Master', pan_trainer:'Pan Trainer', db_king:'dB King', reverb_wizard:'Reverb Wizard', dr_compressor:'Dr. Compressor' };

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }

  const uid = session.user.id;

  // Профиль
  const { data: profile } = await SB.from('profiles').select('*').eq('id', uid).single();
  if (!profile) { location.href = 'auth.html'; return; }

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

    document.getElementById('sBestScore').textContent = best.toLocaleString('ru');
    document.getElementById('sGames').textContent = scores.length;
    document.getElementById('sAccuracy').textContent = avgAcc + '%';
    document.getElementById('sBestStreak').textContent = bestStreak;
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
