-- MIXPRO — автовыдача сертификатов за пройденные курсы.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.
--
-- Таблица certificates существовала с самого первого этапа (001_lms_schema.sql),
-- но ничего в неё не писало — не было связи с курсом и того, кто бы решал,
-- когда сертификат заслужен. Раньше выдача была задумана только вручную
-- (MENTOR/ADMIN), эта миграция добавляет ещё и автоматическую: как только
-- пройдены ВСЕ уроки курса, сертификат выдаётся сам — тем же приёмом,
-- что и достижения (SECURITY DEFINER функция + триггер, см.
-- 004_achievement_engine.sql). Ручная выдача штабом остаётся возможна.

-- ══════════════════════════════════════
--  СВЯЗЬ С КУРСОМ + ЗАЩИТА ОТ ДУБЛЕЙ
-- ══════════════════════════════════════
alter table certificates add column if not exists course_id uuid references courses(id) on delete cascade;

do $$ begin
  alter table certificates add constraint certificates_user_course_unique unique (user_id, course_id);
exception when duplicate_object then null; end $$;

-- Сертификат — как достижение или трек в портфолио, это то, чем логично
-- гордиться на публичном профиле, поэтому расширяем чтение до "видит
-- любой", а не только сам владелец/MENTOR/ADMIN (как было настроено в
-- 002_lms_rls.sql, когда о публичных профилях ещё речи не шло).
drop policy if exists certificates_select_own_or_staff on certificates;
drop policy if exists certificates_select_all on certificates;
create policy certificates_select_all on certificates for select using (true);

comment on column certificates.course_id is
  'Курс, за который выдан сертификат. NULL — сертификат выдан вручную не за конкретный курс.';

-- ══════════════════════════════════════
--  ФУНКЦИЯ: проверить и выдать сертификат за курс
-- ══════════════════════════════════════
create or replace function check_and_grant_certificate(p_user_id uuid, p_course_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_total_lessons integer;
  v_completed_lessons integer;
  v_course_title text;
  v_already boolean;
begin
  select count(*) into v_total_lessons from lessons where course_id = p_course_id;
  if v_total_lessons = 0 then
    return;
  end if;

  select count(*) into v_completed_lessons
    from lesson_progress lp
    join lessons l on l.id = lp.lesson_id
    where l.course_id = p_course_id and lp.user_id = p_user_id and lp.status = 'completed';

  if v_completed_lessons < v_total_lessons then
    return;
  end if;

  select exists(
    select 1 from certificates where user_id = p_user_id and course_id = p_course_id
  ) into v_already;
  if v_already then
    return;
  end if;

  select title into v_course_title from courses where id = p_course_id;

  insert into certificates (user_id, title, course_id, issued_by)
  values (p_user_id, v_course_title, p_course_id, null);
end;
$$;

comment on function check_and_grant_certificate(uuid, uuid) is
  'Если пользователь прошёл ВСЕ уроки курса и ещё не получал за него сертификат — выдаёт. issued_by = null означает "выдано автоматически", не вручную наставником.';

-- ══════════════════════════════════════
--  ТРИГГЕР: урок отмечен пройденным → проверить курс целиком
-- ══════════════════════════════════════
create or replace function trg_certificate_on_lesson_progress()
returns trigger language plpgsql as $$
declare v_course_id uuid;
begin
  if new.status = 'completed' then
    select course_id into v_course_id from lessons where id = new.lesson_id;
    if v_course_id is not null then
      perform check_and_grant_certificate(new.user_id, v_course_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lesson_progress_certificate on lesson_progress;
create trigger trg_lesson_progress_certificate
  after insert or update on lesson_progress
  for each row execute function trg_certificate_on_lesson_progress();

-- ══════════════════════════════════════
--  РАЗОВЫЙ ПЕРЕСЧЁТ — тем, кто уже прошёл курс на 100% ДО этой миграции,
--  сертификат выдаётся сразу, а не при следующем отмеченном уроке.
-- ══════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select distinct lp.user_id, l.course_id
    from lesson_progress lp
    join lessons l on l.id = lp.lesson_id
    where lp.status = 'completed'
  loop
    perform check_and_grant_certificate(r.user_id, r.course_id);
  end loop;
end $$;
