/* ══════════════════════════════════════
   ПЛАВНЫЙ ПЕРЕХОД МЕЖДУ СТРАНИЦАМИ — лёгкое затухание при клике по
   внутренней ссылке, чтобы переключение между разделами сайта (Лента/
   Форум/Курсы и т.д. — это отдельные HTML-файлы, не вкладки) не
   ощущалось как обрыв между двумя страницами. Появление уже есть в
   animations.css (body{animation:pageIn}) — здесь только уход.
   Подключается на каждой странице, после animations.css.

   Там, где браузер умеет сам (Cross-Document View Transitions —
   Chrome/Edge, см. @view-transition в animations.css), этот файл
   вообще ничего не перехватывает — родной переход браузера плавнее
   любого ручного фейда. Ручной фейд ниже — только fallback туда, где
   этой поддержки нет (Firefox/Safari на момент написания).
   ══════════════════════════════════════ */
(function () {
  if ('onpageswap' in window) return; // браузер справится сам

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    let url;
    try { url = new URL(a.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;

    if (reduceMotion) return; // сразу обычный переход, без задержки

    e.preventDefault();
    document.body.classList.add('page-leaving');
    setTimeout(() => { location.href = a.href; }, 150);
  });
})();
