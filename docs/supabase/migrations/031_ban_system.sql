-- Бан пользователей + чёрный список email — отдельно от полного удаления
-- аккаунта (030 добавил админу право удалять чужие данные, но удаление
-- стирает всю историю нарушителя, а сам email тут же снова свободен для
-- регистрации). Это два разных инструмента:
--   • is_banned на profiles — блокирует вход, ИСТОРИЯ И ДАННЫЕ ОСТАЮТСЯ
--     (полезно для досье/разбора — данные не пропадают вместе с баном).
--   • banned_emails — отдельная таблица email'ов, которым нельзя
--     зарегистрироваться заново; заполняется и при бане, и при полном
--     удалении (см. docs/supabase/functions/ban-user и delete-user).
-- Выполнить после всех предыдущих миграций.

-- ══════════════════════════════════════
--  PROFILES.is_banned — защищено тем же триггером, что role/xp/verification_status
-- ══════════════════════════════════════
alter table profiles add column if not exists is_banned boolean not null default false;
alter table profiles add column if not exists ban_reason text;
alter table profiles add column if not exists banned_at timestamptz;

create or replace function guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
as $$
declare
  is_admin boolean;
begin
  select (role = 'ADMIN') into is_admin from profiles where id = auth.uid();

  if not coalesce(is_admin, false) then
    if new.role is distinct from old.role
       or new.xp is distinct from old.xp
       or new.verification_status is distinct from old.verification_status
       or new.is_banned is distinct from old.is_banned
       or new.ban_reason is distinct from old.ban_reason
       or new.banned_at is distinct from old.banned_at then
      raise exception 'role/xp/verification_status/is_banned можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;
-- Триггер trg_guard_profile_fields (002_lms_rls.sql) уже указывает на эту
-- функцию — create or replace достаточно, повторно создавать триггер не нужно.

-- ══════════════════════════════════════
--  BANNED_EMAILS — чёрный список, переживает удаление самого аккаунта
-- ══════════════════════════════════════
create table if not exists banned_emails (
  email text primary key,
  reason text,
  banned_by uuid references profiles(id) on delete set null,
  banned_at timestamptz not null default now()
);
alter table banned_emails enable row level security;

drop policy if exists banned_emails_select_admin on banned_emails;
create policy banned_emails_select_admin on banned_emails for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));
drop policy if exists banned_emails_insert_admin on banned_emails;
create policy banned_emails_insert_admin on banned_emails for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));
drop policy if exists banned_emails_delete_admin on banned_emails;
create policy banned_emails_delete_admin on banned_emails for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

-- Анонимная/клиентская проверка email при регистрации — без прямого
-- доступа к таблице (чтобы никто не мог просто выгрузить весь чёрный
-- список анонимным select'ом), только да/нет по конкретному email.
create or replace function is_email_banned(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from banned_emails where lower(email) = lower(check_email));
$$;
grant execute on function is_email_banned(text) to anon, authenticated;

-- Бэкенд-подстраховка: даже если кто-то в обход клиентского кода вызовет
-- Auth API напрямую, регистрация с заблокированным email всё равно не
-- пройдёт. banned_emails изначально пустая — на обычную регистрацию это
-- никак не влияет.
create or replace function block_banned_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.banned_emails where lower(email) = lower(new.email)) then
    raise exception 'Этот email заблокирован администрацией';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_banned_email_signup on auth.users;
create trigger trg_block_banned_email_signup
  before insert on auth.users
  for each row execute function block_banned_email_signup();
