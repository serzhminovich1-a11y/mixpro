// ══════════════════════════════════════
//   DATA
// ══════════════════════════════════════

// ══════════════════════════════════════
//   СЛОВАРЬ ЗВУКОРЕЖИССЁРА — категории и термины теперь в базе (таблицы
//   glossary_categories/glossary_terms), редактируются из панели
//   администратора. Здесь только загрузка и рендер на Главной.
// ══════════════════════════════════════
let glossCategories=[], glossTerms=[], glossLoaded=false, glossLoading=null;
let glossViewMode='list';
let glossCardItems=[], glossCardIndex=0, glossCardsSinceQuiz=0, glossQuizPool=[];
let glossQuizActive=false, glossQuizQuestions=[], glossQuizAnswers=null;
const GLOSS_QUIZ_TRIGGER=10, GLOSS_QUIZ_LEN=5;
const GLOSS_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 3v18"/></svg>';

// ── Прогресс по карточкам — синхронизирован через аккаунт, тот же
// паттерн, что у ежедневного стрика тренажёров (pan_trainer.js/
// peak_master.js: localStorage сразу + тихая синхронизация в Supabase,
// сверка при следующем визите). Нужен для двух вещей: колода
// перемешивается для тех, кто уже проходил карточки, и баннер
// "освежить знания" после долгого перерыва.
const GLOSS_PROGRESS_KEY='mixpro_gloss_progress';
const GLOSS_REFRESH_DAYS=3;
let glossProgress={seenIds:[],lastVisit:null};
function loadGlossProgressLocal(){
  try{
    const p=JSON.parse(localStorage.getItem(GLOSS_PROGRESS_KEY)||'null');
    if(p&&Array.isArray(p.seenIds))return p;
  }catch(e){}
  return{seenIds:[],lastVisit:null};
}
function saveGlossProgress(p){
  glossProgress=p;
  try{localStorage.setItem(GLOSS_PROGRESS_KEY,JSON.stringify(p));}catch(e){}
  syncGlossProgressToSupabase(p);
}
async function syncGlossProgressToSupabase(p){
  if(!sbUser)return;
  await SB.from('glossary_progress').upsert({
    user_id:sbUser.id,
    seen_term_ids:p.seenIds,
    last_visit:p.lastVisit?new Date(p.lastVisit).toISOString():null,
  },{onConflict:'user_id'});
}
// Сверяет локальный и серверный прогресс (кто новее — тот и побеждает
// по last_visit, seenIds объединяются), затем решает: показывать ли
// баннер "освежить знания" — и только ПОСЛЕ этого решения обновляет
// lastVisit на текущий момент (иначе сравнение всегда будет "только что").
async function reconcileGlossProgress(){
  const local=loadGlossProgressLocal();
  let merged=local;
  if(sbUser){
    const{data:remote}=await SB.from('glossary_progress').select('*').eq('user_id',sbUser.id).maybeSingle();
    if(remote){
      const remoteLastVisit=remote.last_visit?new Date(remote.last_visit).getTime():0;
      merged={
        seenIds:Array.from(new Set([...(remote.seen_term_ids||[]),...local.seenIds])),
        lastVisit:Math.max(remoteLastVisit,local.lastVisit||0)||null,
      };
    }
  }
  glossProgress=merged;
  const prevVisit=merged.lastVisit;
  if(merged.seenIds.length&&prevVisit){
    const days=Math.floor((Date.now()-prevVisit)/86400000);
    if(days>=GLOSS_REFRESH_DAYS)showGlossRefreshBanner(days);
  }
  saveGlossProgress({...merged,lastVisit:Date.now()});
}
function markTermSeen(termId){
  if(glossProgress.seenIds.includes(termId))return;
  saveGlossProgress({...glossProgress,seenIds:[...glossProgress.seenIds,termId]});
}
function showGlossRefreshBanner(days){
  const banner=document.getElementById('glossRefreshBanner');
  if(!banner)return;
  const word=days===1?'день':(days>=2&&days<=4?'дня':'дней');
  document.getElementById('glossRefreshBannerText').textContent=
    'Прошло '+days+' '+word+' с последнего повторения — освежить знания?';
  banner.style.display='';
}
function hideGlossRefreshBanner(){
  const banner=document.getElementById('glossRefreshBanner');
  if(banner)banner.style.display='none';
}
function startGlossRefresh(){
  hideGlossRefreshBanner();
  setGlossMode('cards');
}
async function loadGlossary(){
  if(glossLoading)return glossLoading;
  glossLoading=(async()=>{
    const [{data:cats},{data:terms}]=await Promise.all([
      SB.from('glossary_categories').select('*').order('order_index',{ascending:true}),
      SB.from('glossary_terms').select('*').order('order_index',{ascending:true}),
    ]);
    glossCategories=cats||[];
    glossTerms=terms||[];
    glossLoaded=true;
    const sel=document.getElementById('glossCatSelect');
    if(sel){
      sel.innerHTML='<option value="all">Все категории</option>'+
        glossCategories.map(c=>'<option value="'+c.id+'">'+escapeGlossHtml(c.title)+'</option>').join('');
    }
  })();
  return glossLoading;
}
function escapeGlossHtml(s){
  const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;
}
function glossCatTitle(id){
  const c=glossCategories.find(c=>c.id===id);
  return c?c.title:'';
}
// Плоский текст из rich-HTML определения, обрезанный до maxLen — для
// компактной карточки в списке и для формулировки вопроса теста.
function glossExcerpt(html, maxLen){
  const d=document.createElement('div');
  d.innerHTML=window.sanitizeRichHtml?sanitizeRichHtml(html||''):'';
  const text=(d.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<=maxLen)return{text,truncated:false};
  return{text:text.slice(0,maxLen).trim()+'…',truncated:true};
}
function glossFilteredItems(){
  const catSel=document.getElementById('glossCatSelect');
  const glossCat=catSel?catSel.value:'all';
  const q=(document.getElementById('glossSearch').value||'').trim().toLowerCase();
  return glossTerms.filter(g=>{
    if(glossCat!=='all'&&g.category_id!==glossCat)return false;
    if(!q)return true;
    const plain=(g.term+' '+g.definition).toLowerCase();
    return plain.includes(q);
  });
}
// Два аудио "До"/"После" — общий кусок разметки для развёрнутой модалки
// и для карточки в режиме свайпа. Возвращает только колонки — обёртку
// .gloss-example-compare добавляет каждый вызывающий по месту.
function glossExampleColsHtml(term){
  const col=(url,label,num,fallback)=>!url?'':
    '<div class="gloss-example-col"><div class="gloss-example-label">'+num+' — '+escapeGlossHtml(label||fallback)+'</div><audio controls preload="metadata" src="'+url+'"></audio></div>';
  return col(term.example_a_url,term.example_a_label,'A','До')+col(term.example_b_url,term.example_b_label,'Б','После');
}
function glossHasExamples(term){
  return!!(term.example_a_url||term.example_b_url);
}
// Вся карточка кликабельна и открывает развёрнутый вид термина — не
// только у "длинных" терминов. Показываем ПОЛНЫЙ rich-контент (не
// эксцерпт), чтобы картинки/гифки/видео из определения были видны сразу
// в списке — высота карточки просто ограничена CSS с fade-затуханием
// снизу (.gloss-card-preview), не самим содержимым.
function glossCardHtml(g){
  return'<div class="gloss-card" data-id="'+g.id+'" tabindex="0" role="button">'+
    '<div class="gloss-term">'+GLOSS_ICON+'<span>'+escapeGlossHtml(g.term)+'</span></div>'+
    (g.category_id?'<div class="gloss-cat-tag">'+escapeGlossHtml(glossCatTitle(g.category_id))+'</div>':'')+
    '<div class="gloss-def gloss-rich-content gloss-card-preview">'+(window.sanitizeRichHtml?sanitizeRichHtml(g.definition||''):'')+'</div>'+
    '<div class="gloss-card-enter">Открыть термин →</div>'+
  '</div>';
}
async function renderGlossary(){
  const grid=document.getElementById('glossGrid');
  if(!glossLoaded){
    grid.innerHTML='<div class="empty">Загружаем словарь…</div>';
    await loadGlossary();
  }
  const items=glossFilteredItems();
  if(glossViewMode==='cards'){startGlossCards(items);return;}
  if(!items.length){
    grid.innerHTML='<div class="empty" style="grid-column:1/-1">Ничего не нашлось — попробуй другое слово или выбери «Все категории»</div>';
    return;
  }
  grid.innerHTML=items.map(glossCardHtml).join('');
  if(window.animateChildren)animateChildren(grid);
}

