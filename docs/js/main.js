// ══════════════════════════════════════
//   DATA
// ══════════════════════════════════════

// ══════════════════════════════════════
//   СЛОВАРЬ ЗВУКОРЕЖИССЁРА
// ══════════════════════════════════════
const GLOSS_CATS = {
  eq:'Эквализация', dynamics:'Динамика', loudness:'Громкость',
  space:'Пространство', recording:'Запись и сведение', mastering:'Мастеринг',
};
const GLOSSARY = [
  {term:'Q-фактор', cat:'eq', def:'Ширина полосы EQ-фильтра вокруг центральной частоты. Узкий Q — точечная правка (убрать резонанс), широкий Q — мягкая тональная коррекция.'},
  {term:'Полочный фильтр (Shelf)', cat:'eq', def:'Поднимает или срезает всё выше/ниже заданной частоты плоской «полкой», а не колоколом. Хорош для общей тональной балансировки.'},
  {term:'Колокольный фильтр (Bell)', cat:'eq', def:'Поднимает или срезает узкий диапазон вокруг центральной частоты — самый частый тип EQ-фильтра, «горб» или «яма» на графике.'},
  {term:'High-pass / Low-pass фильтр', cat:'eq', def:'High-pass срезает всё ниже заданной частоты (убирает гул), Low-pass — всё выше (убирает шипение и лишний воздух).'},
  {term:'Резонанс', cat:'eq', def:'Нежелательный подъём на узкой частоте — из-за помещения, инструмента или самого фильтра. Обычно вырезается узким колоколом на слух.'},
  {term:'Сибилянты', cat:'eq', def:'Резкие свистящие звуки речи и вокала («с», «ш», «ц») в районе 5–9 кГц. Убираются де-эссером или точечным вырезом EQ.'},

  {term:'Attack (атака)', cat:'dynamics', def:'Как быстро компрессор или лимитер начинает сжимать сигнал после того, как он превысил порог (threshold).'},
  {term:'Release (восстановление)', cat:'dynamics', def:'Как быстро компрессор перестаёт сжимать сигнал после того, как он опустился ниже порога.'},
  {term:'Ratio (степень сжатия)', cat:'dynamics', def:'Во сколько раз уменьшается превышение порога. При 4:1 превышение на 4 дБ на выходе станет превышением всего на 1 дБ.'},
  {term:'Threshold (порог)', cat:'dynamics', def:'Уровень громкости, начиная с которого компрессор, лимитер или гейт начинают работать.'},
  {term:'Knee (колено)', cat:'dynamics', def:'Мягкий (soft knee) или резкий (hard knee) переход компрессора в режим сжатия возле порога — влияет на то, насколько «незаметно» работает компрессия.'},
  {term:'Sidechain', cat:'dynamics', def:'Компрессор реагирует не на сам сигнал, а на другой — например, бас автоматически «подкачивается» под удар кика, освобождая ему место.'},
  {term:'Лимитер', cat:'dynamics', def:'Компрессор с очень высоким ratio (обычно ∞:1) — не даёт сигналу превысить заданный потолок громкости.'},
  {term:'Гейт (Noise Gate)', cat:'dynamics', def:'Заглушает сигнал ниже порога — убирает шум между фразами вокала или наводки на дорожке в паузах.'},

  {term:'LUFS', cat:'loudness', def:'Единица измерения воспринимаемой громкости всего трека (в отличие от пиковой). Стриминги нормализуют треки именно по LUFS, не по пикам.'},
  {term:'dBFS', cat:'loudness', def:'Единица измерения уровня сигнала относительно цифрового максимума. 0 dBFS — потолок, выше только клиппинг.'},
  {term:'True Peak', cat:'loudness', def:'Реальный пик сигнала после цифро-аналогового преобразования — может быть выше, чем показывает обычный измеритель (Inter-Sample Peak).'},
  {term:'Динамический диапазон', cat:'loudness', def:'Разница между самым тихим и самым громким местом трека. «Зажатый» перекомпрессированный трек имеет маленький диапазон.'},
  {term:'Война громкости (Loudness War)', cat:'loudness', def:'Гонка за максимально громким мастерингом в ущерб динамике трека. Нормализация громкости в стримингах во многом обесценила эту гонку.'},
  {term:'Headroom (запас)', cat:'loudness', def:'Расстояние в дБ между текущим пиковым уровнем сигнала и цифровым потолком 0 dBFS.'},

  {term:'Панорама (Pan)', cat:'space', def:'Положение звука между левым и правым каналом стерео-поля.'},
  {term:'Pan Law', cat:'space', def:'Правило, по которому меняется громкость звука при панорамировании к центру или краям, чтобы моно-сумма звучала ровно по громкости.'},
  {term:'Эффект Хааса (Haas Effect)', cat:'space', def:'Если один и тот же сигнал приходит в оба уха с задержкой 1–30 мс, мозг слышит один источник, но «шире». Основа многих техник расширения стерео.'},
  {term:'Реверберация', cat:'space', def:'Множество отражений звука от поверхностей помещения, создающие ощущение пространства и объёма.'},
  {term:'Задержка (Delay)', cat:'space', def:'Повтор сигнала через заданное время. В отличие от реверберации, повторы отчётливые и раздельные, а не размытые.'},
  {term:'Моно-совместимость', cat:'space', def:'Звучит ли микс нормально, если свести стерео в один канал. Важно для клубных систем, ТВ и части стриминговых сценариев.'},

  {term:'Фантомное питание (+48V)', cat:'recording', def:'Напряжение, которое микшер или аудиоинтерфейс подаёт на конденсаторный микрофон через XLR-кабель.'},
  {term:'Proximity Effect', cat:'recording', def:'Усиление низких частот, когда источник (обычно голос) подносят близко к направленному микрофону.'},
  {term:'DI-бокс', cat:'recording', def:'Устройство, согласующее сигнал инструмента (гитара, бас) с линейным входом интерфейса напрямую, без микрофона.'},
  {term:'Гейн-стейджинг', cat:'recording', def:'Выстраивание правильного уровня сигнала на каждом этапе цепи — запись, плагины, мастер-шина — чтобы избежать лишнего шума и клиппинга.'},

  {term:'Дизеринг (Dither)', cat:'mastering', def:'Добавление контролируемого шума при понижении битности (например, с 24 до 16 бит), чтобы избежать искажений квантования.'},
  {term:'Нормализация', cat:'mastering', def:'Приведение громкости трека к заданному уровню — пиковому или по LUFS.'},
  {term:'Каскад обработки (Chain)', cat:'mastering', def:'Порядок, в котором сигнал проходит через плагины: например EQ → компрессор → лимитер.'},
];
let glossCat='all';
const GLOSS_ICON_PATHS={
  eq:'<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  dynamics:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  loudness:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  space:'<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  recording:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  mastering:'<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
};
function glossIcon(cat){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(GLOSS_ICON_PATHS[cat]||GLOSS_ICON_PATHS.eq)+'</svg>';}
function setGlossCat(cat,btn){
  glossCat=cat;
  document.querySelectorAll('#glossCats .gloss-cat-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderGlossary();
}
function renderGlossCats(){
  const wrap=document.getElementById('glossCats');
  if(wrap.dataset.built)return;
  wrap.dataset.built='1';
  const cats=[['all','Все']].concat(Object.entries(GLOSS_CATS));
  wrap.innerHTML=cats.map(([key,label],i)=>
    '<button type="button" class="gloss-cat-btn'+(i===0?' active':'')+'" onclick="setGlossCat(\''+key+'\',this)">'+label+'</button>'
  ).join('');
}
function renderGlossary(){
  renderGlossCats();
  const q=(document.getElementById('glossSearch').value||'').trim().toLowerCase();
  const grid=document.getElementById('glossGrid');
  const items=GLOSSARY.filter(g=>{
    if(glossCat!=='all'&&g.cat!==glossCat)return false;
    if(!q)return true;
    return g.term.toLowerCase().includes(q)||g.def.toLowerCase().includes(q);
  });
  if(!items.length){
    grid.innerHTML='<div class="empty" style="grid-column:1/-1">Ничего не нашлось — попробуй другое слово или выбери «Все»</div>';
    return;
  }
  grid.innerHTML=items.map(g=>
    '<div class="gloss-card"><div class="gloss-term">'+glossIcon(g.cat)+'<span>'+g.term+'</span></div>'+
    '<div class="gloss-cat-tag">'+GLOSS_CATS[g.cat]+'</div>'+
    '<div class="gloss-def">'+g.def+'</div></div>'
  ).join('');
}

const FREQ_BANDS = [
  {name:'sub',     label:'Sub Bass',  min:20,   max:80,   desc:'20–80 Hz'},
  {name:'bass',    label:'Bass',      min:80,   max:250,  desc:'80–250 Hz'},
  {name:'lowmid',  label:'Low-Mid',   min:250,  max:600,  desc:'250–600 Hz'},
  {name:'mid',     label:'Mid',       min:600,  max:2000, desc:'600–2k Hz'},
  {name:'uppermid',label:'Upper-Mid', min:2000, max:5000, desc:'2–5 kHz'},
  {name:'pres',    label:'Presence',  min:5000, max:8000, desc:'5–8 kHz'},
  {name:'sib',     label:'Sibilance', min:8000, max:12000,desc:'8–12 kHz'},
  {name:'air',     label:'Air',       min:12000,max:20000,desc:'12–20 kHz'},
];

const TRACKS=[
  {id:'noise',label:'Шум'},{id:'trap',label:'Trap'},
  {id:'bass',label:'808'},{id:'pad',label:'Пэд'},{id:'mix',label:'Микс'},
];
const COMP={
  'Вокал':{a:[15,40],r:[80,150],th:[-20,-12],mk:[4,8],tip:'Средний attack — сохраняет согласные'},
  'Кик':{a:[2,8],r:[40,80],th:[-18,-10],mk:[3,6],tip:'Быстрый A/R — панч и контроль transient'},
  '808/Бас':{a:[20,50],r:[100,200],th:[-18,-12],mk:[3,7],tip:'Медленный attack — сохраняет атаку'},
  'Шина':{a:[30,80],r:[150,300],th:[-12,-6],mk:[2,4],tip:'1–3 dB GR макс. Лёгкий клей'},
  'Drum Bus':{a:[10,30],r:[60,120],th:[-15,-8],mk:[3,6],tip:'NY Compression: параллельно 50/50'},
  'Мастер':{a:[50,100],r:[200,400],th:[-6,-2],mk:[1,3],tip:'Только клей. GR не слышен'},
};
const DDIVS=[
  {l:'Целая',m:4},{l:'Половинная',m:2},{l:'Полов. (трио)',m:4/3},
  {l:'Четверть',m:1},{l:'Четв. (трио)',m:2/3},{l:'Восьмая',m:.5},
  {l:'Восьм. (трио)',m:1/3},{l:'Шестнадцатая',m:.25},{l:'Шестн. (трио)',m:1/6},{l:'Тридцать вторая',m:.125},
];
const LEVELS=[{min:0,l:'Новичок'},{min:300,l:'Junior'},{min:800,l:'Mid Engineer'},{min:1800,l:'Senior'},{min:3500,l:'Pro'}];
const BSETS={easy:['bass','lowmid','mid','uppermid'],medium:FREQ_BANDS.map(b=>b.name),hard:FREQ_BANDS.map(b=>b.name)};
const BOOST={easy:14,medium:10,hard:7};const QVAL={easy:1.8,medium:1.4,hard:.9};

let vip=false;
let streak=0,bpm=120,curTrack='noise',diff='medium';
let cBand=null,cFreq=null,answered=false,qStart=0;
let aCtx=null,aGain=null,pNodes=[];
let taps=[],lastTap=0,compType='Вокал';

function tab(id,btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');btn.classList.add('active');
  if(id==='tools')setTimeout(drawEnvelope,50);
  if(id==='glossary')renderGlossary();
}

function openVip(){
  if(vip)return;
  document.getElementById('vipLoginBlock').style.display=sbUser?'none':'block';
  document.getElementById('vipContactBlock').style.display=sbUser?'block':'none';
  const ov=document.getElementById('vipOverlay');
  ov.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add('show')));
}
function closeVip(){
  const ov=document.getElementById('vipOverlay');
  ov.classList.remove('show');
  setTimeout(()=>ov.classList.remove('open'),200);
}
document.getElementById('vipOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeVip();});
const ICON_CHECK_VIP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1.5px;margin-right:3px"><path d="M20 6 9 17l-5-5"/></svg>';
function applyVip(){
  const nb=document.getElementById('navVipBtn');nb.innerHTML=ICON_CHECK_VIP+'VIP';nb.classList.add('unlocked');nb.onclick=null;
}

// ══════════════════════════════════════
//   SUPABASE — VIP теперь привязан к аккаунту, не к коду в браузере
// ══════════════════════════════════════
const SB=supabase.createClient('https://mwzskffecoedpvyflswg.supabase.co','sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD');
let sbUser=null,sbProfile=null;
async function logout(){await SB.auth.signOut();location.href='pages/auth.html';}
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(!session)return;
  sbUser=session.user;
  const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
  sbProfile=p;
  if(p&&p.is_vip){
    vip=true;
    applyVip();
  }
  if(p&&['VERIFIED_PRO','MENTOR','ADMIN'].includes(p.role)){
    const adminBtn=document.getElementById('navAdminBtn');
    if(adminBtn)adminBtn.style.display='';
  }
  const notifMount=document.getElementById('notifMount');
  if(notifMount&&window.mountNotifications)mountNotifications(SB,notifMount,sbUser.id);
}


