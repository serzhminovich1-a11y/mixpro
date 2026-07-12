const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;
let currentLessonId = null;

function buildWatermark(label){
  const wm = document.getElementById('watermark');
  wm.innerHTML = '';
  const grid = document.createElement('div');
  grid.style.cssText = 'position:absolute;inset:-20%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);place-items:center';
  for (let i = 0; i < 12; i++) {
    const span = document.createElement('span');
    span.textContent = label;
    span.style.cssText = "font-family:var(--mono);font-size:13px;color:rgba(255,255,255,.14);transform:rotate(-28deg);white-space:nowrap;letter-spacing:.05em";
    grid.appendChild(span);
  }
  wm.appendChild(grid);
}

async function markComplete(){
  const btn = document.getElementById('completeBtn');
  if (btn.classList.contains('done')) return;
  await SB.from('lesson_progress').upsert({
    user_id: currentUid,
    lesson_id: currentLessonId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,lesson_id' });
  btn.textContent = '✓ Урок пройден';
  btn.classList.add('done');
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;

  currentLessonId = new URLSearchParams(location.search).get('lesson');
  if (!currentLessonId) { location.href = 'courses.html'; return; }

  const [{ data: lesson }, { data: profile }] = await Promise.all([
    SB.from('lessons').select('*').eq('id', currentLessonId).single(),
    SB.from('profiles').select('username').eq('id', currentUid).single(),
  ]);

  if (!lesson) { location.href = 'courses.html'; return; }

  const { data: course } = await SB.from('courses').select('id, title').eq('id', lesson.course_id).single();

  document.getElementById('lessonTitle').textContent = lesson.title;
  document.getElementById('courseName').textContent = course ? course.title : '';
  document.getElementById('backLink').href = 'courses.html?course=' + lesson.course_id;

  if (lesson.content_url) {
    const { data: signed, error } = await SB.storage.from('lessons').createSignedUrl(lesson.content_url, 3600);
    if (signed && signed.signedUrl) {
      document.getElementById('playerBlock').style.display = 'block';
      document.getElementById('video').src = signed.signedUrl;
      buildWatermark((profile && profile.username) || currentUid.slice(0, 8));
    } else {
      document.getElementById('noVideo').style.display = 'block';
      document.getElementById('noVideo').textContent = 'Не удалось загрузить видео' + (error ? ': ' + error.message : '');
    }
  } else {
    document.getElementById('noVideo').style.display = 'block';
  }

  const { data: existingProgress } = await SB.from('lesson_progress')
    .select('status').eq('user_id', currentUid).eq('lesson_id', currentLessonId).maybeSingle();
  if (existingProgress && existingProgress.status === 'completed') {
    const btn = document.getElementById('completeBtn');
    btn.textContent = '✓ Урок пройден';
    btn.classList.add('done');
  }

  document.getElementById('completeBtn').addEventListener('click', markComplete);
  const video = document.getElementById('video');
  if (video) video.addEventListener('ended', markComplete);

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '20px';
}

init();
