/* ══════════════════════════════════════
   АНАЛИЗ МИКСА — LUFS, True Peak, ширина стерео, динамика, пик, моно-совместимость.
   window.createAudioAnalysisPanel(url, mount) строит сворачиваемую панель:
   по клику скачивает и декодирует тот же файл и считает метрики прямо в
   браузере (Web Audio API), ничего не отправляется на сервер и не
   сохраняется — каждое открытие панели считает заново.

   Методика:
   - LUFS (интегральная громкость) — ITU-R BS.1770-4: K-weighting фильтр
     (шелвинг + хай-пасс, коэффициенты пересчитываются под sample rate
     файла) + блоки 400мс/75% + абсолютный (-70 LUFS) и относительный
     (-10 LU от негейтированного среднего) гейтинг.
   - True Peak — сигнал передискретизируется в 4 раза через
     OfflineAudioContext (использует встроенный ресемплер браузера) и
     ищется пик уже на повышенной частоте — так ловятся межсэмпловые
     всплески, которых не видно в исходных сэмплах. Это приближение
     (не точная реализация полифазного фильтра из Приложения 2
     BS.1770), но оно даёт куда более честную цифру, чем простой пик
     по сэмплам.
   - Стерео-корреляция — обычный коэффициент корреляции L/R (-1..1).
   - Динамический диапазон — разница между пиком и RMS всего трека
     (crest factor), не официальный стандарт DR14, но даёт понятную
     оценку "насколько сильно сжат микс".
   ══════════════════════════════════════ */
