const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;

async function handleCreateCourse(e){
  e.preventDefault();
  const btn = document.getElementById('courseBtn');
  const status = document.getElementById('courseStatus');
  btn.disabled = true;
  status.textContent = '';
  status.className = 'form-status';

  const { error } = await SB.from('courses').insert({
    title: document.getElementById('cTitle').value.trim(),
    description: document.getElementById('cDesc').value.trim(),
    category: document.getElementById('cCategory').value.trim(),
    difficulty_level: document.getElementById('cDifficulty').value,
    created_by: currentUid,
  });

  btn.disabled = false;
  if (error) {
    status.textContent = 'Ошибка: ' + error.message;
    status.className = 'form-status error';
    return;
  }
  status.textContent = 'Курс создан!';
  status.className = 'form-status ok';
  document.getElementById('courseForm').reset();
  renderCoursesAdmin();
}

function lessonAdminRow(l){
  const row = document.createElement('div');
  row.className = 'admin-lesson-row';
  row.innerHTML = `<span>${l.order_index + 1}. ${l.title}</span><span>${l.content_url ? '🎬 видео есть' : '— без видео'}</span>`;
  return row;
}

async function handleAddLesson(courseId, form){
  const titleInput = form.querySelector('.lTitle');
  const fileInput = form.querySelector('.lFile');
  const statusEl = form.querySelector('.lStatus');
  const btn = form.querySelector('.lBtn');
  const title = titleInput.value.trim();
  const file = fileInput.files[0];
  if (!title) return;

  btn.disabled = true;
  statusEl.textContent = file ? 'Загружаем видео...' : 'Сохраняем...';
  statusEl.className = 'form-status';

  const { count } = await SB.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const orderIndex = count || 0;

  let contentUrl = null;
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${courseId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await SB.storage.from('lessons').upload(path, file);
    if (upErr) {
      statusEl.textContent = 'Не удалось загрузить видео: ' + upErr.message;
      statusEl.className = 'form-status error';
      btn.disabled = false;
      return;
    }
    contentUrl = path;
  }

  const { error: insErr } = await SB.from('lessons').insert({
    course_id: courseId,
    title,
    content_url: contentUrl,
    order_index: orderIndex,
  });

  btn.disabled = false;
  if (insErr) {
    statusEl.textContent = 'Ошибка: ' + insErr.message;
    statusEl.className = 'form-status error';
    return;
  }
  statusEl.textContent = 'Урок добавлен!';
  statusEl.className = 'form-status ok';
  form.reset();
  renderCoursesAdmin();
}

function courseAdminBlock(course, lessons){
  const block = document.createElement('div');
  block.className = 'admin-course-block';

  const head = document.createElement('div');
  head.className = 'admin-course-head';
  head.textContent = course.title;
  block.appendChild(head);

  lessons.forEach(l => block.appendChild(lessonAdminRow(l)));

  const formWrap = document.createElement('div');
  formWrap.style.cssText = 'padding:14px 18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';
  formWrap.innerHTML = `
    <div class="form-row">
      <div class="field"><input type="text" class="lTitle" placeholder="Название урока"></div>
    </div>
    <div class="field"><input type="file" class="lFile" accept="video/*"></div>
    <button type="button" class="submit-btn lBtn">Добавить урок</button>
    <div class="form-status lStatus"></div>`;
  formWrap.querySelector('.lBtn').addEventListener('click', () => handleAddLesson(course.id, formWrap));
  block.appendChild(formWrap);

  return block;
}

async function renderCoursesAdmin(){
  const wrap = document.getElementById('coursesAdminList');
  const { data: courses } = await SB.from('courses').select('*').order('created_at', { ascending: true });
  if (!courses || courses.length === 0) {
    wrap.innerHTML = '<div class="empty">Курсов пока нет — создай первый выше</div>';
    return;
  }
  const { data: allLessons } = await SB.from('lessons').select('*').order('order_index', { ascending: true });
  wrap.innerHTML = '';
  courses.forEach(c => {
    const lessons = (allLessons || []).filter(l => l.course_id === c.id);
    wrap.appendChild(courseAdminBlock(c, lessons));
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
  document.getElementById('loading').style.display = 'none';

  if (!profile || (profile.role !== 'MENTOR' && profile.role !== 'ADMIN')) {
    document.getElementById('noAccess').style.display = 'block';
    return;
  }

  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';

  document.getElementById('courseForm').addEventListener('submit', handleCreateCourse);
  await renderCoursesAdmin();
}

init();
