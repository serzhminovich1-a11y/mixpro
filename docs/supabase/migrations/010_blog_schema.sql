-- MIXPRO — этап 3: блог/соцсеть (посты, комментарии, реакции, подписки).
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

-- ══════════════════════════════════════
--  ТАБЛИЦЫ
-- ══════════════════════════════════════
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text,
  attachment_type text,   -- 'audio' | 'video' | 'file' | null
  attachment_url text,
  attachment_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_posts_created_at on posts(created_at desc);

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text,
  audio_url text,          -- задел под голосовые комментарии (следующий этап)
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_post_id on post_comments(post_id);

create table if not exists post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id, emoji)
);
create index if not exists idx_reactions_post_id on post_reactions(post_id);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists idx_follows_following on follows(following_id);

-- ══════════════════════════════════════
--  RLS
-- ══════════════════════════════════════
alter table posts enable row level security;
drop policy if exists posts_select_all on posts;
create policy posts_select_all on posts for select using (true);
drop policy if exists posts_insert_own on posts;
create policy posts_insert_own on posts for insert with check (user_id = auth.uid());
drop policy if exists posts_delete_own_or_admin on posts;
create policy posts_delete_own_or_admin on posts for delete
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

alter table post_comments enable row level security;
drop policy if exists comments_select_all on post_comments;
create policy comments_select_all on post_comments for select using (true);
drop policy if exists comments_insert_own on post_comments;
create policy comments_insert_own on post_comments for insert with check (user_id = auth.uid());
drop policy if exists comments_delete_own_or_admin on post_comments;
create policy comments_delete_own_or_admin on post_comments for delete
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

alter table post_reactions enable row level security;
drop policy if exists reactions_select_all on post_reactions;
create policy reactions_select_all on post_reactions for select using (true);
drop policy if exists reactions_insert_own on post_reactions;
create policy reactions_insert_own on post_reactions for insert with check (user_id = auth.uid());
drop policy if exists reactions_delete_own on post_reactions;
create policy reactions_delete_own on post_reactions for delete using (user_id = auth.uid());

alter table follows enable row level security;
drop policy if exists follows_select_all on follows;
create policy follows_select_all on follows for select using (true);
drop policy if exists follows_insert_own on follows;
create policy follows_insert_own on follows for insert with check (follower_id = auth.uid());
drop policy if exists follows_delete_own on follows;
create policy follows_delete_own on follows for delete using (follower_id = auth.uid());

-- ══════════════════════════════════════
--  ХРАНИЛИЩЕ ВЛОЖЕНИЙ (видео/файлы к постам) — публичное, как портфолио
-- ══════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

do $$ begin
  create policy "posts_public_read" on storage.objects
    for select using (bucket_id = 'posts');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "posts_own_insert" on storage.objects
    for insert with check (bucket_id = 'posts' and owner = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "posts_own_delete" on storage.objects
    for delete using (bucket_id = 'posts' and owner = auth.uid());
exception when duplicate_object then null; end $$;
