-- ФОРУМ — репутация ("спасибо"). Отдельная от эмодзи-реакций механика:
-- реакции — эмоция на конкретный пост, "спасибо" — по одному на пост от
-- каждого пользователя, и оно копится в общий счётчик репутации автора.
--
-- profiles.reputation_count поддерживается ИСКЛЮЧИТЕЛЬНО триггером —
-- никакого прямого клиентского пути его поменять нет. Добавляем его же
-- в защищённый список guard_profile_privileged_fields (та же дыра, что
-- нашлась и закрылась для is_vip в 032 — без этого пользователь мог бы
-- выставить себе любое число через обычный update своего профиля).
--
-- Выполнить после 032_fix_privileged_guard.sql и 033_forum_core.sql.

alter table profiles add column if not exists reputation_count integer not null default 0;

create table if not exists forum_thanks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references forum_posts(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, from_user_id),
  check (from_user_id <> to_user_id)
);
create index if not exists idx_forum_thanks_to_user on forum_thanks(to_user_id);

alter table forum_thanks enable row level security;
drop policy if exists forum_thanks_select_all on forum_thanks;
create policy forum_thanks_select_all on forum_thanks for select using (true);
drop policy if exists forum_thanks_insert_own on forum_thanks;
create policy forum_thanks_insert_own on forum_thanks for insert
  with check (
    from_user_id = auth.uid()
    and to_user_id = (select user_id from forum_posts where id = post_id)
  );
drop policy if exists forum_thanks_delete_own on forum_thanks;
create policy forum_thanks_delete_own on forum_thanks for delete using (from_user_id = auth.uid());

create or replace function forum_thanks_bump_reputation()
returns trigger
language plpgsql
security definer
as $$
begin
  perform set_config('app.bypass_privileged_guard', 'true', true);
  if TG_OP = 'INSERT' then
    update profiles set reputation_count = reputation_count + 1 where id = new.to_user_id;
  elsif TG_OP = 'DELETE' then
    update profiles set reputation_count = greatest(reputation_count - 1, 0) where id = old.to_user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_forum_thanks_insert on forum_thanks;
create trigger trg_forum_thanks_insert
  after insert on forum_thanks
  for each row execute function forum_thanks_bump_reputation();

drop trigger if exists trg_forum_thanks_delete on forum_thanks;
create trigger trg_forum_thanks_delete
  after delete on forum_thanks
  for each row execute function forum_thanks_bump_reputation();

-- Добавляем reputation_count в защищённый список (объединяем с текущим
-- содержимым функции из 032, ничего из него не теряя).
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
       or new.verification_status is distinct from old.verification_status
       or new.is_vip is distinct from old.is_vip
       or new.is_banned is distinct from old.is_banned
       or new.ban_reason is distinct from old.ban_reason
       or new.banned_at is distinct from old.banned_at
       or new.reputation_count is distinct from old.reputation_count then
      raise exception 'role/xp/verification_status/is_vip/is_banned/reputation_count можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'post_comment','post_reaction','project_comment','project_reaction','project_review','follow',
    'role_changed','vip_granted','verification_approved','verification_rejected',
    'forum_reaction','forum_reply','forum_thanks'
  ));