// ── Развёрнутый вид термина (модалка) — полный текст + примеры А/Б ──
function openGlossaryDetail(term){
  const catEl=document.getElementById('glossDetailCat');
  const title=glossCatTitle(term.category_id);
  catEl.textContent=title;
  catEl.style.display=title?'':'none';
  document.getElementById('glossDetailTerm').textContent=term.term;
  document.getElementById('glossDetailDef').innerHTML=window.sanitizeRichHtml?sanitizeRichHtml(term.definition||''):'';
  const exWrap=document.getElementById('glossDetailExamples');
  const hasEx=glossHasExamples(term);
  exWrap.innerHTML=hasEx?glossExampleColsHtml(term):'';
  exWrap.style.display=hasEx?'':'none';
  const ov=document.getElementById('glossDetailOverlay');
  ov.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add('show')));
}
function closeGlossaryDetail(){
  const ov=document.getElementById('glossDetailOverlay');
  ov.classList.remove('show');
  setTimeout(()=>ov.classList.remove('open'),200);
}
document.getElementById('glossDetailOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeGlossaryDetail();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('glossDetailOverlay').classList.contains('open'))closeGlossaryDetail();
});
// Клик по любому месту карточки (кроме видео/аудио/ссылок внутри
// определения — им не мешаем) открывает термин целиком.
function glossCardClickToDetail(target){
  if(target.closest('video, audio, a, button'))return;
  const card=target.closest('.gloss-card');
  if(!card)return;
  const term=glossTerms.find(t=>t.id===card.dataset.id);
  if(term)openGlossaryDetail(term);
}
document.getElementById('glossGrid').addEventListener('click',e=>glossCardClickToDetail(e.target));
document.getElementById('glossGrid').addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  if(!e.target.closest('.gloss-card'))return;
  e.preventDefault();
  glossCardClickToDetail(e.target);
});