function syncBpm(v){
  bpm=Math.max(40,Math.min(300,parseFloat(v)||120));
  const el=document.getElementById('bpmIn');
  if(el&&parseFloat(el.value)!==bpm)el.value=bpm;
  document.getElementById('bpmDisp').textContent=bpm+' BPM';
  calcDelay();calcReverb();calcComp();
}
function calcDelay(){
  const q=60000/bpm;
  document.getElementById('delRes').innerHTML=DDIVS.map(d=>'<div class="rr"><span class="rl">'+d.l+'</span><span class="rv'+(d.l==='Четверть'?' hi':'')+'">'+((q*d.m).toFixed(1))+' ms</span></div>').join('');
}
function calcReverb(){
  const ms=(60000/bpm)*4/parseInt(document.getElementById('revNote').value);
  document.getElementById('revRes').innerHTML=
    '<div class="rr"><span class="rl">Pre-delay</span><span class="rv hi">'+ms.toFixed(1)+' ms</span></div>'+
    '<div class="rr"><span class="rl">½ стерео</span><span class="rv">'+(ms/2).toFixed(1)+' ms</span></div>'+
    '<div class="rr"><span class="rl">¼</span><span class="rv">'+(ms/4).toFixed(1)+' ms</span></div>'+
    '<div class="rr"><span class="rl">Decay RT60</span><span class="rv ok">'+(ms*6/1000).toFixed(2)+' сек</span></div>'+
    '<div class="rr"><span class="rl">~Комната</span><span class="rv">'+Math.round(ms*.34)+' м</span></div>';
}
function buildCompTypes(){
  document.getElementById('compTypes').innerHTML=Object.keys(COMP).map(k=>'<button class="comp-type-btn'+(k===compType?' active':'')+'" onclick="setComp(\''+k+'\')">'+k+'</button>').join('');
}
function setComp(t){
  compType=t;
  buildCompTypes();
  calcComp();
}

