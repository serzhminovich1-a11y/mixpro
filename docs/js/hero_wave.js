// Волна в герое Главной. Раньше был самозапускающийся IIFE — с этим
// requestAnimationFrame крутился бы вечно даже после ухода с Главной
// по SPA-переходу (canvas исчезает из DOM, а цикл отрисовки — нет,
// пока страницу не перезагрузят). Теперь mount()/unmount() — экран
// уходит, цикл и слушатели уходят вместе с ним.
let rafId = null;
let stopped = true;
let removeListeners = null;

export function mount(){
  const wrap = document.getElementById('heroWaves');
  const canvas = document.getElementById('heroCanvas');
  if (!wrap || !canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize(){
    const rect = wrap.getBoundingClientRect();
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const layers = [
    { base: 0.62, amp: 20, freq: 1.4, speed: 0.55, phase: 0.0,  width: 2.4, fillAlpha: .16, glow: 16 },
    { base: 0.72, amp: 26, freq: 1.0, speed: 0.38, phase: 1.7,  width: 2,   fillAlpha: .12, glow: 10 },
    { base: 0.84, amp: 15, freq: 1.9, speed: 0.7,  phase: 3.4,  width: 1.6, fillAlpha: .10, glow: 6  },
  ];

  const COLORS = ['#4ade80', '#a78bfa', '#facc15', '#4ade80'];

  function makeGradient(alphaMul){
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0,    hexA(COLORS[0], alphaMul));
    g.addColorStop(0.38, hexA(COLORS[1], alphaMul));
    g.addColorStop(0.7,  hexA(COLORS[2], alphaMul));
    g.addColorStop(1,    hexA(COLORS[3], alphaMul));
    return g;
  }
  function hexA(hex, a){
    const n = parseInt(hex.slice(1), 16);
    const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
    return `rgba(${r},${g},${b},${a})`;
  }

  let mouseX = null, mouseActive = 0;
  const onMouseMove = e => {
    const rect = wrap.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
  };
  const onMouseEnter = () => { mouseActive = 1; };
  const onMouseLeave = () => { mouseActive = 0; mouseX = null; };
  wrap.addEventListener('mousemove', onMouseMove);
  wrap.addEventListener('mouseenter', onMouseEnter);
  wrap.addEventListener('mouseleave', onMouseLeave);

  const pulses = [];
  function spawnPulse(x, y){
    pulses.push({ x, y, t0: performance.now() });
    if (pulses.length > 6) pulses.shift();
  }
  const onClick = e => {
    const rect = wrap.getBoundingClientRect();
    spawnPulse(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onTouchStart = e => {
    const rect = wrap.getBoundingClientRect();
    const t = e.touches[0];
    if (t) spawnPulse(t.clientX - rect.left, t.clientY - rect.top);
  };
  wrap.addEventListener('click', onClick);
  wrap.addEventListener('touchstart', onTouchStart, { passive: true });

  const PULSE_LIFE = 1400;
  const PULSE_SPEED = 0.55;

  function waveY(layer, x, t){
    const px = x / Math.max(w, 1);
    let y = layer.base * h + layer.amp * Math.sin(px * layer.freq * Math.PI * 2 + t * layer.speed + layer.phase);

    if (mouseX != null && mouseActive) {
      const dist = x - mouseX;
      const bumpRadius = 90;
      const influence = Math.exp(-(dist * dist) / (2 * bumpRadius * bumpRadius));
      y -= 34 * influence;
    }

    const now = performance.now();
    for (const p of pulses) {
      const age = now - p.t0;
      if (age > PULSE_LIFE) continue;
      const ringR = age * PULSE_SPEED;
      const dist = Math.abs(x - p.x);
      const ringWidth = 60;
      const edge = Math.abs(dist - ringR);
      if (edge < ringWidth) {
        const decay = Math.max(0, 1 - age / PULSE_LIFE);
        const strength = (1 - edge / ringWidth) * decay;
        y -= 26 * strength;
      }
    }
    return y;
  }

  function drawLayer(layer, t){
    const step = 6;
    const pts = [];
    for (let x = 0; x <= w; x += step) pts.push([x, waveY(layer, x, t)]);
    pts.push([w, waveY(layer, w, t)]);

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = makeGradient(layer.fillAlpha);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.strokeStyle = makeGradient(0.85);
    ctx.lineWidth = layer.width;
    ctx.shadowColor = 'rgba(74,222,128,.55)';
    ctx.shadowBlur = layer.glow;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawPulseRings(){
    const now = performance.now();
    for (const p of pulses) {
      const age = now - p.t0;
      if (age > PULSE_LIFE) continue;
      const r = age * PULSE_SPEED;
      const alpha = Math.max(0, 1 - age / PULSE_LIFE) * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(74,222,128,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    while (pulses.length && now - pulses[0].t0 > PULSE_LIFE) pulses.shift();
  }

  function frame(now){
    if (stopped) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const layer of layers) drawLayer(layer, t);
    drawPulseRings();
    if (!reduceMotion) rafId = requestAnimationFrame(frame);
  }

  stopped = false;
  if (reduceMotion) {
    frame(0);
  } else {
    rafId = requestAnimationFrame(frame);
  }

  removeListeners = () => {
    window.removeEventListener('resize', resize);
    wrap.removeEventListener('mousemove', onMouseMove);
    wrap.removeEventListener('mouseenter', onMouseEnter);
    wrap.removeEventListener('mouseleave', onMouseLeave);
    wrap.removeEventListener('click', onClick);
    wrap.removeEventListener('touchstart', onTouchStart);
  };
}

export function unmount(){
  stopped = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (removeListeners) removeListeners();
  removeListeners = null;
}
