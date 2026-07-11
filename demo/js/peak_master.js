// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const SETS = {
  easy:  [63,125,250,500,1000,2000,4000,8000,16000],
  medium:[63,90,125,180,250,355,500,710,1000,1400,2000,2800,4000,5600,8000,12000,16000],
  hard:  [45,63,90,125,180,250,355,500,710,1000,1400,2000,2800,4000,5600,8000,11000,16000],
};
const BOOST={easy:12,medium:9,hard:6};
const QV={easy:1.5,medium:1.2,hard:.9};
const BASE={easy:60,medium:100,hard:160};
const LEVELS=[{n:'Lv.1',m:0},{n:'Lv.2',m:200},{n:'Lv.3',m:500},{n:'Lv.4',m:1000},{n:'Lv.5',m:1800},{n:'Lv.6',m:3000},{n:'MASTER',m:5000}];
const TODAY=new Date().toISOString().slice(0,10);

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let diff='medium', round=1;
let target=null, picked=null, answered=false, qStart=0;
let score=parseInt(localStorage.getItem('pm_s')||'0');
let streak=0, playing=false, comparing=false;
let actx=null, srcNode=null, filtNode=null, gainNode=null, anlNode=null, noiseBuf=null;
let raf=null, vol=.2, muted=false;
let challengeMode=false;
let sbUser=null, sbProfile=null;

// Streak data
function loadSD(){return JSON.parse(localStorage.getItem('mp_sd')||JSON.stringify({streak:0,best:0,last:'',chDone:0,chDate:''}))}
function saveSD(d){localStorage.setItem('mp_sd',JSON.stringify(d))}

// ══════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════
const SB=supabase.createClient('https://mwzskffecoedpvyflswg.supabase.co','sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD');
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(session){
    sbUser=session.user;
    const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
    sbProfile=p;
    if(p){
      const nb=document.getElementById('navVip');
      if(nb){nb.textContent='👤 '+p.username;nb.style.color='var(--cyan)'}
    }
  }
}
async function saveScore(){
  if(!sbUser||!sbProfile)return;
  await SB.from('scores').insert({user_id:sbUser.id,username:sbProfile.username,game:'peak_master',score,accuracy:totalAns>0?Math.round(totalRight/totalAns*100):0,streak,difficulty:diff,rounds:totalAns});
}
let totalRight=0,totalAns=0;

// ══════════════════════════════════════
//  SVG EQ GRAPH
// ══════════════════════════════════════
const LO=Math.log10(20),HI=Math.log10(20000);
function fToSvgX(f){return((Math.log10(f)-LO)/(HI-LO))*1240}
function dbToSvgY(db){return 100-(db/24)*100}

function buildEQPath(hz,gainDB,q){
  let d='';
  for(let px=0;px<=1240;px+=4){
    const f=Math.pow(10,LO+(px/1240)*(HI-LO));
    const x=q*(f/hz-hz/f);
    const db=gainDB/(1+x*x);
    const y=dbToSvgY(db);
    d+=(px===0?'M':'L')+px.toFixed(1)+','+y.toFixed(1);
  }
  return d;
}

function showBoostCurve(){
  const easyAnswered = parseInt(localStorage.getItem('pm_easy_total')||'0');
  const showCurve = trainMode || (diff === 'easy' && easyAnswered < 30);

  const ep = document.getElementById('eqPath');
  if(showCurve){
    const path = buildEQPath(target, BOOST[diff], QV[diff]);
    ep.setAttribute('d', path);
    ep.style.stroke = '#34e0c4';
    ep.style.filter = 'drop-shadow(0 0 7px rgba(52,224,196,.7))';
    // Подсказка для новичков с счётчиком
    const left = 30 - easyAnswered;
    document.getElementById('hint').textContent =
      playing ? ('С EQ бустом — слушай · подсказка ещё ' + left + ' раз') : 'Нажми ▶ чтобы начать слушать';
  } else {
    // Только плоская линия — тренируем слух без визуальной подсказки
    ep.setAttribute('d','M0,100 L1240,100');
    ep.style.stroke = 'rgba(255,255,255,.15)';
    ep.style.filter = 'none';
  }
  document.getElementById('peakTag').style.opacity = '0';
  document.getElementById('peakLine').style.opacity = '0';
}

function updateGraph(showCurve, color, label){
  const eqPath=document.getElementById('eqPath');
  const peakLine=document.getElementById('peakLine');
  const peakTag=document.getElementById('peakTag');
  const peakFreqLabel=document.getElementById('peakFreqLabel');

  if(showCurve && target){
    const g=comparing?0:BOOST[diff];
    eqPath.setAttribute('d', buildEQPath(target,g,QV[diff]));
    eqPath.style.stroke=color||'#34e0c4';
    eqPath.style.filter=color?`drop-shadow(0 0 7px ${color}88)`:'drop-shadow(0 0 7px rgba(52,224,196,.7))';

    const x=fToSvgX(target);
    peakLine.setAttribute('x1',x);peakLine.setAttribute('x2',x);
    peakLine.style.opacity=comparing?'0':'.6';
    peakTag.style.left=(x/1240*100)+'%';
    peakTag.style.opacity=comparing?'0':'1';
    peakFreqLabel.textContent=fmtF(target)+' Hz';
    document.getElementById('peakBoostLabel').textContent=label||'С БУСТОМ';
  } else {
    eqPath.setAttribute('d','M0,100 L1240,100');
    peakLine.style.opacity='0';
    peakTag.style.opacity='0';
  }
}

