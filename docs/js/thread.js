// ══════════════════════════════════════
//  ТЕМА ФОРУМА — открывающий пост + ответы одним и тем же рендерером
//  (is_op=true у первого), реакции, цитата, редактирование/удаление,
//  жалобы, закреп/блокировка для MENTOR/ADMIN.
// ══════════════════════════════════════
const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;
let currentRole = null;
let threadId = null;
let threadData = null;
let quotePostId = null;
let quotePreviewLabel = '';
let isSubscribed = false;

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function isStaff(role){ return role === 'MENTOR' || role === 'ADMIN'; }

const ICON_PIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
const ICON_PENCIL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>';
const ICON_QUOTE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 6-2 6-6V7H3v8h3c0 1.5-1 3-3 3zM15 21c3 0 6-2 6-6V7h-6v8h3c0 1.5-1 3-3 3z"/></svg>';
const ICON_FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>';
const ICON_BELL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const ICON_THANKS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';

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

function stripHtml(html){
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').trim();
}

// ── Реакции ──
async function toggleReaction(postId, emoji, authorId){
  const { data: mine } = await SB.from('forum_post_reactions').select('id').eq('post_id', postId).eq('user_id', currentUid).eq('emoji', emoji).maybeSingle();
  if (mine) {
    await SB.from('forum_post_reactions').delete().eq('id', mine.id);
  } else {
    await SB.from('forum_post_reactions').insert({ post_id: postId, user_id: currentUid, emoji });
    if (window.notifyUser) notifyUser(SB, { userId: authorId, actorId: currentUid, type: 'forum_reaction', contentType: 'forum_thread', contentId: threadId });
  }
  await refreshPostReactions(postId, authorId);
}

async function refreshPostReactions(postId, authorId){
  const { data: rows } = await SB.from('forum_post_reactions').select('emoji, user_id').eq('post_id', postId);
  const wrap = document.querySelector(`.forum-post[data-post-id="${postId}"] .emoji-pills`);
  if (!wrap) return;
  const counts = new Map();
  (rows || []).forEach(r => {
    const cur = counts.get(r.emoji) || { count: 0, mine: false };
    cur.count++;
    if (r.user_id === currentUid) cur.mine = true;
    counts.set(r.emoji, cur);
  });
  wrap.innerHTML = Array.from(counts.entries()).map(([emoji, v]) =>
    `<button type="button" class="emoji-pill${v.mine ? ' mine' : ''}" data-emoji="${emoji}">${emoji} ${v.count}</button>`
  ).join('');
  wrap.querySelectorAll('.emoji-pill').forEach(btn => {
    btn.addEventListener('click', () => toggleReaction(postId, btn.dataset.emoji, authorId));
  });
}

// ── "Спасибо" (репутация) — отдельно от эмодзи-реакций, по одному на пост от человека ──
async function toggleThanks(postId, authorId, btn){
  const { data: mine } = await SB.from('forum_thanks').select('id').eq('post_id', postId).eq('from_user_id', currentUid).maybeSingle();
  btn.disabled = true;
  if (mine) {
    await SB.from('forum_thanks').delete().eq('id', mine.id);
  } else {
    const { error } = await SB.from('forum_thanks').insert({ post_id: postId, from_user_id: currentUid, to_user_id: authorId });
    if (!error && window.notifyUser) notifyUser(SB, { userId: authorId, actorId: currentUid, type: 'forum_thanks', contentType: 'forum_thread', contentId: threadId });
  }
  btn.disabled = false;
  await refreshPostThanks(postId, authorId);
}

async function refreshPostThanks(postId, authorId){
  const btn = document.querySelector(`.forum-post[data-post-id="${postId}"] .forum-thanks-btn`);
  if (!btn) return;
  const { data: rows } = await SB.from('forum_thanks').select('from_user_id').eq('post_id', postId);
  const mine = (rows || []).some(r => r.from_user_id === currentUid);
  btn.classList.toggle('active', mine);
  btn.querySelector('.forum-thanks-count').textContent = (rows || []).length;
  btn.title = mine ? 'Убрать "спасибо"' : 'Сказать спасибо за пост';
}

