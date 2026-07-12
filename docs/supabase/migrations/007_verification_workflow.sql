-- MIXPRO LMS — этап 3: реальная верификация опыта.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.
--
-- Что меняется:
-- 1. Право создавать/редактировать курсы и уроки получают не только
--    MENTOR/ADMIN, но и VERIFIED_PRO (пользователи с подтверждённым опытом).
-- 2. Функция approve_verification_request() — безопасно одобряет/отклоняет
--    заявку и, если одобрено, сама поднимает роль пользователя до
--    VERIFIED_PRO (напрямую пользователь свою роль менять не может — это
--    защищено триггером с этапа 1).

-- ══════════════════════════════════════
--  COURSES / LESSONS — теперь пишут VERIFIED_PRO тоже
-- ══════════════════════════════════════
drop policy if exists courses_write_staff on courses;
create policy courses_write_staff on courses for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));

drop policy if exists lessons_write_staff on lessons;
create policy lessons_write_staff on lessons for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  ХРАНИЛИЩЕ ВИДЕО УРОКОВ — та же логика для загрузки/удаления файлов
-- ══════════════════════════════════════
drop policy if exists "lessons_video_write_staff" on storage.objects;
create policy "lessons_video_write_staff" on storage.objects
  for insert with check (
    bucket_id = 'lessons'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
  );

drop policy if exists "lessons_video_delete_staff" on storage.objects;
create policy "lessons_video_delete_staff" on storage.objects
  for delete using (
    bucket_id = 'lessons'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
  );

-- ══════════════════════════════════════
--  ОДОБРЕНИЕ ЗАЯВКИ НА ВЕРИФИКАЦИЮ
-- ══════════════════════════════════════
create or replace function approve_verification_request(
  p_request_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_is_staff boolean;
begin
  select (role in ('MENTOR','ADMIN')) into v_is_staff from profiles where id = auth.uid();
  if not coalesce(v_is_staff, false) then
    raise exception 'Только MENTOR/ADMIN может проверять заявки на верификацию';
  end if;

  select user_id into v_user_id from verification_requests where id = p_request_id;
  if v_user_id is null then
    raise exception 'Заявка не найдена';
  end if;

  update verification_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_request_id;

  perform set_config('app.bypass_privileged_guard', 'true', true);
  update profiles
    set role = case when p_approve then 'VERIFIED_PRO'::user_role else role end,
        verification_status = case when p_approve then 'approved' else 'rejected' end
    where id = v_user_id;
end;
$$;
