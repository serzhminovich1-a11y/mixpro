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
    const{data:best}=await SB.from('scores').select('score').eq('user_id',sbUser.id).eq('game','pan_trainer').order('score',{ascending:false}).limit(1).maybeSingle();
    if(best) bestDbScore=best.score;
    await reconcileStreak();
  }
}
async function saveScore(){
  if(!sbUser||!sbProfile||score<=bestDbScore) return;
  const{error}=await SB.from('scores').insert({user_id:sbUser.id,username:sbProfile.username,game:'pan_trainer',score,accuracy:totalAns>0?Math.round(totalRight/totalAns*100):0,streak,difficulty:diff,rounds:totalAns});
  if(!error) bestDbScore=score;
}

// ══════════════════════════════════════
//  DAILY STREAK (та же система, что в Peak Master — общая таблица daily_streaks,
//  но свой ключ 'pan_trainer' и своё локальное хранилище, не пересекается)
// ══════════════════════════════════════
const TODAY=new Date().toISOString().slice(0,10);
function dateStr(offsetDays){const d=new Date();d.setDate(d.getDate()+offsetDays);return d.toISOString().slice(0,10)}
function loadSD(){return JSON.parse(localStorage.getItem('pt_sd')||JSON.stringify({streak:0,best:0,last:'',chDone:0,chDate:'',freezes:0}))}
function saveSD(d){localStorage.setItem('pt_sd',JSON.stringify(d));syncStreakToSupabase(d)}

async function syncStreakToSupabase(d){
  if(!sbUser)return;
  await SB.from('daily_streaks').upsert({
    user_id:sbUser.id, game:'pan_trainer',
    streak:d.streak||0, best_streak:d.best||0, last_played:d.last||null,
  },{onConflict:'user_id,game'});
}

async function reconcileStreak(){
  const local=loadSD();
  const{data:remote}=await SB.from('daily_streaks').select('*').eq('user_id',sbUser.id).eq('game','pan_trainer').maybeSingle();
  if(!remote){await syncStreakToSupabase(local);return;}

  if(remote.last_played&&(!local.last||remote.last_played>local.last)){
    const merged={streak:remote.streak,best:Math.max(remote.best_streak,local.best||0),last:remote.last_played,chDone:local.chDate===TODAY?local.chDone:0,chDate:local.chDate,freezes:local.freezes||0};
    localStorage.setItem('pt_sd',JSON.stringify(merged));
    updateStreakUI(merged);
  }else if(local.last&&(!remote.last_played||local.last>remote.last_played)){
    await syncStreakToSupabase(local);
  }else if(remote.streak>local.streak||remote.best_streak>local.best){
    const merged={...local,streak:Math.max(local.streak,remote.streak),best:Math.max(local.best,remote.best_streak)};
    localStorage.setItem('pt_sd',JSON.stringify(merged));
    updateStreakUI(merged);
  }
}

const FREEZE_COST=300;
const FREEZE_MAX=2;

const FLAME_PATH='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const FLAME_UNLIT=`<svg viewBox="0 0 24 24"><path fill="rgba(255,255,255,.22)" d="${FLAME_PATH}"/></svg>`;
const FLAME_LIT=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradLit" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradLit)" d="${FLAME_PATH}"/></svg>`;
const FLAME_HOT=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradHot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f87171"/><stop offset=".5" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradHot)" d="${FLAME_PATH}"/></svg>`;
const FLAME_POPUP=`<svg viewBox="0 0 24 24"><defs><linearGradient id="flameGradPopup" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><path fill="url(#flameGradPopup)" d="${FLAME_PATH}"/></svg>`;
// Простая одноцветная версия (currentColor) для мелких инлайн-упоминаний стрика в тексте
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

// Стрик продлевается за выполнение дневного челленджа (5/5), не за любой ответ
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
      score+=250;localStorage.setItem('pt_s',score);updateScoreUI();ptsPopup('+250 '+ICON_TARGET);
      updateDailyStreak();
    }
  }
}

function buyFreeze(){
  const d=loadSD();
  if((d.freezes||0)>=FREEZE_MAX)return;
  if(score<FREEZE_COST){ptsPopup('Нужно ещё '+(FREEZE_COST-score)+' очков');return;}
  score-=FREEZE_COST;localStorage.setItem('pt_s',score);updateScoreUI();
  d.freezes=(d.freezes||0)+1;saveSD(d);
  updateStreakUI(d);
  ptsPopup(ICON_SNOWFLAKE+'Заморозка куплена');
}

