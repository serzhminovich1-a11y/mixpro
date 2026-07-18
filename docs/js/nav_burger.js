/* ══════════════════════════════════════
   БУРГЕР-МЕНЮ В ШАПКЕ — общий для всех страниц (кроме index.html, у
   которой своя копия в main.js из-за вкладок Главная/Тренажёры/...).
   Прячет в себя разделы сайта + Выйти, чтобы шапка не расползалась —
   тот же принцип, что и theme-panel на Главной: класс "open" + закрытие
   по клику вне себя.
   ══════════════════════════════════════ */
function toggleBurgerMenu(){
  const panel = document.getElementById('burgerPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeBurgerMenu();
  else panel.classList.add('open');
}
function closeBurgerMenu(){
  const panel = document.getElementById('burgerPanel');
  if (panel) panel.classList.remove('open');
}
document.addEventListener('click', e => {
  const panel = document.getElementById('burgerPanel');
  const btn = document.getElementById('burgerBtn');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeBurgerMenu();
});
