/* ══════════════════════════════════════
   ФОРМАТИРОВАННЫЙ ТЕКСТ (жирный/курсив/подчёркнутый/зачёркнутый/шрифт/размер)
   Общий блок (как waveform_player.js) — сначала жил только в feed.js для
   постов Ленты, теперь нужен ещё и конструктору шагов урока (теория).
   Подключать ПОСЛЕ content_filter.js — sanitizeRichNode зовёт censorText().
   ══════════════════════════════════════ */
const RICH_ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'DIV', 'P',
  // Расширенный набор для конструктора теории урока (Stepik-подобный редактор) —
  // те же теги допускаются и в постах Ленты, потому что sanitizeRichHtml общий
  // на обе поверхности, но панель Ленты кнопок для них просто не показывает.
  'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'VIDEO', 'AUDIO', 'IFRAME',
]);
const RICH_ALLOWED_STYLE_PROPS = ['font-family', 'font-size', 'text-decoration', 'color', 'text-align'];
const RICH_FONT_SIZE_MAP = { '1': '10px', '2': '12px', '3': '15px', '4': '17px', '5': '19px', '6': '24px', '7': '30px' };
// Теги, для которых сохраняем style= (после фильтрации через RICH_ALLOWED_STYLE_PROPS выше) —
// SPAN/P/DIV/заголовки/цитата для text-align, SPAN — для цвета/шрифта от execCommand.
const RICH_STYLEABLE_TAGS = new Set(['SPAN', 'P', 'DIV', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);

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

// Пускаем только http(s)/mailto — javascript:/data:/vbscript: и т.п. отсекаем.
// Так владелец доступа к конструктору урока не сможет (случайно или через
// вставку чужого HTML) протащить исполняемый код в href/src — эта же функция
// звана и при показе теории студенту (sanitizeRichHtml зовётся заново на
// рендере), так что это реальная граница безопасности, а не только на форме.
function isSafeUrl(url){
  const u = String(url || '').trim();
  if (!u) return false;
  return /^https?:\/\//i.test(u) || /^mailto:/i.test(u);
}

function isSafeEmbedUrl(url){
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' && (
      u.hostname === 'www.youtube-nocookie.com' || u.hostname === 'player.vimeo.com'
    ));
  } catch (e) { return false; }
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
    // SCRIPT/STYLE(и их содержимое как "текст") выбрасываем целиком — иначе
    // unwrap ниже оставит исходный JS/CSS видимым текстом на странице
    // (не выполнится, но это мусор в контенте, которого там быть не должно).
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (tag === 'FONT') {
      // execCommand('foreColor',...) в некоторых браузерах даёт легаси
      // <font color> вместо <span style="color:">, поэтому цвет тоже отсюда читаем.
      const span = document.createElement('span');
      const size = child.getAttribute('size');
      const face = child.getAttribute('face');
      const color = child.getAttribute('color');
      let style = '';
      if (size && RICH_FONT_SIZE_MAP[size]) style += 'font-size:' + RICH_FONT_SIZE_MAP[size] + ';';
      if (face) style += 'font-family:' + face.replace(/[^a-zA-Z0-9 ,'"-]/g, '') + ';';
      if (color && /^#?[0-9a-fA-F]{3,8}$/.test(color)) style += 'color:' + (color.startsWith('#') ? color : '#' + color) + ';';
      if (style) span.setAttribute('style', style);
      appendSanitizedChildren(child, span);
      out.appendChild(span);
      return;
    }
    // IMG без детей и без текстового содержимого — раз src небезопасен
    // (не http(s)), просто не переносим картинку, без заглушки.
    if (tag === 'IMG') {
      const src = child.getAttribute('src');
      if (isSafeUrl(src)) {
        const img = document.createElement('img');
        img.setAttribute('src', src);
        const alt = child.getAttribute('alt');
        if (alt) img.setAttribute('alt', alt.replace(/[<>"]/g, ''));
        img.setAttribute('loading', 'lazy');
        out.appendChild(img);
      }
      return;
    }
    if (tag === 'VIDEO' || tag === 'AUDIO') {
      const src = child.getAttribute('src');
      if (isSafeUrl(src)) {
        const media = document.createElement(tag.toLowerCase());
        media.setAttribute('src', src);
        media.setAttribute('controls', '');
        media.setAttribute('preload', 'metadata');
        out.appendChild(media);
      }
      return;
    }
    if (tag === 'IFRAME') {
      const src = child.getAttribute('src');
      if (isSafeEmbedUrl(src)) {
        const frame = document.createElement('iframe');
        frame.setAttribute('src', src);
        frame.setAttribute('title', 'Видео');
        frame.setAttribute('loading', 'lazy');
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        out.appendChild(frame);
      }
      return;
    }
    if (!RICH_ALLOWED_TAGS.has(tag)) { appendSanitizedChildren(child, out); return; }
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = child.getAttribute('href');
      if (isSafeUrl(href)) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
        if (child.classList.contains('rt-attachment')) el.classList.add('rt-attachment');
      }
    }
    if (RICH_STYLEABLE_TAGS.has(tag)) {
      const safeStyle = extractSafeStyle(child.getAttribute('style'));
      if (safeStyle) el.setAttribute('style', safeStyle);
    }
    if (tag === 'SPAN' && child.classList.contains('rt-formula')) el.classList.add('rt-formula');
    appendSanitizedChildren(child, el);
    out.appendChild(el);
  });
  return out;
}
function appendSanitizedChildren(src, dest){
  const sanitized = sanitizeRichNode(src);
  Array.from(sanitized.childNodes).forEach(n => dest.appendChild(n));
}

// Конструктор HTML полного тулбара + сам rt-editable — раньше жил только
// в admin.js (для курсов/словаря), но теперь нужен и публичным страницам
// без admin.js (форум, барахолка, личные сообщения), поэтому перенесён
// сюда вместе со своими иконками. admin.js по-прежнему их использует —
// просто как глобальные функции/константы этого файла, который у него
// подключён раньше своего скрипта.
function aIcon(path){ return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
const ICON_UNDO_A = aIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v1"/>');
const ICON_REDO_A = aIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v1"/>');
const ICON_LIST_UL_A = aIcon('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>');
const ICON_LIST_OL_A = aIcon('<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>');
const ICON_ALIGN_L_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>');
const ICON_ALIGN_C_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/>');
const ICON_ALIGN_R_A = aIcon('<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>');
const ICON_LINK_A = aIcon('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>');
const ICON_UNLINK_A = aIcon('<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 3.9 8.11"/><line x1="8" x2="16" y1="12" y2="12"/><line x1="3" x2="21" y1="3" y2="21"/>');
const ICON_IMAGE_A = aIcon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
const ICON_FILE_A = aIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>');
const ICON_VIDEO_A = aIcon('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>');
const ICON_TABLE_A = aIcon('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>');
const ICON_CODE_A = aIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
const ICON_QUOTE_A = aIcon('<path d="M3 21c3 0 6-2 6-6V7H3v8h3c0 1.5-1 3-3 3zM15 21c3 0 6-2 6-6V7h-6v8h3c0 1.5-1 3-3 3z"/>');

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

// Подключает панель форматирования (.rt-toolbar) к соседнему полю
// (.rt-editable) внутри контейнера. Выделение сохраняем сами, потому что
// клик по кнопке/селекту тулбара обычно сбивает его в contenteditable.
// opts.full — включает расширенные инструменты конструктора теории урока
// (стили/цвет/списки/выравнивание/ссылка/картинка/таблица/исходник) —
// для композера Ленты не передаётся, там остаётся прежний простой тулбар.
// opts.onImageUpload(file) — async-колбэк, должен вернуть готовый URL картинки.
function makeRichEditor(container, opts){
  opts = opts || {};
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
  toolbar.querySelectorAll('.rt-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => applyCmd(btn.dataset.cmd));
  });
  const fontSel = toolbar.querySelector('.rt-font');
  if (fontSel) fontSel.addEventListener('change', () => { if (fontSel.value) applyCmd('fontName', fontSel.value); fontSel.value = ''; });
  const sizeSel = toolbar.querySelector('.rt-size');
  if (sizeSel) sizeSel.addEventListener('change', () => { if (sizeSel.value) applyCmd('fontSize', sizeSel.value); sizeSel.value = ''; });
  if (!opts.full) return editable;

  // ── Стили абзаца (обычный/заголовки/цитата) — показываем в закрытом
  // списке, каким стилем реально оформлен абзац под курсором, а не всегда
  // "Стили"-заглушку. ──
  const styleSel = toolbar.querySelector('.rt-style');
  const STYLE_TAG_TO_VALUE = { H2: 'h2', H3: 'h3', H4: 'h4', BLOCKQUOTE: 'blockquote', P: 'p' };
  function updateStyleSelect(){
    if (!styleSel) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    let node = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== editable) {
      const value = STYLE_TAG_TO_VALUE[node.tagName];
      if (value) { styleSel.value = value; return; }
      node = node.parentElement;
    }
    styleSel.value = '';
  }
  if (styleSel) {
    styleSel.addEventListener('change', () => {
      if (styleSel.value) applyCmd('formatBlock', '<' + styleSel.value + '>');
      updateStyleSelect();
    });
    editable.addEventListener('mouseup', updateStyleSelect);
    editable.addEventListener('keyup', updateStyleSelect);
  }

  // ── Цвет текста — палитра готовых цветов + недавно использованные
  // (запоминаются в этом браузере) + свой цвет через нативный пикер. ──
  const colorWrap = toolbar.querySelector('.rt-color-wrap');
  const colorBtn = toolbar.querySelector('.rt-color-btn');
  const colorPop = toolbar.querySelector('.rt-color-pop');
  const colorInput = toolbar.querySelector('.rt-color');
  const PRESET_COLORS = ['#ff5a36', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#eef0fb'];
  const RECENT_COLORS_KEY = 'mixpro_recent_colors';
  function getRecentColors(){
    try { return JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]'); } catch (e) { return []; }
  }
  function rememberColor(hex){
    let recent = getRecentColors().filter(c => c.toLowerCase() !== hex.toLowerCase());
    recent.unshift(hex);
    try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent.slice(0, 8))); } catch (e) { /* приватный режим — не критично */ }
  }
  function swatchesHtml(colors){
    return colors.map(c => `<button type="button" class="rt-color-swatch" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('');
  }
  function renderColorPop(){
    if (!colorPop) return;
    const presetsRow = colorPop.querySelector('.rt-color-presets');
    const recentRow = colorPop.querySelector('.rt-color-recent');
    if (presetsRow) presetsRow.innerHTML = swatchesHtml(PRESET_COLORS);
    const recent = getRecentColors();
    if (recentRow) recentRow.innerHTML = recent.length ? swatchesHtml(recent) : '';
  }
  function applyColor(hex){
    editable.focus();
    restoreSelection();
    document.execCommand('foreColor', false, hex);
    saveSelection();
  }
  if (colorBtn && colorPop && colorWrap) {
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveSelection();
      const opening = colorPop.hasAttribute('hidden');
      if (opening) { renderColorPop(); colorPop.removeAttribute('hidden'); }
      else colorPop.setAttribute('hidden', '');
    });
    colorPop.addEventListener('click', (e) => {
      const sw = e.target.closest('.rt-color-swatch');
      if (!sw) return;
      applyColor(sw.dataset.color);
      rememberColor(sw.dataset.color);
      renderColorPop();
      colorPop.setAttribute('hidden', '');
    });
    document.addEventListener('click', (e) => { if (!colorWrap.contains(e.target)) colorPop.setAttribute('hidden', ''); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') colorPop.setAttribute('hidden', ''); });
  }
  if (colorInput) {
    colorInput.addEventListener('input', () => applyColor(colorInput.value));
    colorInput.addEventListener('change', () => {
      rememberColor(colorInput.value);
      renderColorPop();
      if (colorPop) colorPop.setAttribute('hidden', '');
    });
  }

  // ── Ссылка / убрать ссылку (unlink — обычная data-cmd кнопка, отдельно не нужна) ──
  const linkBtn = toolbar.querySelector('.rt-link-btn');
  if (linkBtn) linkBtn.addEventListener('click', () => {
    saveSelection();
    const url = prompt('Ссылка (начиная с http:// или https://)');
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) { alert('Ссылка должна начинаться с http:// или https://'); return; }
    applyCmd('createLink', trimmed);
    // createLink оставляет весь текст ссылки выделенным (а не курсор после неё) —
    // без схлопывания следующий инструмент (картинка/видео/таблица) заменит
    // собой только что созданную ссылку вместо вставки после неё.
    const sel = window.getSelection();
    if (sel.rangeCount > 0) { sel.collapseToEnd(); saveSelection(); }
  });

  const codeBtn = toolbar.querySelector('.rt-code-btn');
  if (codeBtn) codeBtn.addEventListener('click', () => applyCmd('formatBlock', '<pre>'));
  const quoteBtn = toolbar.querySelector('.rt-quote-btn');
  if (quoteBtn) quoteBtn.addEventListener('click', () => applyCmd('formatBlock', '<blockquote>'));

  // ── Внутри блока кода Enter по умолчанию у браузера ведёт себя
  // непредсказуемо (может разбить <pre> на несколько блоков). Делаем
  // предсказуемо: обычный Enter — новая строка внутри того же блока кода;
  // Enter на уже пустой строке в конце — выход из кода в обычный абзац,
  // чтобы можно было продолжить текст дальше по теме. ──
  editable.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let node = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const pre = node && node.closest ? node.closest('pre') : null;
    if (!pre || !editable.contains(pre)) return;

    const range = sel.getRangeAt(0);
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(pre);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const beforeCursor = beforeRange.toString();
    const afterRange = document.createRange();
    afterRange.selectNodeContents(pre);
    afterRange.setStart(range.endContainer, range.endOffset);
    const afterCursor = afterRange.toString();
    const lastLine = beforeCursor.split('\n').pop();

    e.preventDefault();
    if (lastLine === '' && beforeCursor.includes('\n') && afterCursor.trim() === '') {
      const newContent = beforeCursor.slice(0, -1);
      if (newContent === '') pre.remove(); else pre.textContent = newContent;
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      if (pre.parentNode) pre.after(p); else editable.appendChild(p);
      const newRange = document.createRange();
      newRange.selectNodeContents(p);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      saveSelection();
      updateStyleSelect();
    } else {
      // execCommand('insertText','\n') превращает перевод строки в <br>,
      // из-за чего его не видно в Range.toString() и вся логика выше
      // ломается — вставляем текстовый узел с настоящим \n напрямую,
      // white-space:pre-wrap у <pre> и так отрисует его переносом строки.
      range.deleteContents();
      const textNode = document.createTextNode('\n');
      range.insertNode(textNode);
      const newRange = document.createRange();
      newRange.setStartAfter(textNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      saveSelection();
    }
  });

  // ── Картинка — загрузка в Storage через колбэк, вставка по готовому URL ──
  const imgBtn = toolbar.querySelector('.rt-img-btn');
  const imgInput = toolbar.querySelector('.rt-img-input');
  if (imgBtn && imgInput) {
    imgBtn.addEventListener('click', () => { saveSelection(); imgInput.click(); });
    imgInput.addEventListener('change', async () => {
      const file = imgInput.files[0];
      imgInput.value = '';
      if (!file || !opts.onImageUpload) return;
      imgBtn.disabled = true;
      try {
        const url = await opts.onImageUpload(file);
        if (url) { editable.focus(); restoreSelection(); document.execCommand('insertHTML', false, '<img src="' + url + '" alt="">'); saveSelection(); }
      } catch (e) {
        alert('Не удалось загрузить картинку: ' + (e && e.message ? e.message : e));
      }
      imgBtn.disabled = false;
    });
  }

  // ── Файл — загружаем в Storage и вставляем подходящий элемент: картинку,
  // видео, аудио или компактную карточку скачивания. ──
  const fileBtn = toolbar.querySelector('.rt-file-btn');
  const fileInput = toolbar.querySelector('.rt-file-input');
  function insertUploadedAsset(asset){
    const type = String(asset.type || '').toLowerCase();
    const name = String(asset.name || 'Файл').replace(/[<>&"]/g, '');
    let html;
    if (type.startsWith('image/')) html = '<img src="' + asset.url + '" alt="' + name + '">';
    else if (type.startsWith('video/')) html = '<video controls preload="metadata" src="' + asset.url + '"></video><p><br></p>';
    else if (type.startsWith('audio/')) html = '<audio controls preload="metadata" src="' + asset.url + '"></audio><p><br></p>';
    else html = '<p><a class="rt-attachment" href="' + asset.url + '" target="_blank" rel="noopener noreferrer">↧ ' + name + '</a></p>';
    editable.focus(); restoreSelection(); document.execCommand('insertHTML', false, html); saveSelection();
  }
  if (fileBtn && fileInput) {
    fileBtn.addEventListener('click', () => { saveSelection(); fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]; fileInput.value = '';
      if (!file || !opts.onFileUpload) return;
      fileBtn.disabled = true;
      try { insertUploadedAsset(await opts.onFileUpload(file)); }
      catch (e) { alert('Не удалось загрузить файл: ' + (e && e.message ? e.message : e)); }
      fileBtn.disabled = false;
    });
  }

  // ── Drag-and-drop — перетащить фото/видео/файл прямо в область текста,
  // без похода к кнопкам тулбара. dragover preventDefault нужен всегда
  // (даже без onFileUpload/onImageUpload) — иначе браузер по умолчанию
  // уводит со страницы, открывая файл вместо неё.
  let dragDepth = 0;
  function isFileDrag(e){ return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'); }
  editable.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    editable.classList.add('rt-drag-over');
  });
  editable.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
  editable.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) editable.classList.remove('rt-drag-over');
  });
  editable.addEventListener('drop', async (e) => {
    const files = e.dataTransfer ? Array.from(e.dataTransfer.files || []) : [];
    dragDepth = 0;
    editable.classList.remove('rt-drag-over');
    if (!files.length) return; // не файлы (например, перетянутый внутри самого текста фрагмент) — обычное поведение
    e.preventDefault();
    if (!opts.onFileUpload && !opts.onImageUpload) return;
    editable.classList.add('rt-uploading');
    const failed = [];
    for (const file of files) {
      try {
        if (opts.onFileUpload) {
          insertUploadedAsset(await opts.onFileUpload(file));
        } else if (file.type.startsWith('image/')) {
          const url = await opts.onImageUpload(file);
          if (url) { editable.focus(); restoreSelection(); document.execCommand('insertHTML', false, '<img src="' + url + '" alt="">'); saveSelection(); }
        }
      } catch (err) {
        failed.push((file.name || 'файл') + ': ' + (err && err.message ? err.message : err));
      }
    }
    editable.classList.remove('rt-uploading');
    if (failed.length) alert('Не удалось загрузить:\n' + failed.join('\n'));
  });

  // ── Видео по внешней ссылке: YouTube/Vimeo получают безопасный embed,
  // прямая ссылка на файл открывается нативным video-плеером. ──
  const videoBtn = toolbar.querySelector('.rt-video-btn');
  if (videoBtn) videoBtn.addEventListener('click', () => {
    saveSelection();
    const raw = prompt('Ссылка на YouTube, Vimeo или прямой видеофайл (.mp4, .webm)');
    if (!raw) return;
    const url = raw.trim();
    let html = '';
    try {
      const u = new URL(url);
      let id = '';
      if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
      if (u.hostname.endsWith('youtube.com')) id = u.searchParams.get('v') || (u.pathname.match(/\/embed\/([^/?]+)/) || [])[1] || '';
      if (id && /^[\w-]{6,}$/.test(id)) html = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '"></iframe><p><br></p>';
      else if (u.hostname.endsWith('vimeo.com') && /^\/[0-9]+/.test(u.pathname)) html = '<iframe src="https://player.vimeo.com/video/' + u.pathname.slice(1).split('/')[0] + '"></iframe><p><br></p>';
      else if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u.pathname + u.search)) html = '<video controls preload="metadata" src="' + url + '"></video><p><br></p>';
    } catch (e) { /* validation below */ }
    if (!html) { alert('Подойдёт ссылка на YouTube, Vimeo или прямой файл .mp4/.webm.'); return; }
    editable.focus(); restoreSelection(); document.execCommand('insertHTML', false, html); saveSelection();
  });

  const formulaBtn = toolbar.querySelector('.rt-formula-btn');
  if (formulaBtn) formulaBtn.addEventListener('click', () => {
    saveSelection();
    const formula = prompt('Формула или математический символ (можно ввести LaTeX):', '');
    if (!formula || !formula.trim()) return;
    const safeFormula = formula.trim().replace(/[<>&"]/g, '');
    editable.focus(); restoreSelection();
    document.execCommand('insertHTML', false, '<span class="rt-formula">Σ ' + safeFormula + '</span>');
    saveSelection();
  });

  // ── Таблица — вставляем стартовую сетку 3×3, дальше редактируется как текст ──
  const tableBtn = toolbar.querySelector('.rt-table-btn');
  if (tableBtn) tableBtn.addEventListener('click', () => {
    let html = '<table><tbody>';
    for (let r = 0; r < 3; r++) { html += '<tr>'; for (let c = 0; c < 3; c++) html += '<td> </td>'; html += '</tr>'; }
    html += '</tbody></table><p><br></p>';
    applyCmd('insertHTML', html);
  });

  // ── Исходный код — для тех, кто хочет поправить HTML руками ──
  const sourceBtn = toolbar.querySelector('.rt-source-btn');
  if (sourceBtn) {
    let sourceArea = null;
    sourceBtn.addEventListener('click', () => {
      if (!sourceArea) {
        sourceArea = document.createElement('textarea');
        sourceArea.className = 'rt-source';
        // Санитизируем перед показом — иначе видны переходные теги вроде
        // <font color>, которые execCommand создаёт при работе с цветом,
        // а на сохранении они всё равно превращаются в <span style>.
        sourceArea.value = sanitizeRichHtml(editable.innerHTML);
        editable.insertAdjacentElement('afterend', sourceArea);
        editable.style.display = 'none';
        sourceBtn.classList.add('active');
      } else {
        editable.innerHTML = sanitizeRichHtml(sourceArea.value);
        sourceArea.remove();
        sourceArea = null;
        editable.style.display = '';
        sourceBtn.classList.remove('active');
      }
    });
  }

  return editable;
}
