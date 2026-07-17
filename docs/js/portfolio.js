const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

// Пороги XP — должны совпадать с XP_LEVELS в profile.js / get_level_from_xp() в БД
const XP_LEVELS = [
  { name:'Beginner',     min:0 },
  { name:'Intermediate', min:500 },
  { name:'Advanced',     min:2000 },
  { name:'Professional', min:5000 },
  { name:'Master',       min:12000 },
  { name:'Legend',       min:25000 },
];
function levelName(xp){
  let current = XP_LEVELS[0];
  for (const l of XP_LEVELS) if ((xp || 0) >= l.min) current = l;
  return current.name;
}

let currentUid = null;
let currentRole = null;
let viewedUid = null;
let isOwn = true;
let allProjects = [];
let projectStats = null; // { byProject: Map, totalReactions, avgRating, totalReviews }
let currentSort = 'new';

const ICON_COVER_PLACEHOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
function coverHtml(p){
  return p.cover_url
    ? `<img class="proj-cover" src="${p.cover_url}" alt="">`
    : `<div class="proj-cover proj-cover-placeholder">${ICON_COVER_PLACEHOLDER}</div>`;
}

function ratingBadge(id){
  const s = projectStats && projectStats.byProject.get(id);
  if (!s || !s.ratingCount) return '';
  const avg = (s.ratingSum / s.ratingCount).toFixed(1);
  return `<span class="proj-badge rating"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>${avg}</span>`;
}
function reviewedBadge(id){
  const s = projectStats && projectStats.byProject.get(id);
  if (!s || !s.reviewed) return '';
  return `<span class="proj-badge reviewed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>Разбор</span>`;
}

function projectCard(p){
  const card = document.createElement('div');
  card.className = 'proj-card';
  card.dataset.id = p.id;
  const date = new Date(p.created_at).toLocaleDateString('ru-RU');
  const badges = ratingBadge(p.id) + reviewedBadge(p.id);
  card.innerHTML = `
    <div class="proj-cover-wrap">${coverHtml(p)}</div>
    <div class="proj-body">
      <div class="proj-top-text">
        <div class="proj-title">${p.title}</div>
        <div class="proj-date">${date}</div>
      </div>
      ${badges ? `<div class="proj-badges">${badges}</div>` : ''}
      <div class="wp-mount"></div>
      <div class="wa-mount"></div>
      <div class="pf-mount"></div>
      ${isOwn ? '<button class="proj-del" data-id="' + p.id + '">Удалить</button>' : ''}
    </div>`;

  if (isOwn) card.querySelector('.proj-del').addEventListener('click', () => deleteProject(p));

  const player = createWavePlayer(p.file_url, card.querySelector('.wp-mount'), { size: 'lg' });
  createAudioAnalysisPanel(p.file_url, card.querySelector('.wa-mount'), player.audio);
  mountProjectFeedback(SB, p, card.querySelector('.pf-mount'), { currentUid, currentRole });

  return card;
}

function sortedProjects(){
  const list = allProjects.slice();
  if (currentSort === 'top') {
    list.sort((a, b) => {
      const sa = projectStats.byProject.get(a.id), sb = projectStats.byProject.get(b.id);
      const ra = sa && sa.ratingCount ? sa.ratingSum / sa.ratingCount : -1;
      const rb = sb && sb.ratingCount ? sb.ratingSum / sb.ratingCount : -1;
      return rb - ra;
    });
  } else if (currentSort === 'hot') {
    list.sort((a, b) => {
      const sa = projectStats.byProject.get(a.id), sb = projectStats.byProject.get(b.id);
      return (sb ? sb.reactions : 0) - (sa ? sa.reactions : 0);
    });
  }
  return list;
}

function renderGrid(){
  const grid = document.getElementById('projGrid');
  grid.innerHTML = '';
  sortedProjects().forEach(p => grid.appendChild(projectCard(p)));
  if (window.animateChildren) animateChildren(grid);
}

