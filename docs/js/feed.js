const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const EMOJI_SET = ['🔥', '👏', '❤️', '😂', '💡', '👎'];

// Контурные SVG-иконки вместо эмодзи для служебных кнопок (запись,
// вложение, закрыть, редактировать, удалить, пожаловаться и т.п.) —
// сами реакции (EMOJI_SET выше) остаются настоящими эмодзи, это разное.
function feedIcon(path){ return `<svg class="feed-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
const ICON_MIC = feedIcon('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>');
const ICON_STOP = feedIcon('<rect x="6" y="6" width="12" height="12" rx="1.5"/>');
const ICON_PAPERCLIP = feedIcon('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>');
const ICON_X = feedIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
const ICON_FLAG = feedIcon('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>');
const ICON_CHECK = feedIcon('<path d="M20 6 9 17l-5-5"/>');
const ICON_MESSAGE = feedIcon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>');
const ICON_PENCIL = feedIcon('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>');
const ICON_TRASH = feedIcon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>');

let currentUid = null;
let currentUsername = null;
let currentRole = null;
let followingSet = new Set();
let pendingFile = null;

// Пауза остальных плееров на странице, когда запускается новый — иначе
// вложения постов, голосовые комментарии и плеер с волной могут играть
// внахлёст. mixpro:pauseOtherPlayers — тот же сигнал, что слушает
// createWavePlayer() из waveform_player.js.
document.addEventListener('play', (e) => {
  if (e.target.tagName !== 'AUDIO' && e.target.tagName !== 'VIDEO') return;
  document.querySelectorAll('audio, video').forEach(el => { if (el !== e.target) el.pause(); });
  document.dispatchEvent(new CustomEvent('mixpro:pauseOtherPlayers', { detail: e.target }));
}, true);

// Один общий обработчик на все пикеры реакций (а не по одному на пост —
// иначе клик по кнопке другого поста "проваливался" мимо старых
// слушателей из-за stopPropagation, и открытые пикеры не закрывались).
function closeAllEmojiPickers(){
  document.querySelectorAll('.emoji-picker.open').forEach(p => p.classList.remove('open'));
}
document.addEventListener('click', closeAllEmojiPickers);

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
   ФИЛЬТР МАТА — автоматически заменяет найденные слова звёздочками
   до того, как текст попадёт в базу. Ловит основные формы через корни
   слов и частые способы обхода (英/лат буквы-омоглифы, "х.у.й" через
   точки/дефисы внутри одного "слова"). Не ловит намеренно разбитые
   пробелами буквы ("х у й") — это отдельная, гораздо более сложная
   задача, для нее лучше жалобы + модератор.
   ══════════════════════════════════════ */
const PROFANITY_ROOTS = [
  'хуй', 'хуя', 'хуе', 'хуё', 'хуи', 'хую',
  'пизд',
  'еба', 'ёба', 'ебу', 'ебё', 'ебы', 'ебл',
  'бляд', 'блят',
  'муда', 'мудо',
  'пидор', 'пидар', 'пидр',
  'гондон',
  'залуп',
];
// Короткие корни небезопасно матчить как подстроку (например "бля" входит
// в безобидное "бляха-муха") — эти проверяем только на точное совпадение
// со всем словом.
const PROFANITY_EXACT_WORDS = ['бля', 'ебн'];
const PROFANITY_HOMOGLYPHS = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };

function normalizeForFilter(chunk){
  let s = '';
  for (const ch of chunk.toLowerCase()) s += PROFANITY_HOMOGLYPHS[ch] || ch;
  return s.replace(/[^a-zа-яё]/gi, '');
}
// Заменяет найденные "плохие" слова звёздочками той же длины, что и оригинал.
// Работает на обычном тексте (используется и для комментариев, и как шаг
// внутри sanitizeRichHtml — там применяется к каждому текстовому узлу,
// так что HTML-теги форматирования никогда не задеваются).
function censorText(text){
  if (!text) return text;
  return text.split(/(\s+)/).map(chunk => {
    if (!chunk || /^\s+$/.test(chunk)) return chunk;
    const core = normalizeForFilter(chunk);
    const isBad = PROFANITY_EXACT_WORDS.includes(core) || PROFANITY_ROOTS.some(root => core.includes(root));
    return isBad ? '*'.repeat(chunk.length) : chunk;
  }).join('');
}

/* ══════════════════════════════════════
   ГАРД НА ПОЛИТИКУ — в отличие от мата, тут не подменяем слова звёздочками
   (пост из одних звёздочек выглядит как баг, не как решение), а просто
   не даём отправить, с понятным сообщением — можно отредактировать
   и отправить снова. Список — только однозначно политические имена/
   термины: специально не включили голое "война" — это ещё и обычный
   термин в сведении ("война громкости"/"война миксов"), было бы много
   ложных срабатываний именно на этой площадке.
   ══════════════════════════════════════ */
const POLITICAL_KEYWORDS = [
  'путин', 'зеленск', 'байден', 'трамп', 'лукашенко', 'порошенко', 'макрон',
  'кремл', 'госдум', 'минобороны', 'спецоперац', 'мобилизац',
  'нато', 'донбасс', 'вторжени', 'госпереворот', 'референдум',
  'санкци', 'оппозици',
];
function containsPoliticalContent(text){
  if (!text) return false;
  const core = normalizeForFilter(text);
  return POLITICAL_KEYWORDS.some(kw => core.includes(kw));
}
const POLITICAL_GUARD_MESSAGE = 'Здесь не обсуждаем политику — только про звук и музыку 🎧. Отредактируй текст.';

/* ══════════════════════════════════════
   ФОРМАТИРОВАННЫЙ ТЕКСТ (жирный/курсив/подчёркнутый/зачёркнутый/шрифт/размер)
   ══════════════════════════════════════ */
const RICH_ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'DIV', 'P']);
const RICH_ALLOWED_STYLE_PROPS = ['font-family', 'font-size', 'text-decoration'];
const RICH_FONT_SIZE_MAP = { '1': '10px', '2': '12px', '3': '15px', '4': '17px', '5': '19px', '6': '24px', '7': '30px' };

function extractSafeStyle(style){
  return (style || '').split(';').map(s => s.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf(':');
    if (idx < 0) return null;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!RICH_ALLOWED_STYLE_PROPS.includes(prop) || !val) return null;
    if (/expression|url\(|javascript:/i.test(val)) return null;
    return prop + ':' + val.replace(/[<>"]/g, '');
  }).filter(Boolean).join(';');
}

// Разбирает произвольный HTML из contenteditable и пересобирает только из
// разрешённых тегов/атрибутов — так вложенный <script>/onclick/ссылки не
// попадут в чужие ленты. Легаси <font size/face> (их создаёт execCommand)
// превращаем в безопасный <span style="...">.
function sanitizeRichHtml(html){
  const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
  const root = doc.body.firstChild;
  return root ? sanitizeRichNode(root).innerHTML : '';
}
function sanitizeRichNode(node){
  const out = document.createElement('div');
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) { out.appendChild(document.createTextNode(censorText(child.textContent))); return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName;
    if (tag === 'FONT') {
      const span = document.createElement('span');
      const size = child.getAttribute('size');
      const face = child.getAttribute('face');
      let style = '';
      if (size && RICH_FONT_SIZE_MAP[size]) style += 'font-size:' + RICH_FONT_SIZE_MAP[size] + ';';
      if (face) style += 'font-family:' + face.replace(/[^a-zA-Z0-9 ,'"-]/g, '') + ';';
      if (style) span.setAttribute('style', style);
      appendSanitizedChildren(child, span);
      out.appendChild(span);
      return;
    }
    if (!RICH_ALLOWED_TAGS.has(tag)) { appendSanitizedChildren(child, out); return; }
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'SPAN') {
      const safeStyle = extractSafeStyle(child.getAttribute('style'));
      if (safeStyle) el.setAttribute('style', safeStyle);
    }
    appendSanitizedChildren(child, el);
    out.appendChild(el);
  });
  return out;
}
function appendSanitizedChildren(src, dest){
  const sanitized = sanitizeRichNode(src);
  Array.from(sanitized.childNodes).forEach(n => dest.appendChild(n));
}

// Подключает панель форматирования (.rt-toolbar) к соседнему полю
// (.rt-editable) внутри контейнера. Выделение сохраняем сами, потому что
// клик по кнопке/селекту тулбара обычно сбивает его в contenteditable.
function makeRichEditor(container){
  const toolbar = container.querySelector('.rt-toolbar');
  const editable = container.querySelector('.rt-editable');
  if (!toolbar || !editable) return editable;
  let savedRange = null;
  function saveSelection(){
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && editable.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection(){
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  function applyCmd(cmd, value){
    editable.focus();
    restoreSelection();
    document.execCommand(cmd, false, value || null);
    saveSelection();
  }
  editable.addEventListener('mouseup', saveSelection);
  editable.addEventListener('keyup', saveSelection);
  toolbar.querySelectorAll('.rt-btn').forEach(btn => {
    btn.addEventListener('click', () => applyCmd(btn.dataset.cmd));
  });
  const fontSel = toolbar.querySelector('.rt-font');
  if (fontSel) fontSel.addEventListener('change', () => { if (fontSel.value) applyCmd('fontName', fontSel.value); fontSel.value = ''; });
  const sizeSel = toolbar.querySelector('.rt-size');
  if (sizeSel) sizeSel.addEventListener('change', () => { if (sizeSel.value) applyCmd('fontSize', sizeSel.value); sizeSel.value = ''; });
  return editable;
}

/* ══════════════════════════════════════
   ЗАПИСЬ ГОЛОСА (MediaRecorder) — общий помощник
   ══════════════════════════════════════ */
function pickMimeType(){
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function formatDuration(s){ const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; }

function createRecorder(onStop){
  let mediaRecorder, chunks = [], stream;
  return {
    async start(){
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        onStop(blob);
      };
      mediaRecorder.start();
    },
    stop(){ if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); },
  };
}

function blobToFile(blob, prefix){
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  return new File([blob], `${prefix}-${Date.now()}.${ext}`, { type: blob.type });
}

/* ══════════════════════════════════════
   КОМПОЗЕР
   ══════════════════════════════════════ */
function pickAttachmentType(file){
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'file';
}

let composerRecorder = null;
let composerRecTimer = null;
let composerRecSeconds = 0;

async function handleMicClick(){
  const micBtn = document.getElementById('micBtn');
  if (micBtn.classList.contains('recording')) {
    composerRecorder.stop();
    return;
  }
  try {
    composerRecorder = createRecorder((blob) => {
      clearInterval(composerRecTimer);
      micBtn.classList.remove('recording');
      micBtn.innerHTML = ICON_MIC;
      pendingFile = blobToFile(blob, 'voice');
      document.getElementById('attachName').innerHTML = ICON_MIC + ' Голосовое сообщение · ' + formatDuration(composerRecSeconds);
      document.getElementById('attachPreview').classList.add('show');
    });
    await composerRecorder.start();
    micBtn.classList.add('recording');
    composerRecSeconds = 0;
    micBtn.innerHTML = ICON_STOP + ' 0:00';
    composerRecTimer = setInterval(() => {
      composerRecSeconds++;
      micBtn.innerHTML = ICON_STOP + ' ' + formatDuration(composerRecSeconds);
    }, 1000);
  } catch (err) {
    alert('Не удалось получить доступ к микрофону: ' + (err && err.message ? err.message : err));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  makeRichEditor(document.getElementById('composerForm'));
  document.getElementById('micBtn').addEventListener('click', handleMicClick);
  document.getElementById('attachBtn').addEventListener('click', () => document.getElementById('attachInput').click());
  document.getElementById('attachInput').addEventListener('change', (e) => {
    pendingFile = e.target.files[0] || null;
    const preview = document.getElementById('attachPreview');
    if (pendingFile) {
      document.getElementById('attachName').innerHTML = ICON_PAPERCLIP + ' ' + escapeHtml(pendingFile.name);
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
  const hasText = !!textEl.textContent.trim();
  const content = hasText ? sanitizeRichHtml(textEl.innerHTML) : '';
  if (!hasText && !pendingFile) return;

  const btn = document.getElementById('postBtn');
  const status = document.getElementById('composerStatus');

  if (containsPoliticalContent(textEl.textContent)) {
    status.textContent = POLITICAL_GUARD_MESSAGE;
    status.className = 'composer-status error';
    return;
  }

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
    is_rich: true,
    attachment_type, attachment_url, attachment_name,
  });

  btn.disabled = false;
  if (error) {
    status.textContent = 'Ошибка: ' + error.message;
    status.className = 'composer-status error';
    return;
  }
  status.textContent = '';
  textEl.innerHTML = '';
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
  if (p.attachment_type === 'audio') return `<div class="post-attachment"><div class="wp-mount"></div></div>`;
  if (p.attachment_type === 'video') return `<div class="post-attachment"><video controls src="${p.attachment_url}"></video></div>`;
  if (p.attachment_type === 'image') return `<div class="post-attachment"><a href="${p.attachment_url}" target="_blank" rel="noopener"><img src="${p.attachment_url}" alt="" loading="lazy"></a></div>`;
  return `<div class="post-attachment"><a class="post-file-link" href="${p.attachment_url}" target="_blank" rel="noopener">${ICON_PAPERCLIP} ${escapeHtml(p.attachment_name || 'Файл')}</a></div>`;
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

function startEditPost(post, card){
  const bodyEl = card.querySelector('.post-body');
  const wasEmpty = !bodyEl;
  const editWrap = document.createElement('div');
  editWrap.className = 'post-edit';
  editWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  editWrap.innerHTML = `
    <div class="rt-toolbar">
      <button type="button" class="rt-btn" data-cmd="bold" title="Жирный"><b>Ж</b></button>
      <button type="button" class="rt-btn" data-cmd="italic" title="Курсив"><i>К</i></button>
      <button type="button" class="rt-btn" data-cmd="underline" title="Подчёркнутый"><u>Ч</u></button>
      <button type="button" class="rt-btn" data-cmd="strikeThrough" title="Зачёркнутый"><s>З</s></button>
      <span class="rt-sep"></span>
      <select class="rt-select rt-font" title="Шрифт">
        <option value="">Шрифт</option>
        <option value="Golos Text">Обычный</option>
        <option value="JetBrains Mono">Моно</option>
        <option value="Georgia">С засечками</option>
      </select>
      <select class="rt-select rt-size" title="Размер">
        <option value="">Размер</option>
        <option value="2">Мелкий</option>
        <option value="3">Обычный</option>
        <option value="5">Крупный</option>
        <option value="7">Огромный</option>
      </select>
    </div>
    <div class="rt-editable post-edit-text" contenteditable="true" style="width:100%;background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:8px 12px" data-placeholder="Текст поста"></div>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn-primary post-edit-save">Сохранить</button>
      <button type="button" class="nav-btn post-edit-cancel">Отмена</button>
    </div>`;

  if (wasEmpty) {
    card.querySelector('.post-head').insertAdjacentElement('afterend', editWrap);
  } else {
    bodyEl.replaceWith(editWrap);
  }
  const editableEl = editWrap.querySelector('.post-edit-text');
  editableEl.innerHTML = post.is_rich ? sanitizeRichHtml(post.content || '') : escapeHtml(post.content || '');
  makeRichEditor(editWrap);
  editableEl.focus();

  editWrap.querySelector('.post-edit-cancel').addEventListener('click', () => renderFeed());
  editWrap.querySelector('.post-edit-save').addEventListener('click', async () => {
    const hasText = !!editableEl.textContent.trim();
    if (containsPoliticalContent(editableEl.textContent)) { alert(POLITICAL_GUARD_MESSAGE); return; }
    const newContent = hasText ? sanitizeRichHtml(editableEl.innerHTML) : '';
    const saveBtn = editWrap.querySelector('.post-edit-save');
    saveBtn.disabled = true;
    const { error } = await SB.from('posts').update({ content: newContent || null, is_rich: true, updated_at: new Date().toISOString() }).eq('id', post.id);
    if (error) { alert('Ошибка: ' + error.message); saveBtn.disabled = false; return; }
    renderFeed();
  });
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

async function toggleCommentReaction(commentId, emoji, pillWrap){
  const { data: mine } = await SB.from('comment_reactions').select('id')
    .eq('comment_id', commentId).eq('user_id', currentUid).eq('emoji', emoji);
  if (mine && mine.length) {
    await SB.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', currentUid).eq('emoji', emoji);
  } else {
    await SB.from('comment_reactions').insert({ comment_id: commentId, user_id: currentUid, emoji });
  }
  await refreshCommentReactions(commentId, pillWrap);
}

async function refreshCommentReactions(commentId, pillWrap){
  const { data } = await SB.from('comment_reactions').select('emoji, user_id').eq('comment_id', commentId);
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
    pill.addEventListener('click', () => toggleCommentReaction(commentId, emoji, pillWrap));
    pillWrap.appendChild(pill);
  });
}

function commentStoragePath(url){
  const idx = url.indexOf('/posts/');
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + '/posts/'.length));
}

async function handleDeleteComment(c, postId, container, countEl){
  if (!confirm('Удалить комментарий?')) return;
  if (c.audio_url) {
    const path = commentStoragePath(c.audio_url);
    if (path) await SB.storage.from('posts').remove([path]);
  }
  const { error } = await SB.from('post_comments').delete().eq('id', c.id);
  if (error) { alert('Ошибка: ' + error.message); return; }
  await loadComments(postId, container, countEl);
  await refreshCommentCount(postId, countEl);
}

function startEditComment(c, row, postId, container, countEl){
  const body = row.querySelector('.comment-body');
  const editWrap = document.createElement('div');
  editWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:2px';
  editWrap.innerHTML = `
    <input type="text" class="c-edit-input" value="${escapeHtml(c.content || '')}" style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-family:var(--sans);font-size:12.5px">
    <div style="display:flex;gap:6px">
      <button type="button" class="c-edit-save" style="font-family:var(--mono);font-size:10.5px;padding:5px 10px;border-radius:20px;border:none;background:var(--cyan);color:#06131a;cursor:pointer">Сохранить</button>
      <button type="button" class="c-edit-cancel" style="font-family:var(--mono);font-size:10.5px;padding:5px 10px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted2);cursor:pointer">Отмена</button>
    </div>`;
  const ctext = body.querySelector('.ctext');
  const actionsWrap = body.querySelector('.comment-actions-row');
  ctext.style.display = 'none';
  actionsWrap.style.display = 'none';
  body.insertBefore(editWrap, actionsWrap);
  editWrap.querySelector('.c-edit-input').focus();

  editWrap.querySelector('.c-edit-cancel').addEventListener('click', () => {
    editWrap.remove();
    ctext.style.display = '';
    actionsWrap.style.display = '';
  });
  editWrap.querySelector('.c-edit-save').addEventListener('click', async () => {
    const raw = editWrap.querySelector('.c-edit-input').value.trim();
    if (!raw) return;
    if (containsPoliticalContent(raw)) { alert(POLITICAL_GUARD_MESSAGE); return; }
    const val = censorText(raw);
    const { error } = await SB.from('post_comments').update({ content: val, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (error) { alert('Ошибка: ' + error.message); return; }
    await loadComments(postId, container, countEl);
  });
}

function commentRow(c, postId, container, countEl){
  const div = document.createElement('div');
  div.className = 'comment-row';
  const username = (c.profiles && c.profiles.username) || '?';
  const isOwn = c.user_id === currentUid;
  const canDelete = isOwn || currentRole === 'ADMIN';
  const canEdit = isOwn && !c.audio_url;
  const body = c.audio_url
    ? `<audio controls src="${c.audio_url}"></audio>`
    : `<div class="ctext">${escapeHtml(censorText(c.content))}</div>`;
  div.innerHTML = `
    <div class="comment-avatar">${initialsOf(username)}</div>
    <div class="comment-body">
      <div class="cname">${escapeHtml(username)}${c.updated_at ? ' <span style="font-weight:400;color:var(--muted);font-size:10px">· изменено</span>' : ''}</div>
      ${body}
      <div class="comment-actions-row">
        <div class="comment-reactions">
          <div class="emoji-pills"></div>
          <div class="emoji-add">
            <button type="button" class="emoji-add-btn">+</button>
            <div class="emoji-picker">${EMOJI_SET.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
          </div>
        </div>
        ${(canEdit || canDelete || !isOwn) ? `<div class="comment-row-actions">
          ${canEdit ? '<button type="button" class="comment-edit-btn">Изменить</button>' : ''}
          ${canDelete ? '<button type="button" class="comment-del-btn">Удалить</button>' : ''}
          ${!isOwn ? '<button type="button" class="comment-report-btn" title="Пожаловаться">' + ICON_FLAG + '</button>' : ''}
        </div>` : ''}
      </div>
    </div>`;

  const commentPillWrap = div.querySelector('.emoji-pills');
  refreshCommentReactions(c.id, commentPillWrap);
  const commentEmojiBtn = div.querySelector('.emoji-add-btn');
  const commentPicker = div.querySelector('.emoji-picker');
  commentEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !commentPicker.classList.contains('open');
    closeAllEmojiPickers();
    if (willOpen) commentPicker.classList.add('open');
  });
  commentPicker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { toggleCommentReaction(c.id, b.dataset.e, commentPillWrap); commentPicker.classList.remove('open'); });
  });

  const editBtn = div.querySelector('.comment-edit-btn');
  if (editBtn) editBtn.addEventListener('click', () => startEditComment(c, div, postId, container, countEl));
  const delBtn = div.querySelector('.comment-del-btn');
  if (delBtn) delBtn.addEventListener('click', () => handleDeleteComment(c, postId, container, countEl));
  const reportBtn = div.querySelector('.comment-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', () => handleReportContent('comment', c.id, reportBtn));

  return div;
}

async function handleReportContent(type, id, btn){
  const reason = prompt('Почему жалуешься? (необязательно, можно оставить пустым)');
  if (reason === null) return;
  btn.disabled = true;
  const { error } = await SB.from('content_reports').insert({ reporter_id: currentUid, content_type: type, content_id: id, reason: reason.trim() || null });
  if (error) {
    btn.disabled = false;
    if (error.code === '23505') { alert('Ты уже жаловался на это.'); return; }
    alert('Не удалось отправить жалобу: ' + error.message);
    return;
  }
  btn.innerHTML = ICON_CHECK;
  btn.title = 'Жалоба отправлена';
}

async function loadComments(postId, container, countEl){
  const { data } = await SB.from('post_comments').select('*, profiles(username)').eq('post_id', postId).order('created_at', { ascending: true });
  container.querySelectorAll('.comment-row').forEach(el => el.remove());
  const form = container.querySelector('.comment-form');
  (data || []).forEach(c => container.insertBefore(commentRow(c, postId, container, countEl), form));
}

async function refreshCommentCount(postId, countEl){
  const { count } = await SB.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId);
  countEl.innerHTML = ICON_MESSAGE + ' ' + (count || 0);
}

async function handleAddComment(postId, input, container, countEl){
  const raw = input.value.trim();
  if (!raw) return;
  if (containsPoliticalContent(raw)) { alert(POLITICAL_GUARD_MESSAGE); return; }
  const text = censorText(raw);
  const { error } = await SB.from('post_comments').insert({ post_id: postId, user_id: currentUid, content: text });
  if (error) { alert('Ошибка: ' + error.message); return; }
  input.value = '';
  await loadComments(postId, container, countEl);
  await refreshCommentCount(postId, countEl);
}

async function handleAddVoiceComment(postId, blob, container, countEl){
  const file = blobToFile(blob, 'comment');
  const path = `${currentUid}/comments/${file.name}`;
  const { error: upErr } = await SB.storage.from('posts').upload(path, file);
  if (upErr) { alert('Не удалось загрузить голосовой комментарий: ' + upErr.message); return; }
  const { data: pub } = SB.storage.from('posts').getPublicUrl(path);
  const { error } = await SB.from('post_comments').insert({ post_id: postId, user_id: currentUid, audio_url: pub.publicUrl });
  if (error) { alert('Ошибка: ' + error.message); return; }
  await loadComments(postId, container, countEl);
  await refreshCommentCount(postId, countEl);
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
      <div class="post-meta"><div class="name">${escapeHtml(username)}</div><div class="time">${timeAgo(p.created_at)}${p.updated_at ? ' · изменено' : ''}</div></div>
      ${!isOwn ? `<button type="button" class="follow-btn ${followingSet.has(p.user_id) ? 'following' : ''}">${followingSet.has(p.user_id) ? 'Вы подписаны' : 'Подписаться'}</button>` : ''}
      ${isOwn ? '<button type="button" class="post-edit-btn" title="Редактировать">' + ICON_PENCIL + '</button>' : ''}
      ${(isOwn || currentRole === 'ADMIN') ? '<button type="button" class="post-del" title="Удалить">' + ICON_TRASH + '</button>' : ''}
      ${!isOwn ? '<button type="button" class="post-report-btn" title="Пожаловаться">' + ICON_FLAG + '</button>' : ''}
    </div>
    ${p.content ? `<div class="post-body">${p.is_rich ? sanitizeRichHtml(p.content) : escapeHtml(p.content)}</div>` : ''}
    ${attachmentHtml(p)}
    <div class="post-actions">
      <div class="emoji-pills"></div>
      <div class="emoji-add">
        <button type="button" class="emoji-add-btn">+</button>
        <div class="emoji-picker">${EMOJI_SET.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
      </div>
      <button type="button" class="comment-toggle">${ICON_MESSAGE} ${commentCount}</button>
    </div>
    <div class="comments">
      <div class="comment-form">
        <button type="button" class="comment-mic" title="Голосовой комментарий">${ICON_MIC}</button>
        <input type="text" placeholder="Написать комментарий...">
        <button type="button" class="comment-send">→</button>
      </div>
      <div class="voice-comment-preview">
        <audio controls></audio>
        <button type="button" class="vc-send">Отправить</button>
        <button type="button" class="vc-cancel">${ICON_X}</button>
      </div>
    </div>`;

  if (p.attachment_type === 'audio' && p.attachment_url) {
    createWavePlayer(p.attachment_url, card.querySelector('.wp-mount'));
  }

  const followBtn = card.querySelector('.follow-btn');
  if (followBtn) followBtn.addEventListener('click', () => handleFollowToggle(p.user_id, followBtn));

  const delBtn = card.querySelector('.post-del');
  if (delBtn) delBtn.addEventListener('click', () => handleDeletePost(p, card));

  const editBtn = card.querySelector('.post-edit-btn');
  if (editBtn) editBtn.addEventListener('click', () => startEditPost(p, card));

  const reportBtn = card.querySelector('.post-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', () => handleReportContent('post', p.id, reportBtn));

  const pillWrap = card.querySelector('.emoji-pills');
  refreshReactions(p.id, pillWrap);

  const emojiBtn = card.querySelector('.emoji-add-btn');
  const picker = card.querySelector('.emoji-picker');
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !picker.classList.contains('open');
    closeAllEmojiPickers();
    if (willOpen) picker.classList.add('open');
  });
  picker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { toggleReaction(p.id, b.dataset.e, pillWrap); picker.classList.remove('open'); });
  });

  const commentsBox = card.querySelector('.comments');
  const commentToggle = card.querySelector('.comment-toggle');
  let commentsLoaded = false;
  commentToggle.addEventListener('click', async () => {
    commentsBox.classList.toggle('open');
    if (commentsBox.classList.contains('open') && !commentsLoaded) {
      commentsLoaded = true;
      await loadComments(p.id, commentsBox, commentToggle);
    }
  });
  const commentInput = commentsBox.querySelector('input');
  const commentSendBtn = commentsBox.querySelector('.comment-send');
  const send = () => handleAddComment(p.id, commentInput, commentsBox, commentToggle);
  commentSendBtn.addEventListener('click', send);
  commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  // Голосовой комментарий
  const micBtn = commentsBox.querySelector('.comment-mic');
  const voicePreview = commentsBox.querySelector('.voice-comment-preview');
  const voiceAudio = voicePreview.querySelector('audio');
  const vcSendBtn = voicePreview.querySelector('.vc-send');
  const vcCancelBtn = voicePreview.querySelector('.vc-cancel');
  let commentRecorder = null;
  let commentRecTimer = null;
  let commentRecSeconds = 0;
  let recordedBlob = null;

  micBtn.addEventListener('click', async () => {
    if (micBtn.classList.contains('recording')) {
      commentRecorder.stop();
      return;
    }
    try {
      commentRecorder = createRecorder((blob) => {
        clearInterval(commentRecTimer);
        micBtn.classList.remove('recording');
        micBtn.innerHTML = ICON_MIC;
        recordedBlob = blob;
        voiceAudio.src = URL.createObjectURL(blob);
        voicePreview.classList.add('show');
      });
      await commentRecorder.start();
      micBtn.classList.add('recording');
      commentRecSeconds = 0;
      micBtn.innerHTML = ICON_STOP + ' 0:00';
      commentRecTimer = setInterval(() => {
        commentRecSeconds++;
        micBtn.innerHTML = ICON_STOP + ' ' + formatDuration(commentRecSeconds);
      }, 1000);
    } catch (err) {
      alert('Не удалось получить доступ к микрофону: ' + (err && err.message ? err.message : err));
    }
  });

  vcCancelBtn.addEventListener('click', () => {
    recordedBlob = null;
    voicePreview.classList.remove('show');
  });
  vcSendBtn.addEventListener('click', async () => {
    if (!recordedBlob) return;
    vcSendBtn.disabled = true;
    await handleAddVoiceComment(p.id, recordedBlob, commentsBox, commentToggle);
    vcSendBtn.disabled = false;
    recordedBlob = null;
    voicePreview.classList.remove('show');
  });

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
  if (window.animateChildren) animateChildren(list);
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
  if (['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(currentRole)) {
    document.getElementById('adminLink').style.display = '';
  }

  const { data: myFollows } = await SB.from('follows').select('following_id').eq('follower_id', currentUid);
  followingSet = new Set((myFollows || []).map(f => f.following_id));

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '20px';

  await renderFeed();
}

init();
