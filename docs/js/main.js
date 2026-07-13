// ══════════════════════════════════════
//   DATA
// ══════════════════════════════════════
const LESSONS = [
 {
  num:'01', free:true,
  title:'Введение в микширование',
  desc:'Философия звука, мониторинг, референсы и рабочий процесс от сырого материала до готового микса.',
  body:`
<h4>Что такое микширование</h4>
<p>Микширование — это не просто «сделать громче». Это процесс баланса: каждый элемент занимает своё место по громкости, по частоте, по пространству. Хороший микс слышен на любой системе — от AirPods до клубного звука — и в каждом случае работает.</p>
<p>Главное заблуждение новичков: «если звучит плохо, значит надо ещё добавить». На самом деле большинство проблем решается вычитанием — убрать лишнее, освободить пространство для главного.</p>

<h4>Мониторинг и рабочее место</h4>
<p>Нельзя сделать хороший микс на плохих наушниках в необработанной комнате. Это не значит, что нужна студия за миллион — достаточно понимать ограничения своего места.</p>
<ul>
  <li><strong>Наушники:</strong> Beyerdynamic DT 990 Pro / Sony MDR-7506 — рабочие варианты. Главное — знать их окраску и использовать коррекционный EQ (например, профили в Sonarworks или встроенные в Logic)</li>
  <li><strong>Мониторы:</strong> Adam T5V, Yamaha HS5, Focal Alpha 50 — начальный уровень студийного контроля</li>
  <li><strong>Громкость:</strong> работай при ~75–80 dB SPL. Регулярно слушай тихо — на малой громкости плохой баланс слышен сразу</li>
  <li><strong>Акустика:</strong> хотя бы мягкая мебель и шторы — уже лучше голой комнаты. Угловые bass traps критически важны для суббаса</li>
</ul>
<div class="callout"><strong>Правило:</strong> слушай на разных системах. AirPods, машина, телефон, Bluetooth колонка — микс должен работать везде.</div>

<h4>Референсные треки</h4>
<p>Референс — это трек в том жанре и стиле, который ты хочешь получить, уже прошедший профессиональное сведение и мастеринг. Открываешь его рядом со своим миксом и сравниваешь.</p>
<ul>
  <li>Импортируй референс на отдельный трек в DAW, выровняй по уровню (–14 LUFS интегрированный, как у стримингов)</li>
  <li>Сравнивай каждые 10–15 минут — уши «замыливаются» и перестают слышать реальную картину</li>
  <li>Обращай внимание: где сидит вокал, насколько открыт верх, сколько суббаса, насколько широко стерео</li>
</ul>

<h4>Workflow: от груды треков до готового микса</h4>
<ul>
  <li>Организация сессии (именование, цвета, группировка)</li>
  <li>Gain staging — правильные уровни на каждом этапе</li>
  <li>Черновой баланс фейдерами — без единого плагина</li>
  <li>Обработка: EQ, компрессия, пространство, эффекты</li>
  <li>Автоматизация и финальный баланс</li>
  <li>Bounce и проверка на разных системах</li>
</ul>
  `
 },
 {
  num:'02', free:true,
  title:'Организация сессии в DAW',
  desc:'Шаблон проекта, routing, Bus/Aux каналы, Summing Stacks, gain staging.',
  body:`
<h4>Шаблон проекта — один раз, навсегда</h4>
<p>Хаотичная сессия убивает творческий поток. Трать первые 5 минут на организацию — экономишь часы на финальном этапе. Создай шаблон один раз и открывай каждый новый проект из него.</p>
<ul>
  <li><strong>Цвета по смыслу:</strong> вокал — синий, кики — красный, атмосфера — зелёный. Придерживайся системы всегда</li>
  <li><strong>Именование:</strong> «Vox Lead», «Vox Double», «Vox Adlib 1», а не «Audio 1», «Audio 2»</li>
  <li><strong>Порядок каналов:</strong> кик / снейр / хэты / перки / 808 / бас / пэды / вокал main / вокал doubles / adlibs / FX</li>
</ul>

<h4>Routing: как сигнал течёт через DAW</h4>
<p>В Logic Pro и других DAW сигнал идёт: Трек → Bus/Aux → Master. Понимание этой цепочки — основа профессиональной работы.</p>
<div class="callout"><strong>Пример цепочки для рэп-проекта:</strong><br>
Vox Lead + Vox Double + Adlibs → <em>Vocal Bus</em> → компрессор на шине → Reverb Send → Master Bus → лимитер → выход</div>

<h4>Bus и Aux каналы: зачем они нужны</h4>
<ul>
  <li><strong>Bus:</strong> группирует треки одного типа. Обрабатываешь всех вокалистов одним компрессором на шине — экономишь ресурсы и получаешь единый «клей»</li>
  <li><strong>Aux / Send:</strong> параллельные эффекты (reverb, delay). Один экземпляр ревербератора — на 20 треков. Так же работает параллельная компрессия</li>
  <li><strong>Naming:</strong> называй шины понятно: «Vocal Bus», «Drum Bus», «Vox Room Send», «Plate Short» — не «Bus 1»</li>
</ul>

<h4>Summing Stacks в Logic Pro</h4>
<p>Track Stack позволяет создать иерархию: Folder Stack группирует визуально, Summing Stack суммирует аудио на одну шину. Структура рэп-проекта:</p>
<ul>
  <li>Summing Stack «VOCALS» ← Vox Lead, Double, Adlibs, Harmonies</li>
  <li>Summing Stack «BEATS» ← Kick, Snare, Hats, 808, Перки</li>
  <li>Summing Stack «ATMO» ← Пэды, Мелодии, FX атмосфера</li>
</ul>

<h4>Gain Staging: уровни имеют значение</h4>
<p>Gain staging — это контроль уровней на каждом этапе цепочки сигнала. Цель: плагины работают в правильном диапазоне, нет перегрузки, есть запас динамики.</p>
<ul>
  <li>Входящий уровень на канале: –18 dBFS RMS (есть headroom для динамики)</li>
  <li>После компрессора: компенсируй Makeup Gain так, чтобы уровень до/после компрессора был одинаковым при bypass</li>
  <li>На шинах: не выше –6 dBFS Peak до мастер-шины</li>
  <li>Master Bus перед мастерингом: –6 … –3 dBFS Peak</li>
</ul>
  `
 },
 {
  num:'03', free:true,
  title:'EQ: формирование тембра',
  desc:'Субтрактивный и аддитивный EQ, Hi-pass/Lo-pass, маскировка частот, динамический EQ.',
  body:`
<h4>Зачем нужен EQ</h4>
<p>EQ (эквалайзер) управляет балансом частот в звуке. Каждый инструмент занимает свой диапазон спектра, и когда несколько источников «сидят» в одной зоне — они маскируют друг друга. EQ помогает дать каждому элементу своё место.</p>

<h4>Главное правило: сначала вычитай</h4>
<p>Новички сразу добавляют частоты. Профессионалы сначала убирают лишнее. Субтрактивный EQ — это поиск «грязных» частот: бочки в вокале, резонансов в 808, mud в 200–400 Hz, который есть почти в любом треке.</p>
<div class="callout"><strong>Workflow:</strong> Hi-pass filter (убрать sub под инструментом) → hunt and cut (ищи резонансы широким boost, сужай и убирай) → аддитивные штрихи в конце</div>

<h4>Hi-pass и Lo-pass фильтры</h4>
<ul>
  <li><strong>Hi-pass (HPF):</strong> убирает всё ниже точки среза. Вокал в рэпе: HPF 80–100 Hz. Гитара: 120–150 Hz. Это освобождает sub и bass зону для 808 и кика</li>
  <li><strong>Lo-pass (LPF):</strong> убирает верхние частоты. Хорошо работает на ревербах и дилеях — делает их тёмнее, не режет high end основного звука</li>
  <li><strong>Крутизна:</strong> 12 dB/oct мягко, 24 dB/oct агрессивно. Не бойся 24 dB/oct на HPF вокала</li>
</ul>

<h4>Частотная маскировка</h4>
<p>Когда два источника звучат в одном диапазоне, громкий маскирует тихий. Решение: прорезать (cut) в одном там, где другой занимает главное место.</p>
<ul>
  <li>808 занимает 40–100 Hz → кику HPF повыше (60–80 Hz), акцент в transient (3–5 kHz)</li>
  <li>Вокал занимает 200 Hz – 4 kHz → пэдам небольшой cut в области 1–2 kHz при появлении вокала</li>
  <li>Две гитары: одну панируй влево, у другой небольшой cut там, где первая сильна</li>
</ul>

<h4>EQ на вокале рэпа</h4>
<ul>
  <li>HPF: 80–100 Hz — убрать rumble и HVAC</li>
  <li>Cut 200–300 Hz: –2…–4 dB — убрать «ящичность», mud</li>
  <li>Cut или boost 1–2 kHz: пространство для разборчивости</li>
  <li>Boost 3–5 kHz: +2…+4 dB — presence, голос вылезает вперёд</li>
  <li>Boost 8–12 kHz: +2…+3 dB — воздух, блеск (аккуратно с сибилянтами)</li>
</ul>
<div class="callout"><strong>Инструменты:</strong> FabFilter Pro-Q3 — стандарт индустрии. Spectrum analyzer в реальном времени позволяет видеть то, что слышишь. В Logic: Channel EQ хорош для быстрой работы, но Pro-Q3 точнее.</div>

<h4>Динамический EQ vs De-esser</h4>
<p>Динамический EQ срабатывает только когда частота превышает пороговый уровень. Идеально для сибилянтов вокала и резонансов, которые проявляются непостоянно. soothe2 делает это автоматически по всему спектру — незаменимый инструмент на вокальных треках.</p>
  `
 },
 {
  num:'04', free:true,
  title:'Компрессия: контроль динамики',
  desc:'Attack, Release, Ratio, Threshold, Knee. Параллельная компрессия. VCA, FET, Optical, Tube. Сайдчейн.',
  body:`
<h4>Зачем нужен компрессор</h4>
<p>Компрессор уменьшает динамический диапазон сигнала — разницу между тихими и громкими частями. В рэпе это критично: рэпер говорит тихо в одной строфе, кричит в другой. Компрессор выравнивает так, чтобы каждое слово было слышно на одном уровне.</p>
<p>Но компрессор — это ещё и звуковой инструмент. Правильные attack и release меняют тембральный характер звука: делают кик более панчёвым, вокал более плотным, шину «склеенной».</p>

<h4>Параметры компрессора</h4>
<ul>
  <li><strong>Threshold:</strong> уровень, выше которого начинается компрессия. Ставь так, чтобы GR (gain reduction) был –3…–6 dB на вокале, –6…–10 dB на кике</li>
  <li><strong>Ratio:</strong> степень сжатия. 4:1 — стандарт для вокала. 8:1+ — агрессивно, почти лимитирование</li>
  <li><strong>Attack:</strong> как быстро компрессор реагирует. Быстрый attack (1–5 ms) убивает transient. Медленный (20–50 ms) — пропускает атаку, компрессирует тело</li>
  <li><strong>Release:</strong> как быстро компрессор «отпускает». Слишком быстрый — pumping. Слишком медленный — зажатость. Лучший старт: автоматический Release, или синхронизация с BPM (используй Delay Calculator)</li>
  <li><strong>Knee:</strong> Hard knee — резкое срабатывание. Soft knee — плавное. На вокале чаще soft (6 dB knee)</li>
  <li><strong>Makeup Gain:</strong> восстанавливает уровень после компрессии. Выравнивай bypass/активный компрессор по уровню — иначе «кажется лучше» только потому что громче</li>
</ul>

<h4>Типы компрессоров</h4>
<ul>
  <li><strong>VCA (SSL G-Bus, API 2500):</strong> быстрый, точный, агрессивный. Отлично на шинах и барабанах</li>
  <li><strong>FET (1176):</strong> очень быстрый, добавляет character. На вокале рэпа — легендарное звучание</li>
  <li><strong>Optical (LA-2A, LA-3A):</strong> медленный, музыкальный. На вокале Pop/R&B, на басу</li>
  <li><strong>Tube (Fairchild, Vari-Mu):</strong> тёплый, мягкий, на мастер-шине и шинах</li>
</ul>
<div class="callout"><strong>На UAD:</strong> 1176 (FET) на вокале, LA-2A (Optical) на басу, SSL G-Bus на Drum Bus — классическая рабочая цепочка.</div>

<h4>Параллельная (NY) компрессия</h4>
<p>Смешиваешь оригинальный сигнал с сильно скомпрессированным. Получаешь плотность и панч без потери transients и естественности. На барабанах — обязательно. На вокале — попробуй через Aux Send.</p>

<h4>Сайдчейн компрессия</h4>
<p>Компрессор на одном треке управляется сигналом с другого. Классика: кик управляет компрессором на 808/басу. При каждом ударе кика бас немного уступает — создаётся groove и разборчивость в low-end.</p>
  `
 },
 {
  num:'05', free:true,
  title:'Реверберация и пространство',
  desc:'Типы реверберации, pre-delay, sends vs insert, построение глубины, reverb в рэпе.',
  body:`
<h4>Зачем нужна реверберация</h4>
<p>Реверберация помещает звук в пространство. Без неё микс звучит плоско и «мёртво». Но слишком много — и всё превращается в кашу. Задача: создать ощущение глубины, не теряя разборчивости.</p>

<h4>Типы реверберации</h4>
<ul>
  <li><strong>Room:</strong> небольшое пространство, плотные ранние отражения. Делает звук «реальным», живым. На барабанах — всегда</li>
  <li><strong>Hall:</strong> большой зал, длинный хвост. На вокале поп/R&B. В рэпе — осторожно, только как творческий инструмент</li>
  <li><strong>Plate:</strong> металлическая пластина, яркий плотный звук. Легендарно на снейре. На вокале рэпа — короткий plate добавляет presence</li>
  <li><strong>Spring:</strong> пружинный реверб, специфический звук. Для lo-fi, vintage эффектов</li>
  <li><strong>Convolution:</strong> реальные импульсные отклики реальных пространств. Максимальный реализм, но тяжёлый на ресурсы</li>
</ul>
<div class="callout"><strong>Valhalla VintageVerb:</strong> лучшее соотношение цена/качество. Dark Mode для мягкого хвоста, Bright для открытого пространства. На вокале рэпа — Bright plate с короткими временами (RT60 0.8–1.2 сек).</div>

<h4>Pre-delay: почему он важен</h4>
<p>Pre-delay — задержка между прямым звуком и началом реверберации. Даже 20–40 ms pre-delay радикально улучшают разборчивость вокала: прямой звук «прилетает» первым, а затем уже появляется хвост.</p>
<p>Синхронизируй pre-delay с BPM через Reverb Calculator на вкладке Инструменты. Четверть или восьмая — хороший старт для рэп-вокала.</p>

<h4>Sends vs Insert для ревербов</h4>
<ul>
  <li><strong>Send (параллельно):</strong> оригинальный звук идёт сухим, параллельно — в reverb. Mix ревербератора 100% (wet only). Так работают профессиональные студии — один reverb на 10 треков, контроль через фейдер Send</li>
  <li><strong>Insert (последовательно):</strong> редко для реверба, уместно только для специфических творческих эффектов. В основном не рекомендуется</li>
</ul>

<h4>Построение глубины в миксе</h4>
<p>Глубина создаётся тремя инструментами: громкостью (тихое = дальше), высокочастотным контентом (высоких меньше = дальше) и количеством реверберации (больше wet = дальше).</p>
<ul>
  <li>Вокал ближе всего: много прямого звука, мало reverb, высоких много</li>
  <li>Пэды дальше: немного тише, LPF на высоких, больше reverb хвоста</li>
  <li>Атмосфера ещё дальше: почти только reverb tail, высокие срезаны</li>
</ul>
  `
 },
 {
  num:'06', free:true,
  title:'Эффекты: delay, модуляция, pitch',
  desc:'Tape delay, ping-pong, reverse delay, chorus, flanger, pitch shift. Творческие эффекты в рэпе.',
  body:`
<h4>Delay: основы и виды</h4>
<p>Delay повторяет звук с задержкой. В отличие от реверба, повторения слышимы как отдельные события. Синхронизированный с BPM delay — мощный ритмический инструмент.</p>
<ul>
  <li><strong>Tape Delay:</strong> аналоговый характер, небольшие флуктуации pitch. Тепло и vintage. На вокале рэпа — с LPF на Feedback для тёмных повторений</li>
  <li><strong>Ping-Pong:</strong> повторения чередуются между Left/Right. Создаёт стерео-ширину. На adlibs, на финальном слоге фразы</li>
  <li><strong>Reverse Delay:</strong> повторение «задом наперёд». Психоделический эффект, особенно на вокальных завитушках</li>
  <li><strong>Slapback:</strong> очень короткий (60–120 ms) однократный delay без feedback. Добавляет «толщину» вокалу без слышимого повторения</li>
</ul>
<div class="callout"><strong>Про совет:</strong> filter the feedback. Каждое повторение должно быть темнее предыдущего — ставь LPF 6–8 kHz на feedback chain или используй режим Vintage в плагине. Натуральнее и не режет high-end основного звука.</div>

<h4>Модуляция: chorus, flanger, phaser</h4>
<ul>
  <li><strong>Chorus:</strong> несколько слегка расстроенных копий. Делает моно-звук широким и «сочным». На пэдах, бэк-вокале, иногда на 808 для движения</li>
  <li><strong>Flanger:</strong> короткий модулируемый delay с feedback. Металлический, jet-plane звук. Аккуратно — очень узнаваемо</li>
  <li><strong>Phaser:</strong> срезает определённые частоты с LFO. Более тонко, чем flanger. Хорошо на синтах и пэдах</li>
</ul>

<h4>Pitch Shift и Harmony</h4>
<ul>
  <li><strong>Pitch shift ±1–3 cent на дублях:</strong> немного детюнированная копия вокала + оригинал = «жирный» звук без слышимого хора</li>
  <li><strong>Harmony:</strong> авто-гармония (Antares Harmony Engine, iZotope Nectar). В рэпе — на отдельных фразах как творческий штрих</li>
  <li><strong>Formant shift:</strong> меняет характер голоса без изменения pitch. Chipmunk вверх, «демон» вниз</li>
</ul>

<h4>Творческие эффекты в рэп-продакшне</h4>
<ul>
  <li>Вокальный трек через Bitcrusher → mix 15–20% — lo-fi текстура</li>
  <li>Distortion на 808 через Saturation → добавляет harmonics, слышен на маленьких колонках</li>
  <li>Stutter effect: gate с быстрым LFO на последнем слоге. AutoGate, LFO Tool</li>
  <li>Vocal chop: нарезка вокальной фразы и перестановка через самплер</li>
</ul>
  `
 },
 {
  num:'07', free:true,
  title:'Стерео и панорамирование',
  desc:'Mid/Side обработка, правила pan, Haas effect, моно-совместимость.',
  body:`
<h4>Mono vs Stereo: фундаментальный вопрос</h4>
<p>Рэп слушают везде: Bluetooth колонки, телефоны, одна колонка в магазине — всё это моно. Если твой микс разваливается в моно, ты теряешь половину аудитории. Проверяй моно-совместимость на каждом этапе работы.</p>

<h4>Правила панорамирования</h4>
<ul>
  <li><strong>Центр (0°):</strong> кик, снейр, 808, вокал lead, бас. Всё, что несёт главную энергию и смысл</li>
  <li><strong>Лёгкое панорирование (L15/R15):</strong> хэты, небольшие перки, дубли вокала</li>
  <li><strong>Широкое (L30/R30 и дальше):</strong> пэды, атмосфера, эффекты. Никогда — суббас и кик</li>
  <li><strong>Стерео vs Моно на треке:</strong> суббас и кик всегда в моно ниже 120 Hz. Используй Mid/Side или Mono Maker</li>
</ul>

<h4>Mid/Side обработка</h4>
<p>M/S разделяет сигнал на центральный (Mid = L+R) и боковой (Side = L-R) компоненты. Обрабатывай их независимо:</p>
<ul>
  <li>Boost High в Side → воздух шире, не трогая центральный вокал</li>
  <li>Cut Low в Side → Bass в центре, нет фазовых проблем в низах</li>
  <li>Compress Mid жёстче → стабилизируй вокал, не трогая атмосферу</li>
</ul>
<div class="callout"><strong>FabFilter Pro-Q3:</strong> встроенный M/S режим. Просто переключи на M/S в правом верхнем углу и обрабатывай каналы независимо.</div>

<h4>Haas Effect</h4>
<p>Delay одного канала 10–40 ms создаёт ощущение широты при сохранении монофонической совместимости (Haas effect). Аккуратно: при сумировании в моно могут быть фазовые проблемы. Проверяй.</p>

<h4>Stereo Wideners: осторожно</h4>
<p>Большинство stereo wideners создают фазовые артефакты при суммировании в моно. Mid/Side через EQ — безопаснее. Если используешь widener, включи Correlation Meter (iZotope Insight, SPAN) и следи, чтобы не уходил в минус.</p>
  `
 },
 {
  num:'08', free:true,
  title:'Сведение вокала в рэпе',
  desc:'Стекинг, doubles, adlibs, gain staging вокала, de-essing, Auto-Tune.',
  body:`
<h4>Анатомия вокального стека в рэпе</h4>
<p>Профессиональный рэп-вокал — это не один трек. Это пирамида из нескольких слоёв, каждый из которых выполняет свою функцию.</p>
<ul>
  <li><strong>Lead vocal (main):</strong> главный дубль. Должен быть идеальным — лучший take, лучшее произношение. Сидит в центре микса</li>
  <li><strong>Double (x2):</strong> второй дубль, записанный отдельно. Немного тише (–6…–8 dB). Создаёт плотность. При совпадении pitch с main — работает как хор</li>
  <li><strong>Adlibs:</strong> короткие фразы, восклицания, повторения отдельных слов. Заполняют пространство, добавляют энергию. Тише основного (–10…–12 dB)</li>
  <li><strong>Whisper vocal:</strong> тихий шёпот того же текста. Создаёт «глубину», ощущение что за основным вокалом есть ещё один слой</li>
</ul>
<div class="callout"><strong>Правило ширины:</strong> Lead — центр. Double — лёгкое L/R (±15°). Adlibs — L/R (±20–30°). Whisper — широко (±40°). Пирамида по ширине и громкости.</div>

<h4>Gain Staging вокала</h4>
<ul>
  <li>До всех плагинов: нормализуй так, чтобы пики были –6…–3 dBFS</li>
  <li>Ручная коррекция уровня (volume automation) перед компрессором: выровняй самые тихие и громкие фразы</li>
  <li>Только после этого — компрессор. Иначе он работает вхолостую или слишком агрессивно</li>
</ul>

<h4>Стандартная цепочка обработки вокала</h4>
<ul>
  <li>Pitch correction (Auto-Tune / Melodyne)</li>
  <li>De-noise (если нужно)</li>
  <li>Hi-pass EQ (80–100 Hz)</li>
  <li>Компрессор №1 (fast FET: 1176 или аналог) — контроль пиков</li>
  <li>EQ формирование тембра (FabFilter Pro-Q3)</li>
  <li>De-esser / soothe2</li>
  <li>Компрессор №2 (Optical: LA-2A) — характер, «клей»</li>
  <li>Saturation (лёгкая) — гармоники, присутствие</li>
  <li>Reverb Send, Delay Send</li>
</ul>

<h4>Auto-Tune: как использовать правильно</h4>
<ul>
  <li><strong>Retune Speed 0–20:</strong> очень быстро, слышимый «тюн-эффект». Т-Pain, Playboi Carti, современный трэп</li>
  <li><strong>Retune Speed 20–50:</strong> натуральная коррекция, незаметная при правильном исполнении</li>
  <li><strong>Key и Scale:</strong> обязательно выставляй правильную тональность и гамму. Иначе Auto-Tune будет «тянуть» не туда</li>
  <li><strong>Humanize:</strong> увеличивай на длинных нотах — убирает metallic звук</li>
  <li><strong>Melodyne vs Auto-Tune:</strong> Melodyne — лучший контроль, подходит для сложной коррекции. Auto-Tune — лучше для эффекта и real-time</li>
</ul>
  `
 },
 {
  num:'09', free:true,
  title:'Low-end: кик, 808 и бас',
  desc:'Отношения кика и 808, сайдчейн, моно-совместимость суббаса, тюнинг 808.',
  body:`
<h4>Главная проблема low-end в рэпе</h4>
<p>808 и кик делят одно пространство — 40–120 Hz. Когда они играют одновременно, они маскируют друг друга, создают интерференцию и фазовые проблемы. Профессиональный low-end — это результат работы с их отношениями, а не просто «подниму басы».</p>

<h4>Тюнинг 808</h4>
<p>808 — это тоновый элемент. Он должен быть в тональности трека. Невыстроенный 808 звучит дисгармонично и создаёт клешинг с мелодией.</p>
<ul>
  <li>Определи root note трека (ключ/тональность)</li>
  <li>Pitch-tune 808 к этой ноте в Melodyne или встроенным pitchbend в DAW</li>
  <li>Для разных нот мелодии — автоматизируй pitch 808</li>
</ul>
<div class="callout"><strong>808 distortion:</strong> чистый суббас не слышен на маленьких колонках. Добавь лёгкую сатурацию (Decapitator, Saturn 2, встроенный distortion) — появятся harmonics 2-го и 3-го порядка (80–300 Hz), которые слышны везде.</div>

<h4>Sidechain: кик управляет 808</h4>
<p>При каждом ударе кика компрессор на 808 кратковременно уменьшает его уровень. Создаётся пульсирующий, «дышащий» грув. Настройка:</p>
<ul>
  <li>Компрессор на канале 808, sidechain вход = кик</li>
  <li>Ratio: 4:1 – 8:1. Attack: 1–5 ms. Release: синхронизируй с BPM (восьмая или четверть)</li>
  <li>Начни с –4…–6 dB GR при ударе кика. Больше — помпинг становится слышимым как эффект</li>
</ul>

<h4>Кик: атака без sub</h4>
<ul>
  <li>Основная энергия кика: 50–80 Hz (удар) и 2–5 kHz (клик, transient)</li>
  <li>HPF кика: 40–50 Hz — убираешь самый суб, который занимает 808</li>
  <li>Boost 3–5 kHz — клик слышен на маленьких колонках и в моно</li>
  <li>LPF 12–15 kHz — убирает шипение, оставляет тело</li>
</ul>

<h4>Моно-совместимость суббаса</h4>
<p>Всё ниже 80–120 Hz должно быть в моно. Стерео суббас при суммировании в моно создаёт фазовую отмену — бас исчезает. Используй FabFilter Pro-Q3 в M/S режиме: в канале Side поставь Hi-pass на 80–100 Hz. Subbass остаётся только в Mid — моно.</p>
  `
 },
 {
  num:'10', free:true,
  title:'Финальные фишки и чеклист',
  desc:'Автоматизация, loudness targets, финальный чеклист перед сдачей, прослушивание на разных системах.',
  body:`
<h4>Автоматизация: микс должен дышать</h4>
<p>Статичный микс звучит мёртво. Автоматизация — движение во времени: уровни, эффекты, фильтры, pan меняются вместе с энергией трека.</p>
<ul>
  <li><strong>Volume automation:</strong> поднимай вокал на 0.5–1 dB в ключевых моментах (хук), опускай в паузах</li>
  <li><strong>Reverb automation:</strong> перед хуком резко открой reverb на последнем слове — создаёт anticipation</li>
  <li><strong>LPF automation:</strong> классика — закрой LPF в начале куплета и открой к хуку (build-up)</li>
  <li><strong>Pan automation:</strong> лёгкое движение adlibs в пространстве делает микс живым</li>
</ul>

<h4>Loudness: LUFS и стриминг</h4>
<p>Spotify, Apple Music, YouTube нормализуют громкость к –14 LUFS интегрированный (некоторые — к –16). Если ты мастеришь в –7 LUFS чтобы «громче» — стриминг приглушит трек и ты потеряешь динамику. Цели мастеринга:</p>
<ul>
  <li>Стриминг: –14 LUFS интегрированный, –1 dBTP True Peak</li>
  <li>Клуб / DJ: –9 … –11 LUFS (больше энергии, потеря динамики — осознанный выбор)</li>
  <li>Проверяй: iZotope Insight, Youlean Loudness Meter (бесплатный)</li>
</ul>

<h4>Финальный чеклист перед сдачей</h4>
<ul>
  <li>✓ Прослушал в наушниках И на мониторах</li>
  <li>✓ Прослушал в моно (кнопка Mono в DAW)</li>
  <li>✓ Прослушал на телефоне и Bluetooth колонке</li>
  <li>✓ Прослушал тихо (~60 dB SPL) — баланс не рассыпается?</li>
  <li>✓ Сравнил с референсом по уровню</li>
  <li>✓ Вокал разборчив? Каждое слово слышно?</li>
  <li>✓ Low-end работает в моно?</li>
  <li>✓ Нет clippping нигде в цепочке?</li>
  <li>✓ True Peak не превышает –1 dBTP?</li>
  <li>✓ Bounce в 24 bit WAV 44.1 kHz или 48 kHz</li>
</ul>
<div class="callout"><strong>Последний совет:</strong> после завершения работы отдохни 30 минут. Потом послушай ещё раз. Уши отдохнут и ты услышишь то, что «замылилось» за сессию. Это последний шанс поймать ошибку до отправки.</div>
  `
 },
];

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
let done=JSON.parse(localStorage.getItem('mp_done')||'[]');
let pts=parseInt(localStorage.getItem('mp_pts')||'0');
let tr=parseInt(localStorage.getItem('mp_right')||'0');
let ta=parseInt(localStorage.getItem('mp_ans')||'0');
let streak=0,bpm=120,curTrack='noise',diff='medium';
let cBand=null,cFreq=null,answered=false,qStart=0;
let aCtx=null,aGain=null,pNodes=[];
let taps=[],lastTap=0,compType='Вокал';

