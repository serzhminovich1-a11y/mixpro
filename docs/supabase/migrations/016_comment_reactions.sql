-- ══════════════════════════════════════
--  РЕАКЦИИ НА КОММЕНТАРИИ
-- ══════════════════════════════════════
-- То же самое, что уже есть у постов (post_reactions), только для
-- комментариев — отдельная таблица, потому что ссылается на другую
-- родительскую таблицу (post_comments, а не posts).

create table if not exists comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references post_comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);
create index if not exists idx_comment_reactions_comment_id on comment_reactions(comment_id);

alter table comment_reactions enable row level security;

drop policy if exists comment_reactions_select_all on comment_reactions;
create policy comment_reactions_select_all on comment_reactions for select using (true);

drop policy if exists comment_reactions_insert_own on comment_reactions;
create policy comment_reactions_insert_own on comment_reactions for insert with check (user_id = auth.uid());

drop policy if exists comment_reactions_delete_own on comment_reactions;
create policy comment_reactions_delete_own on comment_reactions for delete using (user_id = auth.uid());