function closeAllEmojiPickers(except){
  document.querySelectorAll('.emoji-picker.open').forEach(p => { if (p !== except) p.classList.remove('open'); });
}
document.addEventListener('click', () => closeAllEmojiPickers());

// ── Рендер одного поста (и OP, и ответ — один и тот же вид) ──
function postCardHtml(post, ctx){
  const author = ctx.authorMap.get(post.user_id) || { username: '?', role: 'STUDENT', avatar_color: '' };
  const initials = (author.username || '??').slice(0, 2).toUpperCase();
  const isOwn = post.user_id === currentUid;
  const staff = isStaff(currentRole);
  const date = new Date(post.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const roleBadge = ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(author.role)
    ? `<span class="forum-role-badge role-${author.role}">${author.role === 'ADMIN' ? 'ADMIN' : author.role === 'MENTOR' ? 'MENTOR' : 'PRO'}</span>` : '';

  let quoteHtml = '';
  if (post.quote_post_id) {
    const q = ctx.postsById.get(post.quote_post_id);
    if (q) {
      const qAuthor = ctx.authorMap.get(q.user_id);
      quoteHtml = `<div class="forum-post-quote"><b>${escapeHtml(qAuthor ? qAuthor.username : '?')}:</b> ${escapeHtml(stripHtml(q.content)).slice(0, 200)}</div>`;
    } else {
      quoteHtml = `<div class="forum-post-quote">Цитируемое сообщение удалено</div>`;
    }
  }

  const actions = [];
  actions.push(`<button type="button" class="forum-icon-btn quoteBtn" title="Цитировать">${ICON_QUOTE}</button>`);
  if (isOwn || staff) actions.push(`<button type="button" class="forum-icon-btn editBtn" title="Редактировать">${ICON_PENCIL}</button>`);
  if (!isOwn) actions.push(`<button type="button" class="forum-icon-btn reportBtn" title="Пожаловаться">${ICON_FLAG}</button>`);
  if (!post.is_op && (isOwn || staff)) actions.push(`<button type="button" class="forum-icon-btn danger delBtn" title="Удалить">${ICON_TRASH}</button>`);

  return `<div class="card forum-post${post.is_op ? ' is-op' : ''}" data-post-id="${post.id}">
    <div class="forum-post-head">
      <div class="forum-post-avatar" style="background:${author.avatar_color || 'var(--amber)'}">${initials}</div>
      <div class="forum-post-meta">
        <div class="forum-post-name">${escapeHtml(author.username)}${roleBadge}</div>
        <div class="forum-post-time">${date}${post.updated_at ? ' <span class="forum-post-edited">· изменено</span>' : ''}</div>
      </div>
      <div class="forum-post-actions">${actions.join('')}</div>
    </div>
    ${quoteHtml}
    <div class="forum-post-body rt-editable-view">${sanitizeRichHtml(post.content)}</div>
    ${author.bio ? `<div class="forum-post-signature">${escapeHtml(author.bio)}</div>` : ''}
    <div class="forum-reactions">
      <div class="emoji-pills"></div>
      <div class="emoji-add">
        <button type="button" class="emoji-add-btn" title="Добавить реакцию">+</button>
        <div class="emoji-picker">${EMOJI_SET.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
      </div>
      ${isOwn ? '' : `<button type="button" class="forum-thanks-btn" title="Сказать спасибо за пост">${ICON_THANKS} <span class="forum-thanks-count">0</span></button>`}
    </div>
  </div>`;
}

function wirePostCard(el, post, ctx){
  const author = ctx.authorMap.get(post.user_id) || { username: '?' };

  el.querySelector('.quoteBtn').addEventListener('click', () => {
    quotePostId = post.id;
    quotePreviewLabel = `${author.username}: ${stripHtml(post.content).slice(0, 140)}`;
    const qp = document.getElementById('quotePreview');
    document.getElementById('quotePreviewText').textContent = quotePreviewLabel;
    qp.classList.add('show');
    document.getElementById('replyForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const reportBtn = el.querySelector('.reportBtn');
  if (reportBtn) reportBtn.addEventListener('click', () => handleReport(post.id, reportBtn));

  const editBtn = el.querySelector('.editBtn');
  if (editBtn) editBtn.addEventListener('click', () => startEdit(el, post));

  const delBtn = el.querySelector('.delBtn');
  if (delBtn) delBtn.addEventListener('click', () => handleDeletePost(post));

  el.querySelector('.emoji-add-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const picker = el.querySelector('.emoji-picker');
    const opening = !picker.classList.contains('open');
    closeAllEmojiPickers();
    if (opening) picker.classList.add('open');
  });
  el.querySelectorAll('.emoji-picker button').forEach(btn => {
    btn.addEventListener('click', () => { toggleReaction(post.id, btn.dataset.e, post.user_id); closeAllEmojiPickers(); });
  });

  const thanksBtn = el.querySelector('.forum-thanks-btn');
  if (thanksBtn) thanksBtn.addEventListener('click', () => toggleThanks(post.id, post.user_id, thanksBtn));

  refreshPostReactions(post.id, post.user_id);
  if (thanksBtn) refreshPostThanks(post.id, post.user_id);
}

async function handleReport(postId, btn){
  const reason = prompt('Почему жалуетесь на это сообщение? (необязательно)', '');
  if (reason === null) return;
  btn.disabled = true;
  const { error } = await SB.from('content_reports').insert({ reporter_id: currentUid, content_type: 'forum_post', content_id: postId, reason: reason || null });
  if (error) {
    if (error.code === '23505') { btn.innerHTML = ICON_FLAG; alert('Вы уже жаловались на это сообщение'); }
    else alert('Не удалось отправить жалобу: ' + error.message);
    btn.disabled = false;
    return;
  }
  btn.innerHTML = '✓';
}

function startEdit(el, post){
  const body = el.querySelector('.forum-post-body');
  const original = body.innerHTML;
  body.innerHTML = `${courseRichEditorHtml('editBody', post.content)}<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn-primary saveEditBtn">Сохранить</button><button type="button" class="forum-icon-btn cancelEditBtn">Отмена</button></div>`;
  const mount = body.querySelector('.course-rich-editor');
  makeRichEditor(mount, { full: true, onImageUpload: async f => (await uploadForumAsset(f)).url, onFileUpload: uploadForumAsset });
  body.querySelector('.cancelEditBtn').addEventListener('click', () => { body.innerHTML = original; });
  body.querySelector('.saveEditBtn').addEventListener('click', async () => {
    const html = sanitizeRichHtml(mount.querySelector('.rt-editable').innerHTML);
    if (!mount.querySelector('.rt-editable').textContent.trim()) return;
    const { error } = await SB.rpc('edit_forum_post', { p_post_id: post.id, p_content: html });
    if (error) { alert('Не удалось сохранить: ' + error.message); return; }
    await loadThread();
  });
}

async function handleDeletePost(post){
  if (post.is_op) {
    if (!confirm('Удалить всю тему целиком? Это удалит и все ответы. Отменить нельзя.')) return;
    const { error } = await SB.from('forum_threads').delete().eq('id', threadId);
    if (error) { alert('Не удалось удалить тему: ' + error.message); return; }
    location.href = 'forum.html' + (threadData ? '?category=' + threadData.category_id : '');
    return;
  }
  if (!confirm('Удалить это сообщение?')) return;
  const { error } = await SB.from('forum_posts').delete().eq('id', post.id);
  if (error) { alert('Не удалось удалить: ' + error.message); return; }
  await loadThread();
}

// ── Модерация темы (закреп/блокировка) ──
async function handleTogglePin(){
  const { error } = await SB.from('forum_threads').update({ is_pinned: !threadData.is_pinned }).eq('id', threadId);
  if (error) { alert('Не удалось изменить: ' + error.message); return; }
  await loadThread();
}
async function handleToggleLock(){
  const { error } = await SB.from('forum_threads').update({ is_locked: !threadData.is_locked }).eq('id', threadId);
  if (error) { alert('Не удалось изменить: ' + error.message); return; }
  await loadThread();
}

// Подписка на тему — свои посты и так автоподписывают через триггер в базе
// (034_forum_subscriptions.sql), это для тех, кто хочет следить за темой,
// не оставляя сообщений, или наоборот — отписаться от своей же темы.
async function checkSubscription(){
  const { data } = await SB.from('forum_subscriptions').select('thread_id').eq('thread_id', threadId).eq('user_id', currentUid).maybeSingle();
  isSubscribed = !!data;
}

async function handleToggleSubscribe(btn){
  btn.disabled = true;
  if (isSubscribed) {
    const { error } = await SB.from('forum_subscriptions').delete().eq('thread_id', threadId).eq('user_id', currentUid);
    if (error) { alert('Не удалось отписаться: ' + error.message); btn.disabled = false; return; }
    isSubscribed = false;
  } else {
    const { error } = await SB.from('forum_subscriptions').insert({ thread_id: threadId, user_id: currentUid });
    if (error) { alert('Не удалось подписаться: ' + error.message); btn.disabled = false; return; }
    isSubscribed = true;
  }
  renderHeader();
}

function renderHeader(){
  const badges = (threadData.is_pinned ? `<span class="forum-thread-badge" title="Закреплено">${ICON_PIN}</span>` : '') +
    (threadData.is_locked ? `<span class="forum-thread-badge locked" title="Закрыто">${ICON_LOCK}</span>` : '');
  document.getElementById('threadTitle').innerHTML = badges + escapeHtml(threadData.title);
  document.title = 'MIXPRO — ' + threadData.title;

  const actions = document.getElementById('threadActions');
  const canDeleteThread = threadData.user_id === currentUid || isStaff(currentRole);
  const btns = [];
  btns.push(`<button type="button" class="forum-icon-btn${isSubscribed ? ' active' : ''}" id="subBtn" title="${isSubscribed ? 'Отписаться от темы' : 'Подписаться на тему (уведомления об ответах)'}">${ICON_BELL}</button>`);
  if (isStaff(currentRole)) {
    btns.push(`<button type="button" class="forum-icon-btn${threadData.is_pinned ? ' active' : ''}" id="pinBtn" title="${threadData.is_pinned ? 'Открепить' : 'Закрепить'}">${ICON_PIN}</button>`);
    btns.push(`<button type="button" class="forum-icon-btn${threadData.is_locked ? ' active' : ''}" id="lockBtn" title="${threadData.is_locked ? 'Открыть тему' : 'Закрыть тему'}">${threadData.is_locked ? ICON_UNLOCK : ICON_LOCK}</button>`);
  }
  if (canDeleteThread) {
    btns.push(`<button type="button" class="forum-icon-btn danger" id="deleteThreadBtn" title="Удалить тему">${ICON_TRASH}</button>`);
  }
  actions.innerHTML = btns.join('');
  document.getElementById('subBtn').addEventListener('click', () => handleToggleSubscribe(document.getElementById('subBtn')));
  if (document.getElementById('pinBtn')) document.getElementById('pinBtn').addEventListener('click', handleTogglePin);
  if (document.getElementById('lockBtn')) document.getElementById('lockBtn').addEventListener('click', handleToggleLock);
  if (document.getElementById('deleteThreadBtn')) document.getElementById('deleteThreadBtn').addEventListener('click', () => {
    const opRow = document.querySelector('.forum-post.is-op');
    if (opRow) handleDeletePost({ id: opRow.dataset.postId, is_op: true });
  });

  document.getElementById('backLink').href = 'forum.html?category=' + threadData.category_id;

  const replyForm = document.getElementById('replyForm');
  const lockedNotice = document.getElementById('lockedNotice');
  if (threadData.is_locked && !isStaff(currentRole)) {
    replyForm.style.display = 'none';
    lockedNotice.style.display = 'block';
  } else {
    replyForm.style.display = 'flex';
    lockedNotice.style.display = 'none';
  }
}

async function loadThread(){
  const { data: thread } = await SB.from('forum_threads').select('*').eq('id', threadId).single();
  if (!thread) { location.href = 'forum.html'; return; }
  threadData = thread;
  await checkSubscription();
  renderHeader();

  const { data: posts } = await SB.from('forum_posts').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
  const rows = posts || [];
  const postsById = new Map(rows.map(p => [p.id, p]));

  const authorIds = [...new Set(rows.map(p => p.user_id))];
  const { data: authors } = authorIds.length ? await SB.from('profiles').select('id, username, role, avatar_color, bio').in('id', authorIds) : { data: [] };
  const authorMap = new Map((authors || []).map(a => [a.id, a]));

  const ctx = { postsById, authorMap };
  const list = document.getElementById('postsList');
  list.innerHTML = '';
  rows.forEach(post => {
    const wrap = document.createElement('div');
    wrap.innerHTML = postCardHtml(post, ctx);
    const el = wrap.firstElementChild;
    list.appendChild(el);
    wirePostCard(el, post, ctx);
  });
  if (window.animateChildren) animateChildren(list);
}

function setupReplyComposer(){
  const mount = document.getElementById('replyEditorMount');
  mount.innerHTML = courseRichEditorHtml('replyBody', '');
  mount.querySelector('.rt-editable').setAttribute('data-placeholder', 'Ваш ответ…');
  makeRichEditor(mount.querySelector('.course-rich-editor'), { full: true, onImageUpload: async f => (await uploadForumAsset(f)).url, onFileUpload: uploadForumAsset });

  document.getElementById('quoteCancelBtn').addEventListener('click', () => {
    quotePostId = null;
    document.getElementById('quotePreview').classList.remove('show');
  });

  document.getElementById('replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('replyStatus');
    const btn = document.getElementById('replySubmit');
    const editable = mount.querySelector('.rt-editable');
    if (!editable.textContent.trim()) { statusEl.textContent = 'Напишите текст ответа'; statusEl.className = 'composer-status error'; return; }
    const html = sanitizeRichHtml(editable.innerHTML);
    btn.disabled = true;
    statusEl.textContent = '';
    const { error } = await SB.from('forum_posts').insert({ thread_id: threadId, user_id: currentUid, content: html, quote_post_id: quotePostId });
    btn.disabled = false;
    if (error) { statusEl.textContent = 'Ошибка: ' + error.message; statusEl.className = 'composer-status error'; return; }
    editable.innerHTML = '';
    quotePostId = null;
    document.getElementById('quotePreview').classList.remove('show');
    await loadThread();
    document.getElementById('postsList').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function init(){
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;
  SB.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUid).select().then(({ data, error }) => { if (error) console.error('last_seen_at update failed:', error); else if (!data || !data.length) console.warn('last_seen_at: 0 строк обновлено — возможно, истекла сессия'); });

  threadId = new URLSearchParams(location.search).get('thread');
  if (!threadId) { location.href = 'forum.html'; return; }

  const { data: profile } = await SB.from('profiles').select('role, is_banned, ban_reason').eq('id', currentUid).single();
  if (window.enforceBanGate && enforceBanGate(SB, profile)) return;
  currentRole = profile ? profile.role : null;
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('adminLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);
  if (window.mountPmInbox) mountPmInbox(SB, document.getElementById('pmMount'), currentUid);

  // SB.rpc(...) — ленивый билдер, запрос не уйдёт без await/.then().
  SB.rpc('increment_thread_view', { p_thread_id: threadId }).then(() => {});

  setupReplyComposer();
  await loadThread();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '18px';
}

init();
