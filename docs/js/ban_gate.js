/* ══════════════════════════════════════
   БАН-ЭКРАН — общий блок (как notifications.js), подключается на всех
   страницах с логином. window.enforceBanGate(SB, profile) проверяет
   profile.is_banned; если забанен — разлогинивает и показывает
   блокирующий экран на весь сайт. Возвращает true, если доступ
   заблокирован (вызывающий код должен сразу return после этого —
   дальше грузить данные/рисовать страницу не нужно).
   ══════════════════════════════════════ */
(function () {
  window.enforceBanGate = function (SB, profile) {
    if (!profile || !profile.is_banned) return false;

    try { SB.auth.signOut(); } catch (e) { /* не критично */ }

    const reason = profile.ban_reason ? String(profile.ban_reason) : '';
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:var(--bg,#0a0b16);padding:24px">
        <div style="max-width:440px;width:100%;text-align:center;padding:40px 32px;border-radius:16px;border:1px solid var(--red,#f87171);background:var(--card,rgba(255,255,255,.04))">
          <div style="width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:rgba(248,113,113,.12);display:flex;align-items:center;justify-content:center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
          </div>
          <div style="font-family:var(--display,sans-serif);font-weight:800;font-size:20px;color:var(--text,#eef0fb);margin-bottom:10px">Доступ заблокирован</div>
          <div style="font-size:14px;line-height:1.5;color:var(--muted2,rgba(255,255,255,.6))">
            Администрация ограничила доступ к этому аккаунту.${reason ? '<br><br>Причина: ' + reason.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) : ''}
          </div>
          <a href="${location.pathname.includes('/pages/') ? '' : 'pages/'}auth.html" style="display:inline-block;margin-top:24px;padding:10px 20px;border-radius:10px;background:var(--s2,rgba(255,255,255,.07));border:1px solid var(--border,rgba(255,255,255,.1));color:var(--text,#eef0fb);text-decoration:none;font-size:14px;font-weight:600">Выйти</a>
        </div>
      </div>`;
    return true;
  };
})();
