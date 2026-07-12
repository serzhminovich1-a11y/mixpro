-- MIXPRO — этап 3: ежедневный стрик тренажёров в базе (не только в браузере).
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.
--
-- Раньше стрик Peak Master считался только в localStorage — на другом
-- устройстве или после очистки браузера он терялся, и в профиле его
-- не было видно. Таблица общая для любых тренажёров (game — их код),
-- не только Peak Master, чтобы потом не пришлось переделывать под
-- Pan Trainer и остальные.

create table if not exists daily_streaks (
  user_id uuid not null references profiles(id) on delete cascade,
  game text not null,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_played date,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table daily_streaks enable row level security;
drop policy if exists daily_streaks_own on daily_streaks;
create policy daily_streaks_own on daily_streaks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
