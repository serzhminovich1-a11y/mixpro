// MIXPRO — общие анимации: появление карточек при скролле + счётчики чисел.
// Подключается на каждой странице после основного JS.

(function(){
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;

  // Ставит анимацию появления на элемент (используется и статичной
  // разметкой через class="reveal", и динамически создаваемыми карточками).
  window.animateIn = function(el){
    if (!el || reduceMotion) return;
    el.classList.add('reveal');
    if (io) io.observe(el); else el.classList.add('in-view');
  };

  // Ставит .reveal на все текущие и будущие карточки внутри контейнера —
  // удобно вызвать один раз сразу после того, как список отрисован.
  window.animateChildren = function(container){
    if (!container || reduceMotion) return;
    Array.from(container.children).forEach(child => window.animateIn(child));
  };

  // Анимированный счётчик числа: animateNumber(el, 4831)
  window.animateNumber = function(el, target, opts){
    opts = opts || {};
    const duration = opts.duration || 900;
    const formatter = opts.format || (n => Math.round(n).toLocaleString('ru'));
    if (reduceMotion) { el.textContent = formatter(target); return; }
    const start = 0;
    const startTime = performance.now();
    function tick(now){
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.reveal').forEach(el => {
      if (io) io.observe(el); else el.classList.add('in-view');
    });
  });
})();
