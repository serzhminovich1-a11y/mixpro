// ══════════════════════════════════════
//  ЛИЧНЫЕ СООБЩЕНИЯ — список переписок ⇄ сама переписка (?to=<uid>)
//  Плоская таблица pm_messages, "переписка" вычисляется группировкой по
//  собеседнику на клиенте — отдельных таблиц conversations/participants нет.
// ══════════════════════════════════════
const SUPABASE_PROJECT_REF = 'mwzskffecoedpvyflswg';
const SB = supabase.createClient(
  `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let currentUid = null;

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function logout(){ await SB.auth.signOut(); location.href = 'auth.html'; }

function timeAgo(iso){
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return diffMin + ' мин назад';
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return diffH + ' ч назад';
  return d.toLocaleDateString('ru-RU');
}

async function renderConvList(){
  const { data: rows } = await SB.from('pm_messages')
    .select('id, sender_id, recipient_id, content, created_at, read_at')
    .or(`sender_id.eq.${currentUid},recipient_id.eq.${currentUid}`)
    .order('created_at', { ascending: false })
    .limit(200);

  const list = document.getElementById('convList');
  if (!rows || !rows.length) { list.innerHTML = '<div class="empty">Пока нет переписок</div>'; return; }

  const byCounterpart = new Map();
  rows.forEach(m => {
    const counterpart = m.sender_id === currentUid ? m.recipient_id : m.sender_id;
    if (!byCounterpart.has(counterpart)) byCounterpart.set(counterpart, { last: m, unread: 0 });
    if (m.recipient_id === currentUid && !m.read_at) byCounterpart.get(counterpart).unread++;
  });

  const counterpartIds = Array.from(byCounterpart.keys());
  const { data: profiles } = await SB.from('profiles').select('id, username, avatar_color').in('id', counterpartIds);
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  list.innerHTML = Array.from(byCounterpart.entries()).map(([uid, info]) => {
    const p = profileMap.get(uid) || { username: '?', avatar_color: '' };
    const initials = (p.username || '??').slice(0, 2).toUpperCase();
    return `<a href="messages.html?to=${uid}" class="conv-row${info.unread ? ' unread' : ''}">
      <div class="conv-avatar" style="background:${p.avatar_color || 'var(--amber)'}">${initials}</div>
      <div class="conv-main">
        <div class="conv-name">${escapeHtml(p.username)}${info.unread ? '<span class="conv-dot"></span>' : ''}</div>
        <div class="conv-preview">${info.last.sender_id === currentUid ? 'Вы: ' : ''}${escapeHtml(info.last.content)}</div>
      </div>
      <div class="conv-time">${timeAgo(info.last.created_at)}</div>
    </a>`;
  }).join('');
  if (window.animateChildren) animateChildren(list);
}

async function renderConversation(otherUid){
  const { data: profile } = await SB.from('profiles').select('username, avatar_color').eq('id', otherUid).single();
  if (!profile) { location.href = 'messages.html'; return; }
  document.getElementById('convName').textContent = profile.username;
  const av = document.getElementById('convAvatar');
  av.style.background = profile.avatar_color || 'var(--amber)';
  av.textContent = (profile.username || '??').slice(0, 2).toUpperCase();

  const { data: rows } = await SB.from('pm_messages')
    .select('id, sender_id, recipient_id, content, created_at, read_at')
    .or(`and(sender_id.eq.${currentUid},recipient_id.eq.${otherUid}),and(sender_id.eq.${otherUid},recipient_id.eq.${currentUid})`)
    .order('created_at', { ascending: true });

  const msgs = rows || [];
  const list = document.getElementById('msgList');
  list.innerHTML = msgs.map(m => {
    const mine = m.sender_id === currentUid;
    const time = new Date(m.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="msg-bubble ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">${escapeHtml(m.content)}<span class="msg-time">${time}${!mine ? ` · <a href="#" class="msg-report-link" data-id="${m.id}">пожаловаться</a>` : ''}</span></div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
  list.querySelectorAll('.msg-report-link').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const reason = prompt('Почему жалуетесь на это сообщение? (необязательно)', '');
      if (reason === null) return;
      const { error } = await SB.from('content_reports').insert({ reporter_id: currentUid, content_type: 'pm_message', content_id: a.dataset.id, reason: reason || null });
      if (error) { alert(error.code === '23505' ? 'Вы уже жаловались на это сообщение' : 'Не удалось отправить жалобу: ' + error.message); return; }
      a.textContent = 'жалоба отправлена';
      a.style.pointerEvents = 'none';
    });
  });

  // Отмечаем непрочитанные входящие как прочитанные — только через RPC,
  // прямого UPDATE на pm_messages для получателя нет (см. 037_private_messages.sql).
  // SB.rpc(...) — ленивый билдер (как и весь supabase-js): пока его не
  // await'нуть/не подписаться через .then(), запрос физически не уйдёт.
  const unreadIncoming = msgs.filter(m => m.recipient_id === currentUid && !m.read_at);
  await Promise.all(unreadIncoming.map(m => SB.rpc('mark_message_read', { p_message_id: m.id })));
}

function setupComposer(otherUid){
  const form = document.getElementById('msgForm');
  const input = document.getElementById('msgInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    const btn = document.getElementById('msgSendBtn');
    btn.disabled = true;
    const { error } = await SB.from('pm_messages').insert({ sender_id: currentUid, recipient_id: otherUid, content });
    btn.disabled = false;
    if (error) { alert('Не удалось отправить: ' + error.message); return; }
    input.value = '';
    input.style.height = 'auto';
    if (window.notifyUser) notifyUser(SB, { userId: otherUid, actorId: currentUid, type: 'pm_message' });
    await renderConversation(otherUid);
  });
}

async function init(){
  const session = await requireSession(SB);
  if (!session) return;
  currentUid = session.user.id;
  if (window.updateLastSeen) updateLastSeen(SB, currentUid);

  const { data: profile } = await SB.from('profiles').select('role, is_banned, ban_reason').eq('id', currentUid).single();
  if (window.enforceBanGate && enforceBanGate(SB, profile)) return;
  if (profile && ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(profile.role)) {
    document.getElementById('adminLink').style.display = '';
  }
  mountNotifications(SB, document.getElementById('notifMount'), currentUid);
  if (window.mountPmInbox) mountPmInbox(SB, document.getElementById('pmMount'), currentUid);

  document.getElementById('loading').style.display = 'none';

  const otherUid = new URLSearchParams(location.search).get('to');
  if (otherUid) {
    const view = document.getElementById('convView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '16px';
    setupComposer(otherUid);
    await renderConversation(otherUid);
  } else {
    const view = document.getElementById('listView');
    view.style.display = 'flex';
    view.style.flexDirection = 'column';
    view.style.gap = '16px';
    await renderConvList();
  }
}

init();
