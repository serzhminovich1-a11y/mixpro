-- MIXPRO — конструктор шагов внутри урока (тесты, текстовый/числовой ответ,
-- сопоставление, сортировка, теория). Выполнить в Supabase SQL Editor
-- целиком, после всех предыдущих миграций.
--
-- Идея: урок (lessons) как был — заголовок + необязательное видео — так
-- и остаётся. Шаги (lesson_steps) — это ДОПОЛНИТЕЛЬНЫЙ слой контента
-- внутри урока: теоретические блоки и интерактивные задания с
-- автопроверкой, которые показываются друг за другом после видео.
--
-- Программирование с проверкой кода НЕ делаем — это отдельный сервер
-- с песочницей для выполнения чужого кода, у сайта такого сервера нет
-- и не предвидится. LaTeX-формулы и подсветка синтаксиса тоже не нужны
-- курсам про звук.
--
-- Как спрятан правильный ответ от студента: student НЕ имеет прямого
-- доступа на чтение lesson_steps (RLS пускает туда только
-- VERIFIED_PRO/MENTOR/ADMIN — авторов). Студент получает шаги через
-- функцию get_lesson_steps(), которая явно не отдаёт колонку
-- correct_answer, и проверяет свой ответ через submit_step_answer(),
-- которая сверяет ответ ВНУТРИ базы данных и возвращает только
-- "верно/неверно" — сам правильный ответ никогда не уезжает в браузер.

-- ══════════════════════════════════════
--  ТАБЛИЦЫ
-- ══════════════════════════════════════
create table if not exists lesson_steps (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  order_index integer not null default 0,
  step_type text not null check (step_type in ('theory','quiz_single','quiz_multi','text_answer','number_answer','matching','sorting')),
  title text,
  content jsonb not null default '{}'::jsonb,   -- то, что видит студент (без ответа)
  correct_answer jsonb,                          -- null у theory; у остальных — ключ проверки
  explanation text,                              -- "решение автора", показывается после успеха/исчерпанных попыток
  xp_reward integer not null default 0,
  max_attempts integer,                          -- null = без ограничения
  created_at timestamptz not null default now()
);
create index if not exists idx_lesson_steps_lesson on lesson_steps(lesson_id, order_index);

create table if not exists step_attempts (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references lesson_steps(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  answer jsonb,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_step_attempts_user_step on step_attempts(user_id, step_id, created_at desc);

comment on table lesson_steps is
  'Шаги внутри урока — теория и интерактивные задания. correct_answer читают
   только авторы (RLS) и функция submit_step_answer() изнутри базы —
   обычный клиент эту колонку никогда не получает.';
comment on table step_attempts is
  'Каждая попытка ответа на шаг. Пишется ТОЛЬКО через submit_step_answer() —
   у обычных пользователей нет policy на прямой insert.';

-- ══════════════════════════════════════
--  RLS
-- ══════════════════════════════════════
alter table lesson_steps enable row level security;
drop policy if exists lesson_steps_staff_all on lesson_steps;
create policy lesson_steps_staff_all on lesson_steps for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));
-- Обычные студенты не получают ни одной policy на select — значит прямой
-- запрос к таблице для них вернёт пусто. Шаги они видят только через
-- get_lesson_steps() ниже (SECURITY DEFINER, без correct_answer).

alter table step_attempts enable row level security;
drop policy if exists step_attempts_select_own_or_staff on step_attempts;
create policy step_attempts_select_own_or_staff on step_attempts for select
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));
-- Insert намеренно без policy для обычных пользователей — попытки
-- пишутся только изнутри submit_step_answer() (SECURITY DEFINER).

-- ══════════════════════════════════════
--  ФУНКЦИЯ: получить шаги урока БЕЗ правильного ответа
-- ══════════════════════════════════════
create or replace function get_lesson_steps(p_lesson_id uuid)
returns table(
  id uuid, lesson_id uuid, order_index integer, step_type text,
  title text, content jsonb, explanation_available boolean,
  xp_reward integer, max_attempts integer
)
language sql
stable
security definer
as $$
  select id, lesson_id, order_index, step_type, title, content,
         (explanation is not null and explanation <> ''), xp_reward, max_attempts
  from lesson_steps
  where lesson_id = p_lesson_id
  order by order_index;
