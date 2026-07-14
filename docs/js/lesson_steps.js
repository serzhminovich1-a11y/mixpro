/* ══════════════════════════════════════
   ШАГИ УРОКА — теория + интерактивные задания с автопроверкой.
   Общий блок (как waveform_player.js) — используется в lesson.html.
   window.mountLessonSteps(SB, lessonId, mount) сам всё загружает и
   строит. Проверка ответа идёт через RPC submit_step_answer() —
   правильный ответ никогда не попадает в браузер (см.
   022_lesson_steps.sql), сюда долетает только "верно/неверно".

   Нужен rich_text.js (sanitizeRichHtml) для шагов-теории — подключать
   на странице раньше этого файла.
   ══════════════════════════════════════ */
(function () {
  function slIcon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
  const ICON_CHECK = slIcon('<path d="M20 6 9 17l-5-5"/>');
  const ICON_X = slIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const ICON_UP = slIcon('<path d="m18 15-6-6-6 6"/>');
  const ICON_DOWN = slIcon('<path d="m6 9 6 6 6-6"/>');
  const ICON_BOOK = slIcon('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>');
  const STEP_LABELS = {
    theory: 'Теория', quiz_single: 'Тест', quiz_multi: 'Тест (несколько верных)',
    text_answer: 'Ответ текстом', number_answer: 'Ответ числом',
    matching: 'Сопоставление', sorting: 'Сортировка',
  };

  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function shuffleIndices(n){
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  window.mountLessonSteps = async function (SB, lessonId, mount) {
    const { data: steps, error } = await SB.rpc('get_lesson_steps', { p_lesson_id: lessonId });
    if (error || !steps || !steps.length) { mount.innerHTML = ''; return; }

    mount.innerHTML = `<div class="sec-h">Практика</div><div class="steps-list"></div>`;
    const list = mount.querySelector('.steps-list');

    steps.forEach((step, i) => list.appendChild(stepCard(SB, step, i + 1)));
    if (window.animateChildren) animateChildren(list);
  };

  function stepCard(SB, step, num){
    const card = document.createElement('div');
    card.className = 'step-card';
    const isTheory = step.step_type === 'theory';
    card.innerHTML = `
      <div class="step-head">
        <span class="step-num">${num}</span>
        <span class="step-kind">${STEP_LABELS[step.step_type] || step.step_type}</span>
        ${step.title ? `<span class="step-title">${escapeHtml(step.title)}</span>` : ''}
        ${step.xp_reward > 0 ? `<span class="step-xp">+${step.xp_reward} XP</span>` : ''}
      </div>
      <div class="step-body"></div>
      <div class="step-actions">
        <button type="button" class="step-submit">${isTheory ? 'Понятно, дальше' : 'Проверить'}</button>
        <span class="step-attempts"></span>
      </div>
      <div class="step-feedback"></div>`;

    const body = card.querySelector('.step-body');
    const submitBtn = card.querySelector('.step-submit');
    const attemptsEl = card.querySelector('.step-attempts');
    const feedbackEl = card.querySelector('.step-feedback');

    const getAnswer = renderStepBody(step, body);

    if (step.max_attempts) attemptsEl.textContent = `Попыток: ${step.max_attempts}`;

    let locked = false;
    submitBtn.addEventListener('click', async () => {
      if (locked) return;
      const answer = getAnswer();
      if (answer === null) return; // студент ещё не ответил
      submitBtn.disabled = true;
      const { data, error } = await SB.rpc('submit_step_answer', { p_step_id: step.id, p_answer: answer });
      submitBtn.disabled = false;
      if (error) { feedbackEl.innerHTML = `<div class="step-fb wrong">Ошибка: ${escapeHtml(error.message)}</div>`; return; }
      const r = (data && data[0]) || {};

      card.classList.remove('correct', 'wrong');
      card.classList.add(r.is_correct ? 'correct' : 'wrong');
      feedbackEl.innerHTML = `<div class="step-fb ${r.is_correct ? 'correct' : 'wrong'}">${r.is_correct ? ICON_CHECK : ICON_X}${r.is_correct ? 'Верно!' : 'Неверно, попробуй ещё раз'}${r.xp_earned ? ` · +${r.xp_earned} XP` : ''}</div>`;

      if (step.max_attempts) {
        attemptsEl.textContent = r.attempts_remaining === 0 ? 'Попытки закончились' : `Осталось попыток: ${r.attempts_remaining}`;
      }
      if (r.show_solution) {
        locked = true;
        submitBtn.style.display = 'none';
        if (r.explanation) feedbackEl.innerHTML += `<div class="step-explain">${ICON_BOOK}${escapeHtml(r.explanation)}</div>`;
      }
    });

    return card;
  }

  // Строит содержимое шага и возвращает функцию, которая по клику "Проверить"
  // собирает ответ в JSON-форму, ожидаемую submit_step_answer(). Возвращает
  // null, если студент ещё ничего не выбрал/не ввёл.
  function renderStepBody(step, body){
    const c = step.content || {};
    switch (step.step_type) {
      case 'theory': {
        body.innerHTML = `<div class="step-theory">${window.sanitizeRichHtml ? sanitizeRichHtml(c.html || '') : escapeHtml(c.html || '')}</div>`;
        return () => ({});
      }
      case 'quiz_single': {
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || '')}</div>
          <div class="step-options">${(c.options || []).map((opt, i) => `<button type="button" class="step-opt" data-i="${i}">${escapeHtml(opt)}</button>`).join('')}</div>`;
        let picked = null;
        body.querySelectorAll('.step-opt').forEach(btn => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('.step-opt').forEach(b => b.classList.remove('picked'));
            btn.classList.add('picked');
            picked = Number(btn.dataset.i);
          });
        });
        return () => picked === null ? null : { selected: [picked] };
      }
      case 'quiz_multi': {
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || '')}</div>
          <div class="step-options">${(c.options || []).map((opt, i) => `<button type="button" class="step-opt" data-i="${i}">${escapeHtml(opt)}</button>`).join('')}</div>`;
        const picked = new Set();
        body.querySelectorAll('.step-opt').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = Number(btn.dataset.i);
            if (picked.has(i)) { picked.delete(i); btn.classList.remove('picked'); }
            else { picked.add(i); btn.classList.add('picked'); }
          });
        });
        return () => picked.size === 0 ? null : { selected: Array.from(picked) };
      }
      case 'text_answer': {
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || '')}</div>
          <input type="text" class="step-input" placeholder="Твой ответ...">`;
        const input = body.querySelector('.step-input');
        return () => input.value.trim() ? { text: input.value.trim() } : null;
      }
      case 'number_answer': {
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || '')}</div>
          <div class="step-num-row"><input type="number" step="any" class="step-input step-input-num" placeholder="Число...">${c.unit ? `<span class="step-unit">${escapeHtml(c.unit)}</span>` : ''}</div>`;
        const input = body.querySelector('.step-input-num');
        return () => input.value.trim() === '' ? null : { value: Number(input.value) };
      }
      case 'matching': {
        const left = c.left || [];
        const right = c.right || [];
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || 'Сопоставь пары')}</div>
          <div class="step-matching">${left.map((l, i) => `
            <div class="step-match-row">
              <span class="step-match-left">${escapeHtml(l)}</span>
              <select class="step-match-select" data-i="${i}">
                <option value="">— выбери —</option>
                ${right.map((r, j) => `<option value="${j}">${escapeHtml(r)}</option>`).join('')}
              </select>
            </div>`).join('')}</div>`;
        const selects = body.querySelectorAll('.step-match-select');
        return () => {
          const mapping = [];
          for (const sel of selects) {
            if (sel.value === '') return null;
            mapping.push(Number(sel.value));
          }
          return { mapping };
        };
      }
      case 'sorting': {
        let order = (c.items || []).map((_, i) => i);
        body.innerHTML = `<div class="step-question">${escapeHtml(c.question || 'Расставь по порядку')}</div><div class="step-sort-list"></div>`;
        const listEl = body.querySelector('.step-sort-list');
        function renderSort(){
          listEl.innerHTML = order.map((itemIdx, pos) => `
            <div class="step-sort-row" data-pos="${pos}">
              <span class="step-sort-txt">${escapeHtml(c.items[itemIdx])}</span>
              <span class="step-sort-btns">
                <button type="button" class="step-sort-up" ${pos === 0 ? 'disabled' : ''}>${ICON_UP}</button>
                <button type="button" class="step-sort-down" ${pos === order.length - 1 ? 'disabled' : ''}>${ICON_DOWN}</button>
              </span>
            </div>`).join('');
          listEl.querySelectorAll('.step-sort-up').forEach((btn, pos) => btn.addEventListener('click', () => {
            [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]];
            renderSort();
          }));
          listEl.querySelectorAll('.step-sort-down').forEach((btn, pos) => btn.addEventListener('click', () => {
            [order[pos], order[pos + 1]] = [order[pos + 1], order[pos]];
            renderSort();
          }));
        }
        renderSort();
        return () => ({ order });
      }
      default:
        body.innerHTML = '';
        return () => null;
    }
  }
})();