function save(){localStorage.setItem('mp_pts',pts);localStorage.setItem('mp_right',tr);localStorage.setItem('mp_ans',ta);localStorage.setItem('mp_done',JSON.stringify(done));}

function tab(id,btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');btn.classList.add('active');if(id==='tools')setTimeout(drawEnvelope,50);
}

function openVip(){
  if(vip)return;
  document.getElementById('vipLoginBlock').style.display=sbUser?'none':'block';
  document.getElementById('vipContactBlock').style.display=sbUser?'block':'none';
  document.getElementById('vipOverlay').classList.add('open');
}
function closeVip(){document.getElementById('vipOverlay').classList.remove('open');}
document.getElementById('vipOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeVip();});
function applyVip(){
  const nb=document.getElementById('navVipBtn');nb.textContent='✅ VIP';nb.classList.add('unlocked');nb.onclick=null;
  const r=document.getElementById('vipCtaRow');if(r)r.style.display='none';
  document.getElementById('freeTag').textContent='10 уроков';
  const vt=document.getElementById('vipTag');if(vt)vt.style.display='none';
}

// ══════════════════════════════════════
//   SUPABASE — VIP теперь привязан к аккаунту, не к коду в браузере
// ══════════════════════════════════════
const SB=supabase.createClient('https://mwzskffecoedpvyflswg.supabase.co','sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD');
let sbUser=null,sbProfile=null;
async function sbInit(){
  const{data:{session}}=await SB.auth.getSession();
  if(!session)return;
  sbUser=session.user;
  const{data:p}=await SB.from('profiles').select('*').eq('id',sbUser.id).single();
  sbProfile=p;
  if(p&&p.is_vip){
    vip=true;
    applyVip();
    renderLessons();
  }
}

function renderLessons(){
  if(vip)applyVip();
  const list=document.getElementById('lessonsList');list.innerHTML='';
  const c=done.length;
  document.getElementById('progressLabel').textContent='Прогресс: '+c+' / 10 уроков';
  document.getElementById('progressFill').style.width=(c/10*100)+'%';
  LESSONS.forEach((l,i)=>{
    const u=l.free||vip,isDone=done.includes(i);
    const card=document.createElement('div');
    card.className='lesson-card '+(u?(isDone?'done':'free'):'locked');
    card.innerHTML=(isDone?'<div class="l-done-bar"></div>':'')+
      '<div class="lesson-head"><span class="l-num">'+l.num+'</span><span class="l-title">'+l.title+'</span><span class="l-icon">'+(isDone?'✅':u?'▶':'🔒')+'</span></div>'+
      '<div class="l-desc">'+l.desc+'</div>'+
      (u&&l.body?'<div class="lesson-body" id="lb-'+i+'">'+l.body+'<div style="margin-top:18px"><button onclick="markDone('+i+',event)" style="font-family:var(--display);font-size:13px;font-weight:600;padding:9px 20px;border-radius:7px;border:1px solid var(--green);background:rgba(61,220,132,.08);color:var(--green);cursor:pointer;">'+(isDone?'✅ Пройден':'✓ Отметить пройденным')+'</button></div></div>':'');
    if(u&&l.body)card.onclick=e=>{if(e.target.tagName==='BUTTON')return;document.getElementById('lb-'+i).classList.toggle('open');};
    else if(!u)card.onclick=()=>openVip();
    list.appendChild(card);
  });
}
function markDone(i,e){e.stopPropagation();if(!done.includes(i))done.push(i);save();renderLessons();}

function syncBpm(v){
  bpm=Math.max(40,Math.min(300,parseFloat(v)||120));
  ['bpmIn','delBpm','revBpm','cmpBpm'].forEach(id=>{const el=document.getElementById(id);if(el&&parseFloat(el.value)!==bpm)el.value=bpm;});
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

  ctx.strokeStyle='#22d3ee';
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










function buildVU(){
  const el=document.getElementById('vuEl');
  if(!el)return;
  [.3,.5,.7,.9,1,.85,.6,.4,.7,.95,.8,.5,.35,.6,.9,.75,.45,.3,.65,.85,.5].forEach((h,i)=>{
    const b=document.createElement('div');b.className='vu-bar';const c=i<15?'#22d3ee':i<18?'#a78bfa':'#f87171';
    b.style.cssText='height:'+(h*44)+'px;background:'+c+';animation-delay:'+(i*.07).toFixed(2)+'s;animation-duration:'+(.9+Math.random()*.6).toFixed(2)+'s;';
    el.appendChild(b);
  });
}

buildVU();renderLessons();buildCompTypes();
calcDelay();calcReverb();calcComp();
calcNoteHz();calcLufs();calcRoom();
setTimeout(drawEnvelope,50);
sbInit();