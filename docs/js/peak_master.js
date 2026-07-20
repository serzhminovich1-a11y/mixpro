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

// Допуск в октавах (log2-расстояние гипотезы от цели, при котором ответ ещё засчитывается)
const TOLERANCE={easy:.5,medium:.26,hard:.13};
const PERFECT_FRAC=.15; // доля допуска, при которой считаем попадание идеальным
const PHONE_MIN=300,PHONE_MAX=8000; // диапазон целей в режиме "Телефонный динамик"

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
let phoneMode=false, revealShown=true, sessionRound=0, sessionScore=0, sessionResults=[];
let guessFrac=0.5, dragging=false;
let guessSource='noise';
let trackManifest=[], trackCache={};

// Streak data — localStorage остаётся источником истины для мгновенного
// отклика в игре, Supabase — просто зеркало для профиля/др. устройств.
function loadSD(){return JSON.parse(localStorage.getItem('mp_sd')||JSON.stringify({streak:0,best:0,last:'',chDone:0,chDate:'',freezes:0}))}
function dateStr(offsetDays){const d=new Date();d.setDate(d.getDate()+offsetDays);return d.toISOString().slice(0,10)}
function saveSD(d){localStorage.setItem('mp_sd',JSON.stringify(d));syncStreakToSupabase(d)}

async function syncStreakToSupabase(d){
  if(!sbUser)return;
  await SB.from('daily_streaks').upsert({
    user_id:sbUser.id, game:'peak_master',
    streak:d.streak||0, best_streak:d.best||0, last_played:d.last||null,
  },{onConflict:'user_id,game'});
}

// Сверка при входе: если играли с другого устройства — подтягиваем
// более свежие данные с сервера, а не наоборот перезатираем их старым
// локальным состоянием.
async function reconcileStreak(){
  const local=loadSD();
  const{data:remote}=await SB.from('daily_streaks').select('*').eq('user_id',sbUser.id).eq('game','peak_master').maybeSingle();
  if(!remote){await syncStreakToSupabase(local);return;}

  if(remote.last_played&&(!local.last||remote.last_played>local.last)){
    const merged={streak:remote.streak,best:Math.max(remote.best_streak,local.best||0),last:remote.last_played,chDone:local.chDate===TODAY?local.chDone:0,chDate:local.chDate,freezes:local.freezes||0};
    localStorage.setItem('mp_sd',JSON.stringify(merged));
    updateStreakUI(merged);
  }else if(local.last&&(!remote.last_played||local.last>remote.last_played)){
    await syncStreakToSupabase(local);
  }else if(remote.streak>local.streak||remote.best_streak>local.best){
    const merged={...local,streak:Math.max(local.streak,remote.streak),best:Math.max(local.best,remote.best_streak)};
    localStorage.setItem('mp_sd',JSON.stringify(merged));
    updateStreakUI(merged);
  }
}