// ── Переключатель режима отображения (список / карточки) ──
function setGlossMode(mode){
  glossViewMode=mode;
  document.getElementById('glossModeListBtn').classList.toggle('active',mode==='list');
  document.getElementById('glossModeCardsBtn').classList.toggle('active',mode==='cards');
  document.getElementById('glossGrid').style.display=mode==='list'?'':'none';
  document.getElementById('glossSwipeStage').style.display=mode==='cards'?'':'none';
  renderGlossary();
}

// ── Карточный режим — одна карточка на экран, свайп/кнопки листают ──
function startGlossCards(items){
  // Для тех, кто уже проходил карточки раньше — колода перемешивается,
  // чтобы каждый заход не начинался с одного и того же термина. Новый
  // пользователь (seenIds пуст) видит естественный порядок категорий —
  // так понятнее при первом знакомстве с темой.
  glossCardItems=glossProgress.seenIds.length?glossShuffle(items):items;
  glossCardIndex=0;
  glossCardsSinceQuiz=0;
  glossQuizPool=[];
  glossQuizActive=false;
  renderGlossCard();
}
function renderGlossCard(){
  const stage=document.getElementById('glossSwipeStage');
  if(!glossCardItems.length){
    stage.innerHTML='<div class="empty">Ничего не нашлось — попробуй другое слово или выбери «Все категории»</div>';
    return;
  }
  const term=glossCardItems[glossCardIndex];
  markTermSeen(term.id);
  const hasEx=glossHasExamples(term);
  stage.innerHTML=
    '<div class="gloss-swipe-progress">'+(glossCardIndex+1)+' / '+glossCardItems.length+'</div>'+
    '<div class="gloss-swipe-card" id="glossSwipeCard">'+
      (term.category_id?'<div class="gloss-cat-tag">'+escapeGlossHtml(glossCatTitle(term.category_id))+'</div>':'')+
      '<div class="gloss-term">'+GLOSS_ICON+'<span>'+escapeGlossHtml(term.term)+'</span></div>'+
      '<div class="gloss-def gloss-rich-content">'+(window.sanitizeRichHtml?sanitizeRichHtml(term.definition||''):'')+'</div>'+
      (hasEx?'<div class="gloss-example-compare">'+glossExampleColsHtml(term)+'</div>':'')+
    '</div>'+
    '<div class="gloss-swipe-nav">'+
      '<button type="button" class="gloss-swipe-btn" id="glossPrevBtn"'+(glossCardIndex===0?' disabled':'')+'>‹ Назад</button>'+
      '<button type="button" class="gloss-swipe-btn primary" id="glossNextBtn">'+(glossCardIndex===glossCardItems.length-1?'Готово':'Дальше ›')+'</button>'+
    '</div>';
  document.getElementById('glossPrevBtn').addEventListener('click',()=>glossCardStep(-1));
  document.getElementById('glossNextBtn').addEventListener('click',()=>glossCardStep(1));
  wireGlossSwipeGesture(document.getElementById('glossSwipeCard'));
  if(window.animateIn)animateIn(document.getElementById('glossSwipeCard'));
}
function renderGlossCardsDone(){
  const stage=document.getElementById('glossSwipeStage');
  stage.innerHTML='<div class="empty">Ты просмотрел все карточки в этой подборке.<br><button type="button" class="gloss-swipe-btn primary" id="glossBackToListBtn" style="margin-top:12px">К списку</button></div>';
  document.getElementById('glossBackToListBtn').addEventListener('click',()=>setGlossMode('list'));
}
function glossCardStep(delta){
  if(glossQuizActive)return;
  if(delta>0){
    glossQuizPool.push(glossCardItems[glossCardIndex]);
    glossCardsSinceQuiz++;
  }
  const nextIndex=glossCardIndex+delta;
  if(nextIndex<0)return;
  if(glossCardsSinceQuiz>=GLOSS_QUIZ_TRIGGER){
    glossCardIndex=Math.min(nextIndex,glossCardItems.length-1);
    showGlossQuiz();
    return;
  }
  if(nextIndex>=glossCardItems.length){
    renderGlossCardsDone();
    return;
  }
  glossCardIndex=nextIndex;
  renderGlossCard();
}

