-- MIXPRO LMS — этап 1, всё за один запуск (001+002+003 объединены)
-- Вставьте целиком в Supabase Dashboard → SQL Editor → Run

-- MIXPRO LMS — этап 1: схема БД (роли, курсы, прогресс, достижения, портфолио,
-- задания, проверка, сертификация). Выполнить в Supabase SQL Editor целиком.
--
-- Существующие таблицы profiles/scores не трогаем — только расширяем profiles.

-- ══════════════════════════════════════
--  ENUM-ТИПЫ
-- ══════════════════════════════════════
do $$ begin
  create type user_role as enum ('STUDENT','ENGINEER','MENTOR','VERIFIED_PRO','ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type progress_status as enum ('not_started','in_progress','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('submitted','reviewed','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('pending','approved','rejected','changes_requested');
exception when duplicate_object then null; end $$;

-- ══════════════════════════════════════
--  PROFILES — расширяем существующую таблицу
-- ══════════════════════════════════════
alter table profiles
  add column if not exists role user_role not null default 'STUDENT',
  add column if not exists xp integer not null default 0,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists verification_status text not null default 'none';

alter table profiles
  add constraint profiles_xp_nonneg check (xp >= 0);

comment on column profiles.role is 'STUDENT/ENGINEER/MENTOR/VERIFIED_PRO/ADMIN — редактируется только сервером/триггерами, не самим пользователем';
comment on column profiles.xp is 'Суммарный опыт. Уровень вычисляется функцией get_level_from_xp(), не хранится отдельно';
comment on column profiles.verification_status is 'none/pending/approved/rejected — статус заявки на Certified Engineer';

-- ══════════════════════════════════════
--  ФУНКЦИЯ: уровень по XP (пороги — можно менять без миграции схемы)
-- ══════════════════════════════════════
create or replace function get_level_from_xp(p_xp integer)
returns text
language sql
immutable
as $$
  select case
    when p_xp >= 25000 then 'Legend'
    when p_xp >= 12000 then 'Master'
    when p_xp >= 5000  then 'Professional'
    when p_xp >= 2000  then 'Advanced'
    when p_xp >= 500   then 'Intermediate'
    else 'Beginner'
  end;
$$;

-- ══════════════════════════════════════
--  КУРСЫ И УРОКИ
-- ══════════════════════════════════════
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  difficulty_level text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  content_url text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_lessons_course_id on lessons(course_id);

create table if not exists lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  status progress_status not null default 'not_started',
  completed_at timestamptz,
  unique (user_id, lesson_id)
);
create index if not exists idx_lesson_progress_user_id on lesson_progress(user_id);
create index if not exists idx_lesson_progress_lesson_id on lesson_progress(lesson_id);

-- ══════════════════════════════════════
--  ДОСТИЖЕНИЯ (структура; авто-выдача — следующий этап)
-- ══════════════════════════════════════
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  icon text,
  category text,
  rarity text not null default 'common',
  condition_type text not null,
  condition_value numeric not null,
  xp_reward integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  achievement_id uuid not null references achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
create index if not exists idx_user_achievements_user_id on user_achievements(user_id);
create index if not exists idx_user_achievements_achievement_id on user_achievements(achievement_id);

-- ══════════════════════════════════════
--  ПОРТФОЛИО / ЗАГРУЗКА АУДИО
-- ══════════════════════════════════════
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_projects_user_id on projects(user_id);

comment on column projects.metadata is 'Задел под будущий AI-анализ: lufs, peak, clipping, frequency_balance, dynamic_range';

-- ══════════════════════════════════════
--  ЗАДАНИЯ И ПРОВЕРКА
-- ══════════════════════════════════════
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  material_url text,
  requirements text,
  max_score integer not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists idx_assignments_course_id on assignments(course_id);

create table if not exists assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  submitted_at timestamptz not null default now(),
  score integer,
  status submission_status not null default 'submitted'
);
create index if not exists idx_submissions_assignment_id on assignment_submissions(assignment_id);
create index if not exists idx_submissions_user_id on assignment_submissions(user_id);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references assignment_submissions(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete set null,
  score integer,
  feedback text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_submission_id on reviews(submission_id);

-- ══════════════════════════════════════
--  СЕРТИФИКАЦИЯ
-- ══════════════════════════════════════
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references profiles(id) on delete set null
);
create index if not exists idx_certificates_user_id on certificates(user_id);

create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  portfolio_summary text,
  status request_status not null default 'pending',
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_verification_requests_user_id on verification_requests(user_id);


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


-- MIXPRO LMS — этап 1: тестовые данные. Выполнять ПОСЛЕ 001 и 002.
-- Несколько примеров достижений — чтобы проверить, что схема реально работает.
-- Условия (condition_type/condition_value) здесь не проверяются автоматически —
-- логика авто-выдачи будет добавлена на этапе "Achievement Engine".

insert into achievements (title, description, icon, category, rarity, condition_type, condition_value, xp_reward)
values
  ('Первый микс', 'Загрузи свой первый проект в портфолио', '🎚️', 'portfolio', 'common', 'projects_completed', 1, 50),
  ('Прилежный ученик', 'Пройди 10 уроков', '📚', 'learning', 'common', 'lessons_completed', 10, 100),
  ('Сдал первое задание', 'Отправь и получи оценку за первое практическое задание', '✅', 'assignments', 'common', 'assignments_completed', 1, 75),
  ('Подтверждённый профи', 'Пройди верификацию Certified Engineer', '🏆', 'verification', 'rare', 'expert_verified', 1, 500)
on conflict do nothing;
