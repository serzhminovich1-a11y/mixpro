-- БИБЛИОТЕКА — прогресс по карточкам, синхронизированный через аккаунт
-- (не только в браузере) — тот же паттерн, что уже есть у ежедневного
-- стрика тренажёров (012_daily_streaks.sql): localStorage сразу +
-- тихая синхронизация в Supabase, reconcile при следующем визите.
--
-- seen_term_ids — какие термины уже пролистаны в карточном режиме
-- (используется, чтобы у "уже занимавшихся" карточки начинались не
-- всегда с одного и того же места). last_visit — когда последний раз
-- заходили в Библиотеку, для напоминания "освежить знания".
--
-- Выполнить после 027_glossary.sql.

create table if not exists glossary_progress (
  user_id uuid primary key references profiles(id) on delete cascade,
  seen_term_ids uuid[] not null default '{}',
  last_visit timestamptz,
  updated_at timestamptz not null default now()
);

alter table glossary_progress enable row level security;
drop policy if exists glossary_progress_own on glossary_progress;
create policy glossary_progress_own on glossary_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
