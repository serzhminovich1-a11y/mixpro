const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

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
}

function lessonRow(l, idx, status){
  const a = document.createElement('a');
  a.className = 'lesson-row';
  a.href = 'lesson.html?lesson=' + l.id;
  const done = status === 'completed';
  a.innerHTML = `
    <div class="lesson-idx">${idx + 1}</div>
    <div class="lesson-title">${l.title}</div>
    <div class="lesson-status ${done ? 'done' : ''}">${done ? '✓ Пройдено' : 'Не пройдено'}</div>`;
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
    return;
  }

  const { data: progress } = await SB.from('lesson_progress')
    .select('lesson_id, status').eq('user_id', currentUid)
    .in('lesson_id', lessons.map(l => l.id));
  const progressMap = new Map((progress || []).map(p => [p.lesson_id, p.status]));

  list.innerHTML = '';
  lessons.forEach((l, idx) => list.appendChild(lessonRow(l, idx, progressMap.get(l.id))));
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
  if (profile && (profile.role === 'MENTOR' || profile.role === 'ADMIN')) {
    document.getElementById('adminLink').style.display = '';
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
