const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px"><path d="M20 6 9 17l-5-5"/></svg>';

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
  return `<div class="card" style="padding:24px;text-align:center;display:flex;flex-direction:column;gap:8px">${html}</div>`;
}

async function renderStatus(){
  const { data: profile } = await SB.from('profiles').select('role, verification_status').eq('id', currentUid).single();
  const statusBox = document.getElementById('statusBox');
  const form = document.getElementById('verifyForm');

  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role)) {
    statusBox.innerHTML = box(ICON_CHECK_SM + ' <b>Твой опыт подтверждён</b> — можешь создавать курсы.<br><a href="admin.html" style="color:var(--cyan)">Перейти в панель управления →</a>');
    form.style.display = 'none';
    return;
  }

  const { data: requests } = await SB.from('verification_requests')
    .select('*').eq('user_id', currentUid).order('created_at', { ascending: false }).limit(1);
  const latest = requests && requests[0];

  if (latest && latest.status === 'pending') {
    statusBox.innerHTML = box('⏳ Заявка на рассмотрении. Мы сообщим, когда её проверят.');
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

  const { data: profile } = await SB.from('profiles').select('role').eq('id', currentUid).single();
  if (profile && ['MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('reviewLink').style.display = '';
  }

  document.getElementById('verifyForm').addEventListener('submit', handleSubmit);
  await renderStatus();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';
}

init();
