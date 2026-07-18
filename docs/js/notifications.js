/* ══════════════════════════════════════
   УВЕДОМЛЕНИЯ — колокольчик в шапке + выпадающий список.
   Общий блок (как waveform_player.js) — используется на всех страницах,
   где есть навигация залогиненного пользователя.
   window.mountNotifications(SB, mount, currentUid) строит колокольчик
   внутри mount и сам всё загружает/обновляет.

   Кто и когда создаёт уведомления — см. window.notifyUser(SB, {...})
   ниже; вызывается из feed.js / project_feedback.js в нужных местах.
   ══════════════════════════════════════ */
(function () {
  function nIcon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
  const ICON_BELL = nIcon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>');
  const ICON_COMMENT = nIcon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>');
  const ICON_REACTION = nIcon('<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>');
  const ICON_REVIEW = nIcon('<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>');
  const ICON_FOLLOW = nIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>');
  const ICON_SHIELD = nIcon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>');
  const ICON_CROWN = nIcon('<path d="M2.5 19h19l-1.9-9.4a.5.5 0 0 0-.8-.27L15 13 12.4 6.2a.5.5 0 0 0-.8 0L9 13 5.2 9.33a.5.5 0 0 0-.8.27z"/>');

  const TYPE_META = {
    post_comment:    { icon: ICON_COMMENT,  text: u => `${u} оставил(а) комментарий к вашему посту`, href: () => 'feed.html' },
    post_reaction:   { icon: ICON_REACTION, text: u => `${u} отреагировал(а) на ваш пост`,            href: () => 'feed.html' },
    project_comment: { icon: ICON_COMMENT,  text: u => `${u} оставил(а) комментарий к вашему треку`,  href: () => 'portfolio.html' },
    project_reaction:{ icon: ICON_REACTION, text: u => `${u} отреагировал(а) на ваш трек`,            href: () => 'portfolio.html' },
    project_review:  { icon: ICON_REVIEW,   text: u => `${u} оставил(а) разбор на ваш трек`,          href: () => 'portfolio.html' },
    follow:          { icon: ICON_FOLLOW,   text: u => `${u} теперь подписан(а) на вас`,              href: (n) => 'profile.html?user=' + n.actor_id },
    role_changed:            { icon: ICON_SHIELD, text: () => 'Администратор изменил вашу роль на платформе', href: () => 'profile.html' },
    vip_granted:              { icon: ICON_CROWN,  text: () => 'Вам открыт VIP-доступ 🎉',                       href: () => 'profile.html' },
    verification_approved:   { icon: ICON_REVIEW, text: () => 'Заявка на верификацию одобрена — теперь у вас статус Certified Engineer', href: () => 'profile.html' },
    verification_rejected:   { icon: ICON_REVIEW, text: () => 'Заявка на верификацию отклонена',                href: () => 'verify.html' },
  };

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

  // Определяем базовый путь (со страниц в pages/ ссылки на другие страницы
  // pages/ идут без ../, а вот сама папка pages/ относительно текущей
  // страницы может быть на этом же уровне или на уровень выше).
  function pagesPrefix(){
    return location.pathname.includes('/pages/') ? '' : 'pages/';
  }

  window.mountNotifications = function (SB, mount, currentUid) {
    mount.classList.add('notif-wrap');
    mount.innerHTML = `
      <button type="button" class="notif-bell" id="notifBell" title="Уведомления">${ICON_BELL}<span class="notif-badge" id="notifBadge" style="display:none">0</span></button>
      <div class="notif-panel" id="notifPanel">
        <div class="notif-panel-head">Уведомления</div>
        <div class="notif-list" id="notifList"><div class="notif-empty">Загружаем…</div></div>
      </div>`;

    const bell = mount.querySelector('#notifBell');
    const badge = mount.querySelector('#notifBadge');
    const panel = mount.querySelector('#notifPanel');
    const list = mount.querySelector('#notifList');
    let loaded = false;

    async function refreshBadge(){
      const { count } = await SB.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', currentUid).eq('read', false);
      if (count) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }
    refreshBadge();

    async function loadList(){
      const { data } = await SB.from('notifications').select('*, profiles!notifications_actor_id_fkey(username)').eq('user_id', currentUid).order('created_at', { ascending: false }).limit(20);
      const rows = data || [];
      if (!rows.length) { list.innerHTML = '<div class="notif-empty">Пока пусто — здесь появятся комментарии, реакции и разборы на твои посты и треки</div>'; return; }
      const prefix = pagesPrefix();
      list.innerHTML = rows.map(n => {
        const meta = TYPE_META[n.type];
        if (!meta) return '';
        const uname = escapeHtml((n.profiles && n.profiles.username) || 'Кто-то');
        return `<a class="notif-row${n.read ? '' : ' unread'}" href="${prefix}${meta.href(n)}">
          <span class="notif-row-icon">${meta.icon}</span>
          <span class="notif-row-body"><span class="notif-row-text">${meta.text(uname)}</span><span class="notif-row-time">${timeAgo(n.created_at)}</span></span>
        </a>`;
      }).join('');
    }

    async function markAllRead(){
      await SB.from('notifications').update({ read: true }).eq('user_id', currentUid).eq('read', false);
      refreshBadge();
    }

    bell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const opening = !panel.classList.contains('open');
      document.querySelectorAll('.notif-panel.open').forEach(p => p.classList.remove('open'));
      if (opening) {
        panel.classList.add('open');
        if (!loaded) { loaded = true; await loadList(); }
        setTimeout(markAllRead, 800);
      }
    });
    document.addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', (e) => e.stopPropagation());
  };

  // Создать уведомление "от своего имени" (actor = текущий пользователь)
  // для другого получателя. Молча проглатывает ошибки — уведомление не
  // должно ронять основное действие (комментарий/реакцию), если вдруг
  // не отправилось.
  window.notifyUser = async function (SB, { userId, actorId, type, contentType, contentId }) {
    if (!userId || userId === actorId) return; // не уведомляем самого себя о своих же действиях
    try {
      await SB.from('notifications').insert({ user_id: userId, actor_id: actorId, type, content_type: contentType || null, content_id: contentId || null });
    } catch (e) { /* не критично */ }
  };
})();
