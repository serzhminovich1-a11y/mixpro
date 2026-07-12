const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const EMOJI_SET = ['🔥', '👏', '❤️', '😂', '💡', '👎'];

let currentUid = null;
let currentUsername = null;
let currentRole = null;
let followingSet = new Set();
let pendingFile = null;

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function initialsOf(name){ return (name || '??').slice(0, 2).toUpperCase(); }
function timeAgo(iso){
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return diffMin + ' мин назад';
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return diffH + ' ч назад';
  return d.toLocaleDateString('ru-RU');
}

/* ══════════════════════════════════════
   КОМПОЗЕР
   ══════════════════════════════════════ */
function pickAttachmentType(file){
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('attachBtn').addEventListener('click', () => document.getElementById('attachInput').click());
  document.getElementById('attachInput').addEventListener('change', (e) => {
    pendingFile = e.target.files[0] || null;
    const preview = document.getElementById('attachPreview');
    if (pendingFile) {
      document.getElementById('attachName').textContent = '📎 ' + pendingFile.name;
      preview.classList.add('show');
    } else {
      preview.classList.remove('show');
    }
  });
  document.getElementById('attachRemove').addEventListener('click', () => {
    pendingFile = null;
    document.getElementById('attachInput').value = '';
    document.getElementById('attachPreview').classList.remove('show');
  });
  document.getElementById('composerForm').addEventListener('submit', handlePublish);
});

