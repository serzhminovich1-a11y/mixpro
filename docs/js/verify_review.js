const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

function requestCard(r){
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:20px 22px;display:flex;flex-direction:column;gap:12px';
  const date = new Date(r.created_at).toLocaleDateString('ru-RU');
  const username = (r.profiles && r.profiles.username) || r.user_id;
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="font-family:var(--ox);font-weight:700;font-size:14px">${username}</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--muted2)">${date}</div>
    </div>
    <div style="font-size:13px;color:var(--muted2);line-height:1.6;white-space:pre-wrap">${r.portfolio_summary || ''}</div>
    <div style="display:flex;gap:8px">
      <button type="button" class="submit-btn approveBtn" style="background:linear-gradient(90deg,var(--green),#22d3ee)">Подтвердить</button>
      <button type="button" class="nav-btn danger rejectBtn">Отклонить</button>
    </div>
    <div class="form-status rStatus"></div>`;

  card.querySelector('.approveBtn').addEventListener('click', () => handleReview(r.id, true, card));
  card.querySelector('.rejectBtn').addEventListener('click', () => handleReview(r.id, false, card));
  return card;
}

async function handleReview(requestId, approve, card){
  const statusEl = card.querySelector('.rStatus');
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  const { error } = await SB.rpc('approve_verification_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) {
    statusEl.textContent = 'Ошибка: ' + error.message;
    statusEl.className = 'form-status error';
    card.querySelectorAll('button').forEach(b => b.disabled = false);
    return;
  }
  card.style.opacity = '.4';
  statusEl.textContent = approve ? '✓ Подтверждено' : 'Отклонено';
  statusEl.className = 'form-status ' + (approve ? 'ok' : 'error');
}

async function renderQueue(){
  const queue = document.getElementById('queue');
  const { data, error } = await SB.from('verification_requests')
    .select('*, profiles(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    queue.innerHTML = '<div class="empty">Заявок на рассмотрении нет</div>';
    return;
  }
  queue.innerHTML = '';
  data.forEach(r => queue.appendChild(requestCard(r)));
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  const uid = session.user.id;

  const { data: profile } = await SB.from('profiles').select('role').eq('id', uid).single();
  document.getElementById('loading').style.display = 'none';

  if (!profile || !['MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('noAccess').style.display = 'block';
    return;
  }

  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';

  await renderQueue();
}

init();
