const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;color:var(--gold)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

let currentUid = null;

async function handleSubmit(e){
  e.preventDefault();
  const btn = document.getElementById('verifyBtn');
  const status = document.getElementById('verifyStatus');
  const summary = document.getElementById('vSummary').value.trim();
  if (!summary) return;

  btn.disabled = true;
  status.textContent = '';
  status.className = 'form-status';

  const { error } = await SB.from('verification_requests').insert({
    user_id: currentUid,
    portfolio_summary: summary,
  });

  btn.disabled = false;
  if (error) {
    status.textContent = 'Ошибка: ' + error.message;
    status.className = 'form-status error';
    return;
  }
  await renderStatus();
}

function box(html){
  return `<div class="form-card" style="text-align:center"><div>${html}</div></div>`;
}

// prefetched — необязательный уже загруженный профиль (передаётся из
// init(), чтобы не запрашивать одну и ту же строку дважды подряд);
// после отправки заявки (handleSubmit) статус мог измениться, поэтому
// там вызывается без аргумента и профиль грузится заново
async function renderStatus(prefetched){
  const { data: profile } = prefetched
    ? { data: prefetched }
    : await SB.from('profiles').select('role, verification_status').eq('id', currentUid).single();
  const statusBox = document.getElementById('statusBox');
  const form = document.getElementById('verifyForm');
  const sub = document.getElementById('verifySub');

  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role)) {
    sub.textContent = 'Твой опыт уже подтверждён платформой';
    statusBox.innerHTML = box(ICON_CHECK_SM + ' <b>Твой опыт подтверждён</b> — можешь создавать курсы.<br><a href="admin.html" style="color:var(--cyan)">Перейти в панель управления →</a>');
    form.style.display = 'none';
    return;
  }

  const { data: requests } = await SB.from('verification_requests')
    .select('*').eq('user_id', currentUid).order('created_at', { ascending: false }).limit(1);
  const latest = requests && requests[0];

  if (latest && latest.status === 'pending') {
    sub.textContent = 'Заявка уже отправлена и ждёт рассмотрения';
    statusBox.innerHTML = box(ICON_CLOCK + ' Заявка на рассмотрении. Мы сообщим, когда её проверят.');
    form.style.display = 'none';
    return;
  }

  if (latest && latest.status === 'rejected') {
    statusBox.innerHTML = box('Заявка была отклонена. Можешь отправить новую, добавив больше деталей об опыте.');
  } else {
    statusBox.innerHTML = '';
  }
  form.style.display = 'flex';
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).then(({ error }) => { if (error) console.error('last_seen_at update failed:', error); });

  const { data: profile } = await SB.from('profiles').select('role, verification_status').eq('id', currentUid).single();
  if (profile && ['MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('reviewLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);

  document.getElementById('verifyForm').addEventListener('submit', handleSubmit);
  await renderStatus(profile);

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';
}

init();
