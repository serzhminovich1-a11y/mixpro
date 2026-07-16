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
  'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR',
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
    if (!RICH_ALLOWED_TAGS.has(tag)) { appendSanitizedChildren(child, out); return; }
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = child.getAttribute('href');
      if (isSafeUrl(href)) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    if (RICH_STYLEABLE_TAGS.has(tag)) {
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

  // ── Стили абзаца (обычный/заголовки/цитата) ──
  const styleSel = toolbar.querySelector('.rt-style');
  if (styleSel) styleSel.addEventListener('change', () => {
    if (styleSel.value) applyCmd('formatBlock', '<' + styleSel.value + '>');
    styleSel.value = '';
  });

  // ── Цвет текста — нативный color-picker, спрятанный под кнопкой "А" ──
  const colorInput = toolbar.querySelector('.rt-color');
  if (colorInput) colorInput.addEventListener('input', () => applyCmd('foreColor', colorInput.value));

  // ── Ссылка / убрать ссылку (unlink — обычная data-cmd кнопка, отдельно не нужна) ──
  const linkBtn = toolbar.querySelector('.rt-link-btn');
  if (linkBtn) linkBtn.addEventListener('click', () => {
    saveSelection();
    const url = prompt('Ссылка (начиная с http:// или https://)');
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) { alert('Ссылка должна начинаться с http:// или https://'); return; }
    applyCmd('createLink', trimmed);
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
        sourceArea.value = editable.innerHTML;
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
