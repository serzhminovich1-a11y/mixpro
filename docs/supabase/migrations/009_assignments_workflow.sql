-- MIXPRO LMS — этап 3: сдача и проверка заданий.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

-- ══════════════════════════════════════
--  ASSIGNMENTS — создавать/менять теперь может и VERIFIED_PRO
--  (как курсы и уроки — согласованно с этапом верификации)
-- ══════════════════════════════════════
drop policy if exists assignments_write_staff on assignments;
create policy assignments_write_staff on assignments for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  ASSIGNMENT_SUBMISSIONS — раньше не было даже policy на UPDATE,
--  то есть проверяющий не мог поставить статус/оценку. Добавляем.
-- ══════════════════════════════════════
drop policy if exists submissions_update_staff on assignment_submissions;
create policy submissions_update_staff on assignment_submissions for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  REVIEWS — оставлять отзыв теперь тоже может VERIFIED_PRO
-- ══════════════════════════════════════
drop policy if exists reviews_write_staff on reviews;
create policy reviews_write_staff on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
  );
