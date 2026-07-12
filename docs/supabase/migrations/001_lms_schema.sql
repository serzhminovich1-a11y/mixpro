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
