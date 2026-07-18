-- СРОЧНЫЙ ФИКС — регрессия, случайно внесённая в 031_ban_system.sql.
--
-- 031 переписала guard_profile_privileged_fields() с нуля (create or
-- replace), чтобы защитить is_banned/ban_reason/banned_at, но потеряла
-- при этом две вещи, которые уже были в версии из 013_vip_status.sql:
--
-- 1. is_bypassed — флаг, позволяющий доверенным SECURITY DEFINER
--    функциям обойти защиту через set_config('app.bypass_privileged_guard',
--    'true', true). Его использует check_and_grant_achievements()
--    (004_achievement_engine.sql) при начислении XP — то есть ПРЯМО
--    СЕЙЧАС на живом сайте начисление XP за пройденный урок/одобренное
--    задание/загруженный проект, скорее всего, падает с ошибкой
--    "role/xp/verification_status/is_banned можно менять только через
--    ADMIN", и вместе с XP может откатываться вся транзакция (сам факт
--    "урок пройден"). Его же использует approve_verification_request()
--    (007_verification_workflow.sql) для MENTOR (не ADMIN).
-- 2. is_vip — было защищено с 013, сейчас нет. Это значит, что ЛЮБОЙ
--    залогиненный пользователь прямо сейчас может выдать себе VIP сам:
--    SB.from('profiles').update({is_vip:true}).eq('id', myUid) —
--    profiles_update_own разрешает id=auth.uid() без ограничения полей,
--    а триггер эту дыру больше не закрывает.
--
-- Эта миграция объединяет защищённые поля из 013 и 031 и восстанавливает
-- is_bypassed. Выполнить немедленно, независимо от остальных миграций.

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
       or new.banned_at is distinct from old.banned_at then
      raise exception 'role/xp/verification_status/is_vip/is_banned можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;
