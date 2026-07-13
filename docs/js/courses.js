const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px"><path d="M20 6 9 17l-5-5"/></svg>';

let currentUid = null;

function courseCard(c){
  const a = document.createElement('a');
  a.className = 'course-card';
  a.href = 'courses.html?course=' + c.id;
  a.innerHTML = `
    <div class="course-cat">${c.category || 'курс'} · ${c.difficulty_level || ''}</div>
    <div class="course-title">${c.title}</div>
    <div class="course-desc">${c.description || ''}</div>`;
  return a;
}

async function renderCourseList(){
  const { data, error } = await SB.from('courses').select('*').order('created_at', { ascending: true });
  const grid = document.getElementById('courseGrid');
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<div class="empty">Пока нет ни одного курса</div>';
    return;
  }
  grid.innerHTML = '';
  data.forEach(c => grid.appendChild(courseCard(c)));
  if (window.animateChildren) animateChildren(grid);
}

function lessonRow(l, idx, status){
  const a = document.createElement('a');
  a.className = 'lesson-row';
  a.href = 'lesson.html?lesson=' + l.id;
  const done = status === 'completed';
  a.innerHTML = `
    <div class="lesson-idx">${idx + 1}</div>
    <div class="lesson-title">${l.title}</div>
    <div class="lesson-status ${done ? 'done' : ''}">${done ? ICON_CHECK_SM + ' Пройдено' : 'Не пройдено'}</div>`;
  return a;
}

async function renderCourseView(courseId){
  const { data: course } = await SB.from('courses').select('*').eq('id', courseId).single();
  if (!course) {
    document.getElementById('courseTitle').textContent = 'Курс не найден';
    return;
  }
  document.getElementById('courseTitle').textContent = course.title;
  document.getElementById('courseDesc').textContent = course.description || '';

  const { data: lessons } = await SB.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true });
  const list = document.getElementById('lessonList');
  if (!lessons || lessons.length === 0) {
    list.innerHTML = '<div class="empty">В этом курсе пока нет уроков</div>';
  } else {
    const { data: progress } = await SB.from('lesson_progress')
      .select('lesson_id, status').eq('user_id', currentUid)
      .in('lesson_id', lessons.map(l => l.id));
    const progressMap = new Map((progress || []).map(p => [p.lesson_id, p.status]));

    list.innerHTML = '';
    lessons.forEach((l, idx) => list.appendChild(lessonRow(l, idx, progressMap.get(l.id))));
    if (window.animateChildren) animateChildren(list);
  }

  await renderAssignments(courseId);
}

async function handleSubmitAssignment(assignmentId, select, card){
  const projectId = select.value;
  if (!projectId) return;
  const btn = card.querySelector('.aSubmitBtn');
  btn.disabled = true;
  const { error } = await SB.from('assignment_submissions').insert({
    assignment_id: assignmentId,
    user_id: currentUid,
    project_id: projectId,
  });
  if (error) {
    alert('Не удалось отправить: ' + error.message);
    btn.disabled = false;
    return;
  }
  await renderAssignments(new URLSearchParams(location.search).get('course'));
}

function assignmentCard(a, submission, review, myProjects){
  const card = document.createElement('div');
  card.className = 'assignment-card';

  const badgeMap = { submitted: 'На проверке', approved: 'Принято', rejected: 'Отклонено' };
  let statusHtml = '';
  if (submission) {
    const cls = submission.status === 'approved' ? 'approved' : submission.status === 'rejected' ? 'rejected' : 'submitted';
    statusHtml = `<div class="a-status-badge ${cls}">${badgeMap[cls] || submission.status}</div>`;
    if (review) {
      statusHtml += `<div class="a-feedback"><b>Оценка: ${review.score ?? '—'} / ${a.max_score}</b><br>${review.feedback || ''}</div>`;
    }
  }

  card.innerHTML = `
    <div class="assignment-title">${a.title}</div>
    ${a.description ? `<div class="assignment-desc">${a.description}</div>` : ''}
    ${a.requirements ? `<div class="assignment-req">${a.requirements}</div>` : ''}
    <div class="assignment-meta">макс. ${a.max_score} баллов</div>
    ${statusHtml}`;

  if (!submission) {
    if (!myProjects || myProjects.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty';
      note.style.padding = '8px 0';
      note.innerHTML = 'Сначала загрузи работу в <a href="portfolio.html" style="color:var(--cyan)">портфолио</a>, потом сможешь сдать это задание';
      card.appendChild(note);
    } else {
      const row = document.createElement('div');
      row.className = 'a-submit-row';
      const options = myProjects.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      row.innerHTML = `<select class="aProjectSelect">${options}</select><button type="button" class="submit-btn aSubmitBtn">Сдать</button>`;
      row.querySelector('.aSubmitBtn').addEventListener('click', () => handleSubmitAssignment(a.id, row.querySelector('.aProjectSelect'), card));
      card.appendChild(row);
    }
  }

  return card;
}

async function renderAssignments(courseId){
  const section = document.getElementById('assignmentsSection');
  const list = document.getElementById('assignmentList');

  const { data: assignments } = await SB.from('assignments').select('*').eq('course_id', courseId).order('created_at', { ascending: true });
  if (!assignments || assignments.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const [{ data: submissions }, { data: myProjects }] = await Promise.all([
    SB.from('assignment_submissions').select('*').eq('user_id', currentUid).in('assignment_id', assignments.map(a => a.id)),
    SB.from('projects').select('id, title').eq('user_id', currentUid).order('created_at', { ascending: false }),
  ]);
  const submissionMap = new Map((submissions || []).map(s => [s.assignment_id, s]));

  const submissionIds = (submissions || []).map(s => s.id);
  let reviewMap = new Map();
  if (submissionIds.length) {
    const { data: reviews } = await SB.from('reviews').select('*').in('submission_id', submissionIds).order('created_at', { ascending: false });
    (reviews || []).forEach(r => { if (!reviewMap.has(r.submission_id)) reviewMap.set(r.submission_id, r); });
  }

  list.innerHTML = '';
  assignments.forEach(a => {
    const submission = submissionMap.get(a.id);
    const review = submission ? reviewMap.get(submission.id) : null;
    list.appendChild(assignmentCard(a, submission, review, myProjects));
  });
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
  const canAuthor = profile && ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role);
  if (canAuthor) {
    document.getElementById('adminLink').style.display = '';
  } else {
    document.getElementById('verifyLink').style.display = '';
  }

  const courseId = new URLSearchParams(location.search).get('course');
  document.getElementById('loading').style.display = 'none';

  if (courseId) {
    document.getElementById('courseView').style.display = 'flex';
    document.getElementById('courseView').style.flexDirection = 'column';
    document.getElementById('courseView').style.gap = '20px';
    await renderCourseView(courseId);
  } else {
    document.getElementById('listView').style.display = 'flex';
    document.getElementById('listView').style.flexDirection = 'column';
    document.getElementById('listView').style.gap = '24px';
    await renderCourseList();
  }
}

init();
