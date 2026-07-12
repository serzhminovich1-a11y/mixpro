-- MIXPRO LMS — этап 3: полный доступ ADMIN к профилям (панель владельца).
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.
--
-- Раньше пользователь мог менять только свою строку в profiles (RLS).
-- ADMIN технически мог бы менять role/xp/verification_status (это уже
-- разрешал триггер из этапа 1), но RLS не пускал его в чужие строки вообще.
-- Здесь это расширяется: ADMIN может обновлять ЛЮБОЙ профиль.

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (
    id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
  )
  with check (
    id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
  );
