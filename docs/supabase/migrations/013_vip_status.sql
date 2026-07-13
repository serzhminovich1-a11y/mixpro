-- ══════════════════════════════════════
--  VIP-СТАТУС: переносим из localStorage-кода в базу, привязываем к аккаунту
-- ══════════════════════════════════════
-- Раньше VIP разблокировался вводом кода, зашитого прямо в открытом JS-файле
-- (его видел в исходниках сайта кто угодно) и хранился только в браузере —
-- на другом устройстве или после очистки данных VIP слетал.
-- Теперь это поле профиля, видно на любом устройстве, и поменять его может
-- только ADMIN (через панель управления) — точно так же, как role/xp/
-- verification_status уже защищены триггером guard_profile_privileged_fields.

alter table profiles add column if not exists is_vip boolean not null default false;

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
       or new.is_vip is distinct from old.is_vip then
      raise exception 'role/xp/verification_status/is_vip можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;

comment on column profiles.is_vip is
  'VIP-доступ к платному контенту курсов. Меняется только ADMIN через панель управления — не пользователем напрямую. Пока выдаётся вручную (оплата вне сайта), автоматическая оплата — следующий шаг.';
