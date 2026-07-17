const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_CERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>';
const ICON_MANAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

let currentUid = null;
let canManageCourses = false;

function courseSummary(html){
  const el = document.createElement('div');
  el.innerHTML = window.sanitizeRichHtml ? sanitizeRichHtml(html || '') : (html || '');
  return (el.textContent || '').trim().replace(/\s+/g, ' ');
}

function courseCard(c){
  const wrap = document.createElement('div');
  wrap.className = 'course-card-wrap';

  const a = document.createElement('a');
  a.className = 'course-card';
  a.href = 'courses.html?course=' + c.id;
  a.innerHTML = `
    <div class="course-cat">${c.category || 'курс'} · ${c.difficulty_level || ''}</div>
    <div class="course-title">${c.title}</div>
    <div class="course-desc">${courseSummary(c.description)}</div>`;
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
  const [{ data, error }, { data: profile }] = await Promise.all([
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
    ${l.cover_image_url ? `<img class="lesson-cover" src="${l.cover_image_url}" alt="">` : ''}
    <div class="lesson-title">${l.title}</div>
    <div class="lesson-status ${done ? 'done' : ''}">${done ? ICON_CHECK_SM + ' Пройдено' : 'Не пройдено'}</div>`;
  return a;
}

function courseSectionBlock(section, index, lessons, progressMap, offset){
  const block = document.createElement('section');
  block.className = 'course-section-block';
  const completed = lessons.filter(l => progressMap.get(l.id) === 'completed').length;
  block.innerHTML = `<div class="course-section-head"><div><span class="course-section-number">${index + 1}.</span><span>${section.title}</span></div><span class="course-section-progress">${completed}/${lessons.length}</span></div>`;
  const rows = document.createElement('div');
  rows.className = 'course-section-lessons';
  lessons.forEach((lesson, lessonIndex) => rows.appendChild(lessonRow(lesson, offset + lessonIndex, progressMap.get(lesson.id))));
  block.appendChild(rows);
  return block;
}

async function renderCourseView(courseId){
  // Задания курса не зависят от урока/прогресса — грузим их сразу
  // параллельно, а не после списка уроков
  const assignmentsPromise = renderAssignments(courseId);

  const [{ data: course }, { data: lessons }, { data: sections }] = await Promise.all([
    SB.from('courses').select('*').eq('id', courseId).single(),
    SB.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
    SB.from('course_sections').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
  ]);
  if (!course) {
    document.getElementById('courseTitle').textContent = 'Курс не найден';
    await assignmentsPromise;
    return;
  }
  document.getElementById('courseTitle').textContent = course.title;
  const desc = document.getElementById('courseDesc');
  desc.className = 'course-rich-content';
  desc.innerHTML = window.sanitizeRichHtml ? sanitizeRichHtml(course.description || '') : '';

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
    let offset = 0;
    const renderedSections = sections || [];
    let visibleSectionIndex = 0;
    renderedSections.forEach(section => {
      const sectionLessons = lessons.filter(l => l.section_id === section.id);
      if (!sectionLessons.length) return;
      list.appendChild(courseSectionBlock(section, visibleSectionIndex++, sectionLessons, progressMap, offset));
      offset += sectionLessons.length;
    });
    const ungrouped = lessons.filter(l => !l.section_id);
    if (ungrouped.length) {
      if (renderedSections.length) {
        list.appendChild(courseSectionBlock({ title: 'Дополнительные материалы' }, visibleSectionIndex, ungrouped, progressMap, offset));
      } else {
        ungrouped.forEach((l, idx) => list.appendChild(lessonRow(l, idx, progressMap.get(l.id))));
      }
    }
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

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).select().then(({ data, error }) => { if (error) console.error('last_seen_at update failed:', error); else if (!data || !data.length) console.warn('last_seen_at: 0 строк обновлено — возможно, истекла сессия'); });

  const courseId = new URLSearchParams(location.search).get('course');
  // Профиль (для прав автора курсов) не нужен для самих данных курса —
  // грузим его параллельно с уроками/списком курсов, а не перед ними
  // Promise.resolve() оборачивает builder в обычный промис — иначе
  // await в двух местах (тут и в renderCourseList) выполнит запрос дважды
  const profilePromise = Promise.resolve(SB.from('profiles').select('role').eq('id', currentUid).single());
  const viewPromise = courseId ? renderCourseView(courseId) : renderCourseList(profilePromise);

  const { data: profile } = await profilePromise;
  const canAuthor = profile && ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role);
  if (canAuthor) {
    document.getElementById('adminLink').style.display = '';
  } else {
    document.getElementById('verifyLink').style.display = '';
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

init();