(function () {
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>';

  function dbStr(db) {
    if (!isFinite(db)) return '—';
    return (db > 0 ? '+' : '') + db.toFixed(1);
  }

  // ── K-weighting (ITU-R BS.1770-4), коэффициенты пересчитаны под rate ──
  function makeKWeightingStages(rate) {
    // Стадия 1 — шелвинг (предфильтр)
    let f0 = 1681.9744509555319, G = 3.99984385397, Q = 0.7071752369554193;
    let K = Math.tan(Math.PI * f0 / rate);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const stage1 = {
      b0: (Vh + Vb * K / Q + K * K) / a0,
      b1: 2 * (K * K - Vh) / a0,
      b2: (Vh - Vb * K / Q + K * K) / a0,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0,
    };
    // Стадия 2 — RLB хай-пасс
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / rate);
    a0 = 1 + K / Q + K * K;
    const stage2 = {
      b0: 1, b1: -2, b2: 1,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0,
    };
    return [stage1, stage2];
  }

  function applyBiquad(data, c) {
    const out = new Float32Array(data.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      out[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
  }

  function kWeight(data, stages) {
    return applyBiquad(applyBiquad(data, stages[0]), stages[1]);
  }

  function computeIntegratedLufs(buffer) {
    const rate = buffer.sampleRate;
    const stages = makeKWeightingStages(rate);
    const nCh = buffer.numberOfChannels;
    const filtered = [];
    for (let ch = 0; ch < nCh; ch++) filtered.push(kWeight(buffer.getChannelData(ch), stages));

    const blockSize = Math.round(0.4 * rate);
    const stepSize = Math.round(0.1 * rate); // 75% overlap
    if (filtered[0].length < blockSize) return null;

    const blockPower = [];
    for (let start = 0; start + blockSize <= filtered[0].length; start += stepSize) {
      let sum = 0;
      for (let ch = 0; ch < nCh; ch++) {
        const d = filtered[ch];
        let s = 0;
        for (let i = start; i < start + blockSize; i++) s += d[i] * d[i];
        sum += s / blockSize; // весовой коэффициент каналов L/R = 1.0
      }
      blockPower.push(sum);
    }
    if (!blockPower.length) return null;

    const ABS_GATE = Math.pow(10, (-70 + 0.691) / 10);
    const absGated = blockPower.filter(p => p >= ABS_GATE);
    if (!absGated.length) return null;
    const absMean = absGated.reduce((a, b) => a + b, 0) / absGated.length;

    const relThreshold = absMean * Math.pow(10, -10 / 10);
    const relGated = absGated.filter(p => p >= relThreshold);
    if (!relGated.length) return null;
    const relMean = relGated.reduce((a, b) => a + b, 0) / relGated.length;

    return -0.691 + 10 * Math.log10(relMean);
  }

  async function computeTruePeakDb(buffer) {
    const factor = 4;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return computeSamplePeakDb(buffer); // нет поддержки — честный сэмпл-пик вместо оверсэмплинга
    const offline = new OfflineCtx(buffer.numberOfChannels, buffer.length * factor, buffer.sampleRate * factor);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const d = rendered.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  function computeSamplePeakDb(buffer) {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  function computeRmsDb(buffer) {
    let sumSq = 0, count = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) sumSq += d[i] * d[i];
      count += d.length;
    }
    if (!count) return -Infinity;
    const rms = Math.sqrt(sumSq / count);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  function computeStereoCorrelation(buffer) {
    if (buffer.numberOfChannels < 2) return null;
    const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
    const n = Math.min(L.length, R.length);
    let sumLR = 0, sumLL = 0, sumRR = 0;
    for (let i = 0; i < n; i++) { sumLR += L[i] * R[i]; sumLL += L[i] * L[i]; sumRR += R[i] * R[i]; }
    const denom = Math.sqrt(sumLL * sumRR);
    return denom > 0 ? sumLR / denom : 1;
  }

  async function analyze(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const arr = await res.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(arr);
    } finally {
      ctx.close();
    }

    const lufs = computeIntegratedLufs(buffer);
    const truePeak = await computeTruePeakDb(buffer);
    const samplePeak = computeSamplePeakDb(buffer);
    const rms = computeRmsDb(buffer);
    const dynamicRange = isFinite(samplePeak) && isFinite(rms) ? samplePeak - rms : null;
    const correlation = computeStereoCorrelation(buffer);

    return { lufs, truePeak, samplePeak, dynamicRange, correlation, channels: buffer.numberOfChannels };
  }

  function metricHtml(label, value, note, warn) {
    return `<div class="wa-metric${warn ? ' warn' : ''}">
      <div class="wa-label">${label}</div>
      <div class="wa-value">${value}</div>
      ${note ? `<div class="wa-note">${note}</div>` : ''}
    </div>`;
  }

  function renderResults(panel, r) {
    const parts = [];

    if (r.lufs === null) {
      parts.push(metricHtml('LUFS (громкость)', '—', 'трек слишком короткий или тихий для расчёта'));
    } else {
      let note = 'типичный уровень для стриминга (ориентир Spotify/YouTube — −14)';
      if (r.lufs > -9) note = 'заметно громче стрим-таргетов — платформы всё равно занизят громкость при воспроизведении';
      else if (r.lufs < -20) note = 'тихо и динамично — хорошо для формата, где важна живая динамика';
      parts.push(metricHtml('LUFS (громкость)', dbStr(r.lufs), note));
    }

    const tpWarn = isFinite(r.truePeak) && r.truePeak > -1.0;
    parts.push(metricHtml(
      'True Peak',
      isFinite(r.truePeak) ? dbStr(r.truePeak) + ' dBTP' : '—',
      tpWarn ? 'выше −1.0 dBTP — риск призвуков после сжатия в MP3/AAC' : 'запас до цифрового потолка в порядке',
      tpWarn
    ));

    if (r.correlation === null) {
      parts.push(metricHtml('Стерео', 'моно', 'файл одноканальный'));
    } else {
      let note = 'нормальная стерео-картина';
      let warn = false;
      if (r.correlation > 0.7) note = 'почти моно — стерео почти не используется';
      else if (r.correlation < -0.3) { note = 'риск гашения при сведении в моно (телефоны, колонки в кафе и т.п.)'; warn = true; }
      else if (r.correlation < 0.3) note = 'широкая стерео-картина';
      parts.push(metricHtml('Стерео-корреляция', r.correlation.toFixed(2), note, warn));
    }

    if (r.dynamicRange === null) {
      parts.push(metricHtml('Динамический диапазон', '—'));
    } else {
      let note = 'умеренная динамика';
      if (r.dynamicRange > 10) note = 'динамичный микс, без сильной компрессии';
      else if (r.dynamicRange < 6) note = 'сильно сжато — типично для "войны громкости"';
      parts.push(metricHtml('Динамический диапазон', dbStr(r.dynamicRange) + ' dB', note));
    }

    const peakWarn = isFinite(r.samplePeak) && r.samplePeak >= -0.1;
    parts.push(metricHtml(
      'Пик (сэмплы)',
      isFinite(r.samplePeak) ? dbStr(r.samplePeak) + ' dBFS' : '—',
      peakWarn ? 'на грани клиппинга или уже клипует' : null,
      peakWarn
    ));

    panel.innerHTML = `<div class="wa-grid">${parts.join('')}</div>`;
  }

  window.createAudioAnalysisPanel = function (url, mount) {
    mount.classList.add('wave-analysis');
    mount.innerHTML = `
      <button type="button" class="wa-toggle">
        <span>Анализ микса</span>
        ${ICON_CHEVRON}
      </button>
      <div class="wa-panel" hidden></div>`;

    const toggle = mount.querySelector('.wa-toggle');
    const panel = mount.querySelector('.wa-panel');
    let cached = null;
    let loading = false;

    toggle.addEventListener('click', async () => {
      const open = !panel.hidden;
      if (open) { panel.hidden = true; toggle.classList.remove('open'); return; }
      panel.hidden = false;
      toggle.classList.add('open');
      if (cached) { renderResults(panel, cached); return; }
      if (loading) return;
      loading = true;
      panel.innerHTML = `<div class="wa-loading">Считаю LUFS, True Peak, стерео и динамику…</div>`;
      try {
        cached = await analyze(url);
        renderResults(panel, cached);
      } catch (e) {
        panel.innerHTML = `<div class="wa-loading wa-error">${ICON_WARN} Не удалось посчитать — файл недоступен для анализа</div>`;
      } finally {
        loading = false;
      }
    });
  };
})();
