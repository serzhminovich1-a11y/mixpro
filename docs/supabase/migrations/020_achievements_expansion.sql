-- MIXPRO — Achievement Engine, этап 2: подключаем всё, что появилось в
-- проекте ПОСЛЕ первого этапа достижений (004_achievement_engine.sql) —
-- реакции и комментарии в Ленте и Портфолио, подписчики, стрики
-- тренажёров, профессиональные разборы наставников. До этой миграции
-- вся эта активность никак не отражалась в достижениях/XP.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций
-- (обязательно после 004, 010_blog_schema.sql, 012_daily_streaks.sql,
-- 017_project_feedback.sql).

-- ══════════════════════════════════════
--  ЧТОБЫ СИД НИЖЕ БЫЛ БЕЗОПАСНО ПОВТОРЯЕМ (как enum-типы в 001 —
--  "если уже есть, просто пропустить")
-- ══════════════════════════════════════
do $$ begin
  alter table achievements add constraint achievements_title_unique unique (title);
exception when duplicate_object then null; end $$;

-- ══════════════════════════════════════
--  ГЛАВНАЯ ФУНКЦИЯ — те же 4 старых условия + 5 новых
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
  v_received_reactions integer;
  v_comments_written integer;
  v_followers_count integer;
  v_best_streak integer;
  v_reviews_given integer;
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

  -- Реакции, полученные на свои посты (Лента) и треки (Портфолио) суммарно
  select
    (select count(*) from post_reactions pr join posts p on p.id = pr.post_id where p.user_id = p_user_id)
    + (select count(*) from project_reactions pr join projects pj on pj.id = pr.project_id where pj.user_id = p_user_id)
    into v_received_reactions;

  -- Комментарии, которые сам оставил под чужими постами/треками
  select
    (select count(*) from post_comments where user_id = p_user_id)
    + (select count(*) from project_comments where user_id = p_user_id)
    into v_comments_written;

  select count(*) into v_followers_count from follows where following_id = p_user_id;

  -- Лучший стрик среди всех тренажёров (Pan Trainer, Peak Master, ...)
  select coalesce(max(best_streak), 0) into v_best_streak from daily_streaks where user_id = p_user_id;

  select count(*) into v_reviews_given from project_reviews where reviewer_id = p_user_id;

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
      when 'received_reactions'    then v_received_reactions
      when 'comments_written'      then v_comments_written
      when 'followers_count'       then v_followers_count
      when 'best_streak'           then v_best_streak
      when 'reviews_given'         then v_reviews_given
      else null
    end;

    if v_current_value is not null and v_current_value >= v_achievement.condition_value then
      insert into user_achievements (user_id, achievement_id) values (p_user_id, v_achievement.id);

      perform set_config('app.bypass_privileged_guard', 'true', true);
      update profiles set xp = xp + v_achievement.xp_reward where id = p_user_id;

      return next v_achievement;
    end if;
  end loop;
  return;
end;
$$;

-- ══════════════════════════════════════
--  ТРИГГЕРЫ — новые события, которые должны переcчитывать достижения
-- ══════════════════════════════════════