// ── NOTE TO HZ ──
function calcNoteHz(){
  const midi=parseInt(document.getElementById('noteSelect').value);
  const hz=440*Math.pow(2,(midi-69)/12);
  document.getElementById('noteHzDisp').textContent=hz.toFixed(2)+' Hz';
}

// ── LOUDNESS / LUFS ──
function calcLufs(){
  const val=document.getElementById('lufsPlatform').value;
  const target=parseFloat(val);
  const platform={
    '-14':'Spotify','-16':'Apple Music','-14b':'YouTube','-9':'SoundCloud / клубный','-23':'Вещание TV'
  }[val];
  const headroom = Math.abs(-1 - target);
  document.getElementById('lufsRes').innerHTML=
    '<div class="rr"><span class="rl">Платформа</span><span class="rv">'+platform+'</span></div>'+
    '<div class="rr"><span class="rl">Целевой LUFS</span><span class="rv hi">'+target+' LUFS</span></div>'+
    '<div class="rr"><span class="rl">True Peak потолок</span><span class="rv">−1.0 dBTP</span></div>'+
    '<div class="rr"><span class="rl">Headroom для лимитера</span><span class="rv">'+headroom.toFixed(1)+' dB</span></div>';
}

// ── ROOM ACOUSTICS ──
function calcRoom(){
  const L=parseFloat(document.getElementById('roomL').value)||4;
  const W=parseFloat(document.getElementById('roomW').value)||3;
  const H=parseFloat(document.getElementById('roomH').value)||2.5;
  const c=343;
  const modes=[
    {dim:'Длина ('+L+'м)', f1:(c/(2*L)).toFixed(1), f2:(c/L).toFixed(1)},
    {dim:'Ширина ('+W+'м)', f1:(c/(2*W)).toFixed(1), f2:(c/W).toFixed(1)},
    {dim:'Высота ('+H+'м)', f1:(c/(2*H)).toFixed(1), f2:(c/H).toFixed(1)},
  ];
  let html='';
  modes.forEach(m=>{
    html+='<div class="rr"><span class="rl">'+m.dim+'</span><span class="rv hi">'+m.f1+' / '+m.f2+' Hz</span></div>';
  });
  const volume=L*W*H;
  const schroeder=2000*Math.sqrt(0.4/volume);
  document.getElementById('roomRes').innerHTML=html+
    '<div class="rr" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span class="rl">Объём</span><span class="rv">'+volume.toFixed(1)+' м³</span></div>'+
    '<div class="rr"><span class="rl">Частота Шрёдера</span><span class="rv">≈'+schroeder.toFixed(0)+' Hz</span></div>';
}

