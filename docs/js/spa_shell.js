// SPA-роутер для Главной/Ленты/Курсов/Рейтинга/Портфолио. Подключается
// как <script type="module"> вторым скриптом на всех пяти страницах.
// Адреса в адресной строке не меняются на "чистые" — остаются теми же
// реальными .html-файлами (GitHub Pages — статический хостинг, ничего
// не может переписывать на лету), поэтому прямой переход по ссылке и
// обновление страницы (F5) продолжают работать как обычная загрузка.
// Роутер только перехватывает клики ВНУТРИ уже открытого сайта и
// подменяет содержимое без полной перезагрузки.

const here = import.meta.url; // .../js/spa_shell.js — якорь для относительных путей

const ROUTES = [
  { key: 'home', html: new URL('../index.html', here).href, js: new URL('main.js', here).href },
  { key: 'feed', html: new URL('../pages/feed.html', here).href, js: new URL('feed.js', here).href },
  { key: 'courses', html: new URL('../pages/courses.html', here).href, js: new URL('courses.js', here).href },
  { key: 'leaderboard', html: new URL('../pages/leaderboard.html', here).href, js: new URL('leaderboard.js', here).href },
  { key: 'portfolio', html: new URL('../pages/portfolio.html', here).href, js: new URL('portfolio.js', here).href },
];
// courses.html поддерживает ?course=ID — путь совпадает, роут общий
const routeByPathname = new Map(ROUTES.map(r => [new URL(r.html).pathname, r]));

let currentModule = null;
let currentRoute = null;
// Растёт на каждый вызов navigateTo() — если клик по второй ссылке
// прилетел раньше, чем отработал mount() первой (нетерпеливый двойной
// клик), первая навигация должна СВЕРНУТЬСЯ, а не мутировать документ,
// который уже принадлежит второй странице (иначе mount() первого экрана
// упадёт на document.getElementById(...), которого там больше нет —
// он ищет по всему document, а не по своему уже отсоединённому корню).
let navSeq = 0;

function findRouteForUrl(url) {
  // Реальный адрес сайта — "…/mixpro/" БЕЗ "index.html" (сервер отдаёт
  // index.html по этому адресу сам, но в адресной строке и в
  // location.pathname имени файла нет). ROUTES же построен из полных
  // путей с "index.html" на конце. Без этой нормализации самый первый
  // заход на сайт (по обычной ссылке на корень) не распознавался ни
  // одним маршрутом — initialMount() тихо ничего не монтировал, и
  // main.js вообще не выполнялся: ни одна кнопка на Главной не работала.
  let pathname = url.pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  return routeByPathname.get(pathname) || null;
}

function progressBar() {
  let bar = document.getElementById('spaProgressBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'spaProgressBar';
    bar.style.cssText = 'position:fixed;top:0;left:0;height:2px;width:0;z-index:9999;background:linear-gradient(90deg,#4ade80,#a78bfa);transition:width .25s ease,opacity .2s ease;opacity:0;pointer-events:none';
    document.body.appendChild(bar);
  }
  return bar;
}
function startProgress() {
  const bar = progressBar();
  bar.style.opacity = '1';
  bar.style.width = '0%';
  requestAnimationFrame(() => { bar.style.width = '70%'; });
}
function finishProgress() {
  const bar = progressBar();
  bar.style.width = '100%';
  setTimeout(() => { bar.style.opacity = '0'; }, 150);
}

function ensureStylesheets(doc, baseUrl) {
  // doc — распарсенный DOMParser'ом документ другой страницы; его
  // .baseURI наследуется от ТЕКУЩЕГО документа (а не от той страницы,
  // откуда взят HTML), поэтому читать резолвленный link.href нельзя —
  // тот же класс бага, что и с относительными href в постоянной <nav>
  // (см. комментарий в обработчике клика ниже). Резолвим сырой атрибут
  // сами, от настоящего адреса загруженной страницы (route.html).
  const existing = new Set(Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href));
  Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).forEach(link => {
    const raw = link.getAttribute('href');
    if (!raw) return;
    const abs = new URL(raw, baseUrl).href;
    if (!existing.has(abs)) {
      const clone = document.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = abs;
      document.head.appendChild(clone);
    }
  });
}

function updateNavActiveState(routeKey) {
  document.querySelectorAll('nav a[data-route]').forEach(a => {
    a.classList.toggle('current', a.dataset.route === routeKey);
  });
  // .nav-tab.active — своя, отдельная система подсветки для Главной
  // (Тренажёры/Инструменты/Словарь как вкладки внутри неё). Если ушли
  // на другой SPA-маршрут, "Главная" не должна оставаться зелёной —
  // это её собственная <nav>, и она есть только когда сессия началась
  // с Главной, mount() сам расставит нужную вкладку, когда вернёмся.
  if (routeKey !== 'home') {
    document.querySelectorAll('.nav-tab.active').forEach(t => t.classList.remove('active'));
  }
}

