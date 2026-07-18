-- БАГ: в панели администратора («Пользователи») смена роли/XP/VIP/статуса
-- верификации ДРУГОМУ человеку молча не сохранялась — правило безопасности
-- profiles_update_own (002_lms_rls.sql) разрешало обновлять строку только
-- если id = auth.uid(), то есть строго свою собственную. Supabase в таком
-- случае не возвращает ошибку — просто обновляет 0 строк, как будто всё
-- прошло успешно, а на самом деле ничего не изменилось (отсюда и "после
-- обновления страницы всё обнуляется" — обновлялась только своя строка).
--
-- Добавляем ВТОРОЕ правило: администратор может редактировать ЛЮБОЙ
-- профиль. Оно складывается с profiles_update_own (оба разрешающих
-- правила действуют по правилу "ИЛИ"), так что для не-админов ничего
-- не меняется — они по-прежнему могут менять только свою строку, и
-- смену роли/XP/verification_status для своей строки всё ещё блокирует
-- триггер guard_profile_privileged_fields (002_lms_rls.sql).
-- Выполнить после всех предыдущих миграций.

drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));
