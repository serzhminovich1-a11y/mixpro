-- ЗАЩИТА ОТ СПАМА — темы/ответы форума, личные сообщения, объявления
-- барахолки сейчас можно постить сколько угодно раз подряд без задержки
-- (ни одна из этих таблиц не была рассчитана на объём — RLS проверяет
-- ТОЛЬКО "это моя строка", не частоту). MENTOR/ADMIN — без ограничений
-- (модерация/массовые объявления не должны на это натыкаться).
--
-- Каждая проверка — свой BEFORE INSERT триггер на своей таблице, а не
-- общая функция на всех сразу: лимиты по смыслу разные (пять новых
-- объявлений в час — нормально, пять новых тем в час — уже спам), и
-- отдельные функции проще читать/менять по одной, не трогая остальные.
--
-- Выполнить после 039_marketplace.sql.

create or replace function enforce_forum_thread_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  is_staff boolean;
  recent_count integer;
begin
  select (role in ('MENTOR','ADMIN')) into is_staff from profiles where id = auth.uid();
  if coalesce(is_staff, false) then
    return new;
  end if;
  select count(*) into recent_count from forum_threads
    where user_id = new.user_id and created_at > now() - interval '10 minutes';
  if recent_count >= 3 then
    raise exception 'Слишком много новых тем подряд — подожди немного и попробуй снова';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forum_threads_rate_limit on forum_threads;
create trigger trg_forum_threads_rate_limit
  before insert on forum_threads
  for each row execute function enforce_forum_thread_rate_limit();

create or replace function enforce_forum_post_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  is_staff boolean;
  recent_count integer;
begin
  select (role in ('MENTOR','ADMIN')) into is_staff from profiles where id = auth.uid();
  if coalesce(is_staff, false) then
    return new;
  end if;
  select count(*) into recent_count from forum_posts
    where user_id = new.user_id and created_at > now() - interval '60 seconds';
  if recent_count >= 8 then
    raise exception 'Слишком много сообщений подряд — подожди немного и попробуй снова';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forum_posts_rate_limit on forum_posts;
create trigger trg_forum_posts_rate_limit
  before insert on forum_posts
  for each row execute function enforce_forum_post_rate_limit();

create or replace function enforce_pm_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  is_staff boolean;
  recent_count integer;
begin
  select (role in ('MENTOR','ADMIN')) into is_staff from profiles where id = auth.uid();
  if coalesce(is_staff, false) then
    return new;
  end if;
  select count(*) into recent_count from pm_messages
    where sender_id = new.sender_id and created_at > now() - interval '60 seconds';
  if recent_count >= 15 then
    raise exception 'Слишком много сообщений подряд — подожди немного и попробуй снова';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pm_messages_rate_limit on pm_messages;
create trigger trg_pm_messages_rate_limit
  before insert on pm_messages
  for each row execute function enforce_pm_rate_limit();

create or replace function enforce_marketplace_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  is_staff boolean;
  recent_count integer;
begin
  select (role in ('MENTOR','ADMIN')) into is_staff from profiles where id = auth.uid();
  if coalesce(is_staff, false) then
    return new;
  end if;
  select count(*) into recent_count from marketplace_listings
    where user_id = new.user_id and created_at > now() - interval '60 minutes';
  if recent_count >= 5 then
    raise exception 'Слишком много объявлений подряд — подожди немного и попробуй снова';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marketplace_listings_rate_limit on marketplace_listings;
create trigger trg_marketplace_listings_rate_limit
  before insert on marketplace_listings
  for each row execute function enforce_marketplace_rate_limit();
