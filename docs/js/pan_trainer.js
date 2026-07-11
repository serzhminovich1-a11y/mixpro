// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const POSITIONS = {
  easy: [
    {val:-1,    icon:'◄◄', label:'L',   sub:'100%'},
    {val:-.5,   icon:'◄',  label:'L',   sub:'50%'},
    {val:0,     icon:'●',  label:'C',   sub:'центр'},
    {val:.5,    icon:'►',  label:'R',   sub:'50%'},
    {val:1,     icon:'►►', label:'R',   sub:'100%'},
  ],
  medium: [
    {val:-1,    icon:'◄◄', label:'L',   sub:'100%'},
    {val:-.75,  icon:'◄◄', label:'L',   sub:'75%'},
    {val:-.5,   icon:'◄',  label:'L',   sub:'50%'},
    {val:-.25,  icon:'◄',  label:'L',   sub:'25%'},
    {val:0,     icon:'●',  label:'C',   sub:'центр'},
    {val:.25,   icon:'►',  label:'R',   sub:'25%'},
    {val:.5,    icon:'►',  label:'R',   sub:'50%'},
    {val:.75,   icon:'►►', label:'R',   sub:'75%'},
    {val:1,     icon:'►►', label:'R',   sub:'100%'},
  ],
  hard: [
    {val:-1,    icon:'◄◄', label:'L',   sub:'100%'},
    {val:-.83,  icon:'◄◄', label:'L',   sub:'83%'},
    {val:-.67,  icon:'◄◄', label:'L',   sub:'67%'},
    {val:-.5,   icon:'◄',  label:'L',   sub:'50%'},
    {val:-.33,  icon:'◄',  label:'L',   sub:'33%'},
    {val:-.17,  icon:'◄',  label:'L',   sub:'17%'},
    {val:0,     icon:'●',  label:'C',   sub:'центр'},
    {val:.17,   icon:'►',  label:'R',   sub:'17%'},
    {val:.33,   icon:'►',  label:'R',   sub:'33%'},
    {val:.5,    icon:'►',  label:'R',   sub:'50%'},
    {val:.67,   icon:'►►', label:'R',   sub:'67%'},
    {val:.83,   icon:'►►', label:'R',   sub:'83%'},
    {val:1,     icon:'►►', label:'R',   sub:'100%'},
  ],
};

const BASE={easy:60,medium:100,hard:160};
const LEVELS=[{n:'Lv.1',m:0},{n:'Lv.2',m:200},{n:'Lv.3',m:500},{n:'Lv.4',m:1000},{n:'Lv.5',m:1800},{n:'Lv.6',m:3000},{n:'MASTER',m:5000}];

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let diff='medium', round=1;
let target=null, picked=null, answered=false, qStart=0;
let score=parseInt(localStorage.getItem('pt_s')||'0');
let streak=0, playing=false;
let actx=null, srcNode=null, panNode=null, gainNode=null, anlNode=null, noiseBuf=null;
let vol=.2, muted=false;
let vuRaf=null;
let totalRight=0, totalAns=0;

// ══════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════
const SB=supabase.createClient('https://mwzskffecoedpvyflswg.supabase.co','sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD');
let sbUser=null,sbProfile=null;
let bestDbScore=0;
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(session){
    sbUser=session.user;
    const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
    sbProfile=p;
    if(p){
      const nb=document.getElementById('navProfile');
      if(nb) nb.textContent='👤 '+p.username;
    }
    const{data:best}=await SB.from('scores').select('score').eq('user_id',sbUser.id).eq('game','pan_trainer').order('score',{ascending:false}).limit(1).maybeSingle();
    if(best) bestDbScore=best.score;
  }
}
async function saveScore(){
  if(!sbUser||!sbProfile||score<=bestDbScore) return;
  const{error}=await SB.from('scores').insert({user_id:sbUser.id,username:sbProfile.username,game:'pan_trainer',score,accuracy:totalAns>0?Math.round(totalRight/totalAns*100):0,streak,difficulty:diff,rounds:totalAns});
  if(!error) bestDbScore=score;
}