function startChallenge(){
  const d=loadSD();
  const done=d.chDate===TODAY?(d.chDone||0):0;
  if(done>=5)return;
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
//  PROGRESSIVE DIFFICULTY (Hard) — своя механика под панораму:
//  фаза 2 прячет VU-метр (иначе это просто "смотри на шкалу"), фаза 3 добавляет таймер.
// ══════════════════════════════════════
let hardRounds=parseInt(localStorage.getItem('pt_hard_rounds')||'0');
const HARD_PHASE_BOUNDS=[0,20,40];
function getHardPhase(){
  if(hardRounds<20) return 1; // обычный режим, VU-метр виден
  if(hardRounds<40) return 2; // VU-метр скрыт — только слух
  return 3; // + таймер на ответ
}
function getPhaseProgressText(){
  if(diff!=='hard') return '';
  const phase=getHardPhase();
  if(phase>=3) return hardRounds+' верных с начала — все механики сложного уже открыты';
  const start=HARD_PHASE_BOUNDS[phase-1], end=HARD_PHASE_BOUNDS[phase];
  return (hardRounds-start)+'/'+(end-start)+' до следующей фазы';
}

// ── Таймер на ответ (только "Сложно", фаза 3) ──
const ANSWER_TIMER_PHASE=3, ANSWER_TIMER_SECONDS=10;
let answerTimerId=null, answerDeadline=0;

function maybeStartAnswerTimer(){
  clearAnswerTimer();
  if(diff!=='hard'||getHardPhase()<ANSWER_TIMER_PHASE)return;
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
  checkAnswer(true);
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
  pb.setAttribute('aria-label','Пауза');
  pb.innerHTML='<div class="pm-pause"><span class="pm-pause-bar"></span><span class="pm-pause-bar"></span></div>';
  document.getElementById('hint').textContent='Слушай → где сидит звук?';
  if(qStart===0){qStart=Date.now();maybeStartAnswerTimer();}
  drawVU();
}

function stopAudio(){
  if(vuRaf){cancelAnimationFrame(vuRaf);vuRaf=null;}
  const os=srcNode,op=panNode,og=gainNode,oa=anlNode;
  srcNode=null;panNode=null;gainNode=null;anlNode=null;playing=false;
  const pb=document.getElementById('playBtn');
  pb.classList.remove('playing');
  pb.setAttribute('aria-label','Слушать');
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
const ICON_USER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_VOL_HIGH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const ICON_VOL_LOW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const ICON_VOL_MUTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
// Иконки вместо оставшихся эмодзи в попапах стрика/подсказках
const ICON_SNOWFLAKE='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M4.2 7l15.6 10M4.2 17l15.6-10"/></svg>';
const ICON_BULB='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
const ICON_TARGET='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
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
  muted=!muted;
  const icon=document.querySelector('.pm-vol-icon');
  icon.innerHTML=muted?ICON_VOL_MUTE:ICON_VOL_HIGH;
  icon.setAttribute('aria-label',muted?'Включить звук':'Выключить звук');
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
  clearAnswerTimer();

  const set=POSITIONS[diff];
  target=set[Math.floor(Math.random()*set.length)];
  document.getElementById('rn').textContent=round;

  const diffLabelEl=document.getElementById('diffLabel');
  const progEl=document.getElementById('phaseProgress');
  const vuWrap=document.getElementById('vuWrap');
  const vuNote=document.getElementById('vuHiddenNote');
  if(diff==='hard'){
    const phase=getHardPhase();
    const phases=['','Обычный','Без VU-метра','Без VU-метра + таймер'];
    diffLabelEl.textContent='Сложно · '+phases[phase];
    if(progEl){progEl.style.display='block';progEl.textContent=getPhaseProgressText();}
    const hideVu=phase>=2;
    if(vuWrap)vuWrap.style.display=hideVu?'none':'flex';
    if(vuNote)vuNote.style.display=hideVu?'block':'none';
  } else {
    diffLabelEl.textContent={easy:'Легко',medium:'Средне'}[diff];
    if(progEl)progEl.style.display='none';
    if(vuWrap)vuWrap.style.display='flex';
    if(vuNote)vuNote.style.display='none';
  }

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
  const cols=set.length<=5?5:set.length<=9?5:7;
  // Ширина считается в % от колонок, а не через grid — так неполная
  // последняя строка (9 позиций на 5 колонок, 13 на 7) центрируется
  // вместе с остальными, а не повисает прижатой к левому краю.
  const basis='calc(('+(100/cols).toFixed(4)+'% - var(--space-2) * '+((cols-1)/cols).toFixed(4)+'))';
  g.style.width='100%';
  set.forEach(p=>{
    const b=document.createElement('button');
    b.className='pan-btn';b.dataset.val=p.val;
    b.style.flexBasis=basis;
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

function checkAnswer(timedOut){
  if((!picked&&!timedOut)||answered)return;
  answered=true;stopAudio();
  clearAnswerTimer();
  const elapsed=(Date.now()-qStart)/1000;
  const diff_val=picked?Math.abs(picked.val-target.val):Infinity;
  const ok=!timedOut&&diff_val<0.01;
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
  if(!ok&&picked){
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
    updateChallenge();
    if(diff==='hard'){
      hardRounds++;localStorage.setItem('pt_hard_rounds',hardRounds);
    }
  } else {streak=0;}

  // Фидбек
  const fm=document.getElementById('fbMain');
  const fs=document.getElementById('fbSub');
  fm.className='pm-fb-main '+(ok?'ok':'no');
  const tname=target.label+(target.val===0?'':' '+target.sub);
  if(ok){
    fm.textContent='✓ Верно!';
    fs.innerHTML=tname+' · +'+earned+' pts'+(streak>=3?' · '+FLAME_INLINE+'×'+streak:'');
    ptsPopup('+'+earned);
  } else if(timedOut){
    fm.textContent='⏱ Время вышло';
    fs.textContent='Это был '+tname;
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
  el.innerHTML=ICON_BULB+set[Math.floor(Math.random()*set.length)];
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
  document.getElementById('stv').innerHTML=streak+(streak>=3?FLAME_INLINE:'');
  let lvl=LEVELS[0],nxt=LEVELS[1];
  for(let i=0;i<LEVELS.length;i++){if(score>=LEVELS[i].m){lvl=LEVELS[i];nxt=LEVELS[i+1]||null;}}
  document.getElementById('lv').textContent=lvl.n;
  document.getElementById('lf').style.width=nxt?Math.round(((score-lvl.m)/(nxt.m-lvl.m))*100)+'%':'100%';
}

function ptsPopup(html){
  const el=document.createElement('div');el.className='pts-pop';el.innerHTML=html;
  el.style.left='50%';el.style.top='50%';el.style.transform='translateX(-50%)';
  document.body.appendChild(el);setTimeout(()=>el.remove(),900);
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actx&&actx.state==='suspended')actx.resume();});
updateScoreUI();
initStreak();
sbInit();
