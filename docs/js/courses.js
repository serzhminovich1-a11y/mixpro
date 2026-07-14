import { SB, getSession, getMyProfile } from './sb_client.js';
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_CERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>';
const ICON_MANAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

let currentUid = null;
let canManageCourses = false;

function courseCard(c){
  const wrap = document.createElement('div');
  wrap.className = 'course-card-wrap';

  const a = document.createElement('a');
  a.className = 'course-card';
  a.href = 'courses.html?course=' + c.id;
  a.innerHTML = `
    <div class="course-cat">${c.category || 'курс'} · ${c.difficulty_level || ''}</div>
    <div class="course-title">${c.title}</div>
    <div class="course-desc">${c.description || ''}</div>`;
  wrap.appendChild(a);

  if (canManageCourses) {
    const manageBtn = document.createElement('a');
    manageBtn.className = 'course-manage-btn';
    manageBtn.href = 'admin.html#courses';
    manageBtn.title = 'Редактировать или удалить курс — в панели управления';
    manageBtn.innerHTML = ICON_MANAGE;
    wrap.appendChild(manageBtn);
  }

  return wrap;
}

async function renderCourseList(profilePromise){
  const [{ data, error }, profile] = await Promise.all([
    SB.from('courses').select('*').order('created_at', { ascending: true }),
    profilePromise,
  ]);
  canManageCourses = profile && ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role);
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
  // Задания курса не зависят от урока/прогресса — грузим их сразу
  // параллельно, а не после списка уроков
  const assignmentsPromise = renderAssignments(courseId);

  const [{ data: course }, { data: lessons }] = await Promise.all([
    SB.from('courses').select('*').eq('id', courseId).single(),
    SB.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
  ]);
  if (!course) {
    document.getElementById('courseTitle').textContent = 'Курс не найден';
    await assignmentsPromise;
    return;
  }
  document.getElementById('courseTitle').textContent = course.title;
  document.getElementById('courseDesc').textContent = course.description || '';

  const list = document.getElementById('lessonList');
  const certBanner = document.getElementById('certBanner');
  certBanner.style.display = 'none';
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

    const allDone = lessons.every(l => progressMap.get(l.id) === 'completed');
    if (allDone) {
      certBanner.style.display = 'flex';
      certBanner.innerHTML = `${ICON_CERT}<div>Курс пройден полностью<span>Сертификат появился в разделе "Сертификаты" в твоём профиле</span></div>`;
    }
  }

  await assignmentsPromise;
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

export async function mount(root) {
  const session = await getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;

  const courseId = new URLSearchParams(location.search).get('course');
  // Профиль (для прав автора курсов) не нужен для самих данных курса —
  // грузим его параллельно с уроками/списком курсов, а не перед ними.
  // getMyProfile() уже кэширован в sb_client.js, так что если профиль
  // только что грузился на другом SPA-экране — тут это вообще бесплатно.
  const profilePromise = getMyProfile();
  const viewPromise = courseId ? renderCourseView(courseId) : renderCourseList(profilePromise);

  const profile = await profilePromise;
  const canAuthor = profile && ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role);
  // adminLink/verifyLink живут в <nav>, которая теперь может быть от
  // любой из пяти SPA-страниц — verifyLink специфична для Курсов и
  // есть не везде, поэтому без null-проверки тут (в отличие от adminLink,
  // который сейчас есть на всех пяти) будет падать.
  if (canAuthor) {
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = '';
  } else {
    const verifyLink = document.getElementById('verifyLink');
    if (verifyLink) verifyLink.style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);

  document.getElementById('loading').style.display = 'none';
  if (courseId) {
    document.getElementById('courseView').style.display = 'flex';
    document.getElementById('courseView').style.flexDirection = 'column';
    document.getElementById('courseView').style.gap = '20px';
  } else {
    document.getElementById('listView').style.display = 'flex';
    document.getElementById('listView').style.flexDirection = 'column';
    document.getElementById('listView').style.gap = '24px';
  }

  await viewPromise;
}

export function unmount() {
  // Ни таймеров, ни аудио, ни подписок на этом экране нет — подчищать нечего.
}
