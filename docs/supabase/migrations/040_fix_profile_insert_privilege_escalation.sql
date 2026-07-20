-- СРОЧНЫЙ ФИКС — эскалация привилегий через INSERT в profiles.
--
-- guard_profile_privileged_fields() (013/031/032/035) во всех версиях
-- вешалась только на `before update on profiles` — ни разу на insert.
-- Между тем profiles_insert_own (политика, заданная ещё до начала
-- отслеживаемых миграций — вне этого репозитория) разрешает любому
-- авторизованному вставить СВОЮ строку (id = auth.uid()), без
-- ограничения по остальным колонкам. auth.js создаёт эту строку сам
-- (SB.from('profiles').insert({id, username, avatar_color})) сразу
-- после регистрации — но ничто не мешает вызвать insert напрямую и
-- передать role:'ADMIN', is_vip:true, xp:99999, reputation_count:...
-- Проверено вживую на двух одноразовых тестовых аккаунтах: новый
-- пользователь получает ADMIN одним POST-запросом сразу после signup.
--
-- Фикс: тот же guard теперь навешан и на insert, только для insert
-- сравнивать не с чем (OLD ещё нет) — сравниваем с безопасными
-- значениями по умолчанию (те же, что в DEFAULT колонок profiles).
--
-- Выполнить немедленно, независимо от остальных миграций.

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

  if coalesce(is_admin, false) or is_bypassed then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.role is distinct from 'STUDENT'
       or new.xp is distinct from 0
       or new.verification_status is distinct from 'none'
       or new.is_vip is distinct from false
       or new.is_banned is distinct from false
       or new.ban_reason is not null
       or new.banned_at is not null
       or new.reputation_count is distinct from 0 then
      raise exception 'role/xp/verification_status/is_vip/is_banned/reputation_count можно менять только через ADMIN или service_role';
    end if;
  else
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

drop trigger if exists trg_guard_profile_fields on profiles;
create trigger trg_guard_profile_fields
  before insert or update on profiles
  for each row execute function guard_profile_privileged_fields();