// ── Свайп жестом — Pointer Events, тот же приём, что у скраба волны
// (waveform_player.js): один листенер вместо раздельных mouse/touch. ──
function wireGlossSwipeGesture(cardEl){
  if(!cardEl)return;
  let startX=0,dx=0,dragging=false;
  cardEl.addEventListener('pointerdown',e=>{
    if(e.target.closest('audio, button, a'))return;
    dragging=true;startX=e.clientX;dx=0;
    cardEl.setPointerCapture(e.pointerId);
    cardEl.classList.add('dragging');
  });
  cardEl.addEventListener('pointermove',e=>{
    if(!dragging)return;
    dx=e.clientX-startX;
    cardEl.style.transform='translateX('+dx+'px) rotate('+(dx/18)+'deg)';
  });
  function endDrag(){
    if(!dragging)return;
    dragging=false;
    cardEl.classList.remove('dragging');
    const threshold=Math.max(80,cardEl.offsetWidth*0.25);
    cardEl.style.transition='transform .25s ease';
    if(Math.abs(dx)>threshold){
      const dir=dx<0?1:-1;
      cardEl.style.transform='translateX('+(dir>0?-1:1)*600+'px) rotate('+(dir>0?-20:20)+'deg)';
      setTimeout(()=>glossCardStep(dir),180);
    }else{
      cardEl.style.transform='';
      setTimeout(()=>{cardEl.style.transition='';},260);
    }
  }
  cardEl.addEventListener('pointerup',endDrag);
  cardEl.addEventListener('pointercancel',endDrag);
}

