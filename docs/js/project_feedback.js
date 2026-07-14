/* ══════════════════════════════════════
   ОБРАТНАЯ СВЯЗЬ НА ТРЕК В ПОРТФОЛИО
   Общий блок (как waveform_player.js) — используется и в Портфолио
   (управление своими треками), и в Профиле (публичная стена работ).
   window.mountProjectFeedback(SB, project, mount, ctx) строит внутри
   mount: звёздный рейтинг, эмодзи-реакции, профессиональный разбор от
   наставника, комментарии — и сам всё загружает/сохраняет через
   переданный клиент SB. ctx = { currentUid, currentRole }.

   Нужен content_filter.js (EMOJI_SET/censorText/containsPoliticalContent)
   — подключать на странице раньше этого файла.
   ══════════════════════════════════════ */
(function () {
  function pfIcon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
  const ICON_MESSAGE = pfIcon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>');
  const ICON_FLAG = pfIcon('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>');
  const ICON_CHECK = pfIcon('<path d="M20 6 9 17l-5-5"/>');
  const STAR_FULL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
  const ICON_PRO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>';
  const PRO_ROLES = ['VERIFIED_PRO', 'MENTOR', 'ADMIN'];

  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function initialsOf(name){ return (name || '??').slice(0, 2).toUpperCase(); }
  function timeAgo(iso){
    const d = new Date(iso);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return diffMin + ' мин назад';
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return diffH + ' ч назад';
    return d.toLocaleDateString('ru-RU');
  }

  window.mountProjectFeedback = function (SB, project, mount, ctx) {
    const projectId = project.id;
    const currentUid = ctx.currentUid;
    const canReview = ['VERIFIED_PRO', 'MENTOR', 'ADMIN'].includes(ctx.currentRole);
    const isAdmin = ctx.currentRole === 'ADMIN';

    mount.classList.add('pf');
    mount.innerHTML = `
      <div class="pf-summary">
        <div class="pf-stars"></div>
        <div class="pf-reactions">
          <div class="emoji-pills"></div>
          <div class="emoji-add">
            <button type="button" class="emoji-add-btn">+</button>
            <div class="emoji-picker">${EMOJI_SET.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
          </div>
        </div>
        <button type="button" class="pf-comments-toggle">${ICON_MESSAGE} 0</button>
      </div>
      <div class="pf-reviews"></div>
      <div class="pf-comments" style="display:none">
        <div class="pf-comment-list"></div>
        <div class="pf-comment-form">
          <input type="text" class="pf-comment-input" placeholder="Комментарий...">
          <button type="button" class="pf-comment-send">→</button>
        </div>
      </div>`;

    /* ── Звёзды ── */
    const starsEl = mount.querySelector('.pf-stars');
    async function refreshStars(){
      const { data } = await SB.from('project_ratings').select('stars, user_id').eq('project_id', projectId);
      const rows = data || [];
      const mine = rows.find(r => r.user_id === currentUid);
      const avg = rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : 0;
      starsEl.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const lit = mine ? n <= mine.stars : n <= Math.round(avg);
        return `<button type="button" class="pf-star${lit ? ' lit' : ''}" data-n="${n}">${STAR_FULL}</button>`;
      }).join('') + `<span class="pf-stars-avg">${rows.length ? avg.toFixed(1) : '—'}</span><span class="pf-stars-count">(${rows.length})</span>`;
      starsEl.querySelectorAll('.pf-star').forEach(btn => {
        btn.addEventListener('click', () => rateProject(Number(btn.dataset.n)));
      });
    }
    async function rateProject(stars){
      await SB.from('project_ratings').upsert({ project_id: projectId, user_id: currentUid, stars }, { onConflict: 'project_id,user_id' });
      await refreshStars();
    }
    refreshStars();

    /* ── Реакции ── */
    const pillWrap = mount.querySelector('.emoji-pills');
    async function refreshReactions(){
      const { data } = await SB.from('project_reactions').select('emoji, user_id').eq('project_id', projectId);
      const counts = new Map();
      (data || []).forEach(r => {
        const cur = counts.get(r.emoji) || { count: 0, mine: false };
        cur.count++;
        if (r.user_id === currentUid) cur.mine = true;
        counts.set(r.emoji, cur);
      });
      pillWrap.innerHTML = '';
      counts.forEach((v, emoji) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'emoji-pill' + (v.mine ? ' mine' : '');
        pill.textContent = `${emoji} ${v.count}`;
        pill.addEventListener('click', () => toggleReaction(emoji));
        pillWrap.appendChild(pill);
      });
    }
    async function toggleReaction(emoji){
      const { data: mine } = await SB.from('project_reactions').select('id')
        .eq('project_id', projectId).eq('user_id', currentUid).eq('emoji', emoji);
      if (mine && mine.length) {
        await SB.from('project_reactions').delete().eq('project_id', projectId).eq('user_id', currentUid).eq('emoji', emoji);
      } else {
        await SB.from('project_reactions').insert({ project_id: projectId, user_id: currentUid, emoji });
        notifyUser(SB, { userId: project.user_id, actorId: currentUid, type: 'project_reaction', contentType: 'project', contentId: projectId });
      }
      await refreshReactions();
    }
    refreshReactions();

    const emojiBtn = mount.querySelector('.emoji-add-btn');
    const picker = mount.querySelector('.emoji-picker');
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !picker.classList.contains('open');
      mount.querySelectorAll('.emoji-picker.open').forEach(p => p.classList.remove('open'));
      if (willOpen) picker.classList.add('open');
    });
    picker.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => { toggleReaction(b.dataset.e); picker.classList.remove('open'); });
    });
    document.addEventListener('click', () => picker.classList.remove('open'));

    /* ── Профессиональный разбор ── */
    const reviewsEl = mount.querySelector('.pf-reviews');
    async function loadReviews(){
      const { data } = await SB.from('project_reviews').select('*, profiles(username, avatar_color)').eq('project_id', projectId).order('created_at', { ascending: true });
      const rows = data || [];
      const mine = rows.find(r => r.reviewer_id === currentUid);
      reviewsEl.innerHTML = rows.map(r => {
        const rUsername = (r.profiles && r.profiles.username) || 'Наставник';
        return `
        <div class="pf-review">
          <div class="pf-review-head">
            <a class="pf-review-badge" href="profile.html?user=${r.reviewer_id}">${ICON_PRO}${escapeHtml(rUsername)} · ${r.score}/10</a>
            <span class="pf-review-date">${timeAgo(r.created_at)}</span>
          </div>
          <div class="pf-review-text">${escapeHtml(r.feedback)}</div>
        </div>`;
      }).join('');
      if (canReview) {
        const formWrap = document.createElement('div');
        formWrap.className = 'pf-review-form';
        formWrap.innerHTML = `
          <div class="pf-review-form-row">
            <input type="number" min="1" max="10" class="pf-review-score" placeholder="Оценка 1-10" value="${mine ? mine.score : ''}">
          </div>
          <textarea class="pf-review-feedback" placeholder="Разбор трека...">${mine ? escapeHtml(mine.feedback) : ''}</textarea>
          <button type="button" class="pf-review-submit">${mine ? 'Обновить разбор' : 'Оставить разбор'}</button>`;
        reviewsEl.appendChild(formWrap);
        formWrap.querySelector('.pf-review-submit').addEventListener('click', async () => {
          const score = Number(formWrap.querySelector('.pf-review-score').value);
          const feedback = formWrap.querySelector('.pf-review-feedback').value.trim();
          if (!score || score < 1 || score > 10) { alert('Оценка должна быть от 1 до 10'); return; }
          if (!feedback) { alert('Напиши текст разбора'); return; }
          if (containsPoliticalContent(feedback)) { alert(POLITICAL_GUARD_MESSAGE); return; }
          const { error } = await SB.from('project_reviews').upsert(
            { project_id: projectId, reviewer_id: currentUid, score, feedback: censorText(feedback), updated_at: mine ? new Date().toISOString() : null },
            { onConflict: 'project_id,reviewer_id' }
          );
          if (error) { alert('Ошибка: ' + error.message); return; }
          if (!mine) notifyUser(SB, { userId: project.user_id, actorId: currentUid, type: 'project_review', contentType: 'project', contentId: projectId });
          await loadReviews();
        });
      }
    }
    loadReviews();

    /* ── Комментарии ── */
    const commentsBlock = mount.querySelector('.pf-comments');
    const commentList = mount.querySelector('.pf-comment-list');
    const toggleBtn = mount.querySelector('.pf-comments-toggle');
    const commentInput = mount.querySelector('.pf-comment-input');
    const sendBtn = mount.querySelector('.pf-comment-send');
    let commentsLoaded = false;

    async function refreshCommentCount(){
      const { count } = await SB.from('project_comments').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
      toggleBtn.innerHTML = ICON_MESSAGE + ' ' + (count || 0);
    }
    refreshCommentCount();

    toggleBtn.addEventListener('click', async () => {
      const opening = commentsBlock.style.display === 'none';
      commentsBlock.style.display = opening ? '' : 'none';
      if (opening && !commentsLoaded) { commentsLoaded = true; await loadComments(); }
    });

    async function loadComments(){
      const { data } = await SB.from('project_comments').select('*, profiles(username, avatar_color, role)').eq('project_id', projectId).order('created_at', { ascending: true });
      commentList.innerHTML = '';
      (data || []).forEach(c => commentList.appendChild(commentRow(c)));
    }

    function commentRow(c){
      const div = document.createElement('div');
      div.className = 'pf-comment-row';
      const profile = c.profiles || {};
      const username = profile.username || '?';
      const profileUrl = 'profile.html?user=' + c.user_id;
      const isOwn = c.user_id === currentUid;
      const canDelete = isOwn || isAdmin;
      const isPro = PRO_ROLES.includes(profile.role);
      div.innerHTML = `
        <a class="pf-comment-avatar" href="${profileUrl}" style="background:${profile.avatar_color || '#4ade80'}">${initialsOf(username)}</a>
        <div class="pf-comment-body">
          <div class="pf-comment-name">
            <a href="${profileUrl}">${escapeHtml(username)}</a>
            ${isPro ? `<span class="pf-comment-pro" title="Проверенный специалист">${ICON_PRO}</span>` : ''}
            ${c.updated_at ? '<span class="pf-comment-edited">· изменено</span>' : ''}
          </div>
          <div class="pf-comment-text">${escapeHtml(censorText(c.content))}</div>
          <div class="pf-comment-actions">
            <div class="pf-comment-reactions"><div class="emoji-pills"></div></div>
            ${(isOwn || canDelete) ? `
              ${isOwn ? '<button type="button" class="pf-comment-edit">Изменить</button>' : ''}
              ${canDelete ? '<button type="button" class="pf-comment-del">Удалить</button>' : ''}
            ` : ''}
            ${!isOwn ? `<button type="button" class="pf-comment-report" title="Пожаловаться">${ICON_FLAG}</button>` : ''}
          </div>
        </div>`;

      const cPillWrap = div.querySelector('.emoji-pills');
      async function refreshCReactions(){
        const { data } = await SB.from('project_comment_reactions').select('emoji, user_id').eq('comment_id', c.id);
        const counts = new Map();
        (data || []).forEach(r => {
          const cur = counts.get(r.emoji) || { count: 0, mine: false };
          cur.count++;
          if (r.user_id === currentUid) cur.mine = true;
          counts.set(r.emoji, cur);
        });
        cPillWrap.innerHTML = '';
        counts.forEach((v, emoji) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'emoji-pill' + (v.mine ? ' mine' : '');
          pill.textContent = `${emoji} ${v.count}`;
          pill.addEventListener('click', async () => {
            const { data: mine } = await SB.from('project_comment_reactions').select('id')
              .eq('comment_id', c.id).eq('user_id', currentUid).eq('emoji', emoji);
            if (mine && mine.length) await SB.from('project_comment_reactions').delete().eq('comment_id', c.id).eq('user_id', currentUid).eq('emoji', emoji);
            else await SB.from('project_comment_reactions').insert({ comment_id: c.id, user_id: currentUid, emoji });
            await refreshCReactions();
          });
          cPillWrap.appendChild(pill);
        });
      }
      refreshCReactions();

      const delBtn = div.querySelector('.pf-comment-del');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Удалить комментарий?')) return;
        const { error } = await SB.from('project_comments').delete().eq('id', c.id);
        if (error) { alert('Ошибка: ' + error.message); return; }
        await loadComments();
        await refreshCommentCount();
      });

      const editBtn = div.querySelector('.pf-comment-edit');
      if (editBtn) editBtn.addEventListener('click', () => {
        const textEl = div.querySelector('.pf-comment-text');
        const actionsEl = div.querySelector('.pf-comment-actions');
        const editWrap = document.createElement('div');
        editWrap.className = 'pf-comment-edit-wrap';
        editWrap.innerHTML = `
          <input type="text" class="pf-comment-edit-input" value="${escapeHtml(c.content)}">
          <button type="button" class="pf-comment-edit-save">Сохранить</button>
          <button type="button" class="pf-comment-edit-cancel">Отмена</button>`;
        textEl.style.display = 'none';
        actionsEl.style.display = 'none';
        div.querySelector('.pf-comment-body').insertBefore(editWrap, actionsEl);
        editWrap.querySelector('.pf-comment-edit-cancel').addEventListener('click', () => {
          editWrap.remove(); textEl.style.display = ''; actionsEl.style.display = '';
        });
        editWrap.querySelector('.pf-comment-edit-save').addEventListener('click', async () => {
          const raw = editWrap.querySelector('.pf-comment-edit-input').value.trim();
          if (!raw) return;
          if (containsPoliticalContent(raw)) { alert(POLITICAL_GUARD_MESSAGE); return; }
          const { error } = await SB.from('project_comments').update({ content: censorText(raw), updated_at: new Date().toISOString() }).eq('id', c.id);
          if (error) { alert('Ошибка: ' + error.message); return; }
          await loadComments();
        });
      });

      const reportBtn = div.querySelector('.pf-comment-report');
      if (reportBtn) reportBtn.addEventListener('click', async () => {
        const reason = prompt('Почему жалуешься? (необязательно)');
        if (reason === null) return;
        reportBtn.disabled = true;
        const { error } = await SB.from('content_reports').insert({ reporter_id: currentUid, content_type: 'project_comment', content_id: c.id, reason: reason.trim() || null });
        if (error) {
          reportBtn.disabled = false;
          if (error.code === '23505') { alert('Ты уже жаловался на это.'); return; }
          alert('Не удалось отправить жалобу: ' + error.message);
          return;
        }
        reportBtn.innerHTML = ICON_CHECK;
        reportBtn.title = 'Жалоба отправлена';
      });

      return div;
    }

    async function submitComment(){
      const raw = commentInput.value.trim();
      if (!raw) return;
      if (containsPoliticalContent(raw)) { alert(POLITICAL_GUARD_MESSAGE); return; }
      const { error } = await SB.from('project_comments').insert({ project_id: projectId, user_id: currentUid, content: censorText(raw) });
      if (error) { alert('Ошибка: ' + error.message); return; }
      notifyUser(SB, { userId: project.user_id, actorId: currentUid, type: 'project_comment', contentType: 'project', contentId: projectId });
      commentInput.value = '';
      await loadComments();
      await refreshCommentCount();
    }
    sendBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });
  };
})();
