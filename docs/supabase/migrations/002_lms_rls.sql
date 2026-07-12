-- MIXPRO LMS — этап 1: RLS-политики. Выполнять ПОСЛЕ 001_lms_schema.sql.
--
-- Публичное чтение контента (courses/lessons/achievements/user_achievements),
-- пользователь управляет только своими строками, роль/xp/verification_status
-- на profiles защищены триггером от прямого изменения пользователем.

-- ══════════════════════════════════════
--  ЗАЩИТА ЧУВСТВИТЕЛЬНЫХ ПОЛЕЙ PROFILES
-- ══════════════════════════════════════
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
       or new.verification_status is distinct from old.verification_status then
      raise exception 'role/xp/verification_status можно менять только через ADMIN или service_role';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_fields on profiles;
create trigger trg_guard_profile_fields
  before update on profiles
  for each row execute function guard_profile_privileged_fields();

-- profiles: RLS уже должен быть включён из первой версии проекта; на всякий случай:
alter table profiles enable row level security;

drop policy if exists profiles_select_all on profiles;
create policy profiles_select_all on profiles for select using (true);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ══════════════════════════════════════
--  COURSES / LESSONS — читают все, пишут MENTOR/ADMIN
-- ══════════════════════════════════════
alter table courses enable row level security;
drop policy if exists courses_select_all on courses;
create policy courses_select_all on courses for select using (true);
drop policy if exists courses_write_staff on courses;
create policy courses_write_staff on courses for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

alter table lessons enable row level security;
drop policy if exists lessons_select_all on lessons;
create policy lessons_select_all on lessons for select using (true);
drop policy if exists lessons_write_staff on lessons;
create policy lessons_write_staff on lessons for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  LESSON_PROGRESS — только свои строки
-- ══════════════════════════════════════
alter table lesson_progress enable row level security;
drop policy if exists lesson_progress_own on lesson_progress;
create policy lesson_progress_own on lesson_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ══════════════════════════════════════
--  ACHIEVEMENTS — читают все, пишут MENTOR/ADMIN
-- ══════════════════════════════════════
alter table achievements enable row level security;
drop policy if exists achievements_select_all on achievements;
create policy achievements_select_all on achievements for select using (true);
drop policy if exists achievements_write_staff on achievements;
create policy achievements_write_staff on achievements for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  USER_ACHIEVEMENTS — читают все (для профиля/лидерборда),
--  прямой INSERT/UPDATE/DELETE от пользователя запрещён — выдаёт только
--  Achievement Engine (следующий этап, будет работать через service_role).
-- ══════════════════════════════════════
alter table user_achievements enable row level security;
drop policy if exists user_achievements_select_all on user_achievements;
create policy user_achievements_select_all on user_achievements for select using (true);
-- Намеренно нет policy на insert/update/delete для обычных пользователей —
-- по умолчанию RLS блокирует всё, что не разрешено явной policy.

-- ══════════════════════════════════════
--  PROJECTS — свои строки, публичное чтение (портфолио открыто)
-- ══════════════════════════════════════
alter table projects enable row level security;
drop policy if exists projects_select_all on projects;
create policy projects_select_all on projects for select using (true);
drop policy if exists projects_write_own on projects;
create policy projects_write_own on projects for insert with check (user_id = auth.uid());
drop policy if exists projects_update_own on projects;
create policy projects_update_own on projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects for delete using (user_id = auth.uid());

-- ══════════════════════════════════════
--  ASSIGNMENTS — читают все, пишут MENTOR/ADMIN
-- ══════════════════════════════════════
alter table assignments enable row level security;
drop policy if exists assignments_select_all on assignments;
create policy assignments_select_all on assignments for select using (true);
drop policy if exists assignments_write_staff on assignments;
create policy assignments_write_staff on assignments for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  ASSIGNMENT_SUBMISSIONS — свои строки + MENTOR/ADMIN видят все (для проверки)
-- ══════════════════════════════════════
alter table assignment_submissions enable row level security;
drop policy if exists submissions_select_own_or_staff on assignment_submissions;
create policy submissions_select_own_or_staff on assignment_submissions for select
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));
drop policy if exists submissions_insert_own on assignment_submissions;
create policy submissions_insert_own on assignment_submissions for insert with check (user_id = auth.uid());

-- ══════════════════════════════════════
--  REVIEWS — читают участники (автор работы + рецензент), пишет MENTOR/ADMIN
-- ══════════════════════════════════════
alter table reviews enable row level security;
drop policy if exists reviews_select_related on reviews;
create policy reviews_select_related on reviews for select
  using (
    reviewer_id = auth.uid()
    or exists (
      select 1 from assignment_submissions s
      where s.id = reviews.submission_id and s.user_id = auth.uid()
    )
  );
drop policy if exists reviews_write_staff on reviews;
create policy reviews_write_staff on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
  );

-- ══════════════════════════════════════
--  CERTIFICATES — свои читают, выдаёт MENTOR/ADMIN
-- ══════════════════════════════════════
alter table certificates enable row level security;
drop policy if exists certificates_select_own_or_staff on certificates;
create policy certificates_select_own_or_staff on certificates for select
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));
drop policy if exists certificates_write_staff on certificates;
create policy certificates_write_staff on certificates for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  VERIFICATION_REQUESTS — своя заявка + MENTOR/ADMIN видят все
-- ══════════════════════════════════════
alter table verification_requests enable row level security;
drop policy if exists verification_select_own_or_staff on verification_requests;
create policy verification_select_own_or_staff on verification_requests for select
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));
drop policy if exists verification_insert_own on verification_requests;
create policy verification_insert_own on verification_requests for insert with check (user_id = auth.uid());
drop policy if exists verification_update_staff on verification_requests;
create policy verification_update_staff on verification_requests for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));
