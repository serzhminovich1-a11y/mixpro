const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;

function submissionCard(s){
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:20px 22px;display:flex;flex-direction:column;gap:12px';

  const student = (s.profiles && s.profiles.username) || s.user_id;
  const assignmentTitle = (s.assignments && s.assignments.title) || 'Задание';
  const maxScore = (s.assignments && s.assignments.max_score) || 100;
  const projectTitle = s.projects ? s.projects.title : null;
  const projectUrl = s.projects ? s.projects.file_url : null;
  const date = new Date(s.submitted_at).toLocaleDateString('ru-RU');

  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-family:var(--ox);font-weight:700;font-size:14px">${student}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--cyan)">${assignmentTitle}</div>
      </div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--muted2)">${date}</div>
    </div>
    ${projectUrl ? `<div><div style="font-family:var(--ox);font-size:13px;margin-bottom:6px">🎧 ${projectTitle}</div><audio controls src="${projectUrl}" style="width:100%;height:34px"></audio></div>` : '<div class="empty">Работа не прикреплена</div>'}
    <div class="form-row">
      <div class="field"><label>Оценка (из ${maxScore})</label><input type="number" class="rScore" min="0" max="${maxScore}" value="${maxScore}"></div>
    </div>
    <div class="field"><label>Отзыв</label><textarea class="rFeedback" placeholder="Что получилось хорошо, что доработать..."></textarea></div>
    <div style="display:flex;gap:8px">
      <button type="button" class="submit-btn rApprove" style="background:linear-gradient(90deg,var(--green),#22d3ee)">Принять</button>
      <button type="button" class="nav-btn danger rReject">Отклонить</button>
    </div>
    <div class="form-status rStatus"></div>`;

  card.querySelector('.rApprove').addEventListener('click', () => handleReview(s, card, true, maxScore));
  card.querySelector('.rReject').addEventListener('click', () => handleReview(s, card, false, maxScore));

  return card;
}

async function handleReview(submission, card, approve, maxScore){
  const scoreInput = card.querySelector('.rScore');
  const feedback = card.querySelector('.rFeedback').value.trim();
  const statusEl = card.querySelector('.rStatus');
  let score = Math.max(0, Math.min(maxScore, parseInt(scoreInput.value, 10) || 0));

  card.querySelectorAll('button, input, textarea').forEach(el => el.disabled = true);

  const { error: reviewErr } = await SB.from('reviews').insert({
    submission_id: submission.id,
    reviewer_id: currentUid,
    score,
    feedback,
  });
  if (reviewErr) {
    statusEl.textContent = 'Ошибка: ' + reviewErr.message;
    statusEl.className = 'form-status error';
    card.querySelectorAll('button, input, textarea').forEach(el => el.disabled = false);
    return;
  }

  const { error: subErr } = await SB.from('assignment_submissions')
    .update({ status: approve ? 'approved' : 'rejected', score })
    .eq('id', submission.id);
  if (subErr) {
    statusEl.textContent = 'Ошибка: ' + subErr.message;
    statusEl.className = 'form-status error';
    return;
  }

  card.style.opacity = '.4';
  statusEl.textContent = approve ? '✓ Принято' : 'Отклонено';
  statusEl.className = 'form-status ' + (approve ? 'ok' : 'error');
}

async function renderQueue(){
  const queue = document.getElementById('queue');
  const { data, error } = await SB.from('assignment_submissions')
    .select('*, assignments(title, max_score), profiles(username), projects(title, file_url)')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true });

  if (error || !data || data.length === 0) {
    queue.innerHTML = '<div class="empty">Заданий на проверке нет</div>';
    return;
  }
  queue.innerHTML = '';
  data.forEach(s => queue.appendChild(submissionCard(s)));
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
  document.getElementById('loading').style.display = 'none';

  if (!profile || !['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('noAccess').style.display = 'block';
    return;
  }

  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';

  await renderQueue();
}

init();