// ══════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════
const SB=supabase.createClient('https://mwzskffecoedpvyflswg.supabase.co','sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD');
async function logout(){await SB.auth.signOut();location.href='auth.html';}
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(session){
    sbUser=session.user;
    if(window.updateLastSeen)updateLastSeen(SB,sbUser.id);
    const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
    sbProfile=p;
    if(window.enforceBanGate&&enforceBanGate(SB,p))return;
    if(p){
      const nb=document.getElementById('navProfile');
      if(nb){ nb.innerHTML=ICON_USER; nb.appendChild(document.createTextNode(p.username)); }
      const ab=document.getElementById('navAdmin');
      if(ab&&['VERIFIED_PRO','MENTOR','ADMIN'].includes(p.role)) ab.style.display='';
    }
    const notifMount=document.getElementById('notifMount');
    if(notifMount)mountNotifications(SB,notifMount,sbUser.id);
    await reconcileStreak();
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

// Стилизованная кривая полки (shelf) — плавный переход через corner-частоту
// к постоянному уровню gainDB с одной стороны, и 0 дБ с другой.
function buildShelfPath(hz,gainDB,isHigh){
  let d='';
  const k=3.2; // крутизна перехода в декадах log10(f)
  for(let px=0;px<=1240;px+=4){
    const f=Math.pow(10,LO+(px/1240)*(HI-LO));
    const t=(Math.log10(f)-Math.log10(hz))*k;
    const shape=isHigh?1/(1+Math.exp(-t)):1/(1+Math.exp(t));
    const db=gainDB*shape;
    const y=dbToSvgY(db);
    d+=(px===0?'M':'L')+px.toFixed(1)+','+y.toFixed(1);
  }
  return d;
}

function updateGraph(showCurve, color, label){
  const eqPath=document.getElementById('eqPath');
  const peakLine=document.getElementById('peakLine');
  const peakTag=document.getElementById('peakTag');
  const peakFreqLabel=document.getElementById('peakFreqLabel');

  if(showCurve && target){
    const sign=lastCutApplied?-1:1;
    const g=comparing?0:sign*(trainMode?trainCfg.gain:getBoostForPhase());
    const q=trainMode?trainCfg.q:getQForPhase();
    eqPath.setAttribute('d', isShelfMode ? buildShelfPath(target,g,isHighShelf) : buildEQPath(target,g,q));
    eqPath.style.stroke=color||'#34e0c4';
    eqPath.style.filter=color?`drop-shadow(0 0 7px ${color}88)`:'drop-shadow(0 0 7px rgba(52,224,196,.7))';

    const x=fToSvgX(target);
    peakLine.setAttribute('x1',x);peakLine.setAttribute('x2',x);
    peakLine.style.opacity=comparing?'0':'.6';
    // Клампим % (не саму линию — только подпись), иначе на краях диапазона
    // (около 20 Гц или 16-20k) подпись обрезается о край карточки графика.
    peakTag.style.left=Math.max(6,Math.min(94,x/1240*100))+'%';
    peakTag.style.opacity=comparing?'0':'1';
    peakFreqLabel.textContent=fmtF(target)+' Hz';
    document.getElementById('peakBoostLabel').textContent=label||'С БУСТОМ';
  } else {
    eqPath.setAttribute('d','M0,100 L1240,100');
    peakLine.style.opacity='0';
    peakTag.style.opacity='0';
  }
}

// Доп. полосы (2я/3я в тренировке, вторая в hard-режиме) — метки на графике после ответа
function clearExtraBandMarkers(){
  document.querySelectorAll('.pm-extra-band-line,.pm-extra-band-tag').forEach(el=>el.remove());
}
function drawExtraBandMarker(freq,i){
  const svg=document.getElementById('eqSvg');
  const x=fToSvgX(freq);
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('class','pm-extra-band-line');
  line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('y1',0);line.setAttribute('y2',200);
  line.setAttribute('stroke','rgba(251,146,60,.55)');line.setAttribute('stroke-width','1.5');line.setAttribute('stroke-dasharray','3 5');
  svg.appendChild(line);

  const tag=document.createElement('div');
  tag.className='pm-extra-band-tag';
  const top=40+i*22; // ступеньками вниз, чтобы не наезжать друг на друга и на бейдж С БУСТОМ
  tag.style.cssText='position:absolute;top:'+top+'px;left:'+(x/1240*100)+'%;transform:translateX(-50%);font-family:JetBrains Mono,monospace;font-size:10px;font-weight:700;color:#fb923c;background:rgba(10,11,22,.85);padding:2px 6px;border-radius:5px;border:1px solid rgba(251,146,60,.4);white-space:nowrap;pointer-events:none;z-index:5';
  tag.textContent=fmtF(freq)+' Hz';
  document.querySelector('.pm-graph-inner').appendChild(tag);
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

// ── РЕЖИМ "МОИ ТРЕКИ" ──
async function loadTrackManifest(){
  try{
    const res=await fetch('../audio/tracks.json');
    if(!res.ok)return;
    const list=await res.json();
    if(Array.isArray(list)&&list.length){
      trackManifest=list;
      document.getElementById('sourceToggleRow').style.display='block';
    }
  }catch(e){ /* нет файла — режим треков просто не показываем */ }
}

async function getTrackBuffer(){
  const name=trackManifest[Math.floor(Math.random()*trackManifest.length)];
  if(trackCache[name]) return trackCache[name];
  try{
    const res=await fetch('../audio/tracks/'+name);
    const arr=await res.arrayBuffer();
    const buf=await actx.decodeAudioData(arr);
    trackCache[name]=buf;
    return buf;
  }catch(e){
    console.warn('Не удалось загрузить трек:',name,e);
    return null;
  }
}

function setSource(s,btn){
  guessSource=s;
  document.querySelectorAll('#sourceChips .train-chip').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

async function startAudio(){
  stopAudio();
  if(!actx||actx.state==='closed') actx=new(window.AudioContext||window.webkitAudioContext)();
  if(actx.state==='suspended') await actx.resume();

  let srcBuf;
  if(guessSource==='tracks' && trackManifest.length){
    srcBuf=await getTrackBuffer();
  }
  if(!srcBuf){
    if(!noiseBuf||noiseBuf.sampleRate!==actx.sampleRate) noiseBuf=makePink(actx,20);
    srcBuf=noiseBuf;
  }

  srcNode=actx.createBufferSource();
  srcNode.buffer=srcBuf;srcNode.loop=true;
  buildAudioChain(actx);
  if(comparing){
    filtNode.gain.value=0;
    if(filtNode2) filtNode2.gain.value=0;
    if(filtNode3) filtNode3.gain.value=0;
  }
  gainNode=actx.createGain();
  gainNode.gain.value=0;
  // Полосы включаются последовательно: source -> filt1 -> [filt2] -> [filt3] -> gain -> output
  srcNode.connect(filtNode);
  let lastNode=filtNode;
  if(filtNode2){lastNode.connect(filtNode2);lastNode=filtNode2;}
  if(filtNode3){lastNode.connect(filtNode3);lastNode=filtNode3;}
  lastNode.connect(gainNode);
  gainNode.connect(actx.destination);
  srcNode.start();
  const t=actx.currentTime;
  gainNode.gain.setValueAtTime(0,t);
  gainNode.gain.linearRampToValueAtTime(muted?0:vol*.75,t+.1);
  playing=true;
  const pb=document.getElementById('playBtn');
  pb.classList.add('playing');
  pb.setAttribute('aria-label','Пауза');
  pb.innerHTML='<div class="pm-pause"><span class="pm-pause-bar"></span><span class="pm-pause-bar"></span></div>';
  if(qStart===0){qStart=Date.now();maybeStartAnswerTimer();}
  document.getElementById('hint').textContent=comparing?'Оригинал без буста':'С EQ бустом — слушай';
}

function stopAudio(){
  if(raf){cancelAnimationFrame(raf);raf=null;}
  const os=srcNode,of=filtNode,of2=filtNode2,of3=filtNode3,og=gainNode;
  srcNode=null;filtNode=null;filtNode2=null;filtNode3=null;gainNode=null;
  playing=false;
  const pb=document.getElementById('playBtn');
  pb.classList.remove('playing');
  pb.setAttribute('aria-label','Слушать');
  pb.innerHTML='<div class="pm-play-triangle"></div>';
  if(!os)return;
  if(og&&actx&&actx.state!=='closed'){
    const t=actx.currentTime;og.gain.setValueAtTime(og.gain.value,t);og.gain.linearRampToValueAtTime(0,t+.08);
  }
  setTimeout(()=>{try{os.stop();os.disconnect();}catch(e){}try{if(of)of.disconnect();}catch(e){}try{if(of2)of2.disconnect();}catch(e){}try{if(of3)of3.disconnect();}catch(e){}try{if(og)og.disconnect();}catch(e){}},100);
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
  if(filtNode3&&actx) filtNode3.gain.setTargetAtTime(0,actx.currentTime,.015);
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
  if(!comparing)return;
  comparing=false;
  document.getElementById('cmpBtn').classList.remove('active');
  document.getElementById('modeBadge').textContent='С БУСТОМ';
  document.getElementById('modeBadge').classList.remove('comparing');
  const curBoost = trainMode?trainCfg.gain:getBoostForPhase();
  const curSign = isCutMode?-1:1;
  if(filtNode&&actx) filtNode.gain.setTargetAtTime(curBoost*curSign,actx.currentTime,.015);
  if(filtNode2&&actx) filtNode2.gain.setTargetAtTime(curBoost*curSign*0.85,actx.currentTime,.015);
  if(filtNode3&&actx) filtNode3.gain.setTargetAtTime(curBoost*curSign*0.7,actx.currentTime,.015);
  if(playing) document.getElementById('hint').textContent='С EQ бустом — слушай';
  document.getElementById('modeBadge').textContent='С БУСТОМ';
  document.getElementById('modeBadge').classList.remove('comparing');
}

// ══════════════════════════════════════
//  VOLUME
// ══════════════════════════════════════
const ICON_USER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_VOL_HIGH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const ICON_VOL_LOW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const ICON_VOL_MUTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
// Иконки вместо оставшихся эмодзи в попапах/подсказках/туре.
// width/height-атрибуты — разумный размер по умолчанию (CSS в контексте,
// где он есть, всё равно перебивает атрибуты — см. .pts-pop svg и т.п.)
const ICON_SNOWFLAKE='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M4.2 7l15.6 10M4.2 17l15.6-10"/></svg>';
const ICON_BULB='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
const ICON_TARGET='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
const ICON_BOOK='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';
const ICON_TRENDUP='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';
const ICON_GRAD='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';
function setVolume(v){
  vol=v/100;muted=false;
  document.getElementById('volFill').style.width=v+'%';
  document.getElementById('volDot').style.left=v+'%';
  document.getElementById('volPct').textContent=v+'%';
  const icon=document.querySelector('.pm-vol-icon');
  icon.innerHTML=v==0?ICON_VOL_MUTE:v<40?ICON_VOL_LOW:ICON_VOL_HIGH;
  icon.setAttribute('aria-label','Выключить звук');
  if(gainNode&&actx) gainNode.gain.setTargetAtTime(vol*.75,actx.currentTime,.02);
}
function toggleMute(){
  const s=document.getElementById('volFill');
  if(muted){muted=false;setVolume(Math.round(vol*100||70));}
  else{muted=true;const icon=document.querySelector('.pm-vol-icon');icon.innerHTML=ICON_VOL_MUTE;icon.setAttribute('aria-label','Включить звук');if(gainNode&&actx)gainNode.gain.setTargetAtTime(0,actx.currentTime,.02);}
}

// ══════════════════════════════════════
//  GAME
// ══════════════════════════════════════
function setDiff(d,btn){
  diff=d;
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function backToModeSelect(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scrModeSelect').classList.add('active');
}

function openSetupPlay(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scrSetupPlay').classList.add('active');
}

function startGame(){
  sessionRound=0;sessionScore=0;sessionResults=[];
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scrGame').classList.add('active');
  updateScoreUI();newRound();
  if(!trainMode&&!challengeMode&&!localStorage.getItem('pm_tour_seen')){
    setTimeout(()=>startTour(false),400);
  }
}

function showSessionSummary(){
  stopAudio();
  document.getElementById('scrGame').classList.remove('active');
  document.getElementById('summaryScore').textContent='+'+sessionScore.toLocaleString('ru');
  const right=sessionResults.filter(Boolean).length;
  const pct=Math.round(right/sessionResults.length*100);
  const dots=document.getElementById('summaryDots');dots.innerHTML='';
  sessionResults.forEach(ok=>{
    const d=document.createElement('div');
    d.className='pm-dot '+(ok?'done':'');
    if(!ok) d.style.cssText='background:rgba(248,113,113,.5)';
    dots.appendChild(d);
  });
  const msgs=[
    [90,'Невероятная сессия! Слух как у мастеринг-инженера. 🏆'],
    [70,'Отличный результат — точность на высоте!'],
    [50,'Неплохо! Ещё немного практики — и будет стабильно.'],
    [30,'Есть над чем поработать, но прогресс уже виден.'],
    [0,'Каждая сессия тренирует слух. Продолжай!'],
  ];
  document.getElementById('summaryMsg').textContent=(msgs.find(m=>pct>=m[0])||msgs[msgs.length-1])[1]+' Точность: '+pct+'%';
  const ov=document.getElementById('summaryOverlay');
  ov.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add('show')));
}

function closeSummaryOverlay(){
  const ov=document.getElementById('summaryOverlay');
  ov.classList.remove('show');
  setTimeout(()=>ov.classList.remove('open'),200);
}

function continueSession(){
  closeSummaryOverlay();
  sessionRound=0;sessionScore=0;sessionResults=[];
  document.getElementById('scrGame').classList.add('active');
  newRound();
}

function backToMenuFromSummary(){
  closeSummaryOverlay();
  document.getElementById('scrModeSelect').classList.add('active');
}

function newRound(){
  stopAudio();
  answered=false;picked=null;qStart=0;comparing=false;
  if(!trainMode&&!challengeMode) sessionRound++;

  const set=trainMode?(FREQ_RANGES[trainCfg.range]||FREQ_RANGES.all):SETS[diff];
  target=pickTarget(set);
  document.getElementById('rn').textContent=round;
  document.getElementById('diffLabel').textContent={easy:'Легко',medium:'Средне',hard:'Сложно'}[diff];
  document.getElementById('fbMain').textContent='';
  document.getElementById('fbMain').className='pm-fb-main';
  document.getElementById('fbSub').textContent='';
  document.getElementById('hint').textContent='Нажми ▶ чтобы начать слушать';

  // Показываем фазу для hard и лёгкого (плавный рост сложности)
  const diffLabelEl = document.getElementById('diffLabel');
  const progEl = document.getElementById('phaseProgress');
  if(diff==='hard' && !trainMode){
    const phase=getHardPhase();
    const phases=['','Одна полоса','Шире пик','2 полосы','Буст/Срез','+ Полка и таймер'];
    diffLabelEl.textContent='Сложно · '+phases[phase];
    if(progEl){progEl.style.display='block';progEl.textContent=getPhaseProgressText();}
  } else if(diff==='easy' && !trainMode){
    const phase=getEasyPhase();
    const phases=['','Разминка','Знакомство','Почти готов','Финальный рывок'];
    diffLabelEl.textContent='Легко · '+phases[phase];
    if(progEl){progEl.style.display='block';progEl.textContent=getPhaseProgressText();}
  } else if(trainMode){
    diffLabelEl.textContent='Тренировка';
    if(progEl)progEl.style.display='none';
  } else {
    if(progEl)progEl.style.display='none';
  }

  // Надпись режима (буст/срез/полка)
  const modeB=document.getElementById('modeBadge');
  if(modeB){
    let txt=isCutMode?'СО СРЕЗОМ':'С БУСТОМ';
    if(isShelfMode) txt=(isCutMode?'СРЕЗ':'БУСТ')+' ПОЛКОЙ';
    modeB.textContent=txt;
  }

  // Multi-band hint
  const ml=document.getElementById('multiLabel');
  if(ml) ml.style.display=(targets2.length>0||(trainMode&&trainCfg.bands>=2))?'block':'none';
  document.getElementById('modeBadge').classList.remove('comparing');
  document.getElementById('cmpBtn').classList.remove('active');
  const tb=document.getElementById('tipBox');tb.style.display='none';tb.textContent='';
  const fl=document.getElementById('freqLabel');
  if(fl)fl.textContent=isShelfMode?'Найди частоту среза полки':(isCutMode?'Найди срез частоты':'Выбери частоту буста');
  const nb=document.getElementById('nextBtn');nb.style.display='none';
  const rb=document.getElementById('revealBtn');rb.style.display='none';
  // Graph — пустая кривая
  updateGraph(false);
  clearExtraBandMarkers();
  clearAnswerTimer();

  // Сброс гипотезы — воротики видны полупрозрачно по центру, ждут перетаскивания
  guessFrac=0.5;dragging=false;
  document.getElementById('guessLine').style.opacity='0';
  document.getElementById('guessTag').style.opacity='0';
  document.getElementById('guessGate').classList.remove('active');
  updateGuessGate(0.5);
  const gt=document.getElementById('graphTouch');if(gt)gt.style.pointerEvents='auto';
}

function sliderToFreq(v){return Math.pow(10,LO+v*(HI-LO))}

// ── Угадывание прямо на графике: тронул → провёл → отпустил ──
function graphFracFromEvent(e){
  const svg=document.getElementById('eqSvg');
  const rect=svg.getBoundingClientRect();
  const clientX=(e.touches&&e.touches[0])?e.touches[0].clientX:e.clientX;
  return Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
}

function updateGuessLine(v){
  const gl=document.getElementById('guessLine');
  if(!gl)return;
  const x=v*1240;
  gl.setAttribute('x1',x);gl.setAttribute('x2',x);
  gl.style.opacity=answered?'0':'.9';
}

function updateGuessTag(v){
  const tag=document.getElementById('guessTag');
  const label=document.getElementById('guessFreqTag');
  if(!tag)return;
  tag.style.left=(v*100)+'%';
  tag.style.opacity=answered?'0':'1';
  label.textContent=fmtF(Math.round(sliderToFreq(v)))+' Hz';
}

function updateGuessGate(v){
  const gate=document.getElementById('guessGate');
  if(!gate)return;
  gate.style.left=(v*100)+'%';
}

function setGuessFraction(v){
  guessFrac=v;
  updateGuessLine(v);
  updateGuessTag(v);
  updateGuessGate(v);
}

function graphPointerDown(e){
  if(answered)return;
  if(qStart===0){
    // Ещё не начали слушать — угадывать рано
    nudgePlayButton();
    e.preventDefault();
    return;
  }
  dragging=true;
  document.getElementById('guessGate').classList.add('active');
  setGuessFraction(graphFracFromEvent(e));
  e.preventDefault();
}

function nudgePlayButton(){
  const hint=document.getElementById('hint');
  const pb=document.getElementById('playBtn');
  const prev=hint.textContent;
  hint.textContent='Сначала нажми ▶ — послушай звук';
  pb.classList.add('nudge');
  setTimeout(()=>{pb.classList.remove('nudge');if(!playing)hint.textContent=prev;},900);
}
function graphPointerMove(e){
  if(!dragging||answered)return;
  setGuessFraction(graphFracFromEvent(e));
  e.preventDefault();
}
function graphPointerUp(e){
  if(!dragging)return;
  dragging=false;
  if(answered)return;
  submitGuess();
}

function graphHoverMove(e){
  if(dragging||answered||qStart===0)return;
  setGuessFraction(graphFracFromEvent(e));
}
function graphHoverLeave(){
  if(dragging||answered)return;
  const tag=document.getElementById('guessTag');
  if(tag)tag.style.opacity='0';
}

function submitGuess(){
  if(answered)return;
  picked=sliderToFreq(guessFrac);
  checkAnswer();
}

// ── Таймер на ответ (только "Сложно", фаза 3+) ──
const ANSWER_TIMER_PHASE=3, ANSWER_TIMER_SECONDS=10;
let answerTimerId=null, answerDeadline=0;

function maybeStartAnswerTimer(){
  clearAnswerTimer();
  if(trainMode||diff!=='hard'||getHardPhase()<ANSWER_TIMER_PHASE)return;
  const wrap=document.getElementById('answerTimerWrap');
  if(!wrap)return;
  wrap.style.display='flex';
  answerDeadline=Date.now()+ANSWER_TIMER_SECONDS*1000;
  tickAnswerTimer();
  answerTimerId=setInterval(tickAnswerTimer,200);
}
function tickAnswerTimer(){
  const left=Math.max(0,answerDeadline-Date.now());
  const secs=Math.ceil(left/1000);
  const num=document.getElementById('answerTimerNum');
  if(num)num.textContent=secs;
  const fill=document.getElementById('answerTimerFill');
  if(fill)fill.style.width=(left/(ANSWER_TIMER_SECONDS*1000)*100)+'%';
  const wrap=document.getElementById('answerTimerWrap');
  if(wrap)wrap.classList.toggle('urgent',secs<=3);
  if(left<=0){
    clearAnswerTimer();
    handleAnswerTimeout();
  }
}
function clearAnswerTimer(){
  if(answerTimerId){clearInterval(answerTimerId);answerTimerId=null;}
  const wrap=document.getElementById('answerTimerWrap');
  if(wrap){wrap.style.display='none';wrap.classList.remove('urgent');}
}
function handleAnswerTimeout(){
  if(answered||!qStart)return;
  picked=sliderToFreq(guessFrac);
  checkAnswer(true);
}

function checkAnswer(timedOut){
  if(!picked||answered)return;
  answered=true;
  stopAudio();
  clearAnswerTimer();

  const elapsed=(Date.now()-qStart)/1000;
  const dist=Math.abs(Math.log2(picked/target));
  const tol=getTolerance();
  const ok=!timedOut&&dist<=tol;
  const accuracy=ok?Math.pow(Math.max(0,1-dist/tol),2):0;
  const isPerfect=ok&&dist<=tol*PERFECT_FRAC;
  let earned=0;
  totalAns++;

  const gt=document.getElementById('graphTouch');if(gt)gt.style.pointerEvents='none';
  updateGuessLine(guessFrac);
  updateGuessTag(guessFrac);

  // EQ кривая
  // Подсвечиваем вторую/третью полосу если были (hard-режим или тренировка)
  const ml2=document.getElementById('multiLabel');if(ml2)ml2.style.display='none';
  clearExtraBandMarkers();
  const extraBands=[];
  if(targets2.length>0) extraBands.push(targets2[0]);
  if(trainBand2Freq) extraBands.push(trainBand2Freq);
  if(trainBand3Freq) extraBands.push(trainBand3Freq);
  extraBands.forEach((f,i)=>drawExtraBandMarker(f,i));
  const revColor=ok?'rgba(74,222,128,.9)':'rgba(248,113,113,.7)';
  updateGraph(true,revColor,ok?'✓ ВЕРНО':'✗ НЕВЕРНО');
  document.getElementById('peakBoostLabel').style.background=ok?'var(--green)':'var(--red)';
  document.getElementById('peakBoostLabel').style.color=ok?'#0a0b16':'#fff';

  let perfectBonus=0;
  if(ok){
    totalRight++;streak++;
    const spd=Math.max(0,Math.round(50*Math.max(0,1-elapsed/8)));
    const mult=streak>=5?2:streak>=3?1.5:1;
    let base=trainMode?80:BASE[diff];
    earned=Math.round((base*(0.4+0.6*accuracy)+spd)*mult);
    if(isPerfect){
      perfectBonus=Math.round(base*0.5);
      earned+=perfectBonus;
    }
    if(!trainMode){score+=earned;localStorage.setItem('pm_s',score);}
    sessionScore+=earned;
    showTip(target);
    if(isPerfect){playPerfectSound();ptsPopup(ICON_TARGET+'В ЯБЛОЧКО! +'+earned,true);}
    else{playSuccessSound();ptsPopup('+'+earned);}
    if(!trainMode){setTimeout(saveScore,300);}
    if(!trainMode) updateChallenge();
    // Считаем hard раунды
    if(diff==='hard'&&!trainMode){
      hardRounds++;localStorage.setItem('pm_hard_rounds',hardRounds);
    }
    if(diff==='easy'&&!trainMode){
      const et=parseInt(localStorage.getItem('pm_easy_total')||'0')+1;
      localStorage.setItem('pm_easy_total',et);
      if(et===EASY_GRADUATE_AT){
        setTimeout(()=>{
          const n=document.createElement('div');
          n.style.cssText='position:fixed;top:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#a78bfa,#22d3ee);color:#0a0b16;font-family:Unbounded,sans-serif;font-weight:700;font-size:13px;padding:12px 24px;border-radius:10px;z-index:9999;animation:fup 3s ease-out forwards;text-align:center;display:flex;align-items:center;gap:8px;justify-content:center';
          n.innerHTML=ICON_GRAD+'Ты прошёл разминку! Пора попробовать «Средний» уровень';
          document.body.appendChild(n);setTimeout(()=>n.remove(),3500);
        },500);
      }
    }
  } else { streak=0; playWrongSound(); }

  sessionResults.push(ok);

  // Фидбек
  const fm=document.getElementById('fbMain');
  const fs=document.getElementById('fbSub');
  fm.className='pm-fb-main '+(ok?'ok':'no');
  if(ok){
    fm.innerHTML=isPerfect?ICON_TARGET+'В яблочко!':'✓ Верно!';
    fs.innerHTML=fmtF(target)+' Hz · +'+earned+' pts'+(streak>=3?' · '+FLAME_INLINE+'×'+streak:'');
  } else {
    fm.textContent=timedOut?'⏱ Время вышло':'✗ Неверно';
    fs.textContent='Это был '+fmtF(target)+' Hz'+(timedOut?'':' — слушай ещё раз');
  }

  updateScoreUI();

  // Тумблер показать/скрыть буст
  revealShown=true;
  const rb=document.getElementById('revealBtn');
  rb.style.display='block';
  rb.textContent='Скрыть буст';

  // Кнопка Далее
  const nb=document.getElementById('nextBtn');
  nb.style.display='block';
  nb.textContent='Далее →';
}

function toggleReveal(){
  if(!answered)return;
  revealShown=!revealShown;
  const rb=document.getElementById('revealBtn');
  if(revealShown){
    const ok=roundWasOk();
    const revColor=ok?'rgba(74,222,128,.9)':'rgba(248,113,113,.7)';
    updateGraph(true,revColor,ok?'✓ ВЕРНО':'✗ НЕВЕРНО');
    rb.textContent='Скрыть буст';
  } else {
    updateGraph(false);
    rb.textContent='Показать буст';
  }
}
function roundWasOk(){
  if(!picked||!target)return false;
  const dist=Math.abs(Math.log2(picked/target));
  return dist<=getTolerance();
}

function nextRound(){
  round++;
  if(!trainMode&&!challengeMode&&sessionRound>=10){
    showSessionSummary();
    return;
  }
  newRound();
}

// ══════════════════════════════════════
//  DAILY STREAK
// ══════════════════════════════════════
const FREEZE_COST=300;
const FREEZE_MAX=2;

const FLAME_PATH='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const FLAME_UNLIT=`<svg viewBox="0 0 24 24"><path fill="rgba(255,255,255,.22)" d="${FLAME_PATH}"/></svg>`;
const FLAME_LIT=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradLit" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradLit)" d="${FLAME_PATH}"/></svg>`;
const FLAME_HOT=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradHot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f87171"/><stop offset=".5" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradHot)" d="${FLAME_PATH}"/></svg>`;
const FLAME_POPUP=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradPopup" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradPopup)" d="${FLAME_PATH}"/></svg>`;
const FLAME_INLINE=`<svg viewBox="0 0 24 24" fill="currentColor" style="width:.85em;height:.85em;vertical-align:-.1em;display:inline-block"><path d="${FLAME_PATH}"/></svg>`;

function initStreak(){
  const d=loadSD();
  const yest=dateStr(-1), twoAgo=dateStr(-2);
  if(d.last&&d.last!==TODAY&&d.last!==yest&&d.streak>0){
    if((d.freezes||0)>0&&d.last===twoAgo){
      d.freezes--;d.last=yest;saveSD(d);
      showStreakPopup(d.streak,'freeze');
    }else{
      d.streak=0;saveSD(d);showStreakPopup(0,'lost');
    }
  }
  updateStreakUI(d);
}

// Стрик продлевается не за любой ответ, а именно за выполнение
// дневного челленджа (5/5) — так понятнее и совпадает с тем, что
// показывают дневные точки на баннере.
function updateDailyStreak(){
  const d=loadSD();
  if(d.last!==TODAY){
    const yest=dateStr(-1);
    d.streak=(d.last===yest?d.streak:0)+1;
    d.best=Math.max(d.best,d.streak);d.last=TODAY;saveSD(d);
    if([3,7,14,30,60,100].includes(d.streak)) showStreakPopup(d.streak,'milestone');
  }
  updateStreakUI(d);
}

function updateStreakUI(d){
  const n=d.streak||0;
  document.getElementById('streakNum').textContent=n;
  const icon=document.getElementById('streakIcon');
  if(n<=0){icon.innerHTML=FLAME_UNLIT;icon.className='pm-streak-icon';}
  else if(n<7){icon.innerHTML=FLAME_LIT;icon.className='pm-streak-icon lit';}
  else{icon.innerHTML=FLAME_HOT;icon.className='pm-streak-icon lit hot';}

  const freezes=d.freezes||0;
  document.getElementById('freezeCount').textContent=freezes;
  const buyBtn=document.getElementById('freezeBuyBtn');
  if(freezes>=FREEZE_MAX){buyBtn.textContent='макс.';buyBtn.disabled=true;}
  else{buyBtn.textContent='за '+FREEZE_COST;buyBtn.disabled=false;}

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
    updateStreakUI(d);
    if(d.chDone===5){
      score+=250;localStorage.setItem('pm_s',score);updateScoreUI();ptsPopup('+250 '+ICON_TARGET);
      updateDailyStreak();
    }
  }
}

function buyFreeze(){
  const d=loadSD();
  if((d.freezes||0)>=FREEZE_MAX)return;
  if(score<FREEZE_COST){ptsPopup('Нужно ещё '+(FREEZE_COST-score)+' очков');return;}
  score-=FREEZE_COST;localStorage.setItem('pm_s',score);updateScoreUI();
  d.freezes=(d.freezes||0)+1;saveSD(d);
  updateStreakUI(d);
  ptsPopup(ICON_SNOWFLAKE+'Заморозка куплена');
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
  document.getElementById('streakEmoji').innerHTML=type==='lost'?FLAME_UNLIT:type==='freeze'?ICON_SNOWFLAKE:FLAME_POPUP;
  document.getElementById('streakN').textContent=n;
  document.getElementById('streakN').style.color=type==='lost'?'var(--red)':type==='freeze'?'#7dd3fc':'var(--gold)';
  const msgs={3:['3 дня подряд!','Хорошее начало — не останавливайся!'],7:['Неделя!','7 дней ежедневной практики. Ты молодец.'],14:['Две недели!','Привычка формируется за 21 день — ты на пути.'],30:['30 дней! 🏆','Месяц. Это уже серьёзно.'],60:['60 дней! 👑','Два месяца без перерыва. Профессиональная дисциплина.'],100:['100 ДНЕЙ! 🌟','Легендарный стрик. Ты звезда.']};
  if(type==='lost'){document.getElementById('streakT').textContent='Стрик потерян';document.getElementById('streakS').textContent='Ты пропустил день. Начинай заново!';}
  else if(type==='freeze'){document.getElementById('streakT').textContent='Стрик защищён';document.getElementById('streakS').textContent='Заморозка спасла твою серию из '+n+' дней. Не забудь сыграть сегодня!';}
  else{const[t,s]=msgs[n]||[n+' дней!','Продолжай!'];document.getElementById('streakT').textContent=t;document.getElementById('streakS').textContent=s;}
  ov.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add('show')));
}
function closeStreak(){
  const ov=document.getElementById('streakOverlay');
  ov.classList.remove('show');
  setTimeout(()=>ov.classList.remove('open'),200);
}

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
  el.innerHTML=ICON_BULB+getTip(hz);
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

// ── ЗВУК ИДЕАЛЬНОГО ПОПАДАНИЯ ──
function playPerfectSound() {
  try {
    const ctx = (actx && actx.state !== 'closed') ? actx : new (window.AudioContext || window.webkitAudioContext)();
    const isNew = ctx !== actx;
    if(ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    const notes = [784, 988, 1175, 1568]; // G5, B5, D6, G6 — яркий восходящий аккорд
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.06;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + 0.75);
    });
    if(isNew) setTimeout(() => { try{ctx.close();}catch(e){} }, 1400);
  } catch(e) {}
}

// ── ЗВУК НЕВЕРНОГО ОТВЕТА ──
function playWrongSound() {
  try {
    const ctx = (actx && actx.state !== 'closed') ? actx : new (window.AudioContext || window.webkitAudioContext)();
    const isNew = ctx !== actx;
    if(ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.32);
    if(isNew) setTimeout(() => { try{ctx.close();}catch(e){} }, 500);
  } catch(e) {}
}


// ══════════════════════════════════════
//  PROGRESSIVE DIFFICULTY (Hard)
// ══════════════════════════════════════
let hardRounds = parseInt(localStorage.getItem('pm_hard_rounds') || '0');
let targets2 = []; // вторая полоса (multi-band)
let isCutMode = false; // режим среза
let isShelfMode = false; // режим полки вместо колокола
let isHighShelf = false; // полка сверху или снизу от частоты
let lastCutApplied = false; // фактический знак (буст/срез), применённый в текущем раунде — источник правды для графика-разгадки

const HARD_PHASE_BOUNDS = [0,20,40,60,80];

function getHardPhase() {
  if (hardRounds < 20) return 1; // обычный буст
  if (hardRounds < 40) return 2; // более широкий/размытый пик
  if (hardRounds < 60) return 3; // 2 полосы (найди сильнейшую)
  if (hardRounds < 80) return 4; // иногда CUT вместо boost
  return 5; // иногда ПОЛКА вместо колокола + таймер на ответ
}

// Плавный рост сложности внутри "Лёгкого" — готовит к переходу на "Средний"
function getEasyPhase() {
  const n = parseInt(localStorage.getItem('pm_easy_total') || '0');
  if (n < 8) return 1;  // разминка — громкий буст, широкий допуск
  if (n < 16) return 2;
  if (n < 24) return 3;
  return 4;              // почти как "Средний"
}
const EASY_GRADUATE_AT = 32;

function getTolerance() {
  if (diff === 'easy' && !trainMode) {
    const phase = getEasyPhase();
    if (phase >= 4) return 0.32;
    if (phase >= 3) return 0.40;
    if (phase >= 2) return 0.46;
    return 0.6;
  }
  return TOLERANCE[diff] || TOLERANCE.medium;
}

const EASY_PHASE_BOUNDS = [0,8,16,24,32];

// Понятная подпись прогресса внутри фазы — чтобы игрок видел рост сложности, а не гадал
function getPhaseProgressText() {
  if (diff === 'hard') {
    const phase = getHardPhase();
    if (phase >= 5) return hardRounds + ' верных с начала — все механики сложного уже открыты';
    const start = HARD_PHASE_BOUNDS[phase - 1], end = HARD_PHASE_BOUNDS[phase];
    return (hardRounds - start) + '/' + (end - start) + ' до следующей фазы';
  }
  if (diff === 'easy') {
    const n = parseInt(localStorage.getItem('pm_easy_total') || '0');
    if (n >= EASY_GRADUATE_AT) return 'Готов к переходу на «Средне»';
    const phase = getEasyPhase();
    const start = EASY_PHASE_BOUNDS[phase - 1], end = EASY_PHASE_BOUNDS[phase];
    return (n - start) + '/' + (end - start) + ' до следующей фазы';
  }
  return '';
}

function pickTarget(rawSet) {
  const phase = (diff === 'hard' && !trainMode) ? getHardPhase() : 1;
  isCutMode = false;
  isShelfMode = false;
  isHighShelf = false;
  targets2 = [];

  const phoneSet = rawSet.filter(f => f >= PHONE_MIN && f <= PHONE_MAX);
  const set = (phoneMode && phoneSet.length) ? phoneSet : rawSet;

  // Phase 4+: 30% вероятность среза
  if (phase >= 4 && Math.random() < 0.3) {
    isCutMode = true;
  }

  // Phase 5: 35% вероятность полки вместо колокола — одна полоса, без combo с 2-band
  if (phase >= 5 && Math.random() < 0.35) {
    isShelfMode = true;
    isHighShelf = Math.random() < 0.5;
    return set[Math.floor(Math.random() * set.length)];
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

function setPhoneMode(v){ phoneMode=v; }

function getBoostForPhase() {
  if (diff === 'hard') {
    const phase = getHardPhase();
    if (phase >= 3) return 6;
    if (phase >= 2) return 7;
    return BOOST.hard;
  }
  if (diff === 'easy' && !trainMode) {
    const phase = getEasyPhase();
    if (phase >= 4) return 9;
    if (phase >= 3) return 10;
    if (phase >= 2) return 11;
    return 14; // громче базового — максимально заметно на старте
  }
  return BOOST[diff];
}

function getQForPhase() {
  if (diff === 'hard') {
    const phase = getHardPhase();
    if (phase >= 3) return 0.7;
    if (phase >= 2) return 0.8;
    return QV.hard;
  }
  if (diff === 'easy' && !trainMode) {
    const phase = getEasyPhase();
    if (phase >= 4) return 1.1;
    if (phase >= 3) return 1.25;
    if (phase >= 2) return 1.4;
    return 1.8; // шире базового — легче услышать на старте
  }
  return QV[diff];
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
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scrTrain').classList.add('active');
}

function closeTrain() {
  document.getElementById('scrTrain').classList.remove('active');
  document.getElementById('scrModeSelect').classList.add('active');
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
let filtNode3 = null;
let trainBand2Freq = null, trainBand3Freq = null;

function buildAudioChain(ctx) {
  const gain = trainMode ? trainCfg.gain : getBoostForPhase();
  const q    = trainMode ? trainCfg.q   : getQForPhase();
  const cut  = trainMode ? (trainCfg.mode === 'cut' || (trainCfg.mode === 'both' && Math.random() < 0.5)) : isCutMode;
  lastCutApplied = cut;
  const shelf = !trainMode && isShelfMode;

  filtNode = ctx.createBiquadFilter();
  filtNode.type = shelf ? (isHighShelf ? 'highshelf' : 'lowshelf') : 'peaking';
  filtNode.frequency.value = target;
  if (!shelf) filtNode.Q.value = q;
  filtNode.gain.value = cut ? -gain : gain;

  filtNode2 = null;
  filtNode3 = null;
  trainBand2Freq = null;
  trainBand3Freq = null;

  if (!shelf && (targets2.length > 0 || (trainMode && trainCfg.bands >= 2))) {
    const t2 = targets2[0] || SETS.hard[Math.floor(Math.random() * SETS.hard.length)];
    filtNode2 = ctx.createBiquadFilter();
    filtNode2.type = 'peaking';
    filtNode2.frequency.value = t2;
    filtNode2.Q.value = q;
    filtNode2.gain.value = (cut ? -gain : gain) * 0.85;
    if (trainMode) trainBand2Freq = t2;
  }

  if (trainMode && trainCfg.bands >= 3) {
    const rangeSet = FREQ_RANGES[trainCfg.range] || FREQ_RANGES.all;
    const t3 = rangeSet[Math.floor(Math.random() * rangeSet.length)];
    filtNode3 = ctx.createBiquadFilter();
    filtNode3.type = 'peaking';
    filtNode3.frequency.value = t3;
    filtNode3.Q.value = q;
    filtNode3.gain.value = (cut ? -gain : gain) * 0.7;
    trainBand3Freq = t3;
  }
}


// ══════════════════════════════════════
//  SCORE UI
// ══════════════════════════════════════
function updateScoreUI(){
  document.getElementById('sv').textContent=score.toLocaleString('ru');
  document.getElementById('stv').innerHTML=streak+(streak>=3?FLAME_INLINE:'');
  let lvl=LEVELS[0],nxt=LEVELS[1];
  for(let i=0;i<LEVELS.length;i++){if(score>=LEVELS[i].m){lvl=LEVELS[i];nxt=LEVELS[i+1]||null;}}
  document.getElementById('lv').textContent=lvl.n;
  document.getElementById('lf').style.width=nxt?Math.round(((score-lvl.m)/(nxt.m-lvl.m))*100)+'%':'100%';
}

function ptsPopup(html,perfect){
  const el=document.createElement('div');
  el.className='pts-pop'+(perfect?' perfect':'');el.innerHTML=html;
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
//  ОБУЧАЮЩИЙ ТУР
// ══════════════════════════════════════
const TOUR_STEPS=[
  {sel:null,title:'Добро пожаловать в Peak Master',
    text:'Короткий тур покажет, что где находится и как играть. Займёт минуту — потом сразу начнёшь.'},
  {sel:'.pm-vol',title:ICON_VOL_HIGH+'Громкость',
    text:'Настрой удобный уровень перед стартом. Можно менять в любой момент прямо во время игры.'},
  {sel:'#playBtn',title:'▶ Слушай звук',
    text:'Нажми PLAY — услышишь шум с поднятой (или вырезанной) частотой. Это то, что нужно найти на слух.'},
  {sel:'#cmpBtn',title:'Сравнение A / B',
    text:'Зажми эту кнопку — услышишь оригинал без изменений. Отпусти — снова буст. Сравнивай туда-обратно.'},
  {sel:'.pm-graph-card',title:ICON_TARGET+'Угадывание на графике',
    text:'Нажми прямо на графике, веди до нужной частоты и отпусти — воротики (⊏ ⊐) показывают, где ты сейчас. Отпустил — ответ сразу засчитан.'},
  {sel:'.pm-freq-guide',title:ICON_BOOK+'Что где живёт',
    text:'Эта полоска — шпаргалка по диапазонам: слева бас и гул, посередине тело и разборчивость речи, справа — шипящие и воздух.'},
  {sel:'.pm-question',title:ICON_TRENDUP+'Сложность растёт сама',
    text:'В «Лёгком» уровне буст сначала громкий и допуск широкий. С каждым раундом — чуть тише и точнее, пока не подготовишься к «Среднему». Удачи!'},
];
let tourIdx=0, tourWasPlaying=false;

function startTour(manual){
  tourIdx=0;
  if(document.getElementById('scrGame').classList.contains('active')){
    tourWasPlaying=playing;
    if(playing) stopAudio();
  } else {
    // Тур запущен не из игры — откроем пробный раунд, чтобы было что показывать
    diff='easy';
    document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('on'));
    const easyBtn=document.querySelector('.diff-btn[onclick*="easy"]');
    if(easyBtn)easyBtn.classList.add('on');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('scrGame').classList.add('active');
    sessionRound=0;sessionScore=0;sessionResults=[];
    updateScoreUI();newRound();
  }
  document.body.classList.add('tour-lock');
  document.getElementById('tourOverlay').classList.add('open');
  showTourStep(0);
}

function positionTourUI(){
  if(!document.getElementById('tourOverlay').classList.contains('open'))return;
  const step=TOUR_STEPS[tourIdx];
  const spot=document.getElementById('tourSpotlight');
  const card=document.getElementById('tourCard');
  const el=step.sel?document.querySelector(step.sel):null;

  if(el){
    const r=el.getBoundingClientRect();
    const pad=8;
    spot.classList.remove('center');
    spot.style.left=(r.left-pad)+'px';
    spot.style.top=(r.top-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px';
    spot.style.height=(r.height+pad*2)+'px';

    const belowSpace=window.innerHeight-r.bottom;
    const cardTop=belowSpace>180?r.bottom+16:Math.max(16,r.top-16-260);
    let cardLeft=r.left+r.width/2-160;
    cardLeft=Math.max(16,Math.min(window.innerWidth-336,cardLeft));
    card.style.left=cardLeft+'px';
    card.style.top=cardTop+'px';
  } else {
    spot.classList.add('center');
    spot.style.left='50%';spot.style.top='50%';spot.style.width='0px';spot.style.height='0px';
    card.style.left=(window.innerWidth/2-160)+'px';
    card.style.top=(window.innerHeight/2-140)+'px';
  }
}

function showTourStep(i){
  tourIdx=i;
  const step=TOUR_STEPS[i];

  document.getElementById('tourStepN').textContent=(i+1)+' / '+TOUR_STEPS.length;
  document.getElementById('tourTitle').innerHTML=step.title;
  document.getElementById('tourText').textContent=step.text;
  document.getElementById('tourNextBtn').textContent=(i===TOUR_STEPS.length-1)?'Поехали! →':'Далее →';

  const el=step.sel?document.querySelector(step.sel):null;
  if(el){
    el.scrollIntoView({block:'center',behavior:'instant'});
    // Ждём кадр, чтобы scrollIntoView успел применить позицию перед замером
    requestAnimationFrame(()=>requestAnimationFrame(positionTourUI));
  } else {
    positionTourUI();
  }
}

function nextTourStep(){
  if(tourIdx>=TOUR_STEPS.length-1){endTour();return;}
  showTourStep(tourIdx+1);
}

function skipTour(){endTour();}

function endTour(){
  document.getElementById('tourOverlay').classList.remove('open');
  document.body.classList.remove('tour-lock');
  localStorage.setItem('pm_tour_seen','1');
  if(tourWasPlaying) startAudio();
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actx&&actx.state==='suspended')actx.resume();});
updateScoreUI();
initStreak();
sbInit();
loadTrackManifest();

// Угадывание прямо на графике: мышь и тач
const graphTouchEl=document.getElementById('graphTouch');
graphTouchEl.addEventListener('mousedown',graphPointerDown);
graphTouchEl.addEventListener('touchstart',graphPointerDown,{passive:false});
graphTouchEl.addEventListener('mousemove',graphHoverMove);
graphTouchEl.addEventListener('mouseleave',graphHoverLeave);
window.addEventListener('mousemove',graphPointerMove);
window.addEventListener('touchmove',graphPointerMove,{passive:false});
window.addEventListener('mouseup',graphPointerUp);
window.addEventListener('touchend',graphPointerUp);

// A/Б сравнение: если отпустить вне кнопки, подсветка не должна "залипать"
window.addEventListener('mouseup',endCompare);
window.addEventListener('touchend',endCompare);
window.addEventListener('mouseleave',endCompare);
