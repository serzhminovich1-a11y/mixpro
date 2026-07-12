-- MIXPRO LMS — этап 2: Achievement Engine (автовыдача достижений + XP)
-- Выполнять ПОСЛЕ 001–003 (или после 000_ALL_IN_ONE.sql).
--
-- Идея: одна универсальная функция check_and_grant_achievements(user_id)
-- смотрит на реальную статистику пользователя (сколько уроков пройдено,
-- заданий сдано, проектов загружено, подтверждён ли эксперт) и сверяет
-- с условиями (condition_type/condition_value) из таблицы achievements.
-- Всё, что уже выполнено и ещё не выдано — выдаёт + начисляет xp_reward.
--
-- Функция вызывается САМА, через триггеры на lesson_progress /
-- assignment_submissions / projects / profiles — пользователю или сайту
-- не нужно ничего вызывать вручную.

-- ══════════════════════════════════════
--  ГЛАВНАЯ ФУНКЦИЯ: проверить и выдать
-- ══════════════════════════════════════
create or replace function check_and_grant_achievements(p_user_id uuid)
returns setof achievements
language plpgsql
security definer
as $$
declare
  v_lessons_completed integer;
  v_assignments_completed integer;
  v_projects_completed integer;
  v_expert_verified integer;
  v_achievement achievements%rowtype;
  v_current_value numeric;
begin
  select count(*) into v_lessons_completed
    from lesson_progress where user_id = p_user_id and status = 'completed';

  select count(*) into v_assignments_completed
    from assignment_submissions where user_id = p_user_id and status = 'approved';

  select count(*) into v_projects_completed
    from projects where user_id = p_user_id;

  select case when verification_status = 'approved' then 1 else 0 end
    into v_expert_verified
    from profiles where id = p_user_id;

  for v_achievement in
    select a.* from achievements a
    where not exists (
      select 1 from user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = a.id
    )
  loop
    v_current_value := case v_achievement.condition_type
      when 'lessons_completed'     then v_lessons_completed
      when 'assignments_completed' then v_assignments_completed
      when 'projects_completed'    then v_projects_completed
      when 'expert_verified'       then v_expert_verified
      else null
    end;

    if v_current_value is not null and v_current_value >= v_achievement.condition_value then
      insert into user_achievements (user_id, achievement_id) values (p_user_id, v_achievement.id);

      -- Разрешаем себе (только внутри этой функции) начислить xp в обход
      -- обычной защиты profiles — см. guard_profile_privileged_fields в 002.
      perform set_config('app.bypass_privileged_guard', 'true', true);
      update profiles set xp = xp + v_achievement.xp_reward where id = p_user_id;

      return next v_achievement;
    end if;
  end loop;
  return;
end;
$$;

comment on function check_and_grant_achievements(uuid) is
  'Сверяет статистику пользователя с условиями achievements и выдаёт всё новое, что заслужено. Возвращает список только что выданных достижений.';

-- ══════════════════════════════════════
--  РАЗРЕШАЕМ XP-ОБНОВЛЕНИЕ ИЗНУТРИ ФУНКЦИИ (правим триггер из 002)
-- ══════════════════════════════════════
create or replace function guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
as $$
declare
  is_admin boolean;
  is_bypassed boolean;
begin
  is_bypassed := coalesce(current_setting('app.bypass_privileged_guard', true), 'false') = 'true';
  select (role = 'ADMIN') into is_admin from profiles where id = auth.uid();

  if not coalesce(is_admin, false) and not is_bypassed then
    if new.role is distinct from old.role
       or new.xp is distinct from old.xp
       or new.verification_status is distinct from old.verification_status then
      raise exception 'role/xp/verification_status можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;

-- ══════════════════════════════════════
--  ТРИГГЕРЫ: когда именно перепроверять достижения
-- ══════════════════════════════════════

-- Урок отмечен пройденным
create or replace function trg_achievements_on_lesson_progress()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' then
    perform check_and_grant_achievements(new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lesson_progress_achievements on lesson_progress;
create trigger trg_lesson_progress_achievements
  after insert or update on lesson_progress
  for each row execute function trg_achievements_on_lesson_progress();

-- Задание одобрено (approved)
create or replace function trg_achievements_on_submission()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' then
    perform check_and_grant_achievements(new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_submission_achievements on assignment_submissions;
create trigger trg_submission_achievements
  after insert or update on assignment_submissions
  for each row execute function trg_achievements_on_submission();

-- Загружен новый проект
create or replace function trg_achievements_on_project()
returns trigger language plpgsql as $$
begin
  perform check_and_grant_achievements(new.user_id);
  return new;
end;
$$;
drop trigger if exists trg_project_achievements on projects;
create trigger trg_project_achievements
  after insert on projects
  for each row execute function trg_achievements_on_project();

-- Подтверждён как эксперт (verification_status → approved)
create or replace function trg_achievements_on_verification()
returns trigger language plpgsql as $$
begin
  if new.verification_status = 'approved'
     and old.verification_status is distinct from new.verification_status then
    perform check_and_grant_achievements(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_verification_achievements on profiles;
create trigger trg_verification_achievements
  after update on profiles
  for each row execute function trg_achievements_on_verification();