async function computeStats(projectIds){
  const byProject = new Map();
  projectIds.forEach(id => byProject.set(id, { reactions: 0, ratingSum: 0, ratingCount: 0, reviewed: false }));
  if (!projectIds.length) return { byProject, totalReactions: 0, avgRating: null, totalReviews: 0 };

  const [{ data: reactions }, { data: ratings }, { data: reviews }] = await Promise.all([
    SB.from('project_reactions').select('project_id').in('project_id', projectIds),
    SB.from('project_ratings').select('project_id, stars').in('project_id', projectIds),
    SB.from('project_reviews').select('project_id').in('project_id', projectIds),
  ]);
  (reactions || []).forEach(r => byProject.get(r.project_id).reactions++);
  (ratings || []).forEach(r => { const e = byProject.get(r.project_id); e.ratingSum += r.stars; e.ratingCount++; });
  (reviews || []).forEach(r => { byProject.get(r.project_id).reviewed = true; });

  const allStars = (ratings || []).map(r => r.stars);
  return {
    byProject,
    totalReactions: (reactions || []).length,
    avgRating: allStars.length ? allStars.reduce((a, b) => a + b, 0) / allStars.length : null,
    totalReviews: (reviews || []).length,
  };
}

function renderStats(){
  document.getElementById('statTracks').textContent = allProjects.length;
  document.getElementById('statReactions').textContent = projectStats.totalReactions;
  document.getElementById('statRating').textContent = projectStats.avgRating ? projectStats.avgRating.toFixed(1) : '—';
  document.getElementById('statReviews').textContent = projectStats.totalReviews;
}

async function renderProjects(){
  const grid = document.getElementById('projGrid');
  const { data, error } = await SB.from('projects')
    .select('*').eq('user_id', viewedUid).order('created_at', { ascending: false });

  allProjects = data || [];
  if (error || allProjects.length === 0) {
    document.getElementById('portStats').style.display = 'none';
    document.getElementById('projSort').style.display = 'none';
    grid.innerHTML = `<div class="empty">${isOwn ? 'Пока нет загруженных проектов — залей первый микс выше' : 'Здесь пока нет загруженных работ'}</div>`;
    return;
  }
  projectStats = await computeStats(allProjects.map(p => p.id));
  renderStats();
  renderGrid();
}

async function deleteProject(p){
  if (!confirm('Удалить "' + p.title + '"?')) return;
  const storagePath = p.metadata && p.metadata.storage_path;
  const coverStoragePath = p.metadata && p.metadata.cover_storage_path;
  if (storagePath) await SB.storage.from('portfolio').remove([storagePath]);
  if (coverStoragePath) await SB.storage.from('portfolio').remove([coverStoragePath]);
  await SB.from('projects').delete().eq('id', p.id);
  allProjects = allProjects.filter(x => x.id !== p.id);
  if (!allProjects.length) {
    document.getElementById('projGrid').innerHTML = '<div class="empty">Пока нет загруженных проектов — залей первый микс выше</div>';
    document.getElementById('portStats').style.display = 'none';
    document.getElementById('projSort').style.display = 'none';
  } else {
    projectStats = await computeStats(allProjects.map(x => x.id));
    renderStats();
    renderGrid();
  }
}

function setStatus(text, kind){
  const el = document.getElementById('uploadStatus');
  el.textContent = text;
  el.className = 'upload-status' + (kind ? ' ' + kind : '');
}

// Supabase JS не отдаёт реальный процент загрузки байт (это ограничение
// fetch, на котором построен клиент) — поэтому полоска "подкрадывается"
// к промежуточным отметкам, замедляясь по пути (как в большинстве
// современных лоадеров), и рывком идёт до 100%, когда шаг реально
// завершился. Так пользователь всегда видит, что что-то происходит,
// а не гадает, зависла страница или нет.
let progressTimer = null;
function startProgress(){
  const bar = document.getElementById('uploadProgress');
  const fill = document.getElementById('uploadProgressFill');
  bar.style.display = '';
  bar.classList.remove('error');
  fill.style.width = '0%';
  let pct = 0;
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    pct += (80 - pct) * 0.1 + 0.4;
    if (pct > 80) pct = 80;
    fill.style.width = pct + '%';
  }, 200);
}
function setProgress(pct){
  clearInterval(progressTimer);
  document.getElementById('uploadProgressFill').style.width = pct + '%';
}
function finishProgress(){
  clearInterval(progressTimer);
  document.getElementById('uploadProgressFill').style.width = '100%';
  setTimeout(() => {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadProgressFill').style.width = '0%';
  }, 600);
}
function failProgress(){
  clearInterval(progressTimer);
  document.getElementById('uploadProgress').classList.add('error');
  setTimeout(() => {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadProgress').classList.remove('error');
    document.getElementById('uploadProgressFill').style.width = '0%';
  }, 1200);
}