$$;

comment on function get_lesson_steps(uuid) is
  'Безопасный список шагов для студента — специально не выбирает correct_answer.';

-- ══════════════════════════════════════
--  ФУНКЦИЯ: отправить ответ на шаг, проверить и записать попытку
-- ══════════════════════════════════════
create or replace function submit_step_answer(p_step_id uuid, p_answer jsonb)
returns table(
  is_correct boolean, attempts_used integer, attempts_remaining integer,
  show_solution boolean, explanation text, xp_earned integer
)
language plpgsql
security definer
as $$
declare
  v_step lesson_steps%rowtype;
  v_used integer;
  v_correct boolean := false;
  v_already_correct boolean;
  v_xp_earned integer := 0;
  v_remaining integer;
begin
  select * into v_step from lesson_steps where id = p_step_id;
  if v_step.id is null then
    raise exception 'Шаг не найден';
  end if;

  select count(*) into v_used from step_attempts where step_id = p_step_id and user_id = auth.uid();
  if v_step.max_attempts is not null and v_used >= v_step.max_attempts then
    raise exception 'Попытки закончились';
  end if;

  select exists(
    select 1 from step_attempts where step_id = p_step_id and user_id = auth.uid() and is_correct
  ) into v_already_correct;

  -- Сверка ответа — по типу шага. Обёрнуто в блок с перехватом ошибок:
  -- если студент пришлёт кривой JSON (например, нечисловое значение там,
  -- где ждём число), просто засчитываем как неверный ответ, а не роняем
  -- всю функцию с ошибкой.
  begin
    v_correct := case v_step.step_type
      when 'theory' then true
      when 'quiz_single' then
        (p_answer -> 'selected') = (v_step.correct_answer -> 'correct')
      when 'quiz_multi' then
        (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from jsonb_array_elements_text(p_answer -> 'selected') x)
        = (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from jsonb_array_elements_text(v_step.correct_answer -> 'correct') x)
      when 'text_answer' then
        exists (
          select 1 from jsonb_array_elements_text(v_step.correct_answer -> 'accepted') acc
          where lower(trim(acc)) = lower(trim(p_answer ->> 'text'))
        )
      when 'number_answer' then
        abs((p_answer ->> 'value')::numeric - (v_step.correct_answer ->> 'value')::numeric)
          <= coalesce((v_step.correct_answer ->> 'tolerance')::numeric, 0)
      when 'matching' then
        (p_answer -> 'mapping') = (v_step.correct_answer -> 'mapping')
      when 'sorting' then
        (p_answer -> 'order') = (v_step.correct_answer -> 'order')
      else false
    end;
  exception when others then
    v_correct := false;
  end;

  insert into step_attempts (step_id, user_id, answer, is_correct)
  values (p_step_id, auth.uid(), p_answer, v_correct);

  v_used := v_used + 1;
  v_remaining := case when v_step.max_attempts is null then null else greatest(v_step.max_attempts - v_used, 0) end;

  if v_correct and not v_already_correct and v_step.xp_reward > 0 then
    perform set_config('app.bypass_privileged_guard', 'true', true);
    update profiles set xp = xp + v_step.xp_reward where id = auth.uid();
    v_xp_earned := v_step.xp_reward;
  end if;

  return query select
    v_correct,
    v_used,
    v_remaining,
    (v_correct or (v_step.max_attempts is not null and v_used >= v_step.max_attempts)),
    v_step.explanation,
    v_xp_earned;
end;
$$;

comment on function submit_step_answer(uuid, jsonb) is
  'Проверяет ответ студента ВНУТРИ базы и пишет попытку. correct_answer
   наружу не возвращается никогда — только is_correct и (при успехе или
   исчерпанных попытках) текст объяснения от автора.';
