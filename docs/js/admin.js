const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);
const TUS_ENDPOINT = `https://${SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/upload/resumable`;

let currentUid = null;
let currentSession = null;
let currentRole = null;
const loadedSections = new Set();

function escapeAttr(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// Контурные SVG-иконки вместо эмодзи
function aIcon(path){ return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
const ICON_PENCIL_A = aIcon('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>');
const ICON_TRASH_A = aIcon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>');
const ICON_VIDEO_A = aIcon('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>');
const ICON_HEADPHONES_A = aIcon('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>');
const ICON_CHECK_A = aIcon('<path d="M20 6 9 17l-5-5"/>');
const ICON_CLIPBOARD_A = aIcon('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>');
const ICON_STEPS_A = aIcon('<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>');
const ICON_UP_A = aIcon('<path d="m18 15-6-6-6 6"/>');
const ICON_DOWN_A = aIcon('<path d="m6 9 6 6 6-6"/>');
const ICON_X_A = aIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
// Иконки расширенного тулбара конструктора теории (Stepik-подобный редактор)
const ICON_LIST_UL_A = aIcon('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>');
const ICON_LIST_OL_A = aIcon('<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>');
const ICON_ALIGN_L_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>');
const ICON_ALIGN_C_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/>');
const ICON_ALIGN_R_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>');
const ICON_LINK_A = aIcon('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>');
const ICON_UNLINK_A = aIcon('<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 3.9 8.11"/><line x1="8" x2="16" y1="12" y2="12"/><line x1="3" x2="21" y1="3" y2="21"/>');
const ICON_IMAGE_A = aIcon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
const ICON_FILE_A = aIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>');
const ICON_TABLE_A = aIcon('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>');
const ICON_CODE_A = aIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
const ICON_UNDO_A = aIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v1"/>');
const ICON_REDO_A = aIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v1"/>');
const ICON_QUOTE_A = aIcon('<path d="M3 21c3 0 6-2 6-6V7H3v8h3c0 1.5-1 3-3 3zM15 21c3 0 6-2 6-6V7h-6v8h3c0 1.5-1 3-3 3z"/>');

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

/* ══════════════════════════════════════
   НАВИГАЦИЯ МЕЖДУ РАЗДЕЛАМИ
   ══════════════════════════════════════ */
function activateSection(name){
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  loadSection(name);
}

// Клик по пункту меню только меняет адрес — саму панель переключает
// обработчик hashchange ниже. Так кнопка "назад" в браузере тоже
// корректно возвращает на предыдущий раздел, а не оставляет старую
// панель на экране с уже другим адресом в строке.
function switchSection(name){
  if (location.hash.slice(1) === name) { activateSection(name); return; }
  location.hash = name;
}

window.addEventListener('hashchange', () => {
  activateSection(location.hash.slice(1) || 'overview');
});

async function loadSection(name){
  if (loadedSections.has(name)) return;
  loadedSections.add(name);
  if (name === 'overview') await renderOverview();
  if (name === 'courses') await renderCoursesAdmin();
  if (name === 'glossary') await renderGlossaryAdmin();
  if (name === 'assignments') await renderAssignmentQueue();
  if (name === 'verify') await renderVerifyQueue();
  if (name === 'reports') await renderReportsQueue();
  if (name === 'users') await renderUsers(null);
}

/* ══════════════════════════════════════
   ОБЗОР
   ══════════════════════════════════════ */
async function renderOverview(){
  const grid = document.getElementById('overviewStats');
  const boxes = [];

  const { count: coursesCount } = await SB.from('courses').select('id', { count: 'exact', head: true });
  boxes.push(`<button type="button" class="stat-box" onclick="switchSection('courses')" style="text-align:left;cursor:pointer;border:1px solid var(--border);width:100%"><div class="n">${coursesCount ?? 0}</div><div class="l">Курсов</div></button>`);

  const { count: pendingAssignments } = await SB.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
  boxes.push(`<button type="button" class="stat-box ${pendingAssignments ? 'warn' : ''}" onclick="switchSection('assignments')" style="text-align:left;cursor:pointer;border:1px solid var(--border);width:100%"><div class="n">${pendingAssignments ?? 0}</div><div class="l">Заданий на проверке</div></button>`);

  if (['MENTOR', 'ADMIN'].includes(currentRole)) {
    const { count: pendingVerify } = await SB.from('verification_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    boxes.push(`<button type="button" class="stat-box ${pendingVerify ? 'warn' : ''}" onclick="switchSection('verify')" style="text-align:left;cursor:pointer;border:1px solid var(--border);width:100%"><div class="n">${pendingVerify ?? 0}</div><div class="l">Заявок на верификацию</div></button>`);

    const { count: pendingReports } = await SB.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    boxes.push(`<button type="button" class="stat-box ${pendingReports ? 'warn' : ''}" onclick="switchSection('reports')" style="text-align:left;cursor:pointer;border:1px solid var(--border);width:100%"><div class="n">${pendingReports ?? 0}</div><div class="l">Жалоб на рассмотрении</div></button>`);
  }

  if (currentRole === 'ADMIN') {
    const { count: usersCount } = await SB.from('profiles').select('id', { count: 'exact', head: true });
    boxes.push(`<button type="button" class="stat-box" onclick="switchSection('users')" style="text-align:left;cursor:pointer;border:1px solid var(--border);width:100%"><div class="n">${usersCount ?? 0}</div><div class="l">Пользователей</div></button>`);
  }

  grid.classList.add('reveal-group');
  grid.innerHTML = boxes.join('');
  grid.querySelectorAll('.stat-box').forEach(box => {
    const n = box.querySelector('.n');
    const target = parseInt(n.textContent, 10) || 0;
    if (window.animateIn) animateIn(box);
    if (window.animateNumber) animateNumber(n, target, { format: v => Math.round(v) });
  });
  updateSidebarBadges();
}

async function updateSidebarBadges(){
  const { count: pendingAssignments } = await SB.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
  const badgeA = document.getElementById('badgeAssignments');
  if (pendingAssignments) { badgeA.textContent = pendingAssignments; badgeA.style.display = ''; } else { badgeA.style.display = 'none'; }

  if (['MENTOR', 'ADMIN'].includes(currentRole)) {
    const { count: pendingVerify } = await SB.from('verification_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const badgeV = document.getElementById('badgeVerify');
    if (pendingVerify) { badgeV.textContent = pendingVerify; badgeV.style.display = ''; } else { badgeV.style.display = 'none'; }

    const { count: pendingReports } = await SB.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const badgeR = document.getElementById('badgeReports');
    if (pendingReports) { badgeR.textContent = pendingReports; badgeR.style.display = ''; } else { badgeR.style.display = 'none'; }
  }
}

/* ══════════════════════════════════════
   КУРСЫ / УРОКИ / ЗАДАНИЯ (создание)
   ══════════════════════════════════════ */
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
      chunkSize: 6 * 1024 * 1024,
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

// Общий публичный бакет для материалов, встроенных в описание курса и теорию:
// изображения, документы, аудио и короткие видео. Видео целого урока остаётся
// в закрытом бакете lessons и добавляется отдельным полем ниже.
async function uploadCourseAsset(file){
  if (file.size > 100 * 1024 * 1024) throw new Error('Максимальный размер вложения — 100 МБ');
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${currentUid}/${Date.now()}_${safeName}`;
  await tusUploadFile({ file, bucket: 'course-assets', path });
  return {
    url: SB.storage.from('course-assets').getPublicUrl(path).data.publicUrl,
    name: file.name || 'Файл',
    type: file.type || '',
  };
}

function fullRichToolbarHtml(){
  return `
    <div class="rt-toolbar rt-toolbar-full">
      <button type="button" class="rt-btn" data-cmd="undo" data-tip="Отменить" aria-label="Отменить">${ICON_UNDO_A}</button><button type="button" class="rt-btn" data-cmd="redo" data-tip="Повторить" aria-label="Повторить">${ICON_REDO_A}</button>
      <span class="rt-sep"></span>
      <button type="button" class="rt-btn" data-cmd="bold" data-tip="Жирный" aria-label="Жирный"><b>Ж</b></button><button type="button" class="rt-btn" data-cmd="italic" data-tip="Курсив" aria-label="Курсив"><i>К</i></button><button type="button" class="rt-btn" data-cmd="underline" data-tip="Подчёркнутый" aria-label="Подчёркнутый"><u>Ч</u></button><button type="button" class="rt-btn rt-code-btn" data-tip="Блок кода" aria-label="Блок кода">&lt;/&gt;</button>
      <select class="rt-select rt-style" title="Стиль абзаца"><option value="">Стили</option><option value="p">Обычный текст</option><option value="h2">Заголовок 2</option><option value="h3">Заголовок 3</option><option value="h4">Заголовок 4</option><option value="blockquote">Цитата</option></select>
      <div class="rt-color-wrap">
        <button type="button" class="rt-btn rt-color-btn" data-tip="Цвет текста" aria-label="Цвет текста">A</button>
        <div class="rt-color-pop" hidden>
          <div class="rt-color-row rt-color-presets"></div>
          <div class="rt-color-row rt-color-recent"></div>
          <label class="rt-color-custom" title="Свой цвет">+<input type="color" class="rt-color" value="#ff5a36"></label>
        </div>
      </div>
      <span class="rt-sep"></span>
      <button type="button" class="rt-btn" data-cmd="insertUnorderedList" data-tip="Маркированный список" aria-label="Маркированный список">${ICON_LIST_UL_A}</button><button type="button" class="rt-btn" data-cmd="insertOrderedList" data-tip="Нумерованный список" aria-label="Нумерованный список">${ICON_LIST_OL_A}</button>
      <button type="button" class="rt-btn rt-quote-btn" data-tip="Цитата" aria-label="Цитата">${ICON_QUOTE_A}</button>
      <span class="rt-sep"></span>
      <button type="button" class="rt-btn" data-cmd="justifyLeft" data-tip="По левому краю" aria-label="По левому краю">${ICON_ALIGN_L_A}</button><button type="button" class="rt-btn" data-cmd="justifyCenter" data-tip="По центру" aria-label="По центру">${ICON_ALIGN_C_A}</button><button type="button" class="rt-btn" data-cmd="justifyRight" data-tip="По правому краю" aria-label="По правому краю">${ICON_ALIGN_R_A}</button>
      <span class="rt-sep"></span>
      <button type="button" class="rt-btn rt-link-btn" data-tip="Вставить ссылку" aria-label="Вставить ссылку">${ICON_LINK_A}</button><button type="button" class="rt-btn" data-cmd="unlink" data-tip="Убрать ссылку" aria-label="Убрать ссылку">${ICON_UNLINK_A}</button>
      <button type="button" class="rt-btn rt-img-btn" data-tip="Добавить изображение" aria-label="Добавить изображение">${ICON_IMAGE_A}</button><input type="file" class="rt-img-input" accept="image/*" hidden>
      <button type="button" class="rt-btn rt-file-btn" data-tip="Прикрепить файл" aria-label="Прикрепить файл">${ICON_FILE_A}</button><input type="file" class="rt-file-input" hidden>
      <button type="button" class="rt-btn rt-video-btn" data-tip="Добавить видео по ссылке" aria-label="Добавить видео по ссылке">${ICON_VIDEO_A}</button>
      <button type="button" class="rt-btn rt-formula-btn" data-tip="Вставить формулу или символ" aria-label="Вставить формулу или символ">Σ</button>
      <button type="button" class="rt-btn rt-table-btn" data-tip="Вставить таблицу" aria-label="Вставить таблицу">${ICON_TABLE_A}</button>
      <span class="rt-sep"></span><button type="button" class="rt-btn rt-source-btn" data-tip="Исходный код (HTML)" aria-label="Исходный код (HTML)">${ICON_CODE_A}</button>
    </div>`;
}

function courseRichEditorHtml(className, value){
  return `<div class="course-rich-editor">${fullRichToolbarHtml()}<div class="rt-editable rt-editable-large ${className}" contenteditable="true" data-placeholder="Расскажите о курсе, добавьте материалы и полезные ссылки">${sanitizeRichHtml(value || '')}</div><div class="rt-editor-hint">Текст, ссылки, изображения, файлы и видео — всё в одном описании.</div></div>`;
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
    description: sanitizeRichHtml(document.getElementById('cDesc').innerHTML),
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
  document.getElementById('cDesc').innerHTML = '';
  renderCoursesAdmin();
}

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
  const wrap = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'admin-lesson-row';
  row.innerHTML = `
    <span class="admin-lesson-main">${l.cover_image_url ? `<img class="admin-lesson-cover" src="${escapeAttr(l.cover_image_url)}" alt="">` : '<span class="admin-lesson-cover admin-lesson-cover-empty">▶</span>'}<span>${l.order_index + 1}. ${escapeHtml(l.title)}</span></span>
    <span style="display:flex;align-items:center;gap:8px">
      <span>${l.content_url ? ICON_VIDEO_A + ' видео есть' : '— без видео'}</span>
      <button type="button" class="icon-btn" title="Редактировать содержание урока">${ICON_STEPS_A}</button>
      <button type="button" class="icon-btn" title="Переименовать">${ICON_PENCIL_A}</button>
      <button type="button" class="icon-btn" title="Удалить урок">${ICON_TRASH_A}</button>
    </span>`;
  const [stepsBtn, renameBtn, delBtn] = row.querySelectorAll('.icon-btn');
  renameBtn.addEventListener('click', () => handleRenameLesson(l));
  delBtn.addEventListener('click', () => handleDeleteLesson(l));

  const stepsPanel = document.createElement('div');
  stepsPanel.className = 'admin-steps-panel';
  stepsPanel.style.display = 'none';
  let stepsLoaded = false;
  stepsBtn.addEventListener('click', async () => {
    const opening = stepsPanel.style.display === 'none';
    stepsPanel.style.display = opening ? 'block' : 'none';
    if (opening && !stepsLoaded) { stepsLoaded = true; await renderStepsPanel(l, stepsPanel); }
  });

  wrap.appendChild(row);
  wrap.appendChild(stepsPanel);
  return wrap;
}

/* ══════════════════════════════════════
   ШАГИ УРОКА — конструктор (теория/тесты/сопоставление/сортировка/...)
   Правильный ответ пишется прямо в lesson_steps.correct_answer — эту
   таблицу видят только STAFF (RLS), студент получает шаги только через
   get_lesson_steps()/submit_step_answer() без этой колонки — см.
   022_lesson_steps.sql. Программирование с проверкой кода намеренно не
   делаем — нужен отдельный сервер-песочница, которого у сайта нет.
   ══════════════════════════════════════ */
const STEP_TYPE_LABELS_A = {
  theory: 'Теория', quiz_single: 'Тест (один верный)', quiz_multi: 'Тест (несколько верных)',
  text_answer: 'Ответ текстом', number_answer: 'Ответ числом',
  matching: 'Сопоставление', sorting: 'Сортировка',
};

// Перемешивает [0..n-1] — общий приём для matching/sorting: студенту
// показываем элементы в этом перемешанном порядке, а правильный порядок
// восстанавливаем по индексам, записанным в correct_answer.
function shufflePositions(n){
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stepFieldsHtml(type){
  switch (type) {
    case 'theory':
      return `
        <div class="course-rich-editor">${fullRichToolbarHtml()}<div class="rt-editable rt-editable-large sTheoryHtml" contenteditable="true" data-placeholder="Текст теории"></div><div class="rt-editor-hint">Добавляйте текст, ссылки, файлы и видео прямо по ходу урока.</div></div>`;
    case 'quiz_single':
    case 'quiz_multi':
      return `
        <div class="field"><label>Вопрос</label><input type="text" class="sQuestion" placeholder="Что означает Q-фактор в эквалайзере?"></div>
        <div class="field"><label>Варианты ответа — по одному на строку. Верный(-е) отметь звёздочкой * в начале строки</label><textarea class="sOptions" placeholder="*Ширина полосы среза&#10;Скорость атаки&#10;Порог срабатывания"></textarea></div>`;
    case 'text_answer':
      return `
        <div class="field"><label>Вопрос</label><input type="text" class="sQuestion" placeholder="Как называется запас громкости до клиппинга?"></div>
        <div class="field"><label>Принимаемые ответы — по одному на строку, любой из них засчитается</label><textarea class="sAccepted" placeholder="headroom&#10;хедрум"></textarea></div>`;
    case 'number_answer':
      return `
        <div class="field"><label>Вопрос</label><input type="text" class="sQuestion" placeholder="Стандартный уровень для стриминга по LUFS?"></div>
        <div class="form-row">
          <div class="field"><label>Правильное число</label><input type="number" step="any" class="sValue" placeholder="-14"></div>
          <div class="field"><label>Погрешность ±</label><input type="number" step="any" class="sTolerance" value="0"></div>
          <div class="field"><label>Единица (необязательно)</label><input type="text" class="sUnit" placeholder="LUFS"></div>
        </div>`;
    case 'matching':
      return `
        <div class="field"><label>Вопрос/инструкция (необязательно)</label><input type="text" class="sQuestion" placeholder="Сопоставь термин и определение"></div>
        <div class="field"><label>Пары — формат "Левое = Правое", по одной паре на строку</label><textarea class="sPairs" placeholder="Q factor = Ширина полосы среза&#10;Attack = Скорость реакции компрессора"></textarea></div>`;
    case 'sorting':
      return `
        <div class="field"><label>Вопрос/инструкция (необязательно)</label><input type="text" class="sQuestion" placeholder="Расставь по порядку сигнальной цепи"></div>
        <div class="field"><label>Элементы в ПРАВИЛЬНОМ порядке — по одному на строку</label><textarea class="sItems" placeholder="Микрофон&#10;Преамп&#10;Эквалайзер&#10;Компрессор"></textarea></div>`;
    default:
      return '';
  }
}

function linesOf(el){ return (el.value || '').split('\n').map(s => s.trim()).filter(Boolean); }

// Собирает {content, correct_answer} для сохранения по данным формы.
// Если данных не хватает — возвращает {error: '...'} вместо этого.
function collectStepPayload(type, container){
  const q = container.querySelector('.sQuestion');
  const question = q ? q.value.trim() : '';
  switch (type) {
    case 'theory': {
      const editable = container.querySelector('.sTheoryHtml');
      const html = sanitizeRichHtml(editable ? editable.innerHTML : '');
      if (!html.trim()) return { error: 'Добавь текст теории' };
      return { content: { html }, correct_answer: null };
    }
    case 'quiz_single':
    case 'quiz_multi': {
      const raw = linesOf(container.querySelector('.sOptions'));
      if (raw.length < 2) return { error: 'Нужно минимум 2 варианта ответа' };
      const options = raw.map(l => l.replace(/^\*/, '').trim());
      const correct = raw.map((l, i) => l.startsWith('*') ? i : -1).filter(i => i >= 0);
      if (correct.length === 0) return { error: 'Отметь звёздочкой (*) хотя бы один правильный вариант' };
      if (type === 'quiz_single' && correct.length > 1) return { error: 'Для теста с одним верным ответом отметь звёздочкой только один вариант' };
      if (!question) return { error: 'Добавь текст вопроса' };
      return { content: { question, options }, correct_answer: { correct } };
    }
    case 'text_answer': {
      const accepted = linesOf(container.querySelector('.sAccepted'));
      if (!question) return { error: 'Добавь текст вопроса' };
      if (accepted.length === 0) return { error: 'Добавь хотя бы один принимаемый ответ' };
      return { content: { question }, correct_answer: { accepted } };
    }
    case 'number_answer': {
      const valueEl = container.querySelector('.sValue');
      const value = valueEl.value.trim();
      if (!question) return { error: 'Добавь текст вопроса' };
      if (value === '') return { error: 'Укажи правильное число' };
      const tolerance = Number(container.querySelector('.sTolerance').value || 0);
      const unit = container.querySelector('.sUnit').value.trim();
      return { content: { question, unit: unit || null }, correct_answer: { value: Number(value), tolerance } };
    }
    case 'matching': {
      const raw = container.querySelector('.sPairs').value.split('\n').map(l => l.trim()).filter(Boolean);
      const pairs = raw.map(l => {
        const idx = l.indexOf('=');
        if (idx < 0) return null;
        return { left: l.slice(0, idx).trim(), right: l.slice(idx + 1).trim() };
      }).filter(Boolean);
      if (pairs.length < 2) return { error: 'Нужно минимум 2 пары в формате "Левое = Правое"' };
      const leftArr = pairs.map(p => p.left);
      const rightOriginal = pairs.map(p => p.right);
      const shuffled = shufflePositions(rightOriginal.length);
      const right = shuffled.map(i => rightOriginal[i]);
      const mapping = leftArr.map((_, i) => shuffled.indexOf(i));
      return { content: { question, left: leftArr, right }, correct_answer: { mapping } };
    }
    case 'sorting': {
      const correctItems = linesOf(container.querySelector('.sItems'));
      if (correctItems.length < 2) return { error: 'Нужно минимум 2 элемента для сортировки' };
      const positions = correctItems.map((_, i) => i);
      const scrambled = shufflePositions(positions.length);
      const items = scrambled.map(i => correctItems[i]);
      const order = correctItems.map((_, correctPos) => scrambled.indexOf(correctPos));
      return { content: { question, items }, correct_answer: { order } };
    }
    default:
      return { error: 'Неизвестный тип шага' };
  }
}

function stepAdminRow(step, onChanged){
  const row = document.createElement('div');
  row.className = 'admin-step-row';
  const label = step.title || (step.content && step.content.question) || (step.step_type === 'theory' ? 'Теоретический блок' : '(без названия)');
  row.innerHTML = `
    <span class="admin-step-info">
      <span class="admin-step-badge">${STEP_TYPE_LABELS_A[step.step_type] || step.step_type}</span>
      <span>${escapeHtml(label)}</span>
    </span>
    <span style="display:flex;align-items:center;gap:6px">
      <button type="button" class="icon-btn sUp" title="Выше">${ICON_UP_A}</button>
      <button type="button" class="icon-btn sDown" title="Ниже">${ICON_DOWN_A}</button>
      <button type="button" class="icon-btn sDel" title="Удалить шаг">${ICON_TRASH_A}</button>
    </span>`;
  row.querySelector('.sDel').addEventListener('click', async () => {
    if (!confirm('Удалить этот шаг?')) return;
    await SB.from('lesson_steps').delete().eq('id', step.id);
    onChanged();
  });
  return row;
}

async function handleMoveStep(steps, index, dir, onChanged){
  const other = index + dir;
  if (other < 0 || other >= steps.length) return;
  const a = steps[index], b = steps[other];
  await Promise.all([
    SB.from('lesson_steps').update({ order_index: b.order_index }).eq('id', a.id),
    SB.from('lesson_steps').update({ order_index: a.order_index }).eq('id', b.id),
  ]);
  onChanged();
}

async function renderStepsPanel(lesson, panel){
  const { data: steps } = await SB.from('lesson_steps').select('*').eq('lesson_id', lesson.id).order('order_index', { ascending: true });
  const list = steps || [];

  panel.innerHTML = '<div class="admin-steps-list"></div>';
  const listEl = panel.querySelector('.admin-steps-list');
  if (list.length === 0) {
    listEl.innerHTML = '<div class="empty" style="padding:10px 0">Шагов пока нет</div>';
  } else {
    list.forEach((s, i) => {
      const refresh = () => renderStepsPanel(lesson, panel);
      const row = stepAdminRow(s, refresh);
      const upBtn = row.querySelector('.sUp');
      const downBtn = row.querySelector('.sDown');
      if (i === 0) upBtn.disabled = true;
      if (i === list.length - 1) downBtn.disabled = true;
      upBtn.addEventListener('click', () => handleMoveStep(list, i, -1, refresh));
      downBtn.addEventListener('click', () => handleMoveStep(list, i, 1, refresh));
      listEl.appendChild(row);
    });
  }

  const formWrap = document.createElement('div');
  formWrap.className = 'admin-step-form';
  formWrap.innerHTML = `
    <div class="field">
      <label>Новый шаг</label>
      <select class="sType">
        <option value="theory">Теория</option>
        <option value="quiz_single">Тест (один верный)</option>
        <option value="quiz_multi">Тест (несколько верных)</option>
        <option value="text_answer">Ответ текстом</option>
        <option value="number_answer">Ответ числом</option>
        <option value="matching">Сопоставление</option>
        <option value="sorting">Сортировка</option>
      </select>
    </div>
    <div class="sFields"></div>
    <div class="form-row">
      <div class="field"><label>XP за шаг</label><input type="number" class="sXp" value="0" min="0"></div>
      <div class="field"><label>Макс. попыток (пусто — без ограничения)</label><input type="number" class="sMaxAttempts" min="1"></div>
    </div>
    <div class="field"><label>Объяснение / решение автора (необязательно, покажется после успеха)</label><textarea class="sExplanation"></textarea></div>
    <button type="button" class="submit-btn sSaveBtn">Добавить шаг</button>
    <div class="form-status sStatus"></div>`;
  panel.appendChild(formWrap);

  const typeSelect = formWrap.querySelector('.sType');
  const fieldsWrap = formWrap.querySelector('.sFields');
  function renderFields(){
    fieldsWrap.innerHTML = stepFieldsHtml(typeSelect.value);
    if (typeSelect.value === 'theory') makeRichEditor(fieldsWrap, { full: true, onImageUpload: async file => (await uploadCourseAsset(file)).url, onFileUpload: uploadCourseAsset });
  }
  typeSelect.addEventListener('change', renderFields);
  renderFields();

  formWrap.querySelector('.sSaveBtn').addEventListener('click', async () => {
    const statusEl = formWrap.querySelector('.sStatus');
    const saveBtn = formWrap.querySelector('.sSaveBtn');
    const type = typeSelect.value;
    const payload = collectStepPayload(type, fieldsWrap);
    if (payload.error) { statusEl.textContent = payload.error; statusEl.className = 'form-status error'; return; }

    saveBtn.disabled = true;
    const xp = Number(formWrap.querySelector('.sXp').value || 0);
    const maxAttemptsRaw = formWrap.querySelector('.sMaxAttempts').value.trim();
    const explanation = formWrap.querySelector('.sExplanation').value.trim();

    const { error } = await SB.from('lesson_steps').insert({
      lesson_id: lesson.id,
      order_index: list.length,
      step_type: type,
      content: payload.content,
      correct_answer: payload.correct_answer,
      xp_reward: xp,
      max_attempts: maxAttemptsRaw ? Number(maxAttemptsRaw) : null,
      explanation: explanation || null,
    });
    saveBtn.disabled = false;
    if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'form-status error'; return; }
    await renderStepsPanel(lesson, panel);
  });
}

function formatMb(bytes){ return (bytes / 1048576).toFixed(1); }

async function handleAddLesson(courseId, form){
  const titleInput = form.querySelector('.lTitle');
  const fileInput = form.querySelector('.lFile');
  const coverInput = form.querySelector('.lCover');
  const statusEl = form.querySelector('.lStatus');
  const btn = form.querySelector('.lBtn');
  const progressWrap = form.querySelector('.upload-progress');
  const progressFill = form.querySelector('.upload-progress-fill');
  const progressLabel = form.querySelector('.upload-progress-label');
  const title = titleInput.value.trim();
  const file = fileInput.files[0];
  const cover = coverInput && coverInput.files[0];
  if (!title) return;

  btn.disabled = true;
  statusEl.textContent = file ? '' : 'Сохраняем...';
  statusEl.className = 'form-status';

  const { count } = await SB.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const orderIndex = count || 0;

  let contentUrl = null;
  let coverImageUrl = null;
  if (cover) {
    try { coverImageUrl = (await uploadCourseAsset(cover)).url; }
    catch (err) {
      statusEl.textContent = 'Не удалось загрузить обложку: ' + (err && err.message ? err.message : err);
      statusEl.className = 'form-status error'; btn.disabled = false; return;
    }
  }
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
    section_id: form.dataset.sectionId || null,
    cover_image_url: coverImageUrl,
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
  if (coverInput) coverInput.value = '';
  renderCoursesAdmin();
}

async function handleDeleteAssignment(a){
  if (!confirm(`Удалить задание "${a.title}"? Все сдачи по нему тоже удалятся.`)) return;
  const { error } = await SB.from('assignments').delete().eq('id', a.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  renderCoursesAdmin();
}

function assignmentAdminRow(a){
  const row = document.createElement('div');
  row.className = 'admin-lesson-row';
  row.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:13px;height:13px;display:inline-flex">${ICON_CLIPBOARD_A}</span>${escapeHtml(a.title)}</span>
    <span style="display:flex;align-items:center;gap:8px">
      <span>макс. ${a.max_score} баллов</span>
      <button type="button" class="icon-btn" title="Удалить задание">${ICON_TRASH_A}</button>
    </span>`;
  row.querySelector('.icon-btn').addEventListener('click', () => handleDeleteAssignment(a));
  return row;
}

async function handleAddAssignment(courseId, form){
  const titleInput = form.querySelector('.aTitle');
  const descInput = form.querySelector('.aDesc');
  const reqInput = form.querySelector('.aReq');
  const scoreInput = form.querySelector('.aScore');
  const statusEl = form.querySelector('.aStatus');
  const btn = form.querySelector('.aBtn');
  const title = titleInput.value.trim();
  if (!title) return;

  btn.disabled = true;
  statusEl.textContent = '';
  statusEl.className = 'form-status';

  const { error } = await SB.from('assignments').insert({
    course_id: courseId,
    title,
    description: descInput.value.trim(),
    requirements: reqInput.value.trim(),
    max_score: Math.max(1, parseInt(scoreInput.value, 10) || 100),
  });

  btn.disabled = false;
  if (error) {
    statusEl.textContent = 'Ошибка: ' + error.message;
    statusEl.className = 'form-status error';
    return;
  }
  statusEl.textContent = 'Задание добавлено!';
  statusEl.className = 'form-status ok';
  titleInput.value = ''; descInput.value = ''; reqInput.value = ''; scoreInput.value = '100';
  renderCoursesAdmin();
}

function lessonCreateForm(courseId, sectionId){
  const form = document.createElement('div');
  form.className = 'program-add-lesson';
  if (sectionId) form.dataset.sectionId = sectionId;
  form.innerHTML = `
    <div class="field"><input type="text" class="lTitle" placeholder="Название урока"></div>
    <div class="program-add-assets">
      <label class="program-file-label">Обложка<input type="file" class="lCover" accept="image/*"></label>
      <label class="program-file-label">Видео урока<input type="file" class="lFile" accept="video/*"></label>
    </div>
    <div class="upload-progress"><div class="upload-progress-bar"><div class="upload-progress-fill"></div></div><div class="upload-progress-label"></div></div>
    <button type="button" class="program-add-btn lBtn">+ Добавить урок</button><div class="form-status lStatus"></div>`;
  form.querySelector('.lBtn').addEventListener('click', () => handleAddLesson(courseId, form));
  return form;
}

async function createCourseSection(courseId){
  const title = prompt('Название раздела курса:', 'Новый раздел');
  if (!title || !title.trim()) return;
  const { count } = await SB.from('course_sections').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const { error } = await SB.from('course_sections').insert({ course_id: courseId, title: title.trim(), order_index: count || 0 });
  if (error) { alert('Не удалось создать раздел: ' + error.message); return; }
  renderCoursesAdmin();
}

async function renameCourseSection(section){
  const title = prompt('Название раздела:', section.title);
  if (!title || !title.trim() || title.trim() === section.title) return;
  const { error } = await SB.from('course_sections').update({ title: title.trim() }).eq('id', section.id);
  if (error) { alert('Не удалось переименовать раздел: ' + error.message); return; }
  renderCoursesAdmin();
}

async function deleteCourseSection(section, lessons){
  if (!confirm(`Удалить раздел «${section.title}»? Уроки останутся в курсе, но выйдут из этого раздела.`)) return;
  if (lessons.length) await SB.from('lessons').update({ section_id: null }).eq('section_id', section.id);
  const { error } = await SB.from('course_sections').delete().eq('id', section.id);
  if (error) { alert('Не удалось удалить раздел: ' + error.message); return; }
  renderCoursesAdmin();
}

async function moveCourseSection(sections, index, direction){
  const otherIndex = index + direction;
  if (otherIndex < 0 || otherIndex >= sections.length) return;
  const current = sections[index], other = sections[otherIndex];
  await Promise.all([
    SB.from('course_sections').update({ order_index: other.order_index }).eq('id', current.id),
    SB.from('course_sections').update({ order_index: current.order_index }).eq('id', other.id),
  ]);
  renderCoursesAdmin();
}

function courseProgramSection(courseId, section, lessons, index, totalSections){
  const group = document.createElement('div');
  group.className = 'course-program-section';
  const count = lessons.length;
  group.innerHTML = `
    <div class="course-program-section-head">
      <div><span class="course-program-index">${index + 1}.</span><span class="course-program-title">${escapeHtml(section.title)}</span><span class="course-program-count">${count} ${count === 1 ? 'урок' : count < 5 ? 'урока' : 'уроков'}</span></div>
      <div class="course-program-actions">
        <button type="button" class="icon-btn sectionUp" title="Поднять раздел">${ICON_UP_A}</button><button type="button" class="icon-btn sectionDown" title="Опустить раздел">${ICON_DOWN_A}</button>
        <button type="button" class="icon-btn sectionEdit" title="Переименовать раздел">${ICON_PENCIL_A}</button><button type="button" class="icon-btn sectionDelete" title="Удалить раздел">${ICON_TRASH_A}</button>
      </div>
    </div>`;
  const [upBtn, downBtn, editBtn, deleteBtn] = group.querySelectorAll('.icon-btn');
  upBtn.disabled = index === 0;
  downBtn.disabled = index === totalSections - 1;
  upBtn.addEventListener('click', () => moveCourseSection(section._allSections, index, -1));
  downBtn.addEventListener('click', () => moveCourseSection(section._allSections, index, 1));
  editBtn.addEventListener('click', () => renameCourseSection(section));
  deleteBtn.addEventListener('click', () => deleteCourseSection(section, lessons));
  const lessonsWrap = document.createElement('div');
  lessonsWrap.className = 'course-program-lessons';
  lessons.forEach(l => lessonsWrap.appendChild(lessonAdminRow(l)));
  lessonsWrap.appendChild(lessonCreateForm(courseId, section.id));
  group.appendChild(lessonsWrap);
  return group;
}

function courseProgramEditor(courseId, sections, lessons){
  const program = document.createElement('div');
  program.className = 'course-program-editor';
  program.innerHTML = `<div class="course-program-toolbar"><div><div class="course-program-kicker">Программа курса</div><div class="course-program-sub">Создавай разделы и уроки, добавляй обложки, видео и интерактивный контент.</div></div><button type="button" class="program-add-btn addSectionBtn">+ Создать раздел</button></div>`;
  program.querySelector('.addSectionBtn').addEventListener('click', () => createCourseSection(courseId));

  if (!sections.length) {
    if (lessons.length) {
      const legacy = document.createElement('div');
      legacy.className = 'course-program-legacy';
      legacy.innerHTML = '<div class="course-program-legacy-title">Уроки без раздела — создай раздел для новой структуры</div>';
      lessons.forEach(l => legacy.appendChild(lessonAdminRow(l)));
      program.appendChild(legacy);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.padding = '22px 0 12px';
      empty.textContent = 'Начни с раздела: например, «Введение» или «Практика».';
      program.appendChild(empty);
    }
    return program;
  }
  sections.forEach(s => { s._allSections = sections; });
  sections.forEach((section, index) => {
    program.appendChild(courseProgramSection(courseId, section, lessons.filter(l => l.section_id === section.id), index, sections.length));
  });
  const ungrouped = lessons.filter(l => !l.section_id);
  if (ungrouped.length) {
    const legacy = document.createElement('div');
    legacy.className = 'course-program-legacy';
    legacy.innerHTML = '<div class="course-program-legacy-title">Уроки без раздела</div>';
    ungrouped.forEach(l => legacy.appendChild(lessonAdminRow(l)));
    program.appendChild(legacy);
  }
  return program;
}

function courseAdminBlock(course, lessons, assignments, sections){
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
          <button type="button" class="icon-btn cEditBtn" title="Редактировать курс">${ICON_PENCIL_A}</button>
          <button type="button" class="icon-btn cDelBtn" title="Удалить курс">${ICON_TRASH_A}</button>
        </span>
      </div>`;
    head.querySelector('.cEditBtn').addEventListener('click', renderHeadEdit);
    head.querySelector('.cDelBtn').addEventListener('click', () => handleDeleteCourse(course, lessons));
  }

  function renderHeadEdit(){
    head.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;font-weight:400">
        <div class="field"><input type="text" class="ceTitle" value="${escapeAttr(course.title)}"></div>
        <div class="field">${courseRichEditorHtml('ceDesc', course.description || '')}</div>
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
    makeRichEditor(head.querySelector('.course-rich-editor'), { full: true, onImageUpload: async file => (await uploadCourseAsset(file)).url, onFileUpload: uploadCourseAsset });
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
      description: sanitizeRichHtml(head.querySelector('.ceDesc').innerHTML),
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

  block.appendChild(courseProgramEditor(course.id, sections, lessons));

  const aDivider = document.createElement('div');
  aDivider.style.cssText = 'padding:10px 18px;border-top:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--muted2);text-transform:uppercase;letter-spacing:.06em';
  aDivider.textContent = 'Задания';
  block.appendChild(aDivider);

  assignments.forEach(a => block.appendChild(assignmentAdminRow(a)));

  const aFormWrap = document.createElement('div');
  aFormWrap.style.cssText = 'padding:14px 18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';
  aFormWrap.innerHTML = `
    <div class="field"><input type="text" class="aTitle" placeholder="Название задания"></div>
    <div class="field"><textarea class="aDesc" placeholder="Что нужно сделать"></textarea></div>
    <div class="field"><textarea class="aReq" placeholder="Требования к сдаче (необязательно)"></textarea></div>
    <div class="form-row">
      <div class="field"><label style="font-family:var(--mono);font-size:11px;color:var(--muted2)">Макс. баллов</label><input type="number" class="aScore" value="100" min="1"></div>
    </div>
    <button type="button" class="submit-btn aBtn">Добавить задание</button>
    <div class="form-status aStatus"></div>`;
  aFormWrap.querySelector('.aBtn').addEventListener('click', () => handleAddAssignment(course.id, aFormWrap));
  block.appendChild(aFormWrap);

  return block;
}

async function renderCoursesAdmin(){
  const wrap = document.getElementById('coursesAdminList');
  const { data: courses } = await SB.from('courses').select('*').order('created_at', { ascending: true });
  if (!courses || courses.length === 0) {
    wrap.innerHTML = '<div class="empty">Курсов пока нет — создай первый выше</div>';
    return;
  }
  const [{ data: allLessons }, { data: allAssignments }, { data: allSections }] = await Promise.all([
    SB.from('lessons').select('*').order('order_index', { ascending: true }),
    SB.from('assignments').select('*').order('created_at', { ascending: true }),
    SB.from('course_sections').select('*').order('order_index', { ascending: true }),
  ]);
  wrap.innerHTML = '';
  courses.forEach(c => {
    const lessons = (allLessons || []).filter(l => l.course_id === c.id);
    const assignments = (allAssignments || []).filter(a => a.course_id === c.id);
    const sections = (allSections || []).filter(s => s.course_id === c.id);
    wrap.appendChild(courseAdminBlock(c, lessons, assignments, sections));
  });
}

/* ══════════════════════════════════════
   СЛОВАРЬ (категории + термины, видны всем на Главной)
   ══════════════════════════════════════ */
async function renderGlossaryAdmin(){
  const root = document.getElementById('glossaryAdminRoot');
  const [{ data: cats }, { data: terms }] = await Promise.all([
    SB.from('glossary_categories').select('*').order('order_index', { ascending: true }),
    SB.from('glossary_terms').select('*').order('order_index', { ascending: true }),
  ]);
  const categories = cats || [];
  const allTerms = terms || [];
  root.innerHTML = '';
  root.appendChild(glossaryProgramEditor(categories, allTerms));
}

function glossaryProgramEditor(categories, allTerms){
  const wrap = document.createElement('div');
  wrap.className = 'course-program-editor';
  wrap.innerHTML = `<div class="course-program-toolbar"><div><div class="course-program-kicker">Категории и термины</div><div class="course-program-sub">Создавай категории и добавляй в них термины — так же, как разделы и уроки в курсе.</div></div><button type="button" class="program-add-btn addGlossCatBtn">+ Создать категорию</button></div>`;
  wrap.querySelector('.addGlossCatBtn').addEventListener('click', () => createGlossaryCategory());

  categories.forEach((cat, i) => {
    const terms = allTerms.filter(t => t.category_id === cat.id);
    wrap.appendChild(glossaryCategorySection(cat, terms, i, categories.length, categories));
  });

  const uncategorized = allTerms.filter(t => !t.category_id || !categories.some(c => c.id === t.category_id));
  if (uncategorized.length) {
    const legacy = document.createElement('div');
    legacy.className = 'course-program-legacy';
    legacy.innerHTML = '<div class="course-program-legacy-title">Термины без категории</div>';
    uncategorized.forEach(t => legacy.appendChild(glossaryTermRow(t, categories)));
    wrap.appendChild(legacy);
  }
  if (!categories.length && !uncategorized.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.style.padding = '22px 0 12px';
    empty.textContent = 'Пока нет ни одной категории — создай первую выше.';
    wrap.appendChild(empty);
  }
  return wrap;
}

function glossaryCategorySection(cat, terms, index, total, allCategories){
  const group = document.createElement('div');
  group.className = 'course-program-section';
  const count = terms.length;
  group.innerHTML = `
    <div class="course-program-section-head">
      <div><span class="course-program-index">${index + 1}.</span><span class="course-program-title">${escapeHtml(cat.title)}</span><span class="course-program-count">${count} ${count === 1 ? 'термин' : count < 5 ? 'термина' : 'терминов'}</span></div>
      <div class="course-program-actions">
        <button type="button" class="icon-btn catUp" title="Поднять категорию">${ICON_UP_A}</button><button type="button" class="icon-btn catDown" title="Опустить категорию">${ICON_DOWN_A}</button>
        <button type="button" class="icon-btn catEdit" title="Переименовать категорию">${ICON_PENCIL_A}</button><button type="button" class="icon-btn catDelete" title="Удалить категорию">${ICON_TRASH_A}</button>
      </div>
    </div>`;
  const [upBtn, downBtn, editBtn, delBtn] = group.querySelectorAll('.icon-btn');
  upBtn.disabled = index === 0;
  downBtn.disabled = index === total - 1;
  upBtn.addEventListener('click', () => moveGlossaryCategory(allCategories, index, -1));
  downBtn.addEventListener('click', () => moveGlossaryCategory(allCategories, index, 1));
  editBtn.addEventListener('click', () => renameGlossaryCategory(cat));
  delBtn.addEventListener('click', () => deleteGlossaryCategory(cat, terms));

  const termsWrap = document.createElement('div');
  termsWrap.className = 'course-program-lessons';
  terms.forEach(t => termsWrap.appendChild(glossaryTermRow(t, allCategories)));
  termsWrap.appendChild(glossaryTermCreateForm(cat.id));
  group.appendChild(termsWrap);
  return group;
}

function glossaryTermRow(term, categories){
  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'admin-lesson-row';
  row.innerHTML = `
    <span class="admin-lesson-main"><span>${escapeHtml(term.term)}</span></span>
    <span style="display:flex;align-items:center;gap:8px">
      <button type="button" class="icon-btn" title="Редактировать термин">${ICON_PENCIL_A}</button>
      <button type="button" class="icon-btn" title="Удалить термин">${ICON_TRASH_A}</button>
    </span>`;
  const [editBtn, delBtn] = row.querySelectorAll('.icon-btn');
  delBtn.addEventListener('click', () => handleDeleteGlossaryTerm(term));

  const editPanel = document.createElement('div');
  editPanel.className = 'admin-steps-panel';
  editPanel.style.display = 'none';
  let built = false;
  editBtn.addEventListener('click', () => {
    const opening = editPanel.style.display === 'none';
    editPanel.style.display = opening ? 'block' : 'none';
    if (opening && !built) { built = true; buildGlossaryTermEditForm(term, categories, editPanel); }
  });

  wrap.appendChild(row);
  wrap.appendChild(editPanel);
  return wrap;
}

function buildGlossaryTermEditForm(term, categories, panel){
  const catOptions = categories.map(c => `<option value="${c.id}" ${c.id === term.category_id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('');
  panel.innerHTML = `
    <div class="admin-step-form">
      <div class="field"><label>Термин</label><input type="text" class="gtTitle" value="${escapeAttr(term.term)}"></div>
      <div class="field"><label>Категория</label><select class="gtCat"><option value="">Без категории</option>${catOptions}</select></div>
      <div class="field"><label>Описание</label>${courseRichEditorHtml('gtDef', term.definition || '')}</div>
      <button type="button" class="submit-btn gtSaveBtn">Сохранить</button>
      <div class="form-status gtStatus"></div>
    </div>`;
  makeRichEditor(panel.querySelector('.course-rich-editor'), { full: true, onImageUpload: async file => (await uploadCourseAsset(file)).url, onFileUpload: uploadCourseAsset });
  panel.querySelector('.gtSaveBtn').addEventListener('click', () => handleSaveGlossaryTerm(term, panel));
}

async function handleSaveGlossaryTerm(term, panel){
  const statusEl = panel.querySelector('.gtStatus');
  const saveBtn = panel.querySelector('.gtSaveBtn');
  const title = panel.querySelector('.gtTitle').value.trim();
  if (!title) { statusEl.textContent = 'Укажи название термина'; statusEl.className = 'form-status error'; return; }
  const catId = panel.querySelector('.gtCat').value || null;
  const html = sanitizeRichHtml(panel.querySelector('.rt-editable').innerHTML);
  saveBtn.disabled = true;
  const { error } = await SB.from('glossary_terms').update({ term: title, category_id: catId, definition: html }).eq('id', term.id);
  saveBtn.disabled = false;
  if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'form-status error'; return; }
  statusEl.textContent = 'Сохранено!';
  statusEl.className = 'form-status ok';
  setTimeout(renderGlossaryAdmin, 500);
}

function glossaryTermCreateForm(categoryId){
  const form = document.createElement('div');
  form.className = 'program-add-lesson';
  form.innerHTML = `
    <div class="field"><input type="text" class="gtNewTitle" placeholder="Новый термин"></div>
    ${courseRichEditorHtml('gtNewDef', '')}
    <button type="button" class="program-add-btn gtAddBtn">+ Добавить термин</button><div class="form-status gtNewStatus"></div>`;
  makeRichEditor(form.querySelector('.course-rich-editor'), { full: true, onImageUpload: async file => (await uploadCourseAsset(file)).url, onFileUpload: uploadCourseAsset });
  form.querySelector('.gtAddBtn').addEventListener('click', () => handleAddGlossaryTerm(categoryId, form));
  return form;
}

async function handleAddGlossaryTerm(categoryId, form){
  const statusEl = form.querySelector('.gtNewStatus');
  const btn = form.querySelector('.gtAddBtn');
  const title = form.querySelector('.gtNewTitle').value.trim();
  if (!title) { statusEl.textContent = 'Укажи название термина'; statusEl.className = 'form-status error'; return; }
  const html = sanitizeRichHtml(form.querySelector('.rt-editable').innerHTML);
  btn.disabled = true;
  const { count } = await SB.from('glossary_terms').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
  const { error } = await SB.from('glossary_terms').insert({ category_id: categoryId, term: title, definition: html, order_index: count || 0 });
  btn.disabled = false;
  if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'form-status error'; return; }
  statusEl.textContent = 'Термин добавлен!';
  statusEl.className = 'form-status ok';
  setTimeout(renderGlossaryAdmin, 500);
}

async function createGlossaryCategory(){
  const title = prompt('Название категории:', 'Новая категория');
  if (!title || !title.trim()) return;
  const { count } = await SB.from('glossary_categories').select('id', { count: 'exact', head: true });
  const { error } = await SB.from('glossary_categories').insert({ title: title.trim(), order_index: count || 0 });
  if (error) { alert('Не удалось создать категорию: ' + error.message); return; }
  renderGlossaryAdmin();
}

async function renameGlossaryCategory(cat){
  const title = prompt('Название категории:', cat.title);
  if (!title || !title.trim() || title.trim() === cat.title) return;
  const { error } = await SB.from('glossary_categories').update({ title: title.trim() }).eq('id', cat.id);
  if (error) { alert('Не удалось переименовать: ' + error.message); return; }
  renderGlossaryAdmin();
}

async function deleteGlossaryCategory(cat, terms){
  if (!confirm(`Удалить категорию «${cat.title}»? Термины останутся, но выйдут из этой категории.`)) return;
  if (terms.length) await SB.from('glossary_terms').update({ category_id: null }).eq('category_id', cat.id);
  const { error } = await SB.from('glossary_categories').delete().eq('id', cat.id);
  if (error) { alert('Не удалось удалить: ' + error.message); return; }
  renderGlossaryAdmin();
}

async function moveGlossaryCategory(categories, index, direction){
  const otherIndex = index + direction;
  if (otherIndex < 0 || otherIndex >= categories.length) return;
  const current = categories[index], other = categories[otherIndex];
  await Promise.all([
    SB.from('glossary_categories').update({ order_index: other.order_index }).eq('id', current.id),
    SB.from('glossary_categories').update({ order_index: current.order_index }).eq('id', other.id),
  ]);
  renderGlossaryAdmin();
}

async function handleDeleteGlossaryTerm(term){
  if (!confirm(`Удалить термин «${term.term}»?`)) return;
  const { error } = await SB.from('glossary_terms').delete().eq('id', term.id);
  if (error) { alert('Не удалось удалить: ' + error.message); return; }
  renderGlossaryAdmin();
}

/* ══════════════════════════════════════
   ПРОВЕРКА ЗАДАНИЙ
   ══════════════════════════════════════ */
function submissionCard(s){
  const card = document.createElement('div');
  card.className = 'review-card';

  const student = (s.profiles && s.profiles.username) || s.user_id;
  const assignmentTitle = (s.assignments && s.assignments.title) || 'Задание';
  const maxScore = (s.assignments && s.assignments.max_score) || 100;
  const projectTitle = s.projects ? s.projects.title : null;
  const projectUrl = s.projects ? s.projects.file_url : null;
  const date = new Date(s.submitted_at).toLocaleDateString('ru-RU');

  card.innerHTML = `
    <div class="review-card-row">
      <div>
        <div class="review-card-name">${escapeHtml(student)}</div>
        <div class="review-card-sub">${escapeHtml(assignmentTitle)}</div>
      </div>
      <div class="review-card-date">${date}</div>
    </div>
    ${projectUrl ? `<div><div class="review-card-attach">${ICON_HEADPHONES_A}${escapeHtml(projectTitle)}</div><div class="wp-mount"></div><div class="wa-mount"></div></div>` : '<div class="empty">Работа не прикреплена</div>'}
    <div class="form-row">
      <div class="field"><label>Оценка (из ${maxScore})</label><input type="number" class="rScore" min="0" max="${maxScore}" value="${maxScore}"></div>
    </div>
    <div class="field"><label>Отзыв</label><textarea class="rFeedback" placeholder="Что получилось хорошо, что доработать..."></textarea></div>
    <div class="review-card-actions">
      <button type="button" class="submit-btn rApprove" style="background:linear-gradient(90deg,var(--green),#22d3ee)">Принять</button>
      <button type="button" class="nav-btn danger rReject">Отклонить</button>
    </div>
    <div class="form-status rStatus"></div>`;

  if (projectUrl) {
    const player = createWavePlayer(projectUrl, card.querySelector('.wp-mount'));
    createAudioAnalysisPanel(projectUrl, card.querySelector('.wa-mount'), player.audio);
  }
  card.querySelector('.rApprove').addEventListener('click', () => handleReviewSubmission(s, card, true, maxScore));
  card.querySelector('.rReject').addEventListener('click', () => handleReviewSubmission(s, card, false, maxScore));

  return card;
}

async function handleReviewSubmission(submission, card, approve, maxScore){
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
  statusEl.innerHTML = approve ? ICON_CHECK_A + ' Принято' : 'Отклонено';
  statusEl.className = 'form-status ' + (approve ? 'ok' : 'error');
  updateSidebarBadges();
}

async function renderAssignmentQueue(){
  const queue = document.getElementById('assignmentQueue');
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

/* ══════════════════════════════════════
   ВЕРИФИКАЦИЯ
   ══════════════════════════════════════ */
function verifyRequestCard(r){
  const card = document.createElement('div');
  card.className = 'review-card';
  const date = new Date(r.created_at).toLocaleDateString('ru-RU');
  const username = (r.profiles && r.profiles.username) || r.user_id;
  card.innerHTML = `
    <div class="review-card-row">
      <div class="review-card-name">${escapeHtml(username)}</div>
      <div class="review-card-date">${date}</div>
    </div>
    <div class="review-card-summary">${escapeHtml(r.portfolio_summary || '')}</div>
    <div class="review-card-actions">
      <button type="button" class="submit-btn approveBtn" style="background:linear-gradient(90deg,var(--green),#22d3ee)">Подтвердить</button>
      <button type="button" class="nav-btn danger rejectBtn">Отклонить</button>
    </div>
    <div class="form-status rStatus"></div>`;

  card.querySelector('.approveBtn').addEventListener('click', () => handleVerifyReview(r.id, true, card, r.user_id));
  card.querySelector('.rejectBtn').addEventListener('click', () => handleVerifyReview(r.id, false, card, r.user_id));
  return card;
}

async function handleVerifyReview(requestId, approve, card, targetUserId){
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
  if (window.notifyUser && targetUserId) notifyUser(SB, { userId: targetUserId, actorId: currentUid, type: approve ? 'verification_approved' : 'verification_rejected' });
  card.style.opacity = '.4';
  statusEl.innerHTML = approve ? ICON_CHECK_A + ' Подтверждено' : 'Отклонено';
  statusEl.className = 'form-status ' + (approve ? 'ok' : 'error');
  updateSidebarBadges();
}

async function renderVerifyQueue(){
  const queue = document.getElementById('verifyQueue');
  const { data, error } = await SB.from('verification_requests')
    .select('*, profiles(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    queue.innerHTML = '<div class="empty">Заявок на рассмотрении нет</div>';
    return;
  }
  queue.innerHTML = '';
  data.forEach(r => queue.appendChild(verifyRequestCard(r)));
}

/* ══════════════════════════════════════
   ЖАЛОБЫ
   ══════════════════════════════════════ */
async function renderReportsQueue(){
  const queue = document.getElementById('reportsQueue');
  const { data: reports, error } = await SB.from('content_reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error || !reports || reports.length === 0) {
    queue.innerHTML = '<div class="empty">Жалоб на рассмотрении нет</div>';
    return;
  }

  const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
  const postIds = [...new Set(reports.filter(r => r.content_type === 'post').map(r => r.content_id))];
  const commentIds = [...new Set(reports.filter(r => r.content_type === 'comment').map(r => r.content_id))];
  const projectCommentIds = [...new Set(reports.filter(r => r.content_type === 'project_comment').map(r => r.content_id))];

  const [{ data: reporters }, { data: posts }, { data: comments }, { data: projectComments }] = await Promise.all([
    reporterIds.length ? SB.from('profiles').select('id, username').in('id', reporterIds) : Promise.resolve({ data: [] }),
    postIds.length ? SB.from('posts').select('id, content, user_id').in('id', postIds) : Promise.resolve({ data: [] }),
    commentIds.length ? SB.from('post_comments').select('id, content, audio_url, user_id').in('id', commentIds) : Promise.resolve({ data: [] }),
    projectCommentIds.length ? SB.from('project_comments').select('id, content, user_id').in('id', projectCommentIds) : Promise.resolve({ data: [] }),
  ]);
  const reporterMap = new Map((reporters || []).map(u => [u.id, u.username]));
  const postMap = new Map((posts || []).map(p => [p.id, p]));
  const commentMap = new Map((comments || []).map(c => [c.id, c]));
  const projectCommentMap = new Map((projectComments || []).map(c => [c.id, c]));

  queue.innerHTML = '';
  reports.forEach(r => {
    const content = r.content_type === 'post' ? postMap.get(r.content_id)
      : r.content_type === 'project_comment' ? projectCommentMap.get(r.content_id)
      : commentMap.get(r.content_id);
    queue.appendChild(reportCard(r, content, reporterMap.get(r.reporter_id)));
  });
}

function reportCard(r, content, reporterName){
  const card = document.createElement('div');
  card.className = 'review-card';
  const date = new Date(r.created_at).toLocaleDateString('ru-RU');
  const typeLabel = r.content_type === 'post' ? 'Пост' : r.content_type === 'project_comment' ? 'Комментарий (портфолио)' : 'Комментарий';
  let preview;
  const hasAudio = content && content.audio_url;
  if (!content) {
    preview = '<span style="color:var(--muted)">Контент уже удалён</span>';
  } else if (hasAudio) {
    preview = `<div class="wp-mount"></div>`;
  } else {
    preview = `<div style="white-space:pre-wrap">${escapeHtml(content.content || '(пусто)')}</div>`;
  }
  card.innerHTML = `
    <div class="review-card-row">
      <div class="review-card-tag">${typeLabel} · пожаловался ${escapeHtml(reporterName || '?')}</div>
      <div class="review-card-date">${date}</div>
    </div>
    <div class="review-card-body">${preview}</div>
    ${r.reason ? `<div class="review-card-reason"><b>Причина:</b> ${escapeHtml(r.reason)}</div>` : ''}
    <div class="review-card-actions">
      <button type="button" class="nav-btn danger deleteContentBtn" ${!content ? 'disabled' : ''}>Удалить контент</button>
      <button type="button" class="nav-btn dismissBtn">Отклонить жалобу</button>
    </div>`;

  if (hasAudio) createWavePlayer(content.audio_url, card.querySelector('.wp-mount'));
  card.querySelector('.deleteContentBtn').addEventListener('click', () => handleResolveReport(r, card, 'delete'));
  card.querySelector('.dismissBtn').addEventListener('click', () => handleResolveReport(r, card, 'dismiss'));
  return card;
}

async function handleResolveReport(r, card, action){
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  if (action === 'delete') {
    const table = r.content_type === 'post' ? 'posts' : r.content_type === 'project_comment' ? 'project_comments' : 'post_comments';
    const { error: delErr } = await SB.from(table).delete().eq('id', r.content_id);
    if (delErr) { alert('Не удалось удалить: ' + delErr.message); card.querySelectorAll('button').forEach(b => b.disabled = false); return; }
  }
  const { error } = await SB.from('content_reports').update({
    status: action === 'delete' ? 'resolved' : 'dismissed',
    reviewed_by: currentUid,
    reviewed_at: new Date().toISOString(),
  }).eq('id', r.id);
  if (error) { alert('Ошибка: ' + error.message); card.querySelectorAll('button').forEach(b => b.disabled = false); return; }
  card.remove();
  updateSidebarBadges();
}

/* ══════════════════════════════════════
   ПОЛЬЗОВАТЕЛИ
   ══════════════════════════════════════ */
const ROLES = ['STUDENT', 'ENGINEER', 'MENTOR', 'VERIFIED_PRO', 'ADMIN'];
const VSTATUSES = ['none', 'pending', 'approved', 'rejected'];
let allUsers = [];

function flashSaved(el){
  const dot = el.parentElement.querySelector('.au-saved');
  if (!dot) return;
  dot.classList.add('show');
  setTimeout(() => dot.classList.remove('show'), 1200);
}

async function saveField(userId, field, value, el){
  const { error } = await SB.from('profiles').update({ [field]: value }).eq('id', userId);
  if (error) {
    alert('Не удалось сохранить: ' + error.message);
    return;
  }
  flashSaved(el);
  if (!window.notifyUser) return;
  // Раньше выдача роли/VIP/верификации отсюда никак не доходила до самого
  // человека — уведомления слал только feed.js. Доводим до него через тот
  // же общий notifyUser(), что и комментарии/реакции.
  if (field === 'role') notifyUser(SB, { userId, actorId: currentUid, type: 'role_changed' });
  if (field === 'is_vip' && value) notifyUser(SB, { userId, actorId: currentUid, type: 'vip_granted' });
  if (field === 'verification_status' && value === 'approved') notifyUser(SB, { userId, actorId: currentUid, type: 'verification_approved' });
  if (field === 'verification_status' && value === 'rejected') notifyUser(SB, { userId, actorId: currentUid, type: 'verification_rejected' });
}

async function handleDeleteUser(u, tr){
  const sure = confirm(`Удалить аккаунт "${u.username}" насовсем?\n\nЧеловек больше не сможет зайти, все его данные (профиль, очки, проекты) удалятся. Это нельзя отменить.`);
  if (!sure) return;

  const btn = tr.querySelector('.au-del');
  btn.disabled = true;
  const { error } = await SB.functions.invoke('delete-user', { body: { user_id: u.id } });
  if (error) {
    alert('Не удалось удалить: ' + (error.message || error));
    btn.disabled = false;
    return;
  }
  tr.remove();
  allUsers = allUsers.filter(x => x.id !== u.id);
  document.getElementById('userCount').textContent = document.querySelectorAll('#usersBody tr').length + ' из ' + allUsers.length;
}

/* ── Досье пользователя: "был(а) в сети" + журнал действий ──
   Собираем ленту активности не из отдельного лога, а прямо из уже
   существующих таблиц (посты, комментарии, игры, сдачи заданий,
   проекты, заявки на верификацию, поданные и полученные жалобы) —
   у каждой записи уже есть user_id и created_at, отдельный лог не нужен. */
const ICON_POST_A = aIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const ICON_GAME_A = aIcon('<rect width="20" height="12" x="2" y="6" rx="2"/><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/>');
const ICON_PROJECT_A = aIcon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>');
const ICON_FLAG_A = aIcon('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>');
const ACTIVITY_ICONS = { post: ICON_POST_A, comment: ICON_CLIPBOARD_A, game: ICON_GAME_A, submission: ICON_STEPS_A, project: ICON_PROJECT_A, verify: ICON_CHECK_A, report: ICON_FLAG_A };

function formatExactDateTime(dateStr){
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatRelativeTime(dateStr){
  if (!dateStr) return { label: 'никогда', cls: '', exact: '' };
  const exact = formatExactDateTime(dateStr);
  const min = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (min < 1) return { label: 'сейчас', cls: 'online', exact };
  if (min < 5) return { label: min + ' мин назад', cls: 'online', exact };
  if (min < 60) return { label: min + ' мин назад', cls: 'recent', exact };
  const hours = Math.floor(min / 60);
  if (hours < 24) return { label: hours + ' ч назад', cls: 'recent', exact };
  const days = Math.floor(hours / 24);
  if (days < 30) return { label: days + ' дн назад', cls: '', exact };
  const months = Math.floor(days / 30);
  if (months < 12) return { label: months + ' мес назад', cls: '', exact };
  return { label: new Date(dateStr).toLocaleDateString('ru-RU'), cls: '', exact };
}

function stripHtmlForPreview(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}
function truncateText(str, n){
  if (!str) return '(пусто)';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

let userDetailWired = false;
function wireUserDetailModal(){
  if (userDetailWired) return;
  userDetailWired = true;
  document.getElementById('userDetailClose').addEventListener('click', closeUserDetail);
  document.getElementById('userDetailOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeUserDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserDetail(); });
}
function closeUserDetail(){
  document.getElementById('userDetailOverlay').classList.remove('open');
}

async function openUserDetail(u){
  wireUserDetailModal();
  const overlay = document.getElementById('userDetailOverlay');
  const body = document.getElementById('userDetailBody');
  body.innerHTML = '<div class="empty">Загрузка…</div>';
  overlay.classList.add('open');

  const [
    { data: posts }, { data: comments }, { data: scores },
    { data: submissions }, { data: projects }, { data: verifyReqs }, { data: reportsFiled },
    { data: allPosts }, { data: allComments },
  ] = await Promise.all([
    SB.from('posts').select('id, content, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(15),
    SB.from('post_comments').select('id, content, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(15),
    SB.from('scores').select('id, game, score, accuracy, difficulty, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(15),
    SB.from('assignment_submissions').select('id, status, score, submitted_at').eq('user_id', u.id).order('submitted_at', { ascending: false }).limit(15),
    SB.from('projects').select('id, title, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(15),
    SB.from('verification_requests').select('id, status, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(10),
    SB.from('content_reports').select('id, content_type, reason, status, created_at').eq('reporter_id', u.id).order('created_at', { ascending: false }).limit(10),
    SB.from('posts').select('id').eq('user_id', u.id),
    SB.from('post_comments').select('id').eq('user_id', u.id),
  ]);

  const postIds = (allPosts || []).map(p => p.id);
  const commentIds = (allComments || []).map(c => c.id);
  let reportsAgainst = [];
  const reportQueries = [];
  if (postIds.length) reportQueries.push(SB.from('content_reports').select('id, reason, status, created_at, content_type').eq('content_type', 'post').in('content_id', postIds));
  if (commentIds.length) reportQueries.push(SB.from('content_reports').select('id, reason, status, created_at, content_type').eq('content_type', 'comment').in('content_id', commentIds));
  if (reportQueries.length) {
    const results = await Promise.all(reportQueries);
    reportsAgainst = results.flatMap(r => r.data || []);
  }

  renderUserDetailBody(u, {
    posts, comments, scores, submissions, projects, verifyReqs, reportsFiled, reportsAgainst,
    postsCount: postIds.length, commentsCount: commentIds.length,
  });
}

function renderUserDetailBody(u, data){
  const body = document.getElementById('userDetailBody');
  const initials = (u.username || '??').slice(0, 2).toUpperCase();
  const seen = formatRelativeTime(u.last_seen_at);
  const registered = u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—';

  const timeline = [];
  (data.posts || []).forEach(p => timeline.push({ t: p.created_at, icon: 'post', text: 'Пост: ' + escapeHtml(truncateText(stripHtmlForPreview(p.content), 90)) }));
  (data.comments || []).forEach(c => timeline.push({ t: c.created_at, icon: 'comment', text: 'Комментарий: ' + escapeHtml(truncateText(stripHtmlForPreview(c.content), 90)) }));
  (data.scores || []).forEach(s => timeline.push({ t: s.created_at, icon: 'game', text: `Игра «${escapeHtml(s.game)}»: ${s.score} очков (${s.accuracy}% точность, ${escapeHtml(s.difficulty || '')})` }));
  (data.submissions || []).forEach(s => timeline.push({ t: s.submitted_at, icon: 'submission', text: `Сдал(а) задание — статус: ${escapeHtml(s.status)}${s.score != null ? ', ' + s.score + ' баллов' : ''}` }));
  (data.projects || []).forEach(p => timeline.push({ t: p.created_at, icon: 'project', text: 'Загрузил(а) проект в портфолио: ' + escapeHtml(p.title || '') }));
  (data.verifyReqs || []).forEach(v => timeline.push({ t: v.created_at, icon: 'verify', text: 'Заявка на верификацию — статус: ' + escapeHtml(v.status) }));
  (data.reportsFiled || []).forEach(r => timeline.push({ t: r.created_at, icon: 'report', text: `Пожаловался(-ась) на ${r.content_type === 'post' ? 'пост' : 'комментарий'}${r.reason ? ': ' + escapeHtml(r.reason) : ''}` }));
  timeline.sort((a, b) => new Date(b.t) - new Date(a.t));

  const stats = [
    { n: data.postsCount, l: 'Постов' },
    { n: data.commentsCount, l: 'Комментариев' },
    { n: (data.scores || []).length, l: 'Игр (посл. 15)' },
    { n: (data.submissions || []).length, l: 'Сдач заданий' },
    { n: (data.projects || []).length, l: 'Проектов' },
    { n: data.reportsAgainst.length, l: 'Жалоб на контент' },
  ];

  body.innerHTML = `
    <div class="aud-head">
      <div class="aud-avatar" style="background:${escapeAttr(u.avatar_color || '')}">${initials}</div>
      <div>
        <div class="aud-name">${escapeHtml(u.username || '(без имени)')}</div>
        <div class="aud-meta">
          <span class="aud-badge role-${escapeAttr(u.role)}">${escapeHtml(u.role)}</span>
          <span><span class="au-seen-dot ${seen.cls}" style="display:inline-block;vertical-align:-1px"></span> Был(а): ${seen.label}${seen.exact ? ' (' + seen.exact + ')' : ''}</span>
          <span>Регистрация: ${registered}</span>
        </div>
      </div>
    </div>
    <div class="aud-stats">${stats.map(s => `<div class="aud-stat"><div class="n">${s.n}</div><div class="l">${s.l}</div></div>`).join('')}</div>
    ${data.reportsAgainst.length ? `
      <div class="aud-section-title aud-flag">⚠ Жалобы на контент этого пользователя (${data.reportsAgainst.length})</div>
      <div class="aud-timeline">${data.reportsAgainst.map(r => `<div class="aud-item"><div class="aud-item-icon">${ICON_FLAG_A}</div><div class="aud-item-body"><div class="aud-item-text">${r.content_type === 'post' ? 'Пост' : 'Комментарий'} — статус «${escapeHtml(r.status)}»${r.reason ? ': ' + escapeHtml(r.reason) : ''}</div><div class="aud-item-time">${new Date(r.created_at).toLocaleString('ru-RU')}</div></div></div>`).join('')}</div>
    ` : ''}
    <div class="aud-section-title">Последние действия</div>
    <div class="aud-timeline">
      ${timeline.length ? timeline.slice(0, 40).map(item => `
        <div class="aud-item">
          <div class="aud-item-icon">${ACTIVITY_ICONS[item.icon] || ACTIVITY_ICONS.post}</div>
          <div class="aud-item-body">
            <div class="aud-item-text">${item.text}</div>
            <div class="aud-item-time">${new Date(item.t).toLocaleString('ru-RU')}</div>
          </div>
        </div>`).join('') : '<div class="empty">Действий пока нет</div>'}
    </div>`;
}

function userRow(u){
  const tr = document.createElement('tr');

  const roleOptions = ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('');
  const vOptions = VSTATUSES.map(v => `<option value="${v}" ${v === u.verification_status ? 'selected' : ''}>${v}</option>`).join('');
  const initials = (u.username || '??').slice(0, 2).toUpperCase();
  const date = u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—';
  const isSelf = u.id === currentUid;
  const seen = formatRelativeTime(u.last_seen_at);

  tr.innerHTML = `
    <td><button type="button" class="au-user au-userOpenBtn" style="background:none;border:none;cursor:pointer;padding:0;text-align:left" title="Открыть досье"><div class="au-avatar" style="background:${escapeAttr(u.avatar_color || '')}">${initials}</div><div class="au-username">${escapeHtml(u.username || '(без имени)')}</div></button></td>
    <td><select class="au-role role-${u.role}">${roleOptions}</select><span class="au-saved"></span></td>
    <td><input type="number" class="au-xp" value="${u.xp || 0}" min="0"><span class="au-saved"></span></td>
    <td><select class="au-vstatus">${vOptions}</select><span class="au-saved"></span></td>
    <td><label class="au-vip-toggle"><input type="checkbox" class="au-vip" ${u.is_vip ? 'checked' : ''}><span class="au-saved"></span></label></td>
    <td><button type="button" class="au-seen au-userOpenBtn" title="Открыть досье"><span class="au-seen-dot ${seen.cls}"></span><span><span class="au-seen-rel">${seen.label}</span>${seen.exact ? `<span class="au-seen-exact">${seen.exact}</span>` : ''}</span></button></td>
    <td class="au-date">${date}</td>
    <td>${isSelf ? '' : `<button type="button" class="icon-btn au-del" title="Удалить аккаунт">${ICON_TRASH_A}</button>`}</td>`;

  tr.querySelectorAll('.au-userOpenBtn').forEach(btn => btn.addEventListener('click', () => openUserDetail(u)));

  const roleSel = tr.querySelector('.au-role');
  roleSel.addEventListener('change', () => {
    roleSel.className = 'au-role role-' + roleSel.value;
    saveField(u.id, 'role', roleSel.value, roleSel);
  });
  tr.querySelector('.au-xp').addEventListener('change', (e) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    e.target.value = val;
    saveField(u.id, 'xp', val, e.target);
  });
  tr.querySelector('.au-vstatus').addEventListener('change', (e) => {
    saveField(u.id, 'verification_status', e.target.value, e.target);
  });
  tr.querySelector('.au-vip').addEventListener('change', (e) => {
    saveField(u.id, 'is_vip', e.target.checked, e.target);
  });
  const delBtn = tr.querySelector('.au-del');
  if (delBtn) delBtn.addEventListener('click', () => handleDeleteUser(u, tr));

  return tr;
}

function renderUserList(list){
  const body = document.getElementById('usersBody');
  body.innerHTML = '';
  list.forEach(u => body.appendChild(userRow(u)));
  document.getElementById('userCount').textContent = list.length + ' из ' + allUsers.length;
}

function handleSearch(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = q ? allUsers.filter(u => (u.username || '').toLowerCase().includes(q)) : allUsers;
  renderUserList(filtered);
}

async function renderUsers(){
  const { data: users } = await SB.from('profiles').select('*').order('created_at', { ascending: false });
  allUsers = users || [];
  renderUserList(allUsers);
  document.getElementById('searchInput').addEventListener('input', handleSearch);
}

/* ══════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ
   ══════════════════════════════════════ */
async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  currentSession = session;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).select().then(({ data, error }) => { if (error) console.error('last_seen_at update failed:', error); else if (!data || !data.length) console.warn('last_seen_at: 0 строк обновлено — возможно, истекла сессия'); });

  const { data: profile } = await SB.from('profiles').select('role').eq('id', currentUid).single();
  currentRole = profile ? profile.role : null;
  document.getElementById('loading').style.display = 'none';

  const canAccessPanel = ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole);
  if (!canAccessPanel) {
    document.getElementById('noAccess').style.display = 'block';
    return;
  }

  document.getElementById('shell').style.display = 'flex';
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);

  if (!['MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('navVerify').style.display = 'none';
    document.getElementById('navReports').style.display = 'none';
  }
  if (currentRole !== 'ADMIN') {
    document.getElementById('navUsers').style.display = 'none';
  }

  document.querySelectorAll('.admin-nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  document.getElementById('courseForm').addEventListener('submit', handleCreateCourse);
  const createCourseEditor = document.getElementById('cDescEditor');
  createCourseEditor.innerHTML = `${fullRichToolbarHtml()}<div class="rt-editable rt-editable-large" id="cDesc" contenteditable="true" data-placeholder="Расскажите о курсе: чему научится студент, для кого он и какие материалы будут внутри"></div><div class="rt-editor-hint">Можно форматировать текст, вставлять ссылки, изображения, файлы и видео. Поле растёт вместе с содержимым.</div>`;
  makeRichEditor(createCourseEditor, { full: true, onImageUpload: async file => (await uploadCourseAsset(file)).url, onFileUpload: uploadCourseAsset });

  const initialSection = (location.hash || '#overview').slice(1);
  const validSections = Array.from(document.querySelectorAll('.admin-nav-item[data-section]'))
    .filter(b => b.style.display !== 'none')
    .map(b => b.dataset.section);
  activateSection(validSections.includes(initialSection) ? initialSection : 'overview');
}

init();