// ── ATTACK / RELEASE VISUALIZER ──
function drawEnvelope(){
  const atk=parseInt(document.getElementById('atkSlider').value);
  const rel=parseInt(document.getElementById('relSlider').value);
  document.getElementById('atkVal').textContent=atk+' мс';
  document.getElementById('relVal').textContent=rel+' мс';

  const canvas=document.getElementById('envCanvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth*devicePixelRatio, H=canvas.offsetHeight*devicePixelRatio;
  canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);

  const totalMs=1200;
  const holdStart=0.15;
  const peakX=holdStart*W;
  const atkX=peakX+(atk/totalMs)*W;
  const relEndX=Math.min(W, atkX+(rel/totalMs)*W);

  ctx.strokeStyle='rgba(255,255,255,.25)';
  ctx.lineWidth=1.5*devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(0,H*0.85);
  ctx.lineTo(peakX,H*0.85);
  ctx.lineTo(peakX+3,H*0.15);
  ctx.lineTo(peakX+15,H*0.6);
  ctx.lineTo(W,H*0.75);
  ctx.stroke();

  ctx.strokeStyle='#4ade80';
  ctx.lineWidth=2.5*devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(0,H*0.85);
  ctx.lineTo(peakX,H*0.85);
  ctx.lineTo(atkX,H*0.25);
  ctx.lineTo(relEndX,H*0.8);
  ctx.lineTo(W,H*0.85);
  ctx.stroke();

  const hint=document.getElementById('envHint');
  if(atk<5) hint.textContent='Очень быстрая attack — компрессор полностью съедает транзиент удара';
  else if(atk<20) hint.textContent='Быстрая attack — частично убирает атаку, добавляет контроль';
  else if(atk<50) hint.textContent='Средняя attack — транзиент проходит, компрессия начинается после удара';
  else hint.textContent='Медленная attack — транзиент полностью сохраняется, сжимается только «тело» звука';
}

