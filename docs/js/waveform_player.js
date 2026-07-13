/* ══════════════════════════════════════
   ОБЩИЙ ПЛЕЕР С ВОЛНОЙ
   Используется в Ленте, Портфолио и Профиле — везде, где проигрывается
   загруженный аудиофайл. window.createWavePlayer(url, mount) строит
   плеер внутри mount: play/pause, реальная волна файла, перемотка
   кликом/протяжкой по волне, таймкоды.
   ══════════════════════════════════════ */
(function () {
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
  const BAR_COUNT = 56;
  const COLOR_PLAYED = '#4ade80';
  const COLOR_UNPLAYED = 'rgba(255,255,255,.18)';

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function flatPeaks(n) {
    return Array.from({ length: n }, (_, i) => .16 + .09 * Math.sin(i * 0.7));
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

  window.createWavePlayer = function (url, mount, opts) {
    opts = opts || {};
    const bars = opts.bars || BAR_COUNT;
    mount.classList.add('wave-player');
    mount.innerHTML = `
      <button type="button" class="wp-play" aria-label="Воспроизвести">${ICON_PLAY}</button>
      <div class="wp-body">
        <div class="wp-wave"><canvas></canvas></div>
        <div class="wp-time"><span class="wp-cur">0:00</span><span class="wp-dur">--:--</span></div>
      </div>`;

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = url;

    const playBtn = mount.querySelector('.wp-play');
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
    }

    function seekFromEvent(e) {
      if (!audio.duration) return;
      const rect = waveEl.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = frac * audio.duration;
      draw();
    }

    waveEl.addEventListener('pointerdown', (e) => { dragging = true; seekFromEvent(e); });
    window.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
    window.addEventListener('pointerup', () => { dragging = false; });

    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        // Останавливаем как другие плееры с волной (через событие), так и
        // обычные <audio>/<video> на странице (голосовые комментарии,
        // видео-вложения) — они не в DOM-дереве этого плеера и событие их не достанет.
        document.dispatchEvent(new CustomEvent('mixpro:pauseOtherPlayers', { detail: audio }));
        document.querySelectorAll('audio, video').forEach(el => el.pause());
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });
    document.addEventListener('mixpro:pauseOtherPlayers', (e) => { if (e.detail !== audio) audio.pause(); });

    audio.addEventListener('play', () => { playBtn.innerHTML = ICON_PAUSE; });
    audio.addEventListener('pause', () => { playBtn.innerHTML = ICON_PLAY; });
    audio.addEventListener('ended', () => { playBtn.innerHTML = ICON_PLAY; draw(); });
    audio.addEventListener('timeupdate', () => { curEl.textContent = fmtTime(audio.currentTime); draw(); });
    audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmtTime(audio.duration); draw(); });
    audio.addEventListener('error', () => {
      mount.classList.add('wp-error');
      playBtn.disabled = true;
      durEl.textContent = 'ошибка загрузки';
    });

    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(waveEl);

    computePeaks(url, bars).then(p => { peaks = p; draw(); }).catch(() => { /* волна остаётся плоской, но плеер полностью рабочий */ });

    return {
      audio,
      destroy() { audio.pause(); audio.src = ''; }
    };
  };
})();
