/* ══════════════════════════════════════
   АНАЛИЗ МИКСА — живые метры LUFS/пик/стерео, синхронные с воспроизведением
   плюс итоговые цифры на весь трек (True Peak, динамический диапазон).
   window.createAudioAnalysisPanel(url, mount, audioEl) строит сворачиваемую
   панель: по клику скачивает и декодирует тот же файл и считает метрики
   прямо в браузере (Web Audio API) — ничего не отправляется на сервер и
   не сохраняется, каждое открытие панели считает заново. audioEl — тот
   же <audio>, которым управляет плеер с волной (createWavePlayer),
   нужен, чтобы метры двигались синхронно с реальным play/pause/перемоткой,
   а не жили своей отдельной жизнью.

   Методика:
   - Громкость по времени — ITU-R BS.1770-4: K-weighting фильтр
     (шелвинг + хай-пасс, коэффициенты пересчитываются под sample rate
     файла) + блоки 400мс с шагом 100мс. Из ЭТОЙ ЖЕ последовательности
     блоков считаются сразу три вещи: Momentary-ряд ("Быстро" — сырое
     значение блока), Short-term-ряд ("Медленно" — скользящее среднее
     за 3 секунды) и итоговая Integrated-громкость (стандартный
     абсолютный+относительный гейтинг по всему треку).
   - True Peak — сигнал передискретизируется в 4 раза через
     OfflineAudioContext (используя встроенный ресемплер браузера) —
     приближение, не точная реализация полифазного фильтра из
     Приложения 2 стандарта, но честнее простого пика по сэмплам.
   - Пиковый метр в реальном времени — максимум по сэмплам внутри
     каждого 100мс окна (плюс "хвост" пик-холда, который медленно
     оседает — как на обычных студийных метрах).
   - Стерео-корреляция — коэффициент корреляции L/R, тоже посчитан
     по тем же 100мс окнам для живой стрелки, и отдельно по всему
     треку для итоговой цифры.
   ══════════════════════════════════════ */