-- Общий случай: таблица содержит user_id того, чью статистику надо
-- пересчитать (post_comments, project_comments, daily_streaks — сам автор
-- действия и есть тот, кому может выдаться достижение)
create or replace function trg_achievements_on_own_user_id()
returns trigger language plpgsql as $$
begin
  perform check_and_grant_achievements(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_post_comment_achievements on post_comments;
create trigger trg_post_comment_achievements
  after insert on post_comments
  for each row execute function trg_achievements_on_own_user_id();

drop trigger if exists trg_project_comment_achievements on project_comments;
create trigger trg_project_comment_achievements
  after insert on project_comments
  for each row execute function trg_achievements_on_own_user_id();

drop trigger if exists trg_daily_streak_achievements on daily_streaks;
create trigger trg_daily_streak_achievements
  after insert or update on daily_streaks
  for each row execute function trg_achievements_on_own_user_id();

-- Реакция на пост — пересчитываем автора ПОСТА, не того, кто поставил реакцию
create or replace function trg_achievements_on_post_reaction()
returns trigger language plpgsql as $$
declare v_owner uuid;
begin
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is not null then perform check_and_grant_achievements(v_owner); end if;
  return new;
end;
$$;
drop trigger if exists trg_post_reaction_achievements on post_reactions;
create trigger trg_post_reaction_achievements
  after insert on post_reactions
  for each row execute function trg_achievements_on_post_reaction();

-- Реакция на трек — пересчитываем автора ТРЕКА
create or replace function trg_achievements_on_project_reaction()
returns trigger language plpgsql as $$
declare v_owner uuid;
begin
  select user_id into v_owner from projects where id = new.project_id;
  if v_owner is not null then perform check_and_grant_achievements(v_owner); end if;
  return new;
end;
$$;
drop trigger if exists trg_project_reaction_achievements on project_reactions;
create trigger trg_project_reaction_achievements
  after insert on project_reactions
  for each row execute function trg_achievements_on_project_reaction();

-- Новая подписка — пересчитываем того, НА КОГО подписались
create or replace function trg_achievements_on_follow()
returns trigger language plpgsql as $$
begin
  perform check_and_grant_achievements(new.following_id);
  return new;
end;
$$;
drop trigger if exists trg_follow_achievements on follows;
create trigger trg_follow_achievements
  after insert on follows
  for each row execute function trg_achievements_on_follow();

-- Новый профессиональный разбор — пересчитываем самого рецензента (наставника)
create or replace function trg_achievements_on_review()
returns trigger language plpgsql as $$
begin
  perform check_and_grant_achievements(new.reviewer_id);
  return new;
end;
$$;
drop trigger if exists trg_review_achievements on project_reviews;
create trigger trg_review_achievements
  after insert on project_reviews
  for each row execute function trg_achievements_on_review();

-- ══════════════════════════════════════
--  НОВЫЕ ДОСТИЖЕНИЯ
-- ══════════════════════════════════════
insert into achievements (title, description, icon, category, rarity, condition_type, condition_value, xp_reward)
values
  ('Первый лайк', 'Получи первую реакцию на свой пост или трек', '👍', 'social', 'common', 'received_reactions', 1, 25),
  ('Душа компании', 'Получи 25 реакций на посты и треки суммарно', '🎉', 'social', 'rare', 'received_reactions', 25, 150),
  ('Звезда ленты', 'Получи 100 реакций на посты и треки суммарно', '⭐', 'social', 'epic', 'received_reactions', 100, 400),
  ('Активный комментатор', 'Оставь 10 комментариев под постами и треками', '💬', 'social', 'common', 'comments_written', 10, 50),
  ('Голос сообщества', 'Оставь 50 комментариев под постами и треками', '📣', 'social', 'rare', 'comments_written', 50, 200),
  ('Есть последователи', 'Собери 5 подписчиков', '🧲', 'social', 'common', 'followers_count', 5, 50),
  ('Инфлюенсер', 'Собери 25 подписчиков', '📈', 'social', 'rare', 'followers_count', 25, 250),
  ('Недельный стрик', 'Держи стрик 7 дней подряд в любом тренажёре', '🔥', 'streaks', 'common', 'best_streak', 7, 75),
  ('Железная дисциплина', 'Держи стрик 30 дней подряд в любом тренажёре', '🏅', 'streaks', 'epic', 'best_streak', 30, 500),
  ('Наставник', 'Оставь 10 профессиональных разборов чужих треков', '🎓', 'mentoring', 'rare', 'reviews_given', 10, 300)
on conflict (title) do nothing;

-- ══════════════════════════════════════
--  РАЗОВЫЙ ПЕРЕСЧЁТ — у кого-то условия могли выполниться ДО того, как
--  появились эти триггеры (например, уже есть 30 реакций) — без этого
--  шага достижение выдалось бы только при следующем новом действии.
-- ══════════════════════════════════════
do $$
declare v_id uuid;
begin
  for v_id in select id from profiles loop
    perform check_and_grant_achievements(v_id);
  end loop;
end $$;
