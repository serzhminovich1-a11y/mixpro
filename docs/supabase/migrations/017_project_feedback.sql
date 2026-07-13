-- MIXPRO — обратная связь на треки в портфолио: реакции, звёздный рейтинг,
-- профессиональный разбор от наставника, комментарии.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

-- ══════════════════════════════════════
--  РЕАКЦИИ НА ТРЕК — то же самое, что post_reactions у постов в Ленте
-- ══════════════════════════════════════
create table if not exists project_reactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id, emoji)
);
create index if not exists idx_project_reactions_project on project_reactions(project_id);

alter table project_reactions enable row level security;
drop policy if exists project_reactions_select_all on project_reactions;
create policy project_reactions_select_all on project_reactions for select using (true);
drop policy if exists project_reactions_insert_own on project_reactions;
create policy project_reactions_insert_own on project_reactions for insert with check (user_id = auth.uid());
drop policy if exists project_reactions_delete_own on project_reactions;
create policy project_reactions_delete_own on project_reactions for delete using (user_id = auth.uid());

-- ══════════════════════════════════════
--  ЗВЁЗДНЫЙ РЕЙТИНГ — один голос (1-5) от пользователя на трек,
--  повторная отправка обновляет свою же оценку.
-- ══════════════════════════════════════
create table if not exists project_ratings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists idx_project_ratings_project on project_ratings(project_id);

alter table project_ratings enable row level security;
drop policy if exists project_ratings_select_all on project_ratings;
create policy project_ratings_select_all on project_ratings for select using (true);
drop policy if exists project_ratings_insert_own on project_ratings;
create policy project_ratings_insert_own on project_ratings for insert with check (user_id = auth.uid());
drop policy if exists project_ratings_update_own on project_ratings;
create policy project_ratings_update_own on project_ratings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists project_ratings_delete_own on project_ratings;
create policy project_ratings_delete_own on project_ratings for delete using (user_id = auth.uid());

-- ══════════════════════════════════════
--  ПРОФЕССИОНАЛЬНЫЙ РАЗБОР — числовая оценка (1-10) + текст от
--  подтверждённого специалиста. Ставить может VERIFIED_PRO/MENTOR/ADMIN —
--  та же граница доверия, что уже используется для отзывов на задания
--  курсов (см. 009_assignments_workflow.sql). Один разбор на пару
--  трек+рецензент, но его можно отредактировать (updated_at).
-- ══════════════════════════════════════
create table if not exists project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  feedback text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (project_id, reviewer_id)
);
create index if not exists idx_project_reviews_project on project_reviews(project_id);

alter table project_reviews enable row level security;
drop policy if exists project_reviews_select_all on project_reviews;
create policy project_reviews_select_all on project_reviews for select using (true);
drop policy if exists project_reviews_insert_staff on project_reviews;
create policy project_reviews_insert_staff on project_reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
  );
drop policy if exists project_reviews_update_own on project_reviews;
create policy project_reviews_update_own on project_reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
drop policy if exists project_reviews_delete_own_or_admin on project_reviews;
create policy project_reviews_delete_own_or_admin on project_reviews for delete
  using (reviewer_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

-- ══════════════════════════════════════
--  КОММЕНТАРИИ К ТРЕКУ — как post_comments у постов, только текст
--  (без голосовых — там это отдельный этап, здесь не нужен)
-- ══════════════════════════════════════
create table if not exists project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_project_comments_project on project_comments(project_id);

alter table project_comments enable row level security;
drop policy if exists project_comments_select_all on project_comments;
create policy project_comments_select_all on project_comments for select using (true);
drop policy if exists project_comments_insert_own on project_comments;
create policy project_comments_insert_own on project_comments for insert with check (user_id = auth.uid());
drop policy if exists project_comments_update_own on project_comments;
create policy project_comments_update_own on project_comments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists project_comments_delete_own_or_admin on project_comments;
create policy project_comments_delete_own_or_admin on project_comments for delete
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

-- ══════════════════════════════════════
--  РЕАКЦИИ НА КОММЕНТАРИИ К ТРЕКУ
-- ══════════════════════════════════════
create table if not exists project_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references project_comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);
create index if not exists idx_project_comment_reactions_comment on project_comment_reactions(comment_id);

alter table project_comment_reactions enable row level security;
drop policy if exists project_comment_reactions_select_all on project_comment_reactions;
create policy project_comment_reactions_select_all on project_comment_reactions for select using (true);
drop policy if exists project_comment_reactions_insert_own on project_comment_reactions;
create policy project_comment_reactions_insert_own on project_comment_reactions for insert with check (user_id = auth.uid());
drop policy if exists project_comment_reactions_delete_own on project_comment_reactions;
create policy project_comment_reactions_delete_own on project_comment_reactions for delete using (user_id = auth.uid());

-- ══════════════════════════════════════
--  ЖАЛОБЫ — расширяем существующую очередь модерации (content_reports)
--  новым типом контента, чтобы на комментарии к трекам тоже можно было
--  пожаловаться и разобрать их в той же панели, что и жалобы из Ленты.
-- ══════════════════════════════════════
alter table content_reports drop constraint if exists content_reports_content_type_check;
alter table content_reports add constraint content_reports_content_type_check
  check (content_type in ('post', 'comment', 'project_comment'));

comment on table project_reactions is 'Эмодзи-реакции на трек в портфолио — как post_reactions у постов.';
comment on table project_ratings is 'Звёздный рейтинг трека (1-5) от любого пользователя, один голос на трек.';
comment on table project_reviews is 'Профессиональный разбор трека: оценка 1-10 + текст, только от VERIFIED_PRO/MENTOR/ADMIN.';
comment on table project_comments is 'Комментарии под треком в портфолио — текстовые, как post_comments.';
