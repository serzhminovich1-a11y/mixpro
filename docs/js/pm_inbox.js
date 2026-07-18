/* ══════════════════════════════════════
   ЛИЧНЫЕ СООБЩЕНИЯ — маленький виджет-иконка рядом с колокольчиком
   уведомлений (как notifications.js, но отдельно — чтобы визуально
   отличать "мне написали" от обычных уведомлений о реакциях/ответах).
   window.mountPmInbox(SB, mount, currentUid) строит иконку с бейджем
   непрочитанных и выпадающий список последних переписок.
   ══════════════════════════════════════ */
(function () {
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function timeAgo(iso){
    const d = new Date(iso);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return diffMin + ' мин назад';
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return diffH + ' ч назад';
    return d.toLocaleDateString('ru-RU');
  }
  function pagesPrefix(){
    return location.pathname.includes('/pages/') ? '' : 'pages/';
  }

  const ICON_MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;

  window.mountPmInbox = function (SB, mount, currentUid) {
    mount.classList.add('notif-wrap');
    mount.innerHTML = `
      <button type="button" class="notif-bell" id="pmBell" title="Личные сообщения">${ICON_MAIL}<span class="notif-badge" id="pmBadge" style="display:none">0</span></button>
      <div class="notif-panel" id="pmPanel">
        <div class="notif-panel-head">Сообщения</div>
        <div class="notif-list" id="pmList"><div class="notif-empty">Загружаем…</div></div>
      </div>`;

    const bell = mount.querySelector('#pmBell');
    const badge = mount.querySelector('#pmBadge');
    const panel = mount.querySelector('#pmPanel');
    const list = mount.querySelector('#pmList');
    let loaded = false;

    async function refreshBadge(){
      const { count } = await SB.from('pm_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', currentUid).is('read_at', null);
      if (count) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }
    refreshBadge();

    async function loadList(){
      const { data } = await SB.from('pm_messages')
        .select('id, sender_id, recipient_id, content, created_at, read_at')
        .or(`sender_id.eq.${currentUid},recipient_id.eq.${currentUid}`)
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = data || [];
      if (!rows.length) { list.innerHTML = '<div class="notif-empty">Пока нет переписок — напишите кому-нибудь на форуме или в профиле</div>'; return; }

      const byCounterpart = new Map();
      rows.forEach(m => {
        const counterpart = m.sender_id === currentUid ? m.recipient_id : m.sender_id;
        if (!byCounterpart.has(counterpart)) byCounterpart.set(counterpart, m);
      });
      const counterpartIds = Array.from(byCounterpart.keys());
      const { data: profiles } = counterpartIds.length ? await SB.from('profiles').select('id, username').in('id', counterpartIds) : { data: [] };
      const nameMap = new Map((profiles || []).map(p => [p.id, p.username]));

      const prefix = pagesPrefix();
      list.innerHTML = Array.from(byCounterpart.entries()).slice(0, 8).map(([uid, m]) => {
        const unread = m.recipient_id === currentUid && !m.read_at;
        return `<a class="notif-row${unread ? ' unread' : ''}" href="${prefix}messages.html?to=${uid}">
          <span class="notif-row-body"><span class="notif-row-text"><b>${escapeHtml(nameMap.get(uid) || 'Пользователь')}</b>: ${escapeHtml(m.content).slice(0, 60)}</span><span class="notif-row-time">${timeAgo(m.created_at)}</span></span>
        </a>`;
      }).join('') + `<a class="notif-row" style="text-align:center;color:var(--amber)" href="${prefix}messages.html">Все сообщения →</a>`;
    }

    bell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const opening = !panel.classList.contains('open');
      document.querySelectorAll('.notif-panel.open').forEach(p => p.classList.remove('open'));
      if (opening) {
        panel.classList.add('open');
        if (!loaded) { loaded = true; await loadList(); }
      }
    });
    document.addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', (e) => e.stopPropagation());
  };
})();