// ══════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════
function makePink(ctx,dur){
  const sr=ctx.sampleRate,n=Math.ceil(sr*dur),buf=ctx.createBuffer(2,n,sr);
  for(let ch=0;ch<2;ch++){
    const d=buf.getChannelData(ch);let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;}
  }
  return buf;
}

async function startAudio(){
  stopAudio();
  if(!actx||actx.state==='closed') actx=new(window.AudioContext||window.webkitAudioContext)();
  if(actx.state==='suspended') await actx.resume();
  if(!noiseBuf||noiseBuf.sampleRate!==actx.sampleRate) noiseBuf=makePink(actx,20);

  srcNode=actx.createBufferSource();
  srcNode.buffer=noiseBuf;srcNode.loop=true;

  panNode=actx.createStereoPanner();
  panNode.pan.value=target.val;

  anlNode=actx.createAnalyser();
  anlNode.fftSize=256;

  gainNode=actx.createGain();
  gainNode.gain.value=0;

  srcNode.connect(panNode);panNode.connect(anlNode);anlNode.connect(gainNode);gainNode.connect(actx.destination);
  srcNode.start();
  const t=actx.currentTime;
  gainNode.gain.setValueAtTime(0,t);gainNode.gain.linearRampToValueAtTime(muted?0:vol*.75,t+.1);

  playing=true;
  const pb=document.getElementById('playBtn');
  pb.classList.add('playing');
  pb.innerHTML='<div class="pm-pause"><span class="pm-pause-bar"></span><span class="pm-pause-bar"></span></div>';
  document.getElementById('hint').textContent='Слушай → где сидит звук?';
  if(qStart===0) qStart=Date.now();
  drawVU();
}

function stopAudio(){
  if(vuRaf){cancelAnimationFrame(vuRaf);vuRaf=null;}
  const os=srcNode,op=panNode,og=gainNode,oa=anlNode;
  srcNode=null;panNode=null;gainNode=null;anlNode=null;playing=false;
  const pb=document.getElementById('playBtn');
  pb.classList.remove('playing');
  pb.innerHTML='<div class="pm-play-triangle"></div>';
  if(!os)return;
  if(og&&actx&&actx.state!=='closed'){const t=actx.currentTime;og.gain.setValueAtTime(og.gain.value,t);og.gain.linearRampToValueAtTime(0,t+.08);}
  setTimeout(()=>{try{os.stop();os.disconnect();}catch(e){}try{if(op)op.disconnect();}catch(e){}try{if(oa)oa.disconnect();}catch(e){}try{if(og)og.disconnect();}catch(e){}},100);
  // Reset VU
  document.getElementById('vuL').style.width='0%';
  document.getElementById('vuR').style.width='0%';
}

function togglePlay(){if(playing)stopAudio();else startAudio();}

// ── VU Meter ──
function drawVU(){
  if(!anlNode||!actx) return;
  const buf=new Uint8Array(anlNode.frequencyBinCount);
  anlNode.getByteTimeDomainData(buf);

  // RMS per channel — упрощённо через стерео паннер
  const pan=target?target.val:0;
  const lGain=pan<=0?1:1-pan;
  const rGain=pan>=0?1:1+pan;

  // Анимируем VU
  let rms=0;
  for(let i=0;i<buf.length;i++) rms+=(buf[i]/128-1)**2;
  rms=Math.sqrt(rms/buf.length);

  const lPct=Math.min(100,lGain*rms*200+lGain*30);
  const rPct=Math.min(100,rGain*rms*200+rGain*30);
  document.getElementById('vuL').style.width=lPct.toFixed(1)+'%';
  document.getElementById('vuR').style.width=rPct.toFixed(1)+'%';
  vuRaf=requestAnimationFrame(drawVU);
}

// ══════════════════════════════════════
//  VOLUME
// ══════════════════════════════════════
function setVolume(v){
  vol=v/100;muted=false;
  document.getElementById('volFill').style.width=v+'%';
  document.getElementById('volDot').style.left=v+'%';
  document.getElementById('volPct').textContent=v+'%';
  document.querySelector('.pm-vol-icon').textContent=v==0?'🔇':v<40?'🔉':'🔊';
  if(gainNode&&actx) gainNode.gain.setTargetAtTime(vol*.75,actx.currentTime,.02);
}
function toggleMute(){
  muted=!muted;
  document.querySelector('.pm-vol-icon').textContent=muted?'🔇':'🔊';
  if(gainNode&&actx) gainNode.gain.setTargetAtTime(muted?0:vol*.75,actx.currentTime,.02);
}