async function handlePublish(e){
  e.preventDefault();
  const textEl = document.getElementById('postContent');
  const content = textEl.value.trim();
  if (!content && !pendingFile) return;

  const btn = document.getElementById('postBtn');
  const status = document.getElementById('composerStatus');
  btn.disabled = true;
  status.textContent = pendingFile ? 'Загружаем вложение...' : 'Публикуем...';
  status.className = 'composer-status';

  let attachment_type = null, attachment_url = null, attachment_name = null;
  if (pendingFile) {
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${currentUid}/${Date.now()}_${safeName}`;
    const { error: upErr } = await SB.storage.from('posts').upload(path, pendingFile);
    if (upErr) {
      status.textContent = 'Не удалось загрузить вложение: ' + upErr.message;
      status.className = 'composer-status error';
      btn.disabled = false;
      return;
    }
    const { data: pub } = SB.storage.from('posts').getPublicUrl(path);
    attachment_type = pickAttachmentType(pendingFile);
    attachment_url = pub.publicUrl;
    attachment_name = pendingFile.name;
  }

  const { error } = await SB.from('posts').insert({
    user_id: currentUid,
    content: content || null,
    attachment_type, attachment_url, attachment_name,
  });

  btn.disabled = false;
  if (error) {
    status.textContent = 'Ошибка: ' + error.message;
    status.className = 'composer-status error';
    return;
  }
  status.textContent = '';
  textEl.value = '';
  pendingFile = null;
  document.getElementById('attachInput').value = '';
  document.getElementById('attachPreview').classList.remove('show');
  renderFeed();
}

/* ══════════════════════════════════════
   ПОСТЫ
   ══════════════════════════════════════ */
function attachmentHtml(p){
  if (!p.attachment_url) return '';
  if (p.attachment_type === 'audio') return `<div class="post-attachment"><audio controls src="${p.attachment_url}"></audio></div>`;
  if (p.attachment_type === 'video') return `<div class="post-attachment"><video controls src="${p.attachment_url}"></video></div>`;
  return `<div class="post-attachment"><a class="post-file-link" href="${p.attachment_url}" target="_blank" rel="noopener">📎 ${escapeHtml(p.attachment_name || 'Файл')}</a></div>`;
}

async function handleFollowToggle(authorId, btn){
  btn.disabled = true;
  if (followingSet.has(authorId)) {
    await SB.from('follows').delete().eq('follower_id', currentUid).eq('following_id', authorId);
    followingSet.delete(authorId);
    btn.textContent = 'Подписаться';
    btn.classList.remove('following');
  } else {
    await SB.from('follows').insert({ follower_id: currentUid, following_id: authorId });
    followingSet.add(authorId);
    btn.textContent = 'Вы подписаны';
    btn.classList.add('following');
  }
  btn.disabled = false;
}

async function handleDeletePost(post, card){
  if (!confirm('Удалить пост?')) return;
  if (post.attachment_url) {
    const idx = post.attachment_url.indexOf('/posts/');
    if (idx !== -1) {
      const path = decodeURIComponent(post.attachment_url.slice(idx + '/posts/'.length));
      await SB.storage.from('posts').remove([path]);
    }
  }
  const { error } = await SB.from('posts').delete().eq('id', post.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  card.remove();
}

async function toggleReaction(postId, emoji, pillWrap){
  const { data: mine } = await SB.from('post_reactions').select('id')
    .eq('post_id', postId).eq('user_id', currentUid).eq('emoji', emoji);
  if (mine && mine.length) {
    await SB.from('post_reactions').delete().eq('post_id', postId).eq('user_id', currentUid).eq('emoji', emoji);
  } else {
    await SB.from('post_reactions').insert({ post_id: postId, user_id: currentUid, emoji });
  }
  await refreshReactions(postId, pillWrap);
}

async function refreshReactions(postId, pillWrap){
  const { data } = await SB.from('post_reactions').select('emoji, user_id').eq('post_id', postId);
  const counts = new Map();
  (data || []).forEach(r => {
    const cur = counts.get(r.emoji) || { count: 0, mine: false };
    cur.count++;
    if (r.user_id === currentUid) cur.mine = true;
    counts.set(r.emoji, cur);
  });
  pillWrap.innerHTML = '';
  counts.forEach((v, emoji) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'emoji-pill' + (v.mine ? ' mine' : '');
    pill.textContent = `${emoji} ${v.count}`;
    pill.addEventListener('click', () => toggleReaction(postId, emoji, pillWrap));
    pillWrap.appendChild(pill);
  });
}

function commentRow(c){
  const div = document.createElement('div');
  div.className = 'comment-row';
  const username = (c.profiles && c.profiles.username) || '?';
  div.innerHTML = `
    <div class="comment-avatar">${initialsOf(username)}</div>
    <div class="comment-body"><div class="cname">${escapeHtml(username)}</div><div class="ctext">${escapeHtml(c.content)}</div></div>`;
  return div;
}

async function loadComments(postId, container){
  const { data } = await SB.from('post_comments').select('*, profiles(username)').eq('post_id', postId).order('created_at', { ascending: true });
  container.querySelectorAll('.comment-row').forEach(el => el.remove());
  const form = container.querySelector('.comment-form');
  (data || []).forEach(c => container.insertBefore(commentRow(c), form));
}

async function handleAddComment(postId, input, container, countEl){
  const text = input.value.trim();
  if (!text) return;
  const { error } = await SB.from('post_comments').insert({ post_id: postId, user_id: currentUid, content: text });
  if (error) { alert('Ошибка: ' + error.message); return; }
  input.value = '';
  await loadComments(postId, container);
  const { count } = await SB.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId);
  countEl.textContent = '💬 ' + (count || 0);
}

function postCard(p, commentCounts){
  const card = document.createElement('div');
  card.className = 'card post';

  const author = p.profiles || {};
  const username = author.username || 'Пользователь';
  const isOwn = p.user_id === currentUid;
  const commentCount = commentCounts.get(p.id) || 0;

  card.innerHTML = `
    <div class="post-head">
      <div class="post-avatar" style="background:${author.avatar_color || ''}">${initialsOf(username)}</div>
      <div class="post-meta"><div class="name">${escapeHtml(username)}</div><div class="time">${timeAgo(p.created_at)}</div></div>
      ${!isOwn ? `<button type="button" class="follow-btn ${followingSet.has(p.user_id) ? 'following' : ''}">${followingSet.has(p.user_id) ? 'Вы подписаны' : 'Подписаться'}</button>` : ''}
      ${(isOwn || currentRole === 'ADMIN') ? '<button type="button" class="post-del" title="Удалить">🗑</button>' : ''}
    </div>
    ${p.content ? `<div class="post-body">${escapeHtml(p.content)}</div>` : ''}
    ${attachmentHtml(p)}
    <div class="post-actions">
      <div class="emoji-pills"></div>
      <div class="emoji-add">
        <button type="button" class="emoji-add-btn">+</button>
        <div class="emoji-picker">${EMOJI_SET.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
      </div>
      <button type="button" class="comment-toggle">💬 ${commentCount}</button>
    </div>
    <div class="comments">
      <div class="comment-form"><input type="text" placeholder="Написать комментарий..."><button type="button">→</button></div>
    </div>`;

  const followBtn = card.querySelector('.follow-btn');
  if (followBtn) followBtn.addEventListener('click', () => handleFollowToggle(p.user_id, followBtn));

  const delBtn = card.querySelector('.post-del');
  if (delBtn) delBtn.addEventListener('click', () => handleDeletePost(p, card));

  const pillWrap = card.querySelector('.emoji-pills');
  refreshReactions(p.id, pillWrap);

  const emojiBtn = card.querySelector('.emoji-add-btn');
  const picker = card.querySelector('.emoji-picker');
  emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); picker.classList.toggle('open'); });
  picker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { toggleReaction(p.id, b.dataset.e, pillWrap); picker.classList.remove('open'); });
  });
  document.addEventListener('click', (e) => { if (!card.contains(e.target)) picker.classList.remove('open'); });

  const commentsBox = card.querySelector('.comments');
  const commentToggle = card.querySelector('.comment-toggle');
  let commentsLoaded = false;
  commentToggle.addEventListener('click', async () => {
    commentsBox.classList.toggle('open');
    if (commentsBox.classList.contains('open') && !commentsLoaded) {
      commentsLoaded = true;
      await loadComments(p.id, commentsBox);
    }
  });
  const commentInput = commentsBox.querySelector('input');
  const commentSendBtn = commentsBox.querySelector('.comment-form button');
  const send = () => handleAddComment(p.id, commentInput, commentsBox, commentToggle);
  commentSendBtn.addEventListener('click', send);
  commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  return card;
}

async function renderFeed(){
  const list = document.getElementById('postsList');
  const { data: posts, error } = await SB.from('posts')
    .select('*, profiles(username, avatar_color)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !posts || posts.length === 0) {
    list.innerHTML = '<div class="empty">Постов пока нет — напиши первый!</div>';
    return;
  }

  const postIds = posts.map(p => p.id);
  const { data: comments } = await SB.from('post_comments').select('post_id').in('post_id', postIds);
  const commentCounts = new Map();
  (comments || []).forEach(c => commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1));

  list.innerHTML = '';
  posts.forEach(p => list.appendChild(postCard(p, commentCounts)));
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  currentUid = session.user.id;

  const { data: profile } = await SB.from('profiles').select('username, role').eq('id', currentUid).single();
  currentUsername = profile ? profile.username : null;
  currentRole = profile ? profile.role : null;

  const { data: myFollows } = await SB.from('follows').select('following_id').eq('follower_id', currentUid);
  followingSet = new Set((myFollows || []).map(f => f.following_id));

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '20px';

  await renderFeed();
}

init();
