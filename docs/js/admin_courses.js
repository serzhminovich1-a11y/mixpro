const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const TUS_ENDPOINT = `https://${SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/upload/resumable`;

let currentUid = null;
let currentSession = null;

// Докачиваемая загрузка (TUS): если связь оборвётся и пользователь выберет
// тот же файл ещё раз, tus-js-client узнает его по отпечатку и продолжит
// с того места, где остановилось, а не с нуля.
function tusUploadFile({ file, bucket, path, onProgress }){
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${currentSession.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // Supabase требует ровно 6MB
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => onProgress && onProgress(bytesUploaded, bytesTotal),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    });
  });
}

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

function escapeAttr(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function handleRenameLesson(lesson){
  const newTitle = prompt('Новое название урока:', lesson.title);
  if (newTitle == null) return;
  const trimmed = newTitle.trim();
  if (!trimmed || trimmed === lesson.title) return;
  const { error } = await SB.from('lessons').update({ title: trimmed }).eq('id', lesson.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  renderCoursesAdmin();
}

async function handleDeleteLesson(lesson){
  if (!confirm(`Удалить урок "${lesson.title}"?`)) return;
  if (lesson.content_url) await SB.storage.from('lessons').remove([lesson.content_url]);
  const { error } = await SB.from('lessons').delete().eq('id', lesson.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  renderCoursesAdmin();
}

async function handleDeleteCourse(course, lessons){
  if (!confirm(`Удалить курс "${course.title}" вместе со всеми уроками (${lessons.length})? Это нельзя отменить.`)) return;
  const paths = lessons.filter(l => l.content_url).map(l => l.content_url);
  if (paths.length) await SB.storage.from('lessons').remove(paths);
  const { error } = await SB.from('courses').delete().eq('id', course.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  renderCoursesAdmin();
}

function lessonAdminRow(l){
  const row = document.createElement('div');
  row.className = 'admin-lesson-row';
  row.innerHTML = `
    <span>${l.order_index + 1}. ${escapeHtml(l.title)}</span>
    <span style="display:flex;align-items:center;gap:8px">
      <span>${l.content_url ? '🎬 видео есть' : '— без видео'}</span>
      <button type="button" class="icon-btn" title="Переименовать">✏️</button>
      <button type="button" class="icon-btn" title="Удалить урок">🗑</button>
    </span>`;
  const [renameBtn, delBtn] = row.querySelectorAll('.icon-btn');
  renameBtn.addEventListener('click', () => handleRenameLesson(l));
  delBtn.addEventListener('click', () => handleDeleteLesson(l));
  return row;
}

function formatMb(bytes){ return (bytes / 1048576).toFixed(1); }

async function handleAddLesson(courseId, form){
  const titleInput = form.querySelector('.lTitle');
  const fileInput = form.querySelector('.lFile');
  const statusEl = form.querySelector('.lStatus');
  const btn = form.querySelector('.lBtn');
  const progressWrap = form.querySelector('.upload-progress');
  const progressFill = form.querySelector('.upload-progress-fill');
  const progressLabel = form.querySelector('.upload-progress-label');
  const title = titleInput.value.trim();
  const file = fileInput.files[0];
  if (!title) return;

  btn.disabled = true;
  statusEl.textContent = file ? '' : 'Сохраняем...';
  statusEl.className = 'form-status';

  const { count } = await SB.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const orderIndex = count || 0;

  let contentUrl = null;
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${courseId}/${Date.now()}_${safeName}`;
    progressWrap.classList.add('active');
    progressFill.style.width = '0%';
    progressLabel.textContent = 'Начинаем загрузку...';
    try {
      await tusUploadFile({
        file, bucket: 'lessons', path,
        onProgress: (uploaded, total) => {
          const pct = Math.round((uploaded / total) * 100);
          progressFill.style.width = pct + '%';
          progressLabel.textContent = `${pct}% · ${formatMb(uploaded)} / ${formatMb(total)} МБ`;
        },
      });
      contentUrl = path;
    } catch (err) {
      statusEl.textContent = 'Загрузка прервалась: ' + (err && err.message ? err.message : 'проблема с сетью') + '. Выбери тот же файл и нажми кнопку ещё раз — докачается с места обрыва.';
      statusEl.className = 'form-status error';
      btn.disabled = false;
      progressWrap.classList.remove('active');
      return;
    }
    progressWrap.classList.remove('active');
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
  titleInput.value = '';
  fileInput.value = '';
  renderCoursesAdmin();
}

function courseAdminBlock(course, lessons){
  const block = document.createElement('div');
  block.className = 'admin-course-block';

  const head = document.createElement('div');
  head.className = 'admin-course-head';
  block.appendChild(head);

  function renderHeadView(){
    head.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span>${escapeHtml(course.title)}</span>
        <span style="display:flex;gap:6px">
          <button type="button" class="icon-btn cEditBtn" title="Редактировать курс">✏️</button>
          <button type="button" class="icon-btn cDelBtn" title="Удалить курс">🗑</button>
        </span>
      </div>`;
    head.querySelector('.cEditBtn').addEventListener('click', renderHeadEdit);
    head.querySelector('.cDelBtn').addEventListener('click', () => handleDeleteCourse(course, lessons));
  }

  function renderHeadEdit(){
    head.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;font-weight:400">
        <div class="field"><input type="text" class="ceTitle" value="${escapeAttr(course.title)}"></div>
        <div class="field"><textarea class="ceDesc">${escapeHtml(course.description || '')}</textarea></div>
        <div class="form-row">
          <div class="field"><input type="text" class="ceCategory" value="${escapeAttr(course.category || '')}"></div>
          <div class="field"><select class="ceDifficulty">
            <option value="beginner">Новичок</option>
            <option value="intermediate">Средний</option>
            <option value="advanced">Продвинутый</option>
          </select></div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="submit-btn ceSave">Сохранить</button>
          <button type="button" class="nav-btn ceCancel">Отмена</button>
        </div>
        <div class="form-status ceStatus"></div>
      </div>`;
    head.querySelector('.ceDifficulty').value = course.difficulty_level || 'beginner';
    head.querySelector('.ceCancel').addEventListener('click', renderHeadView);
    head.querySelector('.ceSave').addEventListener('click', handleSaveCourse);
  }

  async function handleSaveCourse(){
    const statusEl = head.querySelector('.ceStatus');
    const saveBtn = head.querySelector('.ceSave');
    const title = head.querySelector('.ceTitle').value.trim();
    if (!title) { statusEl.textContent = 'Название не может быть пустым'; statusEl.className = 'form-status error'; return; }
    saveBtn.disabled = true;
    const updated = {
      title,
      description: head.querySelector('.ceDesc').value.trim(),
      category: head.querySelector('.ceCategory').value.trim(),
      difficulty_level: head.querySelector('.ceDifficulty').value,
    };
    const { error } = await SB.from('courses').update(updated).eq('id', course.id);
    if (error) {
      statusEl.textContent = 'Ошибка: ' + error.message;
      statusEl.className = 'form-status error';
      saveBtn.disabled = false;
      return;
    }
    Object.assign(course, updated);
    renderHeadView();
  }

  renderHeadView();

  lessons.forEach(l => block.appendChild(lessonAdminRow(l)));

  const formWrap = document.createElement('div');
  formWrap.style.cssText = 'padding:14px 18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';
  formWrap.innerHTML = `
    <div class="form-row">
      <div class="field"><input type="text" class="lTitle" placeholder="Название урока"></div>
    </div>
    <div class="field"><input type="file" class="lFile" accept="video/*"></div>
    <div class="upload-progress">
      <div class="upload-progress-bar"><div class="upload-progress-fill"></div></div>
      <div class="upload-progress-label"></div>
    </div>
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
  currentSession = session;

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
