const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;

function projectCard(p){
  const card = document.createElement('div');
  card.className = 'proj-card';
  card.dataset.id = p.id;
  const date = new Date(p.created_at).toLocaleDateString('ru-RU');
  card.innerHTML = `
    <div class="proj-top">
      <div class="proj-title">${p.title}</div>
      <div class="proj-date">${date}</div>
    </div>
    <audio controls src="${p.file_url}"></audio>
    <button class="proj-del" data-id="${p.id}">Удалить</button>`;
  card.querySelector('.proj-del').addEventListener('click', () => deleteProject(p));
  return card;
}

async function renderProjects(){
  const grid = document.getElementById('projGrid');
  const { data, error } = await SB.from('projects')
    .select('*').eq('user_id', currentUid).order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    grid.innerHTML = '<div class="empty">Пока нет загруженных проектов — залей первый микс выше</div>';
    return;
  }
  grid.innerHTML = '';
  data.forEach(p => grid.appendChild(projectCard(p)));
}

async function deleteProject(p){
  if (!confirm('Удалить "' + p.title + '"?')) return;
  const storagePath = p.metadata && p.metadata.storage_path;
  if (storagePath) await SB.storage.from('portfolio').remove([storagePath]);
  await SB.from('projects').delete().eq('id', p.id);
  document.querySelector(`.proj-card[data-id="${p.id}"]`)?.remove();
  const grid = document.getElementById('projGrid');
  if (!grid.children.length) grid.innerHTML = '<div class="empty">Пока нет загруженных проектов — залей первый микс выше</div>';
}

function setStatus(text, kind){
  const el = document.getElementById('uploadStatus');
  el.textContent = text;
  el.className = 'upload-status' + (kind ? ' ' + kind : '');
}

async function handleUpload(e){
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  const file = document.getElementById('fFile').files[0];
  if (!title || !file) return;

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  setStatus('Загружаем файл...');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${currentUid}/${Date.now()}_${safeName}`;

  const { error: upErr } = await SB.storage.from('portfolio').upload(storagePath, file);
  if (upErr) {
    setStatus('Не удалось загрузить файл: ' + upErr.message, 'error');
    btn.disabled = false;
    return;
  }

  const { data: pub } = SB.storage.from('portfolio').getPublicUrl(storagePath);

  const { error: insErr } = await SB.from('projects').insert({
    user_id: currentUid,
    title,
    file_url: pub.publicUrl,
    file_type: file.type,
    metadata: { storage_path: storagePath },
  });

  btn.disabled = false;
  if (insErr) {
    setStatus('Файл загружен, но не удалось сохранить запись: ' + insErr.message, 'error');
    return;
  }

  setStatus('Готово!', 'ok');
  document.getElementById('uploadForm').reset();
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

  document.getElementById('uploadForm').addEventListener('submit', handleUpload);

  await renderProjects();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '24px';
}

init();