function calcComp(){
  const p=COMP[compType],ratio=parseInt(document.getElementById('cmpRatio').value),rs=Math.round(60000/bpm*.5);
  document.getElementById('cmpRes').innerHTML=
    '<div class="rr"><span class="rl">Attack</span><span class="rv hi">'+p.a[0]+'–'+p.a[1]+' ms</span></div>'+
    '<div class="rr"><span class="rl">Release</span><span class="rv hi">'+p.r[0]+'–'+p.r[1]+' ms</span></div>'+
    '<div class="rr"><span class="rl">Release BPM ⅛</span><span class="rv ok">'+rs+' ms</span></div>'+
    '<div class="rr"><span class="rl">Ratio</span><span class="rv">'+ratio+':1</span></div>'+
    '<div class="rr"><span class="rl">Threshold</span><span class="rv">'+p.th[0]+'…'+p.th[1]+' dB</span></div>'+
    '<div class="rr"><span class="rl">Makeup Gain</span><span class="rv">'+p.mk[0]+'–'+p.mk[1]+' dB</span></div>'+
    '<div class="rr" style="background:var(--amber-glow)"><span class="rl" style="color:var(--amber)">Совет</span><span class="rv tip">'+p.tip+'</span></div>';
}
function tapTempo(){
  const now=Date.now();if(lastTap&&now-lastTap>2500)taps=[];taps.push(now);lastTap=now;
  if(taps.length>1){const avg=taps.slice(1).map((t,i)=>t-taps[i]).reduce((a,b)=>a+b)/(taps.length-1);syncBpm(Math.round(60000/avg));}
}



function setDiff(v){diff=v;buildBands();}


function pink(ctx,dur){
  const sr=ctx.sampleRate,n=Math.ceil(sr*(dur+.1)),buf=ctx.createBuffer(2,n,sr);
  for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.10;b6=w*.115926;}}
  return buf;
}










buildCompTypes();
calcDelay();calcReverb();calcComp();
calcNoteHz();calcLufs();calcRoom();
setTimeout(drawEnvelope,50);
sbInit();

// Ссылки с других страниц ведут на index.html#trainers и т.п. —
// открываем нужную вкладку сразу, а не всегда «Главную»
(function(){
  const initialTab=location.hash.slice(1);
  const btn=document.querySelector('.nav-tab[data-tab="'+initialTab+'"]');
  if(btn)tab(initialTab,btn);
})();