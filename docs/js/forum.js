// ══════════════════════════════════════
//  ФОРУМ — список категорий ⇄ список тем внутри категории
//  (тот же паттерн list/detail через ?category=, что у courses.js)
// ══════════════════════════════════════
const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;
let currentRole = null;
let currentCategoryId = null;

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function pluralRu(n, one, few, many){
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

const ICON_PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

async function logout(){ await SB.auth.signOut(); location.href = 'auth.html'; }

async function uploadForumAsset(file){
  if (file.size > 20 * 1024 * 1024) throw new Error('Максимальный размер файла — 20 МБ');
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `forum/${currentUid}/${Date.now()}_${safeName}`;
  const { error } = await SB.storage.from('posts').upload(path, file);
  if (error) throw error;
  const { data: pub } = SB.storage.from('posts').getPublicUrl(path);
  return { url: pub.publicUrl, name: file.name || 'Файл', type: file.type || '' };
}

async function renderCategoryList(){
  const { data: cats, error } = await SB.from('forum_categories').select('*, forum_threads(count)').order('order_index', { ascending: true });
  const grid = document.getElementById('catGrid');
  if (error || !cats || !cats.length) { grid.innerHTML = '<div class="empty">Пока нет ни одной категории — загляните позже</div>'; return; }
  grid.innerHTML = cats.map(c => {
    const count = (c.forum_threads && c.forum_threads[0] && c.forum_threads[0].count) || 0;
    return `<a href="forum.html?category=${c.id}" class="forum-cat-card">
      <div class="forum-cat-title">${escapeHtml(c.title)}</div>
      ${c.description ? `<div class="forum-cat-desc">${escapeHtml(c.description)}</div>` : ''}
      <div class="forum-cat-count">${count} ${pluralRu(count, 'тема', 'темы', 'тем')}</div>
    </a>`;
  }).join('');
  if (window.animateChildren) animateChildren(grid);
}

function threadRowHtml(t, authorMap){
  const totalPosts = (t.forum_posts && t.forum_posts[0] && t.forum_posts[0].count) || 1;
  const replies = Math.max(totalPosts - 1, 0);
  const date = new Date(t.created_at).toLocaleDateString('ru-RU');
  return `<a href="thread.html?thread=${t.id}" class="forum-thread-row${t.is_pinned ? ' pinned' : ''}">
    <div class="forum-thread-main">
      <div class="forum-thread-title">${t.is_pinned ? `<span class="forum-thread-badge" title="Закреплено">${ICON_PIN}</span>` : ''}${t.is_locked ? `<span class="forum-thread-badge locked" title="Закрыто">${ICON_LOCK}</span>` : ''}${escapeHtml(t.title)}</div>
      <div class="forum-thread-meta">${escapeHtml(authorMap.get(t.user_id) || '?')} · ${date}</div>
    </div>
    <div class="forum-thread-stats">
      <b>${replies}</b>
      <span>${pluralRu(replies, 'ответ', 'ответа', 'ответов')}</span>
    </div>
  </a>`;
}

async function renderThreadList(categoryId){
  const { data: cat } = await SB.from('forum_categories').select('*').eq('id', categoryId).single();
  if (!cat) { location.href = 'forum.html'; return; }
  document.getElementById('catTitle').textContent = cat.title;
  document.getElementById('catDesc').textContent = cat.description || '';

  const { data: threads } = await SB.from('forum_threads')
    .select('*, forum_posts(count)')
    .eq('category_id', categoryId)
    .order('is_pinned', { ascending: false })
    .order('last_activity_at', { ascending: false });

  const list = document.getElementById('threadList');
  if (!threads || !threads.length) { list.innerHTML = '<div class="empty">Пока нет тем — станьте первым</div>'; return; }

  const authorIds = [...new Set(threads.map(t => t.user_id))];
  const { data: authors } = await SB.from('profiles').select('id, username').in('id', authorIds);
  const authorMap = new Map((authors || []).map(a => [a.id, a.username]));

  list.innerHTML = threads.map(t => threadRowHtml(t, authorMap)).join('');
  if (window.animateChildren) animateChildren(list);
}

function setupNewThreadForm(){
  const mount = document.getElementById('ntEditorMount');
  mount.innerHTML = courseRichEditorHtml('ntBody', '');
  mount.querySelector('.rt-editable').setAttribute('data-placeholder', 'О чём тема? Опишите вопрос или мысль подробнее…');
  makeRichEditor(mount.querySelector('.course-rich-editor'), { full: true, onImageUpload: async f => (await uploadForumAsset(f)).url, onFileUpload: uploadForumAsset });

  document.getElementById('newThreadBtn').addEventListener('click', () => {
    document.getElementById('newThreadForm').classList.toggle('open');
  });

  document.getElementById('newThreadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('ntStatus');
    const btn = document.getElementById('ntSubmit');
    const title = document.getElementById('ntTitle').value.trim();
    const editable = mount.querySelector('.rt-editable');
    if (title.length < 3) { statusEl.textContent = 'Заголовок — минимум 3 символа'; statusEl.className = 'form-status error'; return; }
    if (!editable.textContent.trim()) { statusEl.textContent = 'Напишите текст темы'; statusEl.className = 'form-status error'; return; }

    const html = sanitizeRichHtml(editable.innerHTML);
    btn.disabled = true;
    statusEl.textContent = '';
    const { data: threadId, error } = await SB.rpc('create_forum_thread', { p_category_id: currentCategoryId, p_title: title, p_content: html });
    if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'form-status error'; btn.disabled = false; return; }
    location.href = 'thread.html?thread=' + threadId;
  });
}

async function init(){
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).select().then(({ data, error }) => { if (error) console.error('last_seen_at update failed:', error); else if (!data || !data.length) console.warn('last_seen_at: 0 строк обновлено — возможно, истекла сессия'); });

  const { data: profile } = await SB.from('profiles').select('role, is_banned, ban_reason').eq('id', currentUid).single();
  if (window.enforceBanGate && enforceBanGate(SB, profile)) return;
  currentRole = profile ? profile.role : null;
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('adminLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);
  if (window.mountPmInbox) mountPmInbox(SB, document.getElementById('pmMount'), currentUid);

  document.getElementById('loading').style.display = 'none';

  currentCategoryId = new URLSearchParams(location.search).get('category');
  if (currentCategoryId) {
    const view = document.getElementById('categoryView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '20px';
    setupNewThreadForm();
    await renderThreadList(currentCategoryId);
  } else {
    const view = document.getElementById('listView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '24px';
    await renderCategoryList();
  }
}

init();
