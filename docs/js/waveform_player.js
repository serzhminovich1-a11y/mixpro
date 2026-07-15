/* ══════════════════════════════════════
   ОБЩИЙ ПЛЕЕР С ВОЛНОЙ
   Используется в Ленте, Портфолио и Профиле — везде, где проигрывается
   загруженный аудиофайл. window.createWavePlayer(url, mount) строит
   плеер внутри mount: play/pause, реальная волна файла, перемотка
   кликом/протяжкой по волне, таймкоды, громкость, переход между
   треками (все плееры на одной странице образуют общую очередь —
   играется следующая работа/пост после текущего, автоматически или
   по кнопкам "предыдущий/следующий").
   ══════════════════════════════════════ */
(function () {
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
  const ICON_PREV = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>';
  const ICON_VOL_UP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  const ICON_VOL_OFF = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v1.8l2.46 2.46.04-.26zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>';
  const BAR_COUNT = 56;
  const COLOR_PLAYED = '#4ade80';
  const COLOR_UNPLAYED = 'rgba(255,255,255,.18)';
  const COLOR_PLAYHEAD = '#eef0fb';
  const VOL_KEY = 'mixpro_wp_volume';

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function flatPeaks(n) {
    return Array.from({ length: n }, (_, i) => .16 + .09 * Math.sin(i * 0.7));
  }

  // Определяем формат по сигнатуре первых байт файла, а не по расширению
  // в ссылке — расширение может быть какое угодно (Supabase Storage
  // отдаёт файл по тому имени, что дал пользователь при загрузке),
  // а первые байты честно говорят, что внутри на самом деле.
  function sniffFormat(bytes, url) {
    const str = (start, len) => {
      let s = '';
      for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    };
    if (bytes.length >= 12 && str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') return 'WAV';
    if (bytes.length >= 4 && str(0, 4) === 'fLaC') return 'FLAC';
    if (bytes.length >= 4 && str(0, 4) === 'OggS') return 'OGG';
    if (bytes.length >= 8 && str(4, 4) === 'ftyp') return 'M4A';
    if (bytes.length >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'WEBM';
    if (bytes.length >= 3 && str(0, 3) === 'ID3') return 'MP3';
    if (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return 'MP3';
    const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
    return m ? m[1].toUpperCase() : null;
  }

  async function detectFormat(url) {
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-15' } });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return sniffFormat(new Uint8Array(buf), url);
    } catch (e) {
      return null;
    }
  }

  async function computePeaks(url, bars) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const buf = await res.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const raw = decoded.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(raw.length / bars));
      const peaks = [];
      for (let i = 0; i < bars; i++) {
        const start = i * blockSize;
        const end = Math.min(raw.length, start + blockSize);
        let sum = 0;
        for (let j = start; j < end; j++) sum += Math.abs(raw[j]);
        peaks.push(end > start ? sum / (end - start) : 0);
      }
      const max = Math.max(...peaks, 0.0001);
      return peaks.map(v => Math.max(.04, v / max));
    } finally {
      ctx.close();
    }
  }

  // Общая громкость для ВСЕХ плееров на странице — это один
  // непрерывный сеанс прослушивания (переход между треками), не набор
  // независимых виджетов, поэтому громкость должна быть одна на всех
  // и сохраняться между заходами на сайт.
  let sharedVolume = parseFloat(localStorage.getItem(VOL_KEY));
  if (!isFinite(sharedVolume) || sharedVolume < 0 || sharedVolume > 1) sharedVolume = 1;
  let lastNonZeroVolume = sharedVolume || 1;

  // Один AudioContext на все плееры страницы — соло-каналов (Лево/Право/
  // Моно/Только стерео) не сделать без маршрутизации через Web Audio,
  // а создавать по контексту на каждый трек нет смысла и есть лимиты
  // браузера на их количество.
  let sharedCtx = null;
  function getAudioCtx() {
    if (!sharedCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      sharedCtx = new Ctx();
    }
    return sharedCtx;
  }

  // Разбирает воспроизведение на L/R через ChannelSplitter и собирает
  // обратно через 4 регулируемых gain-узла — так одним набором узлов
  // получаются все режимы: обычное стерео, соло Лево/Право, Моно (L+R,
  // то же самое, что услышит человек с одной колонкой) и "Только
  // стерео" (L−R — всё, что панорамировано в центр, гасится, остаётся
  // только то, чем каналы отличаются друг от друга).
  function setupChannelRouting(audio) {
    const ctx = getAudioCtx();
    const source = ctx.createMediaElementSource(audio);
    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);
    const gLL = ctx.createGain(), gRL = ctx.createGain(), gLR = ctx.createGain(), gRR = ctx.createGain();
    splitter.connect(gLL, 0);
    splitter.connect(gRL, 1);
    splitter.connect(gLR, 0);
    splitter.connect(gRR, 1);
    const merger = ctx.createChannelMerger(2);
    gLL.connect(merger, 0, 0);
    gRL.connect(merger, 0, 0);
    gLR.connect(merger, 0, 1);
    gRR.connect(merger, 0, 1);
    merger.connect(ctx.destination);

    function setMode(mode) {
      const now = ctx.currentTime;
      const RAMP = 0.05; // плавный переход, чтобы не щёлкало при смене режима
      const set = (node, val) => node.gain.linearRampToValueAtTime(val, now + RAMP);
      if (mode === 'L') { set(gLL, 1); set(gRL, 0); set(gLR, 1); set(gRR, 0); }
      else if (mode === 'R') { set(gLL, 0); set(gRL, 1); set(gLR, 0); set(gRR, 1); }
      else if (mode === 'mid') { set(gLL, .5); set(gRL, .5); set(gLR, .5); set(gRR, .5); }
      else if (mode === 'side') { set(gLL, .5); set(gRL, -.5); set(gLR, .5); set(gRR, -.5); }
      else { set(gLL, 1); set(gRL, 0); set(gLR, 0); set(gRR, 1); } // stereo
    }
    return { ctx, setMode };
  }

  // Очередь плееров текущей страницы, в порядке создания (совпадает с
  // порядком карточек — Лента/Портфолио/Профиль рендерят их именно так
  // подряд). createWavePlayer() вызывается ДО того, как вызывающий код
  // вставит саму карточку в document (сначала строят карточку целиком,
  // потом делают grid.appendChild) — поэтому фильтр "жив ли ещё mount"
  // обязан возвращать КОПИЮ, а не переприсваивать queue: если в этот
  // самый момент mount ещё не в document.body, разрушительный filter()
  // вычеркнул бы запись из очереди навсегда, хотя через мгновение
  // карточка нормально появится в DOM.
  let queue = [];
  function liveQueue() {
    return queue.filter(e => document.body.contains(e.mount));
  }
  function playEntry(entry) {
    entry.audio.currentTime = 0;
    entry.startPlayback();
  }
  function playRelative(entry, delta) {
    const q = liveQueue();
    const i = q.indexOf(entry);
    if (i === -1) return;
    const next = q[i + delta];
    if (next) playEntry(next);
  }

  function applyVolumeToAll(v) {
    liveQueue().forEach(e => { e.audio.volume = v; });
  }

  window.createWavePlayer = function (url, mount, opts) {
    opts = opts || {};
    const isLg = opts.size === 'lg';
    const bars = opts.bars || (isLg ? 84 : BAR_COUNT);
    mount.classList.add('wave-player');
    if (isLg) mount.classList.add('lg');
    mount.innerHTML = `
      <div class="wp-wave"><canvas></canvas></div>
      <div class="wp-row">
        <div class="wp-time"><span class="wp-cur">0:00</span><span class="wp-dur">--:--</span><span class="wp-format"></span></div>
        <div class="wp-transport">
          <button type="button" class="wp-prev" aria-label="Предыдущий трек">${ICON_PREV}</button>
          <button type="button" class="wp-play" aria-label="Воспроизвести">${ICON_PLAY}</button>
          <button type="button" class="wp-next" aria-label="Следующий трек">${ICON_NEXT}</button>
        </div>
        <div class="wp-volume">
          <button type="button" class="wp-vol-icon" aria-label="Звук">${ICON_VOL_UP}</button>
          <input type="range" class="wp-vol-slider" min="0" max="1" step="0.01">
        </div>
      </div>
      <div class="wp-channels">
        <button type="button" class="wp-ch-btn active" data-ch="stereo">Стерео</button>
        <button type="button" class="wp-ch-btn" data-ch="L">Лево</button>
        <button type="button" class="wp-ch-btn" data-ch="R">Право</button>
        <button type="button" class="wp-ch-btn" data-ch="mid">Моно</button>
        <button type="button" class="wp-ch-btn" data-ch="side">Только стерео</button>
      </div>`;

    const audio = new Audio();
    audio.preload = 'metadata';
    // Пробуем сразу с crossOrigin — он нужен заранее для соло-каналов
    // (задним числом, без перезагрузки файла, его не включить). Но если
    // у хранилища файла нет нужных CORS-заголовков, ЗАПРОС С crossOrigin
    // не грузится ВООБЩЕ (не только соло-каналы — сама загрузка трека
    // падает с ошибкой) — поэтому при первой же ошибке загрузки тихо
    // откатываемся на обычный запрос без crossOrigin (грузится и играет
    // нормально) и просто выключаем кнопки каналов для этого трека:
    // лучше рабочий плеер без одной фичи, чем полностью немой трек.
    let corsOk = null; // null = ещё не знаем, true/false = выяснили
    let corsRetryInFlight = false;
    audio.crossOrigin = 'anonymous';
    // Должен сработать ДО обработчика ниже (mount.classList.add('wp-error');
    // playBtn.disabled = true) — он всё ещё думает, что любая ошибка
    // загрузки означает "битый файл", хотя она может значить лишь то,
    // что нужно перегрузить без crossOrigin. corsRetryInFlight — сигнал
    // тому обработчику "эту конкретную ошибку я уже обрабатываю, не
    // считай её настоящим сбоем".
    audio.addEventListener('error', () => {
      if (corsOk === null) {
        corsOk = false;
        corsRetryInFlight = true;
        audio.crossOrigin = null;
        audio.src = url;
        audio.load();
        mount.querySelectorAll('.wp-ch-btn').forEach(b => { if (b.dataset.ch !== 'stereo') b.disabled = true; });
      }
    });
    audio.addEventListener('loadedmetadata', () => { if (corsOk === null) corsOk = true; });
    audio.src = url;
    audio.volume = sharedVolume;
    let channelRouting = null;
    function ensureChannelRouting() {
      if (corsOk === false) return null;
      if (!channelRouting) {
        try { channelRouting = setupChannelRouting(audio); } catch (e) { channelRouting = false; }
      }
      return channelRouting || null;
    }

    const playBtn = mount.querySelector('.wp-play');
    const prevBtn = mount.querySelector('.wp-prev');
    const nextBtn = mount.querySelector('.wp-next');
    const volIcon = mount.querySelector('.wp-vol-icon');
    const volSlider = mount.querySelector('.wp-vol-slider');
    const chButtons = mount.querySelectorAll('.wp-ch-btn');
    const waveEl = mount.querySelector('.wp-wave');
    const canvas = waveEl.querySelector('canvas');
    const curEl = mount.querySelector('.wp-cur');
    const durEl = mount.querySelector('.wp-dur');
    const ctx2d = canvas.getContext('2d');

    let peaks = null;
    let dragging = false;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = waveEl.clientWidth, h = waveEl.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);
      const data = peaks || flatPeaks(bars);
      const progress = audio.duration ? audio.currentTime / audio.duration : 0;
      const barW = w / data.length;
      for (let i = 0; i < data.length; i++) {
        const barH = Math.max(2, data[i] * h);
        const x = i * barW;
        ctx2d.fillStyle = (i / data.length) <= progress ? COLOR_PLAYED : COLOR_UNPLAYED;
        ctx2d.fillRect(x, (h - barH) / 2, Math.max(1, barW - 2), barH);
      }
      // Явный маркер позиции — чтобы было однозначно видно, что по волне
      // можно тащить и перематывать, а не просто смотреть на цвет столбиков.
      if (audio.duration) {
        const px = progress * w;
        ctx2d.fillStyle = COLOR_PLAYHEAD;
        ctx2d.fillRect(Math.max(0, px - 1), 0, 2, h);
        ctx2d.beginPath();
        ctx2d.arc(px, h / 2, isLg ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    function seekFromEvent(e) {
      if (!audio.duration) return;
      const rect = waveEl.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = frac * audio.duration;
      draw();
    }

    waveEl.addEventListener('pointerdown', (e) => { dragging = true; waveEl.classList.add('dragging'); seekFromEvent(e); });
    window.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
    window.addEventListener('pointerup', () => { dragging = false; waveEl.classList.remove('dragging'); });

    function startPlayback() {
      // Останавливаем как другие плееры с волной (через событие), так и
      // обычные <audio>/<video> на странице (голосовые комментарии,
      // видео-вложения) — они не в DOM-дереве этого плеера и событие их не достанет.
      document.dispatchEvent(new CustomEvent('mixpro:pauseOtherPlayers', { detail: audio }));
      document.querySelectorAll('audio, video').forEach(el => el.pause());
      // Браузеры не дают Web Audio Context работать до жеста пользователя —
      // клик по play как раз им и является, resume() тут безопасен, даже
      // если соло-каналы ни разу не трогали (channelRouting тогда пуст).
      if (channelRouting) channelRouting.ctx.resume();
      audio.play().catch(() => {});
    }

    function updateNavState() {
      const q = liveQueue();
      const i = q.indexOf(entry);
      prevBtn.disabled = i <= 0;
      nextBtn.disabled = i === -1 || i >= q.length - 1;
    }

    playBtn.addEventListener('click', () => {
      if (audio.paused) startPlayback(); else audio.pause();
    });
    prevBtn.addEventListener('click', () => playRelative(entry, -1));
    nextBtn.addEventListener('click', () => playRelative(entry, 1));
    document.addEventListener('mixpro:pauseOtherPlayers', (e) => { if (e.detail !== audio) audio.pause(); });

    chButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.ch;
        const routing = ensureChannelRouting();
        if (!routing) return; // нет CORS у файла — соло-каналов не будет, обычное воспроизведение не трогаем
        if (channelRouting.ctx.state === 'suspended') channelRouting.ctx.resume();
        routing.setMode(mode);
        chButtons.forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Следующий трек в очереди — после того, как текущий доиграл до
    // конца сам (не по клику "Следующий"), а не только по кнопке.
    audio.addEventListener('ended', () => { playBtn.innerHTML = ICON_PLAY; draw(); playRelative(entry, 1); });

    audio.addEventListener('play', () => { playBtn.innerHTML = ICON_PAUSE; updateNavState(); });
    audio.addEventListener('pause', () => { playBtn.innerHTML = ICON_PLAY; });
    audio.addEventListener('timeupdate', () => { curEl.textContent = fmtTime(audio.currentTime); draw(); });
    audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmtTime(audio.duration); draw(); });
    audio.addEventListener('error', () => {
      if (corsRetryInFlight) { corsRetryInFlight = false; return; } // ожидаемая ошибка из-за CORS, откат уже запущен выше
      mount.classList.add('wp-error');
      playBtn.disabled = true;
      durEl.textContent = 'ошибка загрузки';
    });

    // Громкость — общая на все плееры страницы (см. sharedVolume выше).
    volSlider.value = sharedVolume;
    function renderVolIcon() {
      volIcon.innerHTML = sharedVolume === 0 ? ICON_VOL_OFF : ICON_VOL_UP;
    }
    renderVolIcon();
    volSlider.addEventListener('input', () => {
      sharedVolume = parseFloat(volSlider.value);
      if (sharedVolume > 0) lastNonZeroVolume = sharedVolume;
      localStorage.setItem(VOL_KEY, String(sharedVolume));
      applyVolumeToAll(sharedVolume);
      liveQueue().forEach(e => { if (e.volSlider !== volSlider) e.volSlider.value = sharedVolume; e.renderVolIcon(); });
    });
    volIcon.addEventListener('click', () => {
      sharedVolume = sharedVolume === 0 ? lastNonZeroVolume : 0;
      localStorage.setItem(VOL_KEY, String(sharedVolume));
      applyVolumeToAll(sharedVolume);
      liveQueue().forEach(e => { e.volSlider.value = sharedVolume; e.renderVolIcon(); });
    });

    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(waveEl);

    computePeaks(url, bars).then(p => { peaks = p; draw(); }).catch(() => { /* волна остаётся плоской, но плеер полностью рабочий */ });
    const formatEl = mount.querySelector('.wp-format');
    detectFormat(url).then(fmt => { if (fmt) formatEl.textContent = fmt; }).catch(() => {});

    const entry = { audio, mount, startPlayback, volSlider, renderVolIcon };
    queue.push(entry);
    updateNavState();

    return {
      audio,
      destroy() {
        audio.pause();
        audio.src = '';
        queue = queue.filter(e => e !== entry);
      }
    };
  };
})();