// ── Тест каждые 10 карточек — самопроверка, без XP. Term→определение и
// обратно вперемешку, отвлекающие варианты сперва из той же категории. ──
function glossShuffle(arr){return arr.slice().sort(()=>Math.random()-0.5);}
function buildGlossQuizQuestions(pool,allItems){
  return glossShuffle(pool).slice(0,GLOSS_QUIZ_LEN).map(term=>{
    const direction=Math.random()<0.5?'term2def':'def2term';
    const sameCat=allItems.filter(t=>t.id!==term.id&&t.category_id===term.category_id);
    const distractorPool=sameCat.length>=3?sameCat:allItems.filter(t=>t.id!==term.id);
    const distractors=glossShuffle(distractorPool).slice(0,Math.min(3,distractorPool.length));
    return{term,direction,options:glossShuffle([term,...distractors])};
  });
}
function showGlossQuiz(){
  glossQuizActive=true;
  glossQuizQuestions=buildGlossQuizQuestions(glossQuizPool,glossCardItems);
  glossQuizAnswers={correct:0,total:glossQuizQuestions.length,index:0};
  renderGlossQuizQuestion();
}
function renderGlossQuizQuestion(){
  const stage=document.getElementById('glossSwipeStage');
  const q=glossQuizQuestions[glossQuizAnswers.index];
  const isT2D=q.direction==='term2def';
  const promptHtml=isT2D
    ?'<div class="gloss-quiz-prompt-label">Что означает термин?</div><div class="gloss-quiz-prompt-main">'+escapeGlossHtml(q.term.term)+'</div>'
    :'<div class="gloss-quiz-prompt-label">Какой термин соответствует определению?</div><div class="gloss-quiz-prompt-main gloss-quiz-prompt-def">'+escapeGlossHtml(glossExcerpt(q.term.definition,140).text)+'</div>';
  const optsHtml=q.options.map(opt=>{
    const label=isT2D?escapeGlossHtml(glossExcerpt(opt.definition,90).text):escapeGlossHtml(opt.term);
    return'<button type="button" class="gloss-quiz-opt" data-id="'+opt.id+'" data-correct="'+(opt.id===q.term.id)+'">'+label+'</button>';
  }).join('');
  stage.innerHTML=
    '<div class="gloss-quiz-card">'+
      '<div class="gloss-quiz-progress">Тест по последним карточкам · '+(glossQuizAnswers.index+1)+' / '+glossQuizAnswers.total+
        ' <button type="button" class="gloss-quiz-skip-inline" id="glossQuizSkipBtn">Пропустить</button></div>'+
      promptHtml+
      '<div class="gloss-quiz-opts">'+optsHtml+'</div>'+
      '<div class="gloss-quiz-fb" id="glossQuizFb"></div>'+
    '</div>';
  stage.querySelectorAll('.gloss-quiz-opt').forEach(btn=>btn.addEventListener('click',()=>handleGlossQuizAnswer(btn)));
  document.getElementById('glossQuizSkipBtn').addEventListener('click',finishGlossQuiz);
  if(window.animateIn)animateIn(stage.querySelector('.gloss-quiz-card'));
}
function handleGlossQuizAnswer(btn){
  const stage=document.getElementById('glossSwipeStage');
  if(stage.querySelector('.gloss-quiz-opt.correct, .gloss-quiz-opt.wrong'))return;
  const opts=stage.querySelectorAll('.gloss-quiz-opt');
  const correctBtn=Array.from(opts).find(o=>o.dataset.correct==='true');
  const isRight=btn.dataset.correct==='true';
  btn.classList.add(isRight?'correct':'wrong');
  if(!isRight&&correctBtn)correctBtn.classList.add('correct');
  opts.forEach(o=>o.disabled=true);
  const fb=document.getElementById('glossQuizFb');
  fb.textContent=isRight?'Верно!':'Правильный вариант выделен зелёным';
  fb.className='gloss-quiz-fb '+(isRight?'correct':'wrong');
  if(isRight)glossQuizAnswers.correct++;
  setTimeout(()=>{
    glossQuizAnswers.index++;
    if(glossQuizAnswers.index<glossQuizQuestions.length)renderGlossQuizQuestion();
    else renderGlossQuizResult();
  },1100);
}
function renderGlossQuizResult(){
  const stage=document.getElementById('glossSwipeStage');
  stage.innerHTML=
    '<div class="gloss-quiz-card gloss-quiz-result">'+
      '<div class="gloss-quiz-score">'+glossQuizAnswers.correct+' / '+glossQuizAnswers.total+'</div>'+
      '<div class="gloss-quiz-score-label">Правильных ответов</div>'+
      '<button type="button" class="gloss-swipe-btn primary" id="glossQuizContinueBtn">Продолжить карточки</button>'+
      '<button type="button" class="gloss-quiz-skip-inline" id="glossQuizListBtn2">К списку</button>'+
    '</div>';
  document.getElementById('glossQuizContinueBtn').addEventListener('click',finishGlossQuiz);
  document.getElementById('glossQuizListBtn2').addEventListener('click',()=>setGlossMode('list'));
}
function finishGlossQuiz(){
  glossQuizActive=false;
  glossQuizPool=[];
  glossCardsSinceQuiz=0;
  if(glossCardIndex>=glossCardItems.length)glossCardIndex=glossCardItems.length-1;
  if(glossCardIndex<0){renderGlossCardsDone();return;}
  renderGlossCard();
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
let bpm=120;
let taps=[],lastTap=0,compType='Вокал';

function tab(id,btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');btn.classList.add('active');
  if(id==='tools')setTimeout(drawEnvelope,50);
  if(id==='glossary'){renderGlossary();reconcileGlossProgress();}
  closeBurgerMenu();
}

// Бургер-меню в шапке (разделы сайта + аккаунт) — те же вкл/выкл по клику
// вне себя, что и у theme-panel (theme.js), только отдельный элемент.
function toggleBurgerMenu(){
  const panel=document.getElementById('burgerPanel');
  if(!panel)return;
  if(panel.classList.contains('open'))closeBurgerMenu();
  else{ if(typeof closeThemePanel==='function')closeThemePanel(); panel.classList.add('open'); }
}
function closeBurgerMenu(){
  const panel=document.getElementById('burgerPanel');
  if(panel)panel.classList.remove('open');
}
document.addEventListener('click',e=>{
  const panel=document.getElementById('burgerPanel');
  const btn=document.getElementById('burgerBtn');
  if(!panel||!panel.classList.contains('open'))return;
  if(panel.contains(e.target)||(btn&&btn.contains(e.target)))return;
  closeBurgerMenu();
});

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
function applyGuestNav(){
  const profileBtn=document.getElementById('navProfileBtn');
  if(profileBtn){profileBtn.textContent='Войти';profileBtn.href='pages/auth.html';}
  const logoutBtn=document.getElementById('navLogoutBtn');
  if(logoutBtn)logoutBtn.style.display='none';
}
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(!session){applyGuestNav();return;}
  sbUser=session.user;
  if(window.updateLastSeen)updateLastSeen(SB,sbUser.id);
  const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
  sbProfile=p;
  if(window.enforceBanGate&&enforceBanGate(SB,p))return;
  if(p&&p.is_vip){
    vip=true;
    applyVip();
  }
  if(window.syncThemeFromProfile)syncThemeFromProfile();
  if(p&&['VERIFIED_PRO','MENTOR','ADMIN'].includes(p.role)){
    const adminBtn=document.getElementById('navAdminBtn');
    if(adminBtn)adminBtn.style.display='';
  }
  const notifMount=document.getElementById('notifMount');
  if(notifMount&&window.mountNotifications)mountNotifications(SB,notifMount,sbUser.id);
  const pmMount=document.getElementById('pmMount');
  if(pmMount&&window.mountPmInbox)mountPmInbox(SB,pmMount,sbUser.id);
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









buildCompTypes();
calcDelay();calcReverb();calcComp();
calcNoteHz();calcLufs();calcRoom();
setTimeout(drawEnvelope,50);
sbInit();

// ── Карточка "Статус площадки" в герое — честные живые цифры, не
// "онлайн сейчас" (на небольшой площадке почти всегда 0, выглядит как
// заброшенный сайт) — общее число участников только растёт. Публичные
// таблицы (profiles/glossary_terms/forum_threads все select using(true)),
// анонимного ключа достаточно, авторизация не нужна.
async function loadHeroStatus(){
  const [{count:userCount},{count:termCount},{count:threadCount}]=await Promise.all([
    SB.from('profiles').select('id',{count:'exact',head:true}),
    SB.from('glossary_terms').select('id',{count:'exact',head:true}),
    SB.from('forum_threads').select('id',{count:'exact',head:true}),
  ]);
  const userEl=document.getElementById('heroUserCount');
  const termEl=document.getElementById('heroTermCount');
  const threadEl=document.getElementById('heroThreadCount');
  if(userEl)userEl.textContent=userCount??'—';
  if(termEl)termEl.textContent=termCount??'—';
  if(threadEl)threadEl.textContent=threadCount??'—';
}
loadHeroStatus();

// Ссылки с других страниц ведут на index.html#trainers и т.п. —
// открываем нужную вкладку сразу, а не всегда «Главную»
(function(){
  const initialTab=location.hash.slice(1);
  const btn=document.querySelector('.nav-tab[data-tab="'+initialTab+'"]');
  if(btn)tab(initialTab,btn);
})();