(function () {
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>';

  const HOP_SEC = 0.1;
  const MOM_WINDOW_SEC = 0.4;
  const ST_WINDOW_SEC = 3.0;
  const LUFS_MIN = -40, LUFS_MAX = 0;
  const PEAK_MIN = -40, PEAK_MAX = 0;
  const PEAK_HOLD_DECAY_PER_SEC = 12; // дБ/сек — скорость оседания пик-холда

  function dbStr(db) {
    if (!isFinite(db)) return '—';
    return (db > 0 ? '+' : '') + db.toFixed(1);
  }
  function clampPct(val, min, max) {
    if (!isFinite(val)) return 0;
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  }

  // ── K-weighting (ITU-R BS.1770-4), коэффициенты пересчитаны под rate ──
  function makeKWeightingStages(rate) {
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
  function kWeight(data, stages) { return applyBiquad(applyBiquad(data, stages[0]), stages[1]); }

  function toLufsSeries(powerArr) {
    const out = new Float32Array(powerArr.length);
    for (let i = 0; i < powerArr.length; i++) out[i] = powerArr[i] > 0 ? -0.691 + 10 * Math.log10(powerArr[i]) : -Infinity;
    return out;
  }

  // Считает блоки громкости один раз и строит из них: Momentary-ряд
  // ("Быстро"), Short-term-ряд ("Медленно", скользящее среднее за 3с)
  // и Integrated (гейтинг на весь трек) — вместо трёх отдельных проходов.
  function computeLoudnessSeries(buffer) {
    const rate = buffer.sampleRate;
    const stages = makeKWeightingStages(rate);
    const nCh = buffer.numberOfChannels;
    const filtered = [];
    for (let ch = 0; ch < nCh; ch++) filtered.push(kWeight(buffer.getChannelData(ch), stages));

    const hopSize = Math.round(HOP_SEC * rate);
    const momWindowSize = Math.round(MOM_WINDOW_SEC * rate);
    const totalLen = filtered[0].length;
    const nHops = Math.max(0, Math.floor((totalLen - momWindowSize) / hopSize) + 1);

    const momentaryPower = new Float32Array(nHops);
    for (let h = 0; h < nHops; h++) {
      const start = h * hopSize;
      let sum = 0;
      for (let ch = 0; ch < nCh; ch++) {
        const d = filtered[ch];
        let s = 0;
        const end = start + momWindowSize;
        for (let i = start; i < end; i++) s += d[i] * d[i];
        sum += s / momWindowSize;
      }
      momentaryPower[h] = sum;
    }

    const stBlocks = Math.max(1, Math.round(ST_WINDOW_SEC / HOP_SEC));
    const shortTermPower = new Float32Array(nHops);
    let windowSum = 0;
    for (let h = 0; h < nHops; h++) {
      windowSum += momentaryPower[h];
      if (h >= stBlocks) windowSum -= momentaryPower[h - stBlocks];
      shortTermPower[h] = windowSum / Math.min(h + 1, stBlocks);
    }

    let integrated = null;
    const ABS_GATE = Math.pow(10, (-70 + 0.691) / 10);
    const absGated = [];
    for (let h = 0; h < nHops; h++) if (momentaryPower[h] >= ABS_GATE) absGated.push(momentaryPower[h]);
    if (absGated.length) {
      const absMean = absGated.reduce((a, b) => a + b, 0) / absGated.length;
      const relThreshold = absMean * Math.pow(10, -10 / 10);
      const relGated = absGated.filter(p => p >= relThreshold);
      if (relGated.length) {
        const relMean = relGated.reduce((a, b) => a + b, 0) / relGated.length;
        integrated = -0.691 + 10 * Math.log10(relMean);
      }
    }

    return {
      hopSeconds: HOP_SEC,
      momentaryLufs: toLufsSeries(momentaryPower),
      shortTermLufs: toLufsSeries(shortTermPower),
      integrated,
    };
  }

  // Пик и корреляция по тем же 100мс окнам — для живых метров.
  function computePeakAndCorrSeries(buffer, hopSeconds) {
    const rate = buffer.sampleRate;
    const nCh = buffer.numberOfChannels;
    const chans = [];
    for (let ch = 0; ch < nCh; ch++) chans.push(buffer.getChannelData(ch));
    const totalLen = chans[0].length;
    const hopSize = Math.round(hopSeconds * rate);
    const nHops = Math.max(0, Math.ceil(totalLen / hopSize));

    const peakDb = new Float32Array(nHops);
    const corr = new Float32Array(nHops);
    for (let h = 0; h < nHops; h++) {
      const start = h * hopSize;
      const end = Math.min(start + hopSize, totalLen);
      let peak = 0;
      for (let ch = 0; ch < nCh; ch++) {
        const d = chans[ch];
        for (let i = start; i < end; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      }
      peakDb[h] = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

      if (nCh >= 2) {
        const L = chans[0], R = chans[1];
        let sumLR = 0, sumLL = 0, sumRR = 0;
        for (let i = start; i < end; i++) { sumLR += L[i] * R[i]; sumLL += L[i] * L[i]; sumRR += R[i] * R[i]; }
        const denom = Math.sqrt(sumLL * sumRR);
        corr[h] = denom > 0 ? sumLR / denom : 0;
      } else {
        corr[h] = NaN;
      }
    }
    return { peakDb, corr };
  }

  async function computeTruePeakDb(buffer) {
    const factor = 4;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return computeSamplePeakDb(buffer);
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
    try { buffer = await ctx.decodeAudioData(arr); } finally { ctx.close(); }

    const loudness = computeLoudnessSeries(buffer);
    const { peakDb, corr } = computePeakAndCorrSeries(buffer, loudness.hopSeconds);
    const truePeak = await computeTruePeakDb(buffer);
    const samplePeak = computeSamplePeakDb(buffer);
    const rms = computeRmsDb(buffer);
    const dynamicRange = isFinite(samplePeak) && isFinite(rms) ? samplePeak - rms : null;
    const correlation = computeStereoCorrelation(buffer);

    return {
      duration: buffer.duration,
      hopSeconds: loudness.hopSeconds,
      momentaryLufs: loudness.momentaryLufs,
      shortTermLufs: loudness.shortTermLufs,
      peakSeries: peakDb,
      corrSeries: corr,
      lufsIntegrated: loudness.integrated,
      truePeak, samplePeak, dynamicRange, correlation,
      channels: buffer.numberOfChannels,
    };
  }

  function panelSkeleton() {
    return `
      <div class="wa-live">
        <div class="wa-live-row">
          <span class="wa-live-label">Громкость (LUFS)</span>
          <div class="wa-mode-toggle">
            <button type="button" class="wa-mode-btn active" data-mode="fast">Быстро</button>
            <button type="button" class="wa-mode-btn" data-mode="slow">Медленно</button>
          </div>
          <span class="wa-live-value wa-v-lufs">−∞</span>
        </div>
        <div class="wa-meter wa-meter-lufs">
          <div class="wa-meter-fill wa-fill-lufs"></div>
          <div class="wa-meter-target wa-target-lufs" title="Целевой ориентир стриминга −14 LUFS"></div>
        </div>

        <div class="wa-live-row">
          <span class="wa-live-label">Пик</span>
          <span class="wa-live-value wa-v-peak">−∞</span>
        </div>
        <div class="wa-meter wa-meter-peak">
          <div class="wa-meter-fill wa-fill-peak"></div>
          <div class="wa-meter-hold wa-hold-peak"></div>
        </div>

        <div class="wa-live-row">
          <span class="wa-live-label">Стерео-корреляция</span>
          <span class="wa-live-value wa-v-corr">—</span>
        </div>
        <div class="wa-meter wa-meter-corr">
          <div class="wa-meter-center"></div>
          <div class="wa-meter-needle wa-needle-corr"></div>
        </div>
        <div class="wa-hint">Нажми play — метры оживут вместе с треком</div>
      </div>
      <div class="wa-grid"></div>`;
  }

  function summaryHtml(r) {
    const parts = [];
    if (r.lufsIntegrated === null) {
      parts.push(`<div class="wa-metric"><div class="wa-label">LUFS (весь трек)</div><div class="wa-value">—</div></div>`);
    } else {
      let note = 'типичный уровень для стриминга (ориентир −14)';
      if (r.lufsIntegrated > -9) note = 'громче стрим-таргетов — платформы всё равно занизят громкость';
      else if (r.lufsIntegrated < -20) note = 'тихо и динамично';
      parts.push(`<div class="wa-metric"><div class="wa-label">LUFS (весь трек)</div><div class="wa-value">${dbStr(r.lufsIntegrated)}</div><div class="wa-note">${note}</div></div>`);
    }
    const tpWarn = isFinite(r.truePeak) && r.truePeak > -1.0;
    parts.push(`<div class="wa-metric${tpWarn ? ' warn' : ''}"><div class="wa-label">True Peak</div><div class="wa-value">${isFinite(r.truePeak) ? dbStr(r.truePeak) + ' dBTP' : '—'}</div><div class="wa-note">${tpWarn ? 'риск призвуков после сжатия в MP3/AAC' : 'запас до потолка в порядке'}</div></div>`);
    if (r.dynamicRange !== null) {
      let note = 'умеренная динамика';
      if (r.dynamicRange > 10) note = 'динамичный микс';
      else if (r.dynamicRange < 6) note = 'сильно сжато — "война громкости"';
      parts.push(`<div class="wa-metric"><div class="wa-label">Динамический диапазон</div><div class="wa-value">${dbStr(r.dynamicRange)} dB</div><div class="wa-note">${note}</div></div>`);
    }
    if (r.correlation === null) {
      parts.push(`<div class="wa-metric"><div class="wa-label">Стерео</div><div class="wa-value">моно</div></div>`);
    }
    return parts.join('');
  }

  window.createAudioAnalysisPanel = function (url, mount, audioEl) {
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
    let mode = 'fast';
    let peakHold = PEAK_MIN;
    let rafId = null;
    let lastFrameT = 0;
    let everPlayed = false;

    function els() {
      return {
        vLufs: panel.querySelector('.wa-v-lufs'),
        fillLufs: panel.querySelector('.wa-fill-lufs'),
        targetLufs: panel.querySelector('.wa-target-lufs'),
        vPeak: panel.querySelector('.wa-v-peak'),
        fillPeak: panel.querySelector('.wa-fill-peak'),
        holdPeak: panel.querySelector('.wa-hold-peak'),
        vCorr: panel.querySelector('.wa-v-corr'),
        needleCorr: panel.querySelector('.wa-needle-corr'),
        hint: panel.querySelector('.wa-hint'),
        grid: panel.querySelector('.wa-grid'),
        fastBtn: panel.querySelector('[data-mode="fast"]'),
        slowBtn: panel.querySelector('[data-mode="slow"]'),
      };
    }

    function startLoop() {
      if (rafId || !cached) return;
      lastFrameT = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (panel.hidden || !cached || !audioEl) return;
      const dt = lastFrameT ? (now - lastFrameT) / 1000 : 0;
      lastFrameT = now;
      const e = els();
      const idx = Math.max(0, Math.min(cached.momentaryLufs.length - 1, Math.floor(audioEl.currentTime / cached.hopSeconds)));

      const series = mode === 'fast' ? cached.momentaryLufs : cached.shortTermLufs;
      const lufsVal = series[idx];
      e.fillLufs.style.width = (100 - clampPct(lufsVal, LUFS_MIN, LUFS_MAX)) + '%';
      e.vLufs.textContent = isFinite(lufsVal) ? lufsVal.toFixed(1) : '−∞';

      const peakVal = cached.peakSeries[idx];
      e.fillPeak.style.width = (100 - clampPct(peakVal, PEAK_MIN, PEAK_MAX)) + '%';
      e.vPeak.textContent = isFinite(peakVal) ? peakVal.toFixed(1) : '−∞';
      peakHold = Math.max(isFinite(peakVal) ? peakVal : PEAK_MIN, peakHold - PEAK_HOLD_DECAY_PER_SEC * dt);
      e.holdPeak.style.left = clampPct(peakHold, PEAK_MIN, PEAK_MAX) + '%';

      const corrVal = cached.corrSeries[idx];
      if (!isNaN(corrVal)) {
        e.needleCorr.style.left = ((corrVal + 1) / 2 * 100) + '%';
        e.vCorr.textContent = corrVal.toFixed(2);
      }

      if (!audioEl.paused && !everPlayed) {
        everPlayed = true;
        if (e.hint) e.hint.style.display = 'none';
      }
    }

    function wireLiveControls() {
      const e = els();
      if (cached.lufsIntegrated !== null) {
        e.targetLufs.style.left = clampPct(-14, LUFS_MIN, LUFS_MAX) + '%';
      } else {
        e.targetLufs.style.display = 'none';
      }
      e.fastBtn.addEventListener('click', () => { mode = 'fast'; e.fastBtn.classList.add('active'); e.slowBtn.classList.remove('active'); });
      e.slowBtn.addEventListener('click', () => { mode = 'slow'; e.slowBtn.classList.add('active'); e.fastBtn.classList.remove('active'); });
      e.grid.innerHTML = summaryHtml(cached);
    }

    toggle.addEventListener('click', async () => {
      const open = !panel.hidden;
      if (open) { panel.hidden = true; toggle.classList.remove('open'); stopLoop(); return; }
      panel.hidden = false;
      toggle.classList.add('open');
      if (cached) { startLoop(); return; }
      if (loading) return;
      loading = true;
      panel.innerHTML = `<div class="wa-loading">Считаю LUFS, True Peak, стерео и динамику…</div>`;
      try {
        cached = await analyze(url);
        panel.innerHTML = panelSkeleton();
        wireLiveControls();
        startLoop();
      } catch (e) {
        panel.innerHTML = `<div class="wa-loading wa-error">${ICON_WARN} Не удалось посчитать — файл недоступен для анализа</div>`;
      } finally {
        loading = false;
      }
    });
  };
})();