async function handleUpload(e){
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  const file = document.getElementById('fFile').files[0];
  const coverFile = document.getElementById('fCover').files[0];
  if (!title || !file) return;

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  setStatus('Загружаем файл...');
  startProgress();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${currentUid}/${Date.now()}_${safeName}`;

  const { error: upErr } = await SB.storage.from('portfolio').upload(storagePath, file);
  if (upErr) {
    setStatus('Не удалось загрузить файл: ' + upErr.message, 'error');
    failProgress();
    btn.disabled = false;
    return;
  }
  setProgress(coverFile ? 55 : 80);
  const { data: pub } = SB.storage.from('portfolio').getPublicUrl(storagePath);

  let coverUrl = null, coverStoragePath = null;
  if (coverFile) {
    setStatus('Загружаем обложку...');
    const safeCoverName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    coverStoragePath = `${currentUid}/covers/${Date.now()}_${safeCoverName}`;
    const { error: coverErr } = await SB.storage.from('portfolio').upload(coverStoragePath, coverFile);
    if (coverErr) {
      setStatus('Файл загружен, но обложка — нет: ' + coverErr.message, 'error');
      coverStoragePath = null;
    } else {
      coverUrl = SB.storage.from('portfolio').getPublicUrl(coverStoragePath).data.publicUrl;
    }
    setProgress(80);
  }

  setStatus('Сохраняем запись...');
  const { error: insErr } = await SB.from('projects').insert({
    user_id: currentUid,
    title,
    file_url: pub.publicUrl,
    file_type: file.type,
    cover_url: coverUrl,
    metadata: { storage_path: storagePath, cover_storage_path: coverStoragePath },
  });

  btn.disabled = false;
  if (insErr) {
    setStatus('Файл загружен, но не удалось сохранить запись: ' + insErr.message, 'error');
    failProgress();
    return;
  }

  finishProgress();
  setStatus('Готово!', 'ok');
  document.getElementById('uploadForm').reset();
  document.getElementById('coverPreview').innerHTML = '';
  document.getElementById('portStats').style.display = '';
  document.getElementById('projSort').style.display = '';
  renderProjects();
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).then(({ error }) => { if (error) console.error('last_seen_at update failed:', error); });
  viewedUid = new URLSearchParams(location.search).get('user') || currentUid;
  isOwn = viewedUid === currentUid;

  // Если смотрим свой профиль, viewedProfile и myProfile — одна и та же
  // строка, второй запрос за ней не нужен
  const [{ data: viewedProfile }, { data: myProfile }] = await Promise.all([
    SB.from('profiles').select('*').eq('id', viewedUid).single(),
    isOwn ? Promise.resolve({ data: null }) : SB.from('profiles').select('role').eq('id', currentUid).single(),
  ]);
  if (!viewedProfile) { location.href = 'auth.html'; return; }
  currentRole = isOwn ? viewedProfile.role : (myProfile ? myProfile.role : null);
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('adminLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);

  document.getElementById('portAvatar').style.background = viewedProfile.avatar_color || '#4ade80';
  document.getElementById('portAvatar').textContent = viewedProfile.username.slice(0, 2).toUpperCase();
  document.getElementById('portName').textContent = viewedProfile.username;
  document.getElementById('portTagline').textContent = 'Sound Engineer · ' + levelName(viewedProfile.xp);
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(viewedProfile.role)) {
    document.getElementById('portProBadge').style.display = '';
  }
  document.title = isOwn ? 'MIXPRO — Портфолио' : 'MIXPRO — Портфолио · ' + viewedProfile.username;

  if (!isOwn) {
    document.getElementById('uploadForm').style.display = 'none';
    document.getElementById('tracksHeading').textContent = 'Работы';
  } else {
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    document.getElementById('fCover').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById('coverPreview');
      preview.innerHTML = file ? `<img src="${URL.createObjectURL(file)}" alt="">` : '';
    });
  }

  document.getElementById('shareBtn').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?user=' + viewedUid;
    const btn = document.getElementById('shareBtn');
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      prompt('Скопируй ссылку:', url);
    }
    const label = btn.querySelector('span');
    const prevLabel = label.textContent;
    btn.classList.add('copied');
    label.textContent = 'Ссылка скопирована!';
    setTimeout(() => { btn.classList.remove('copied'); label.textContent = prevLabel; }, 1800);
  });

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderGrid();
    });
  });

  await renderProjects();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';
}

init();