// ══════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════
function makePink(ctx,dur){
  const sr=ctx.sampleRate,n=Math.ceil(sr*dur),buf=ctx.createBuffer(2,n,sr);
  for(let ch=0;ch<2;ch++){
    const d=buf.getChannelData(ch);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(let i=0;i<n;i++){
      const w=Math.random()*2-1;
      b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;
      b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;
      b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;
      d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;
    }
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
  buildAudioChain(actx);
  if(comparing){
    filtNode.gain.value=0;
    if(filtNode2) filtNode2.gain.value=0;
  }
  gainNode=actx.createGain();
  gainNode.gain.value=0;
  srcNode.connect(filtNode);filtNode.connect(gainNode);gainNode.connect(actx.destination);
  srcNode.start();
  const t=actx.currentTime;
  gainNode.gain.setValueAtTime(0,t);
  gainNode.gain.linearRampToValueAtTime(muted?0:vol*.75,t+.1);
  playing=true;
  const pb=document.getElementById('playBtn');
  pb.classList.add('playing');
  pb.innerHTML='<div class="pm-pause"><span class="pm-pause-bar"></span><span class="pm-pause-bar"></span></div>';
  if(qStart===0) qStart=Date.now();
  document.getElementById('hint').textContent=comparing?'Оригинал без буста':'С EQ бустом — слушай';
}

function stopAudio(){
  if(raf){cancelAnimationFrame(raf);raf=null;}
  const os=srcNode,of=filtNode,og=gainNode;
  srcNode=null;filtNode=null;gainNode=null;
  playing=false;
  const pb=document.getElementById('playBtn');
  pb.classList.remove('playing');
  pb.innerHTML='<div class="pm-play-triangle"></div>';
  if(!os)return;
  if(og&&actx&&actx.state!=='closed'){
    const t=actx.currentTime;og.gain.setValueAtTime(og.gain.value,t);og.gain.linearRampToValueAtTime(0,t+.08);
  }
  setTimeout(()=>{try{os.stop();os.disconnect();}catch(e){}try{if(of)of.disconnect();}catch(e){}try{if(og)og.disconnect();}catch(e){}},100);
}

function togglePlay(){if(playing)stopAudio();else startAudio();}

function startCompare(){
  if(answered)return;
  comparing=true;
  document.getElementById('cmpBtn').classList.add('active');
  document.getElementById('modeBadge').textContent='ОРИГИНАЛ';
  document.getElementById('modeBadge').classList.add('comparing');
  if(filtNode&&actx) filtNode.gain.setTargetAtTime(0,actx.currentTime,.015);
  if(filtNode2&&actx) filtNode2.gain.setTargetAtTime(0,actx.currentTime,.015);
  if(!playing) startAudio();
  else document.getElementById('hint').textContent='Оригинал без буста';
  // A mode: плоская линия
  document.getElementById('eqPath').setAttribute('d','M0,100 L1240,100');
  document.getElementById('eqPath').style.stroke='rgba(255,255,255,.25)';
  document.getElementById('eqPath').style.filter='none';
  document.getElementById('peakTag').style.opacity='0';
  document.getElementById('peakLine').style.opacity='0';
  document.getElementById('modeBadge').textContent='ОРИГИНАЛ';
  document.getElementById('modeBadge').classList.add('comparing');
}
function endCompare(){
  if(answered)return;
  comparing=false;
  document.getElementById('cmpBtn').classList.remove('active');
  document.getElementById('modeBadge').textContent='С БУСТОМ';
  document.getElementById('modeBadge').classList.remove('comparing');
  const curBoost = trainMode?trainCfg.gain:getBoostForPhase();
  const curSign = isCutMode?-1:1;
  if(filtNode&&actx) filtNode.gain.setTargetAtTime(curBoost*curSign,actx.currentTime,.015);
  if(filtNode2&&actx) filtNode2.gain.setTargetAtTime(curBoost*curSign*0.85,actx.currentTime,.015);
  if(playing) document.getElementById('hint').textContent='С EQ бустом — слушай';
  document.getElementById('modeBadge').textContent='С БУСТОМ';
  document.getElementById('modeBadge').classList.remove('comparing');
  // B mode: показываем кривую буста (без метки)
  if(target && !answered) showBoostCurve();
}

// ══════════════════════════════════════
//  VOLUME
// ══════════════════════════════════════
function setVolume(v){
  vol=v/100;muted=false;
  document.getElementById('volFill').style.width=v+'%';
  document.getElementById('volDot').style.left=v+'%';
  document.getElementById('volPct').textContent=v+'%';
  const icon=document.querySelector('.pm-vol-icon');
  icon.textContent=v==0?'🔇':v<40?'🔉':'🔊';
  if(gainNode&&actx) gainNode.gain.setTargetAtTime(vol*.75,actx.currentTime,.02);
}
function toggleMute(){
  const s=document.getElementById('volFill');
  if(muted){muted=false;setVolume(Math.round(vol*100||70));}
  else{muted=true;document.querySelector('.pm-vol-icon').textContent='🔇';if(gainNode&&actx)gainNode.gain.setTargetAtTime(0,actx.currentTime,.02);}
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
  answered=false;picked=null;qStart=0;comparing=false;
  
  const set=SETS[diff];
  target=set[Math.floor(Math.random()*set.length)];
  document.getElementById('rn').textContent=round;
  document.getElementById('diffLabel').textContent={easy:'Легко',medium:'Средне',hard:'Сложно'}[diff];
  document.getElementById('fbMain').textContent='';
  document.getElementById('fbMain').className='pm-fb-main';
  document.getElementById('fbSub').textContent='';
  document.getElementById('hint').textContent='Нажми ▶ чтобы начать слушать';
  updateHintBtn();

  // Показываем фазу для hard
  const diffLabelEl = document.getElementById('diffLabel');
  if(diff==='hard' && !trainMode){
    const phase=getHardPhase();
    const phases=['','Одна полоса','Узкий Q','2 полосы','Буст/Срез'];
    diffLabelEl.textContent='Сложно · '+phases[phase];
  } else if(trainMode){
    diffLabelEl.textContent='Тренировка';
  }

  // Надпись режима
  const modeB=document.getElementById('modeBadge');
  if(modeB) modeB.textContent=isCutMode?'СО СРЕЗОМ':'С БУСТОМ';

  // Multi-band hint
  const ml=document.getElementById('multiLabel');
  if(ml) ml.style.display=(targets2.length>0||(trainMode&&trainCfg.bands>=2))?'block':'none';
  document.getElementById('modeBadge').textContent='С БУСТОМ';
  document.getElementById('modeBadge').classList.remove('comparing');
  document.getElementById('cmpBtn').classList.remove('active');
  const tb=document.getElementById('tipBox');tb.style.display='none';tb.textContent='';
  const fl=document.getElementById('freqLabel');if(fl)fl.textContent=isCutMode?'Найди срез частоты':'Выбери частоту буста';
  const nb=document.getElementById('nextBtn');nb.style.display='none';
  // Graph — пустая кривая
  updateGraph(false);
  buildChips();
}

function buildChips(){
  const set=SETS[diff];
  const g=document.getElementById('chipGrid');g.innerHTML='';
  // Адаптируем количество колонок
  const cols = set.length <= 5 ? 5 : set.length <= 9 ? 5 : set.length <= 12 ? 6 : 6;
  g.style.gridTemplateColumns='repeat('+cols+',1fr)';
  set.forEach(f=>{
    const b=document.createElement('button');
    b.className='pm-chip';b.dataset.f=f;
    b.innerHTML=`<span class="pm-chip-val">${fmtF(f)}</span><span class="pm-chip-unit">Hz</span>`;
    b.onclick=()=>pickFreq(f,b);
    g.appendChild(b);
  });
}

function pickFreq(f,btn){
  if(answered)return;
  document.querySelectorAll('.pm-chip').forEach(b=>b.classList.remove('picked'));
  btn.classList.add('picked');
  picked=f;
  checkAnswer();
}

function checkAnswer(){
  if(!picked||answered)return;
  answered=true;
  stopAudio();

  const elapsed=(Date.now()-qStart)/1000;
  const dist=Math.abs(Math.log2(picked/target));
  const ok=dist<0.26;
  let earned=0;
  totalAns++;

  // Подсветка кнопок
  document.querySelectorAll('.pm-chip').forEach(b=>{
    b.disabled=true;
    const f=parseInt(b.dataset.f);
    if(f===target) b.className='pm-chip '+(ok?'correct':'reveal');
    else if(f===picked&&!ok) b.className='pm-chip wrong';
  });

  // EQ кривая
  clearHintZone();
  // Подсвечиваем вторую полосу если была
  if(targets2.length>0){
    const x2=fToSvgX(targets2[0]);
    const svg=document.getElementById('eqSvg');
    let m=svg.querySelector('#peakLine2');
    if(!m){m=document.createElementNS('http://www.w3.org/2000/svg','line');m.id='peakLine2';svg.appendChild(m);}
    m.setAttribute('x1',x2);m.setAttribute('x2',x2);m.setAttribute('y1',0);m.setAttribute('y2',200);
    m.setAttribute('stroke','rgba(251,146,60,.5)');m.setAttribute('stroke-width','1.5');m.setAttribute('stroke-dasharray','3 5');
  }
  const revColor=ok?'rgba(74,222,128,.9)':'rgba(248,113,113,.7)';
  updateGraph(true,revColor,ok?'✓ ВЕРНО':'✗ НЕВЕРНО');
  document.getElementById('peakBoostLabel').style.background=ok?'var(--green)':'var(--red)';
  document.getElementById('peakBoostLabel').style.color=ok?'#0a0b16':'#fff';

  if(ok){
    totalRight++;streak++;
    const spd=Math.max(0,Math.round(50*Math.max(0,1-elapsed/8)));
    const mult=streak>=5?2:streak>=3?1.5:1;
    let base=trainMode?80:BASE[diff];
    if(window._hintUsed) base=Math.round(base*0.5); // штраф за подсказку
    earned=Math.round((base+spd)*mult);
    if(!trainMode){score+=earned;localStorage.setItem('pm_s',score);}
    showTip(target);
    playSuccessSound();
    if(!trainMode){setTimeout(saveScore,300);updateDailyStreak();}
    if(!trainMode&&challengeMode) updateChallenge();
    // Считаем hard раунды
    if(diff==='hard'&&!trainMode){
      hardRounds++;localStorage.setItem('pm_hard_rounds',hardRounds);
    }
    if(diff==='easy'){
      const et=parseInt(localStorage.getItem('pm_easy_total')||'0')+1;
      localStorage.setItem('pm_easy_total',et);
      if(et===30){
        setTimeout(()=>{
          const n=document.createElement('div');
          n.style.cssText='position:fixed;top:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#a78bfa,#22d3ee);color:#0a0b16;font-family:Unbounded,sans-serif;font-weight:700;font-size:13px;padding:12px 24px;border-radius:10px;z-index:9999;animation:fup 3s ease-out forwards';
          n.textContent='🎓 Подсказка убрана — теперь только слух!';
          document.body.appendChild(n);setTimeout(()=>n.remove(),3000);
        },500);
      }
    }
  } else { streak=0; }

  // Фидбек
  const fm=document.getElementById('fbMain');
  const fs=document.getElementById('fbSub');
  fm.className='pm-fb-main '+(ok?'ok':'no');
  if(ok){
    fm.textContent='✓ Верно!';
    fs.textContent=fmtF(target)+' Hz · +'+earned+' pts'+(streak>=3?' · 🔥×'+streak:'');
    ptsPopup('+'+earned);
  } else {
    fm.textContent='✗ Неверно';
    fs.textContent='Это был '+fmtF(target)+' Hz — слушай ещё раз';
  }

  updateScoreUI();

  // Кнопка Далее
  const nb=document.getElementById('nextBtn');
  nb.style.display='block';
  nb.textContent='Далее →';
}


function nextRound(){round++;newRound();}

// ══════════════════════════════════════
//  DAILY STREAK
// ══════════════════════════════════════
function initStreak(){
  const d=loadSD();
  const yest=new Date();yest.setDate(yest.getDate()-1);
  const ys=yest.toISOString().slice(0,10);
  if(d.last&&d.last!==TODAY&&d.last!==ys&&d.streak>0){
    d.streak=0;saveSD(d);showStreakPopup(0,'lost');
  }
  updateStreakUI(d);
}

function updateDailyStreak(){
  const d=loadSD();
  if(d.last!==TODAY){
    const yest=new Date();yest.setDate(yest.getDate()-1);
    d.streak=(d.last===yest.toISOString().slice(0,10)?d.streak:0)+1;
    d.best=Math.max(d.best,d.streak);d.last=TODAY;saveSD(d);
    if([3,7,14,30,60,100].includes(d.streak)) showStreakPopup(d.streak,'milestone');
  }
  updateStreakUI(d);
}

function updateStreakUI(d){
  const n=d.streak||0;
  document.getElementById('streakNum').textContent=n;
  document.getElementById('streakIcon').textContent=n>=7?'🔥':n>=3?'🔥':'🔥';
  const done=d.chDate===TODAY?(d.chDone||0):0;
  document.getElementById('chCount').textContent=done+'/5';
  for(let i=0;i<5;i++){
    const dot=document.getElementById('cd'+i);
    if(dot) dot.className='pm-dot'+(i<done?' done':i===done?' active':'');
  }
  const btn=document.getElementById('chPlayBtn');
  if(done>=5){btn.textContent='✓ Выполнен';btn.className='pm-ch-play done';}
  else{btn.textContent='Играть';btn.className='pm-ch-play';}
}

function updateChallenge(){
  const d=loadSD();
  if(d.chDate!==TODAY){d.chDate=TODAY;d.chDone=0;}
  if(d.chDone<5){
    d.chDone++;saveSD(d);
    if(d.chDone===5){score+=250;localStorage.setItem('pm_s',score);updateScoreUI();ptsPopup('+250 🎯');}
  }
  updateStreakUI(d);
}

function startChallenge(){
  const d=loadSD();
  const done=d.chDate===TODAY?(d.chDone||0):0;
  if(done>=5)return;
  challengeMode=true;
  startGame();
}

function showStreakPopup(n,type){
  const ov=document.getElementById('streakOverlay');
  document.getElementById('streakEmoji').textContent=type==='lost'?'💔':'🔥';
  document.getElementById('streakN').textContent=n;
  document.getElementById('streakN').style.color=type==='lost'?'var(--red)':'var(--gold)';
  const msgs={3:['3 дня подряд!','Хорошее начало — не останавливайся!'],7:['Неделя!','7 дней ежедневной практики. Ты молодец.'],14:['Две недели!','Привычка формируется за 21 день — ты на пути.'],30:['30 дней! 🏆','Месяц. Это уже серьёзно.'],60:['60 дней! 👑','Два месяца без перерыва. Профессиональная дисциплина.'],100:['100 ДНЕЙ! 🌟','Легендарный стрик. Ты звезда.']};
  if(type==='lost'){document.getElementById('streakT').textContent='Стрик потерян';document.getElementById('streakS').textContent='Ты пропустил день. Начинай заново!';}
  else{const[t,s]=msgs[n]||[n+' дней!','Продолжай!'];document.getElementById('streakT').textContent=t;document.getElementById('streakS').textContent=s;}
  ov.classList.add('open');
}
function closeStreak(){document.getElementById('streakOverlay').classList.remove('open');}

// ══════════════════════════════════════
//  TIPS
// ══════════════════════════════════════
const TIPS={
  easy:{
    45:["На 40–50 Hz длина звуковой волны достигает 7–8 метров. Такие волны больше большинства студий — они создают стоячие волны в углах. Суббас в этой зоне почти невозможно контролировать без специализированной акустической обработки помещения.",
      "Ниже 50 Hz звук воспринимается телом физически: грудная клетка резонирует на 20–40 Hz. Это не слуховое, а тактильное ощущение. Именно поэтому большинство бытовых колонок и наушников эту зону не воспроизводят совсем."],
    63:["63 Hz — длина волны около 5.4 метра. В типичной студии 4×5 м эта волна создаёт стоячие резонансы вдоль стен. Мониторинг в этой зоне без сабвуфера и акустической обработки комнаты практически ненадёжен.",
      "Слух человека наименее чувствителен к частотам ниже 100 Hz согласно кривым равной громкости Fletcher-Munson. Чтобы 63 Hz казался таким же громким как 1 kHz, его реальный уровень должен быть на 10–15 dB выше."],
    125:["125 Hz — нижняя граница зоны которую большинство студийных мониторов воспроизводят с достаточной точностью. Энергия здесь ощущается как «вес» и «теплота» звука. Ниже 125 Hz без измерений доверять мониторингу сложно.",
      "Стандарт ISO 266 определяет предпочтительные частоты для акустических измерений: 63, 125, 250, 500, 1k, 2k, 4k, 8k Hz. Это октавные полосы, на которых измеряется время реверберации RT60 в любом помещении."],
    250:["250 Hz — длина волны около 1.37 метра. Акустические панели из поролона толщиной 5 см начинают работать только от 500–1000 Hz. Для поглощения 250 Hz нужны панели от 35 см толщиной или специальные bass trap конструкции.",
      "Избыток энергии в зоне 200–350 Hz делает звук «ящичным» — один из самых узнаваемых признаков любительской записи. Профессиональный инженер сначала ищет что убрать в этой зоне, а не что добавить."],
    500:["500 Hz воспроизводят абсолютно все звуковые системы: телефоны, Bluetooth-колонки, ноутбуки, дорогие мониторы. Что плохо звучит на 500 Hz — будет плохо везде. Это ключевая зона для проверки баланса микса.",
      "Эффект Хааса: если один звук следует за другим с задержкой 1–30 мс — оба воспринимаются как один, но направление определяется по первому сигналу. Задержки 30–50 мс уже слышны как различимое эхо. Именно на этом основан «slap delay»."],
    1000:["1 kHz — единственная частота для которой 1 фон равен 1 дБ SPL по определению ISO 226. Это нейтральная опорная точка кривых равной громкости. Все калибровочные тоны 0 dBu в аналоговых системах воспроизводятся именно на 1 kHz.",
      "Длина волны на 1 kHz — ровно 34.3 см при температуре 20°C. Расстояние 17 см между двумя источниками вызовет фазовую отмену на 1 kHz. Именно поэтому неправильная расстановка микрофонов даёт характерный «пустой» звук."],
    2000:["2 kHz — нижняя граница зоны максимальной чувствительности слуха. Диапазон 2–5 kHz соответствует резонансной частоте ушного канала (около 3.5 kHz). Небольшой буст здесь делает звук разборчивее без реального увеличения громкости.",
      "Temporal masking (временная маскировка): звук маскирует не только одновременные звуки, но и те, что происходят за 5–30 мс до и после него. MP3-компрессия активно использует этот эффект для уменьшения размера файла без заметной потери качества."],
    4000:["3–4 kHz — резонансная частота наружного слухового канала человека (длиной около 25 мм). Из-за этого анатомического усиления звуки здесь воспринимаются на 10–15 dB громче при одинаковом SPL. Именно поэтому в этой зоне так легко «перестараться».",
      "Noise-induced hearing loss (профессиональная тугоухость) начинается именно с 4 kHz — стандартная «4 kHz notch» на аудиограмме. Волосковые клетки улитки в этой зоне наиболее уязвимы к акустической травме. Мониторинг выше 85 dB SPL более 8 часов повреждает слух необратимо."],
    8000:["8 kHz — зона сибилянтов. Звуки «С», «Ш», «З» состоят из шума в диапазоне 6–12 kHz. Наш слух чрезвычайно чувствителен здесь благодаря роли этих звуков в распознавании согласных речи. Именно поэтому de-esser — обязательный инструмент при работе с вокалом.",
      "Акустика Страдивари: исследования спектра лучших скрипок мастера выявили уникальный пик в зоне 8–9 kHz. Именно эта характеристика отличает инструменты Страдивари от современных копий и определяет их особый «поющий» тембр."],
    16000:["16 kHz — верхняя граница хорошего слуха у большинства людей старше 30 лет. Presbycusis (возрастное снижение слуха) затрагивает в первую очередь именно высокие частоты. Профессиональные звукорежиссёры регулярно проходят аудиометрию.",
      "При MP3-кодировании с битрейтом 128 kbps частоты выше 16 kHz обычно полностью срезаются. При 320 kbps — до 20 kHz. Алгоритм MPEG использует psychoacoustic masking: маскируемые частоты кодируются с меньшей точностью или не кодируются вовсе."]
  },
  medium:{
    45:["На 45 Hz длина волны 7.6 метра. Стоячие волны образуются когда размер комнаты кратен половине длины волны (3.8 м для 45 Hz). Room modes в этой зоне невозможно устранить без масштабной акустической обработки — только контролировать.",
      "Ниже 80 Hz слух перестаёт точно воспринимать стереоинформацию. Профессиональный стандарт — держать суббас в моно ниже 80–120 Hz. Это улучшает совместимость с моносистемами и повышает максимальный уровень при мастеринге."],
    63:["63 Hz — стандартная тестовая частота для измерения звукоизоляции (Sound Transmission Loss). Именно в диапазоне 63–250 Hz звукоизоляция наиболее дорога: для снижения уровня на 10 dB на 63 Hz нужна вдвое большая масса стены по сравнению с 250 Hz.",
      "Обертоны 63 Hz находятся на 126, 189, 252 Hz. Через них работает «missing fundamental»: мозг восстанавливает отсутствующий фундаментал по серии гармоник. Это доказанный психоакустический феномен — именно он позволяет слышать бас на телефонном динамике."],
    90:["90 Hz — стандартная crossover-частота THX-систем. При правильной настройке суб-сателлит системы фазовая стыковка обеспечивает ровный отклик. Неправильная фаза на crossover создаёт провал до −20 dB — один из самых частых дефектов домашних кинотеатров.",
      "Proximity effect (эффект близости) динамических и ленточных микрофонов: при расстоянии 10 см буст в зоне 80–200 Hz достигает +6 dB по сравнению с расстоянием 1 м. Именно на этом основан «radio voice» — тёплый низкочастотный призвук близко поставленного микрофона."],
    125:["125 Hz — одна из центральных октавных полос стандарта ISO 9613. Время реверберации RT60 на 125 Hz в профессиональной студии должно составлять 0.2–0.4 секунды. Жилые помещения обычно имеют RT60 на 125 Hz около 0.5–0.8 с из-за малого количества поглощающих поверхностей.",
      "В диапазоне 80–120 Hz происходит переход от room modes к geometric acoustics. Ниже этой зоны звук ведёт себя как волна, выше — как луч. Именно поэтому в разных точках комнаты бас звучит принципиально по-разному, а высокие частоты — относительно стабильно."],
    180:["Диапазон 150–250 Hz — зона максимального проявления proximity effect (эффекта близости) у динамических микрофонов. При записи вокала вплотную к микрофону буст здесь может достигать 10–12 dB. Именно управляя расстоянием до микрофона вокалист может управлять тембром голоса.",
      "На 180 Hz длина волны около 1.9 метра. Типичная стоячая волна в комнате шириной 1.9 м образует пучность давления у стен и узел в центре. Это значит: переставив рабочее место на 50 см, можно изменить воспринимаемый уровень 180 Hz на 6–10 dB."],
    250:["Auditory masking (слуховая маскировка) на 250 Hz: громкий тон маскирует соседние частоты в радиусе примерно ⅓ октавы вверх и уже вниз. Именно этим объясняется «mud» в плотном миксе: инструменты в зоне 200–400 Hz маскируют друг друга и теряют разборчивость.",
      "Sound transmission loss (STL) обычной гипсокартонной перегородки на 250 Hz — 35–45 dB. На 63 Hz — лишь 25–30 dB. Именно поэтому низкочастотный бас «проходит» сквозь стены, а высокочастотные составляющие изолируются значительно лучше."],
    355:["355 Hz — нижняя граница зоны «присутствия» ударных инструментов. На этой частоте активно работают обертоны малого барабана. «Хлопок» снейра который слышен через любую систему — формируется именно в диапазоне 280–450 Hz.",
      "Critical bandwidth (критическая полоса слуха) на 355 Hz составляет около 100 Hz. Два тона, разделённых менее чем на критическую полосу, воспринимаются как один «грубый» звук (roughness) — эффект открытый Хельмгольцем в XIX веке и лежащий в основе теории диссонанса."],
    500:["OSHA рекомендует ограничивать воздействие 85 dB SPL до 8 часов в день. При 88 dB — до 4 часов. При 94 dB — до 1 часа. Именно работа на высокой громкости в диапазоне 500 Hz – 4 kHz приводит к профессиональной тугоухости большинства звукорежиссёров.",
      "Диапазон 300–3400 Hz — полоса пропускания традиционных телефонных линий. Именно в этой зоне сосредоточена основная информация для разборчивости речи. Инструмент хорошо слышимый здесь — будет разборчив на любой системе воспроизведения."],
    710:["710 Hz — зона формантных характеристик струнных инструментов. Резонансные особенности скрипичной деки в диапазоне 500–1000 Hz определяют индивидуальный тембр каждого инструмента. Скрипки Страдивари и Гварнери отличаются именно характером резонансов в этой зоне.",
      "Auditory masking: тон 70 dB на 710 Hz маскирует соседние частоты примерно в диапазоне 473–1065 Hz (±⅓ октавы). При одновременном звучании инструментов в этом диапазоне они конкурируют за «слуховое внимание». Разделение EQ — единственный способ сделать их одновременно разборчивыми."],
    1000:["1 kHz — международный стандарт калибровки уровней в аналоговых системах. Тональный сигнал 1 kHz, 0 dBu используется для согласования уровней между любым профессиональным оборудованием. Стандарт SMPTE устанавливает −20 dBFS = 0 dBu на частоте 1 kHz.",
      "Equal loudness contour ISO 226: на уровне 60 dB SPL разница восприятия между 1 kHz и 30 Hz составляет около 40 dB. Чтобы 30 Hz казался таким же громким как 1 kHz, его реальная акустическая мощность должна быть в 10 000 раз (40 dB) выше."],
    1400:["Формантный анализ: первая форманта (F1) гласных звуков человеческого голоса — 250–850 Hz, вторая форманта (F2) — 850–2500 Hz. Именно F2 определяет «окраску» гласной. Синтез речи, vocoder и автотюн работают на основе точного анализа и воспроизведения этих формант.",
      "Диапазон 1–2 kHz — граница между «телом» и «присутствием». Ниже звук ощущается тёплым и объёмным, выше — ярким и резким. Большинство тембральных характеристик инструментов определяются именно балансом этих двух зон относительно друг друга."],
    2000:["Temporal resolution (временное разрешение) слуха в зоне 2 kHz составляет около 2–3 миллисекунд. Два звука разделённые менее чем на 2 мс воспринимаются как один. Компрессоры с attack менее 2 мс «невидимы» для слуха — они не меняют воспринимаемый тембр, но стабилизируют уровень.",
      "2 kHz — нижняя граница зоны максимальной чувствительности слуха. Эволюционное объяснение: человеческий голос наиболее информативен в полосе 1–4 kHz. Слух «заточен» под восприятие речи — и это напрямую влияет на то, какие частоты кажутся нам «громкими» в музыке."],
    2800:["Just Noticeable Difference (JND) по частоте на 2.8 kHz составляет около 3–5 Hz — человек различает ноты, отличающиеся менее чем на ¼ полутона. Это примерно в 5 раз точнее, чем на 100 Hz. Именно в этом диапазоне слух наиболее чувствителен к расстройке интонации.",
      "Диапазон 2–4 kHz обрабатывается ушным каналом с анатомическим усилением около +10 dB. Источник излучающий равную мощность на всех частотах будет казаться значительно ярче в этой зоне. Это физиологическая константа, не зависящая от жанра, стиля или вкуса."],
    4000:["Listening fatigue (слуховая усталость) особенно быстро накапливается при воздействии на 3–5 kHz. После 2 часов работы с интенсивным контентом в этой зоне восприятие искажается: звук начинает казаться менее ярким. Профессиональный стандарт — перерыв каждые 45–60 минут.",
      "4 kHz — резонансная частота наружного слухового канала. Расчёт: скорость звука 343 м/с, длина канала 25 мм, четвертьволновой резонатор: 343/(4×0.025) = 3430 Hz. Именно поэтому пик чувствительности — 3.5–4 kHz, что строго соответствует анатомии."],
    5600:["5.6 kHz — верхняя граница диапазона directional hearing (направленного слуха). HRTF-эффекты от 5 до 16 kHz помогают мозгу определять положение звука по вертикали и спереди/сзади. Именно поэтому наушники не воспроизводят полностью пространственное восприятие реального звука.",
      "В диапазоне 5–8 kHz находятся спектральные компоненты звуков «С», «Ф», «Т» в речи. Именно поэтому телефонный стандарт (до 3.4 kHz) требует большего внимания при прослушивании — разборчивость согласных снижена. При мастеринге «для телефонов» эту зону особенно важно контролировать."],
    8000:["«Cocktail party effect» (Черри, 1953): мозг способен выделять один голос из хора других благодаря разнице спектральных характеристик в зоне 4–12 kHz. Именно здесь слуховая система анализирует тонкие различия тембра для разделения источников в сложной акустической обстановке.",
      "Акустическая эмиссия улитки (OAE — otoacoustic emissions): внутреннее ухо само генерирует слабые звуки в ответ на внешнее воздействие. На 8 kHz OAE особенно заметны. Тест OAE используется для ранней диагностики потери слуха у музыкантов до появления субъективных симптомов."],
    12000:["Именно в диапазоне 10–20 kHz записываются тончайшие детали: дыхание исполнителя, призвуки смычка, шелест пальцев на струнах. Эти компоненты не несут мелодической информации, но критически важны для ощущения «живости» и «присутствия» записи.",
      "При MP3-кодировании 128 kbps частоты выше 16 kHz срезаются полностью. Психоакустический алгоритм Perceptual Audio Coder маскирует именно те частоты, которые перекрываются более громкими соседями. В зоне 12–20 kHz маскировка работает наиболее агрессивно."],
    16000:["Presbycusis в среднем снижает верхнюю границу слуха на 1 kHz каждые 10 лет. Это значит: 16 kHz хорошо слышат только люди до 25–30 лет. При мастеринге для широкой аудитории чрезмерный буст выше 14 kHz будет «слышен» только молодыми слушателями.",
      "High-resolution audio (96 kHz / 192 kHz) позволяет записывать частоты выше 20 kHz. Хотя человек их не слышит, сверхзвуковые компоненты влияют на интермодуляционные искажения в слышимом диапазоне. Это одна из причин почему Hi-Res записи многие описывают как «более открытые» даже через обычные системы."]
  },
  hard:{
    45:["На 45 Hz wavelength — 7.6 метра. Room modes рассчитываются по формуле f=c·n/(2L): для комнаты 7.6 м первая аксиальная мода — 22.6 Hz, вторая — 45.2 Hz. Именно поэтому большие студии (Broadcasting House BBC, Abbey Road Studio One) с размерами более 15 м практически свободны от room modes ниже 11 Hz.",
      "Инфразвук (ниже 20 Hz) не слышим но воздействует на организм физически. На 18–19 Hz резонирует глазное яблоко, вызывая зрительные иллюзии. Виктор Танди (1998) установил, что ощущение «призраков» в «haunted» помещениях часто вызвано инфразвуком от вентиляции на 18.9 Hz."],
    63:["Sound Transmission Loss (STL) на 63 Hz — 25–30 dB для стандартной перегородки. Закон «совпадения частот»: при углах падения близких к критическому, STL резко падает. Для 63 Hz критический угол для гипсокартона — около 60°. Именно под этим углом низкий бас «пробивает» стены наиболее эффективно.",
      "Room modes делятся на осевые (1D), тангенциальные (2D) и косые (3D). Осевые на 63 Hz возникают в комнатах длиной 2.7 м. Тангенциальные — при комбинации двух размеров. Косые — при всех трёх. Чем больше мод в зоне 40–120 Hz, тем неравномернее бас в разных точках комнаты."],
    90:["Crossover-точка 90 Hz в системах суб-сателлит: при неправильной фазировке (фазовый сдвиг 180°) — провал до −∞ на частоте crossover. Проверка: если суб вместе с мониторами звучит тише чем только мониторы — перевернуть полярность сабвуфера. Это фундаментальная ошибка в настройке мониторинга.",
      "На 90 Hz смещение слушателя на 95 см (¼ длины волны) изменит уровень этой частоты на 6 dB из-за интерференции прямого и отражённого сигнала. «Sweet spot» студии определяется именно точкой где room modes дают наиболее равномерный отклик в зоне 80–120 Hz."],
    125:["RT60 (время за которое уровень спадает на 60 dB) на 125 Hz — ключевой параметр акустики: студии звукозаписи: 0.2–0.4 с; концертные залы: 1.8–2.2 с; соборы: до 10 с. Оптимальное RT60 на 125 Hz зависит от назначения: для речи нужно меньше, для органной музыки — больше.",
      "Диффузоры QRD (Quadratic Residue Diffuser) эффективно рассеивают звук от 250 Hz вверх. Для 125 Hz диффузор должен иметь максимальную глубину ячеек около 68 см. Именно поэтому полноценная акустическая обработка низких частот требует значительного пространства."],
    180:["Schroeder frequency (частота Шрёдера): граница между зоной room modes и зоной статистической акустики. Формула: f_s = 2000√(RT60/V), где V — объём комнаты в кубометрах. Для комнаты 50 м³ с RT60 0.4 с: f_s ≈ 2000√(0.008) ≈ 179 Hz. Выше частоты Шрёдера мониторинг достоверен.",
      "Proximity effect у ленточных микрофонов значительно сильнее чем у динамических: буст на 100–200 Hz может достигать 12–15 dB при расстоянии 5 см. Именно этот эффект является частью «звука» ленточных микрофонов и активно используется в студиях для придания вокалу «vintage» характера."],
    250:["Диапазон 200–400 Hz — зона где auditory grouping (слуховая группировка по Брегману) наиболее активна. Мозг группирует частоты по общей огибающей амплитуды: если два инструмента имеют синхронные атаки в этой зоне — они воспринимаются как единый источник. Это объясняет почему «клей» от bus-компрессии слышен именно здесь.",
      "Critical bands по Беркингоффу: на 250 Hz ширина критической полосы — около 50 Hz. Это означает: два тона разделённые менее чем на 50 Hz будут взаимно маскировать друг друга. При расстоянии более 50 Hz — воспринимаются независимо. Именно поэтому частотное разделение инструментов в этой зоне особенно важно."],
    355:["Скрипичная дека резонирует на частоте A0 (220 Hz) и имеет «main air mode» около 280 Hz и «main wood mode» около 420–450 Hz. Именно «main wood mode» на 355–450 Hz определяет характерный «voice» скрипки. Мастера-лютьеры настраивают инструменты точно под эти резонансы.",
      "Auralisation (аурализация) — компьютерное моделирование акустики помещения. Сверточная реверберация использует импульсные отклики (IR) реальных пространств. На 355 Hz IR-сигнатура концертного зала содержит информацию о ранних отражениях (до 80 мс) которые определяют ощущение «intimacy» (близости к исполнителю)."],
    500:["Fletcher-Munson curves (равной громкости): на уровне 40 phon (сравнительно тихо) разница чувствительности между 500 Hz и 4 kHz составляет около 10 dB. При 90 phon эта разница сокращается до 5 dB. Именно поэтому миксы сделанные на громкости различаются по тональному балансу при прослушивании тихо — классический «too much bass at low volume» эффект.",
      "A-weighting (A-взвешивание): при измерении шума SPL по A-кривой 500 Hz взвешивается с коэффициентом около −3 dBA относительно 1 kHz. Именно A-взвешивание используется при оценке риска слуховых повреждений согласно OSHA и WHO — потому что оно приближается к чувствительности реального уха."],
    710:["HRTF (Head-Related Transfer Function) на 710 Hz начинает активно формировать пространственный образ звука. Дифракция волны вокруг головы на 710 Hz создаёт разницу уровней между ушами (ILD — Interaural Level Difference) около 3–5 dB для источника сбоку. Именно ILD и ITD (разница времён прихода) дают мозгу информацию о локализации.",
      "Формант-синтез: вторая форманта (F2) определяет «окраску» гласной. Для «А» F2 ≈ 1100 Hz, для «И» F2 ≈ 2300 Hz, для «У» F2 ≈ 800 Hz. Именно поэтому вокальный тембр меняется в зависимости от гласного — и почему эквализация вокала требует учёта текста исполняемого произведения."],
    1000:["1 kHz — стандарт ITU-R BS.1770 для измерения интегрированной громкости (LUFS). Алгоритм K-weighting основан на двух фильтрах: high-shelf +4 dB от 1.5 kHz и high-pass 38 Hz. Стандарт принят как основа нормализации для всех стриминговых сервисов: Spotify −14 LUFS, Apple Music −16 LUFS, YouTube −14 LUFS.",
      "Binaural beats (бинауральные биения): если в левое ухо подать 1000 Hz, а в правое 1004 Hz — мозг «слышит» биение с частотой 4 Hz (разница). Этот феномен обнаружен Генрихом Довом в 1839 году. Бинауральные биения используются в медитативной музыке и нейромаркетинге, хотя их терапевтический эффект научно не подтверждён."],
    1400:["Temporal fine structure (TFS): способность слуха анализировать тонкую временну́ю структуру сигнала в диапазоне 1–5 kHz. TFS лежит в основе восприятия тона и высоты звука у людей. Повреждение TFS-чувствительности — один из первых признаков потери слуха от шума, предшествующий заметному снижению аудиограммы.",
      "MIDI стандарт: A4 = 440 Hz (международный стандарт с 1939 года, утверждён ISO в 1975 году). Однако 432 Hz, 432 Hz, 444 Hz и другие «альтернативные строи» используются некоторыми исполнителями. Музыкальная разница между 440 и 432 Hz — примерно ⅓ полутона, что меньше JND большинства людей в этом диапазоне."],
    2000:["Precedence effect (эффект преимущества, эффект Хааса): первый звук маскирует эхо длиной до 30–40 мс. Это позволяет мозгу слышать прямой звук в реверберирующем помещении без «замутнения» пространством. В студии это означает: первые отражения от стен (5–20 мс) являются критически важными для восприятия пространства записи.",
      "In-ear monitoring (IEM) в live-выступлениях формирует «private» акустическое пространство: исполнитель слышит точный микс без вмешательства зала. В зоне 2 kHz IEM-наушники имеют наибольшее значение из-за максимальной чувствительности слуха: при неправильной настройке именно здесь появляется резкость и усталость за время длинного выступления."],
    2800:["Preattentive processing (до-сознательная обработка): мозг реагирует на звуки в диапазоне 2–4 kHz быстрее чем на другие частоты. MMN (Mismatch Negativity) — нейронный ответ на неожиданный звук — максимален именно в этом диапазоне. Это используется в UX-дизайне звуковых интерфейсов: alert-сигналы намеренно проектируются с акцентом на 2–4 kHz для немедленного привлечения внимания.",
      "Distortion products: при нелинейных искажениях (клип, сатурация, дисторшн) возникают интермодуляционные продукты. Для двух тонов f1 и f2 появляются компоненты 2f1-f2, 2f2-f1 и т.д. На 2.8 kHz интермодуляционные продукты от инструментов в зоне 1.5–4 kHz создают характерный «дисторшн-призвук» при перегрузке цифровых систем."],
    4000:["Cochlear amplifier (кохлеарный усилитель): наружные волосковые клетки улитки активно усиливают звук на 3–4 kHz за счёт электромоторного механизма (prestin). Это обеспечивает дополнительное усиление до 40–60 dB в зоне максимальной чувствительности. Именно повреждение этих клеток при шумовом воздействии приводит к необратимой потере слуха.",
      "4 kHz notch на аудиограмме — классический признак noise-induced hearing loss (NIHL). Первоначально потеря слуха на 4 kHz не ощущается субъективно — человек продолжает хорошо слышать речь. Именно поэтому ранняя диагностика через аудиометрию критически важна для профессиональных музыкантов и звукорежиссёров."],
    5600:["Diffraction (дифракция) на 5.6 kHz: длина волны 6 см. Волна огибает объекты сравнимых размеров. Именно поэтому в студии рассеяние высоких частот создаётся диффузорами с ячейками 3–10 см. На меньших частотах диффузоры не работают — нужны другие акустические решения.",
      "Interaural Level Difference (ILD) на 5.6 kHz достигает максимума: при источнике сбоку разница уровней между ушами — 15–20 dB. Мозг использует ILD как главный механизм локализации на частотах выше 1.5 kHz. На низких частотах (ниже 1.5 kHz) доминирует ITD (разница времён прихода). Это следствие теоремы Рэлея о дуплексной теории слуха (1907)."],
    8000:["Otoacoustic emissions (OAE): здоровая улитка генерирует слабые звуки в ответ на тональные стимулы. На 8 kHz OAE особенно стабильны. TEOAE-тест (Transient Evoked OAE) позволяет диагностировать потерю слуха до 30 dB в диапазоне 1–4 kHz без участия пациента — поэтому используется в обязательном скрининге новорождённых.",
      "Spectral masking на 8 kHz: критическая полоса по Беркингоффу здесь составляет около 1.5 kHz. Это означает шум в полосе 7–9.5 kHz маскируется одним тоном на 8 kHz. Именно на этом принципе работает noise-shaped dither (шумоформирующий дитер) в 16-bit аудио: шум дитера смещается в зону где слух менее чувствителен."],
    11000:["Hypersonic effect (гиперзвуковой эффект): исследование Tsutomu Oohashi (2000) показало, что ультразвуковые компоненты выше 20 kHz в gamelan-музыке активируют мозговую активность измеримым образом. Хотя результаты остаются дискуссионными — это одно из обоснований записи и обработки в высоком разрешении 96 kHz / 192 kHz.",
      "Длина волны на 11 kHz — 3.1 см. При таких размерах даже небольшие объекты (листы, кабели, диффузоры) создают комплексные картины интерференции. Именно поэтому параллельные отражающие поверхности в студии (две стеклянные стены) создают «flutter echo» — характерное металлическое «дрожание» на высоких частотах."],
    16000:["Presbycusis (возрастная потеря слуха): по данным WHO, умеренная потеря слуха затрагивает более 430 миллионов людей. Каждое десятилетие после 30 лет средняя верхняя граница слуха снижается примерно на 1 kHz. Аудиограмма молодого здорового человека (18–25 лет): 0–10 dB HL на всех частотах до 16 kHz.",
      "Dithering в 16-bit аудио: квантовый шум от 16-битной оцифровки имеет спектр до 22 kHz. Без дитера возникают интермодуляционные гармоники в слышимом диапазоне. Noise-shaped дитер (POW-R, MBIT+) перемещает шум квантования выше 15 kHz — в зону где слух наименее чувствителен. Именно поэтому правильный дитер незаметен для слуха."]
  }
};
function getTip(hz){
  const set=TIPS[diff]||TIPS.medium;
  const keys=Object.keys(set).map(Number);
  const near=keys.reduce((a,b)=>Math.abs(Math.log2(b/hz))<Math.abs(Math.log2(a/hz))?b:a);
  const arr=set[near];return arr[Math.floor(Math.random()*arr.length)];
}
function showTip(hz){
  const el=document.getElementById('tipBox');
  el.textContent='💡 '+getTip(hz);
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
//  HINT SYSTEM
// ══════════════════════════════════════
let hintsLeft = 3;

function initHints() {
  hintsLeft = 3;
  updateHintBtn();
}

function updateHintBtn() {
  const btn = document.getElementById('hintBtn');
  const uses = document.getElementById('hintUses');
  if (!btn) return;
  uses.textContent = hintsLeft;
  btn.disabled = (hintsLeft <= 0 || answered || !playing);
}

function useHint() {
  if (hintsLeft <= 0 || answered || !playing) return;
  hintsLeft--;
  updateHintBtn();

  // Показываем зону на спектре (±1 октава) без точной частоты
  const lo = target / 2;
  const hi = target * 2;
  showHintZone(lo, hi);

  // Штраф к очкам этого раунда
  document.getElementById('hint').textContent =
    '💡 Зона подсказки показана на графике · этот раунд -50% очков';
  window._hintUsed = true;
}

function showHintZone(lo, hi) {
  const LO = Math.log10(20), HI = Math.log10(20000);
  const x1 = ((Math.log10(Math.max(20, lo)) - LO) / (HI - LO)) * 1240;
  const x2 = ((Math.log10(Math.min(20000, hi)) - LO) / (HI - LO)) * 1240;
  const svg = document.getElementById('eqSvg');
  let zone = svg.querySelector('#hintZone');
  if (!zone) {
    zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    zone.id = 'hintZone';
    svg.insertBefore(zone, svg.firstChild);
  }
  zone.setAttribute('x', x1);
  zone.setAttribute('y', 0);
  zone.setAttribute('width', x2 - x1);
  zone.setAttribute('height', 200);
  zone.setAttribute('fill', 'rgba(250,204,21,.08)');
  zone.setAttribute('stroke', 'rgba(250,204,21,.3)');
  zone.setAttribute('stroke-width', '1');
  zone.setAttribute('stroke-dasharray', '4 4');
}

function clearHintZone() {
  const zone = document.getElementById('hintZone');
  if (zone) zone.remove();
  window._hintUsed = false;
}

// ══════════════════════════════════════
//  PROGRESSIVE DIFFICULTY (Hard)
// ══════════════════════════════════════
let hardRounds = parseInt(localStorage.getItem('pm_hard_rounds') || '0');
let targets2 = []; // вторая полоса (multi-band)
let isCutMode = false; // режим среза

function getHardPhase() {
  if (hardRounds < 20) return 1; // обычный буст
  if (hardRounds < 40) return 2; // + narrower Q
  if (hardRounds < 60) return 3; // 2 полосы (найди сильнейшую)
  return 4; // иногда CUT вместо boost
}

function pickTarget(set) {
  const phase = (diff === 'hard') ? getHardPhase() : 1;
  isCutMode = false;
  targets2 = [];

  // Phase 4: 30% вероятность среза
  if (phase >= 4 && Math.random() < 0.3) {
    isCutMode = true;
  }

  // Phase 3+: 2 полосы (50% раундов)
  if (phase >= 3 && Math.random() < 0.5 && set.length >= 4) {
    const idx1 = Math.floor(Math.random() * set.length);
    let idx2 = Math.floor(Math.random() * set.length);
    while (idx2 === idx1) idx2 = Math.floor(Math.random() * set.length);
    targets2 = [set[idx1], set[idx2]];
    return set[idx1]; // главная цель = первая
  }

  return set[Math.floor(Math.random() * set.length)];
}

function getBoostForPhase() {
  if (diff !== 'hard') return BOOST[diff];
  const phase = getHardPhase();
  if (phase >= 3) return 6;
  if (phase >= 2) return 7;
  return BOOST.hard;
}

function getQForPhase() {
  if (diff !== 'hard') return QV[diff];
  const phase = getHardPhase();
  if (phase >= 3) return 0.7;
  if (phase >= 2) return 0.8;
  return QV.hard;
}

// ══════════════════════════════════════
//  TRAIN MODE
// ══════════════════════════════════════
let trainMode = false;
const trainCfg = {
  bands: 1,
  gain: 9,
  q: 1.2,
  mode: 'boost',
  range: 'all',
};

const FREQ_RANGES = {
  all:  [45,63,90,125,180,250,355,500,710,1000,1400,2000,2800,4000,5600,8000,11000,16000],
  low:  [45,63,90,125,180,250,355,500],
  mid:  [355,500,710,1000,1400,2000,2800,4000],
  high: [2800,4000,5600,8000,11000,16000],
};

function openTrain() {
  document.getElementById('scrStart').classList.remove('active');
  document.getElementById('scrGame').classList.remove('active');
  document.getElementById('scrTrain').classList.add('active');
}

function closeTrain() {
  document.getElementById('scrTrain').classList.remove('active');
  document.getElementById('scrStart').classList.add('active');
}

function setTrain(key, val, btn) {
  trainCfg[key] = val;
  const group = btn.parentElement;
  group.querySelectorAll('.train-chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function setTrainSlider(key, input) {
  const v = parseFloat(input.value);
  const pct = ((v - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min))) * 100;
  input.style.setProperty('--p', pct + '%');
  if (key === 'gain') {
    trainCfg.gain = v;
    document.getElementById('gainVal').textContent = '+' + v + ' dB';
  } else {
    // Q: slider 1-10 → Q 0.5-4
    const qVal = (0.5 + (v - 1) / 9 * 3.5).toFixed(1);
    trainCfg.q = parseFloat(qVal);
    document.getElementById('qVal').textContent = 'Q ' + qVal;
  }
}

function startTrainGame() {
  trainMode = true;
  document.getElementById('scrTrain').classList.remove('active');
  document.getElementById('scrGame').classList.add('active');
  updateScoreUI();
  newRound();
}

// ══════════════════════════════════════
//  MULTI-BAND AUDIO
// ══════════════════════════════════════
let filtNode2 = null;

function buildAudioChain(ctx) {
  const gain = trainMode ? trainCfg.gain : getBoostForPhase();
  const q    = trainMode ? trainCfg.q   : getQForPhase();
  const cut  = trainMode ? (trainCfg.mode === 'cut' || (trainCfg.mode === 'both' && Math.random() < 0.5)) : isCutMode;

  filtNode = ctx.createBiquadFilter();
  filtNode.type = 'peaking';
  filtNode.frequency.value = target;
  filtNode.Q.value = q;
  filtNode.gain.value = cut ? -gain : gain;

  if (targets2.length > 0 || (trainMode && trainCfg.bands >= 2)) {
    const t2 = targets2[0] || SETS.hard[Math.floor(Math.random() * SETS.hard.length)];
    filtNode2 = ctx.createBiquadFilter();
    filtNode2.type = 'peaking';
    filtNode2.frequency.value = t2;
    filtNode2.Q.value = q;
    filtNode2.gain.value = (cut ? -gain : gain) * 0.85;
  }

  if (trainMode && trainCfg.bands >= 3) {
    // Третья полоса через WaveShaperNode не нужна — просто второй фильтр достаточно
  }
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
  const el=document.createElement('div');
  el.className='pts-pop';el.textContent=txt;
  // Центрируем по горизонтали, фиксированная позиция по вертикали
  el.style.position='fixed';
  el.style.left='50%';
  el.style.top='50%';
  el.style.transform='translateX(-50%)';
  el.style.zIndex='999';
  document.body.appendChild(el);setTimeout(()=>el.remove(),900);
}

function fmtF(hz){return hz>=1000?(hz/1000)+'k':String(hz)}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actx&&actx.state==='suspended')actx.resume();});
updateScoreUI();
initStreak();
sbInit();
initHints();