// ══════════════════════════════════════
//  GAME
// ══════════════════════════════════════
function setDiff(d,btn){
  diff=d;
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function startGame(){
  document.getElementById('scrStart').classList.remove('active');
  document.getElementById('scrGame').classList.add('active');
  updateScoreUI();newRound();
}

function newRound(){
  stopAudio();
  answered=false;picked=null;qStart=0;
  
  const set=POSITIONS[diff];
  target=set[Math.floor(Math.random()*set.length)];
  document.getElementById('rn').textContent=round;
  document.getElementById('diffLabel').textContent={easy:'Легко',medium:'Средне',hard:'Сложно'}[diff];
  document.getElementById('fbMain').textContent='';document.getElementById('fbMain').className='pm-fb-main';
  document.getElementById('fbSub').textContent='';
  document.getElementById('hint').textContent='Нажми ▶ чтобы начать слушать';
  const tb=document.getElementById('tipBox');tb.style.display='none';tb.textContent='';
  const nb=document.getElementById('nextBtn');nb.style.display='none';
  // Reset pan field
  document.getElementById('panDotCorrect').style.left='50%';
  document.getElementById('panDotUser').style.opacity='0';
  setPanFill(null);
  buildButtons();
}

function buildButtons(){
  const set=POSITIONS[diff];
  const g=document.getElementById('panButtons');g.innerHTML='';
  const set2=POSITIONS[diff];
  const cols2 = set2.length <= 5 ? 5 : set2.length <= 9 ? 5 : 7;
  g.style.gridTemplateColumns='repeat(9, 1fr)';
  g.style.width='100%';
  set.forEach(p=>{
    const b=document.createElement('button');
    b.className='pan-btn';b.dataset.val=p.val;
    b.innerHTML=`<span class="pan-icon">${p.icon}</span><span class="pan-val">${p.label}</span><span class="pan-sub">${p.sub}</span>`;
    b.onclick=()=>pickPos(p,b);
    g.appendChild(b);
  });
}

function setPanFill(val){
  const fill=document.getElementById('panFill');
  if(val===null){fill.style.display='none';return;}
  fill.style.display='block';
  if(val===0){fill.style.left='50%';fill.style.width='0%';fill.style.background='rgba(255,255,255,.2)';}
  else if(val<0){const w=(-val)*50;fill.style.left=(50-w)+'%';fill.style.width=w+'%';fill.style.background='linear-gradient(to left,var(--purple),rgba(167,139,250,.2))';}
  else{fill.style.left='50%';fill.style.width=(val*50)+'%';fill.style.background='linear-gradient(to right,var(--cyan),rgba(34,211,238,.2))';}
}

function pickPos(pos,btn){
  if(answered)return;
  document.querySelectorAll('.pan-btn').forEach(b=>b.classList.remove('picked'));
  btn.classList.add('picked');
  picked=pos;
  checkAnswer();
}

function checkAnswer(){
  if(!picked||answered)return;
  answered=true;stopAudio();
  const elapsed=(Date.now()-qStart)/1000;
  const diff_val=Math.abs(picked.val-target.val);
  const ok=diff_val<0.01;
  let earned=0;
  totalAns++;

  // Кнопки
  document.querySelectorAll('.pan-btn').forEach(b=>{
    b.disabled=true;
    const v=parseFloat(b.dataset.val);
    if(Math.abs(v-target.val)<0.01) b.className='pan-btn '+(ok?'correct':'reveal');
    else if(picked&&Math.abs(v-picked.val)<0.01&&!ok) b.className='pan-btn wrong';
  });

  // Позиции на поле
  const correctPct=((target.val+1)/2*100);
  document.getElementById('panDotCorrect').style.left=correctPct+'%';
  if(!ok){
    const userPct=((picked.val+1)/2*100);
    document.getElementById('panDotUser').style.left=userPct+'%';
    document.getElementById('panDotUser').style.opacity='1';
  }
  setPanFill(target.val);

  if(ok){
    totalRight++;streak++;
    const spd=Math.max(0,Math.round(50*Math.max(0,1-elapsed/6)));
    const mult=streak>=5?2:streak>=3?1.5:1;
    earned=Math.round((BASE[diff]+spd)*mult);
    score+=earned;
    localStorage.setItem('pt_s',score);
    showTip();
    playSuccessSound();
    setTimeout(saveScore,300);
  } else {streak=0;}

  // Фидбек
  const fm=document.getElementById('fbMain');
  const fs=document.getElementById('fbSub');
  fm.className='pm-fb-main '+(ok?'ok':'no');
  const tname=target.label+(target.val===0?'':' '+target.sub);
  if(ok){
    fm.textContent='✓ Верно!';
    fs.textContent=tname+' · +'+earned+' pts'+(streak>=3?' · 🔥×'+streak:'');
    ptsPopup('+'+earned);
  } else {
    const close=diff_val<=0.26;
    fm.textContent=close?'✗ Почти!':'✗ Неверно';
    fs.textContent='Это был '+tname+(picked?' — ты выбрал '+picked.label+' '+picked.sub:'');
  }

  updateScoreUI();

  // Кнопка Далее
  const nb=document.getElementById('nextBtn');
  nb.style.display='block';
  nb.textContent='Далее →';
}


function nextRound(){round++;newRound();}

// ══════════════════════════════════════
//  TIPS
// ══════════════════════════════════════
const TIPS = {
  easy:[
    "Interaural Time Difference (ITD): мозг определяет направление звука по разнице времени прихода к двум ушам. Максимальная ITD при источнике сбоку — около 660 микросекунд (0.66 мс). Именно это крошечное различие позволяет слуху точно локализовать звук по горизонтали.",
    "Ниже 80 Hz слух теряет способность точно локализовать звук. Именно поэтому стандарт профессионального мастеринга — держать частоты ниже 80–120 Hz в моно. Суббас в стерео создаёт фазовые проблемы и может исчезнуть при суммировании в моно.",
    "Haas effect (эффект преимущества): если один и тот же звук воспроизводится из двух источников, но один из них задержан на 1–30 мс — слушатель локализует звук по первому источнику, даже если второй на 10 dB громче. Это фундаментальный принцип работы задержки в live-звуке.",
    "Ширина стерео базы зависит от расстояния между мониторами и слушателем. Стандарт: равносторонний треугольник с углом 60° между мониторами. При более широком размещении стерео-база «схлопывается» к центру. При более узком — теряется ширина.",
    "Mono compatibility (моносовместимость): при суммировании стерео в моно сигналы с разными фазами частично отменяют друг друга. Профессиональный мониторинг всегда включает проверку в моно. Если микс «схлопывается» — проблема в фазовых несоответствиях между каналами.",
  ],
  medium:[
    "Interaural Level Difference (ILD): на частотах выше 1.5 kHz голова создаёт «звуковую тень» — разницу уровней между ушами до 20 dB при источнике сбоку. На низких частотах (ниже 500 Hz) ILD незначительна — волны огибают голову. Именно поэтому высокие частоты локализуются точнее низких.",
    "HRTF (Head-Related Transfer Function): каждый человек имеет уникальную HRTF, определяемую формой ушных раковин, головы и тела. Именно поэтому персонализированные HRTF в VR-звуке звучат значительно реалистичнее универсальных. Ушная раковина вносит спектральные подсказки для локализации по вертикали.",
    "Phantom center (фантомный центр): когда одинаковый сигнал воспроизводится из обоих мониторов — он воспринимается как звук из точки между ними. Это иллюзия, которая разрушается при небольшом смещении слушателя. Именно поэтому вокал в центре микса устойчив только в sweet spot студии.",
    "Mid/Side (M/S) обработка: Mid-канал = (L+R)/2, Side-канал = (L-R)/2. Это математическое преобразование позволяет независимо обрабатывать центральный образ и стерео-ширину. M/S EQ и компрессия — стандартные инструменты профессионального мастеринга.",
    "Goniometer (фазоскоп): прибор для визуализации стерео-поля. Моно-сигнал отображается как вертикальная линия. Полное стерео — как эллипс. Выход за пределы круга — проблемные фазовые несоответствия. Это обязательный инструмент мониторинга в профессиональной студии.",
    "Стерео-ширина через задержку: задержка одного канала на 20–40 мс создаёт ощущение широкого стерео без реального панорамирования. Однако этот метод разрушается в моно (эффект Хааса компенсируется и возникают фазовые отмены). Это «дешёвый» способ ширины — профессионалы избегают его.",
  ],
  hard:[
    "Duplex theory of sound localization (теория Рэлея, 1907): на низких частотах (до 1.5 kHz) мозг использует ITD (Interaural Time Difference), на высоких (выше 1.5 kHz) — ILD (Interaural Level Difference). Диапазон 1.5–3 kHz — переходная зона где оба механизма работают совместно. Именно поэтому здесь локализация менее точна.",
    "Cone of confusion: существует бесконечное множество точек в пространстве, которые дают одинаковую ITD и ILD. Эти точки образуют «конус неопределённости» с вершиной у уха. Именно для разрешения этой неопределённости слух использует спектральные подсказки HRTF от ушной раковины и движения головы.",
    "Elevation cues (подсказки высоты): ушная раковина вносит спектральные изменения в зависимости от угла возвышения источника. Пики и провалы в диапазоне 7–16 kHz сигнализируют мозгу о вертикальном положении звука. Именно поэтому потеря слуха выше 8 kHz ухудшает восприятие трёхмерного пространства.",
    "Cross-talk cancellation (XTC): при воспроизведении через громкоговорители правый монитор слышит и правое, и левое ухо. XTC-алгоритмы вычитают «перекрёстный» сигнал, позволяя создать иллюзию наушников через мониторы. Система Ambiophonics использует два близко расположенных монитора и XTC для реалистичного пространственного звука.",
    "Precedence effect и «focus» стерео: в живом помещении ранние отражения (до 30–40 мс) интегрируются слухом с прямым звуком и воспринимаются как «ширина» или «объём». При задержке более 40 мс — как отдельное эхо. Именно на этом принципе основаны алгоритмы ревербераторов типа «room» и «hall».",
    "Амбиофоника и Ambisonic: Ambisonic B-format кодирует звуковое поле через 4 канала (W, X, Y, Z) — один всенаправленный и три пространственных. При декодировании для любого количества динамиков создаётся точная пространственная картина. Используется в 360° видео, VR и профессиональном пост-продакшне.",
  ]
};
function showTip(){
  const set=TIPS[diff];
  const el=document.getElementById('tipBox');
  el.textContent='💡 '+set[Math.floor(Math.random()*set.length)];
  el.style.display='block';
  el.style.animation='none';void el.offsetWidth;el.style.animation='tipIn .35s ease-out';
}


// ── ЗВУК ПРАВИЛЬНОГО ОТВЕТА ──
function playSuccessSound() {
  try {
    // Используем существующий контекст или создаём новый
    const ctx = (actx && actx.state !== 'closed') ? actx : new (window.AudioContext || window.webkitAudioContext)();
    const isNew = ctx !== actx;
    if(ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + 0.65);
    });
    if(isNew) setTimeout(() => { try{ctx.close();}catch(e){} }, 1200);
  } catch(e) {}
}

// ══════════════════════════════════════
//  SCORE UI
// ══════════════════════════════════════
function updateScoreUI(){
  document.getElementById('sv').textContent=score.toLocaleString('ru');
  document.getElementById('stv').textContent=streak+(streak>=3?'🔥':'');
  let lvl=LEVELS[0],nxt=LEVELS[1];
  for(let i=0;i<LEVELS.length;i++){if(score>=LEVELS[i].m){lvl=LEVELS[i];nxt=LEVELS[i+1]||null;}}
  document.getElementById('lv').textContent=lvl.n;
  document.getElementById('lf').style.width=nxt?Math.round(((score-lvl.m)/(nxt.m-lvl.m))*100)+'%':'100%';
}

function ptsPopup(txt){
  const el=document.createElement('div');el.className='pts-pop';el.textContent=txt;
  el.style.left='50%';el.style.top='50%';el.style.transform='translateX(-50%)';
  document.body.appendChild(el);setTimeout(()=>el.remove(),900);
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actx&&actx.state==='suspended')actx.resume();});
updateScoreUI();
sbInit();