async function navigateTo(route, url, doPushState) {
  const mySeq = ++navSeq;
  startProgress();
  try {
    const res = await fetch(route.html);
    if (mySeq !== navSeq) return; // подменили ссылкой, кликнутой позже
    if (!res.ok) { location.href = url; return; }
    const text = await res.text();
    if (mySeq !== navSeq) return;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const newRoot = doc.getElementById('view-root');
    const oldRoot = document.getElementById('view-root');
    if (!newRoot || !oldRoot) { location.href = url; return; }

    if (currentModule && typeof currentModule.unmount === 'function') {
      try { currentModule.unmount(); } catch (err) { console.error('unmount error', err); }
    }
    if (window.disconnectReveals) window.disconnectReveals(oldRoot);

    ensureStylesheets(doc, route.html);
    document.title = doc.title;
    oldRoot.replaceWith(newRoot);
    if (doPushState) history.pushState({ routeKey: route.key }, '', url);
    updateNavActiveState(route.key);

    const mod = await import(route.js);
    // Пока грузился модуль экрана, могла прилететь ещё одна навигация —
    // тогда #view-root в документе уже принадлежит ЕЙ, и звать mount()
    // этого (устаревшего) модуля нельзя: он будет искать свои элементы
    // по всему document и либо упадёт, либо испортит чужой экран.
    if (mySeq !== navSeq) return;
    currentModule = mod;
    currentRoute = route;
    if (typeof mod.mount === 'function') await mod.mount(newRoot);
  } finally {
    if (mySeq === navSeq) finishProgress();
  }
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a) return;
  if (a.target && a.target !== '_self') return;
  if (a.hasAttribute('download')) return;

  let route, targetUrl;
  if (a.dataset.route) {
    // Постоянная <nav> не подменяется роутером и может быть от ЛЮБОЙ
    // из пяти страниц — её относительные href были посчитаны один раз
    // при начальной загрузке и остаются верными только для директории
    // ТОЙ страницы. Стоило перейти хоть раз (history.pushState меняет
    // адрес), как те же относительные ссылки начинают резолвиться уже
    // от нового адреса и ломаются (например "pages/courses.html" на
    // ссылке из шапки Ленты превращается в "pages/pages/courses.html").
    // Поэтому для ссылок из <nav> берём заранее посчитанный, стабильный
    // URL из ROUTES по ключу data-route, а не a.href.
    route = ROUTES.find(r => r.key === a.dataset.route);
    if (!route) return;
    const rawHref = a.getAttribute('href') || '';
    const hashIdx = rawHref.indexOf('#');
    const hash = hashIdx !== -1 ? rawHref.slice(hashIdx) : '';
    targetUrl = route.html + hash;
  } else {
    // Ссылки, сгенерированные динамически уже смонтированным экраном
    // (карточка курса, пост в ленте и т.п.), создаются уже ПОСЛЕ
    // pushState — на момент их создания location.href уже верный,
    // поэтому обычное резолвление через a.href тут безопасно.
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    route = findRouteForUrl(url);
    if (!route) return; // не один из пяти SPA-маршрутов — обычный переход
    targetUrl = url.href;
  }

  if (route === currentRoute && targetUrl === location.href) { e.preventDefault(); return; }
  e.preventDefault();
  navigateTo(route, targetUrl, true);
});

window.addEventListener('popstate', () => {
  const route = findRouteForUrl(new URL(location.href));
  if (!route) return;
  navigateTo(route, location.href, false);
});

// Для случаев, когда что-то на текущем экране (например, вкладка
// "Тренажёры" на Главной, если её нажали не находясь на Главной) должно
// программно перейти на Главную, а не по клику на <a href>.
window.__spaGoHome = async function (afterSectionId) {
  const home = ROUTES.find(r => r.key === 'home');
  await navigateTo(home, home.html, true);
  if (afterSectionId && window.tab) {
    // btn может не найтись (если текущая <nav> не от Главной), tab()
    // и без него откроет нужный раздел — см. main.js
    const btn = document.querySelector('.nav-tab[data-tab="' + afterSectionId + '"]');
    window.tab(afterSectionId, btn);
  }
};

// Первая загрузка — страница уже отрисована сервером, просто монтируем
// её собственный модуль (init() внутри него больше не запускается сам).
(async function initialMount() {
  const route = findRouteForUrl(new URL(location.href));
  if (!route) return;
  const root = document.getElementById('view-root');
  if (!root) return;
  const mod = await import(route.js);
  currentModule = mod;
  currentRoute = route;
  updateNavActiveState(route.key);
  if (typeof mod.mount === 'function') await mod.mount(root);
})();
