/* ══════════════════════════════════════
   ФОРМАТИРОВАННЫЙ ТЕКСТ (жирный/курсив/подчёркнутый/зачёркнутый/шрифт/размер)
   Общий блок (как waveform_player.js) — сначала жил только в feed.js для
   постов Ленты, теперь нужен ещё и конструктору шагов урока (теория).
   Подключать ПОСЛЕ content_filter.js — sanitizeRichNode зовёт censorText().
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
