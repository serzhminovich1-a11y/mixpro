-- ФОРУМ — ядро: категории, темы, посты (первый пост темы = обычный пост
-- с is_op=true, дальше идут ответы — единая логика реакций/жалоб/
-- редактирования на весь форум, без раздвоения "тело темы"/"тело
-- ответа", как получилось в Ленте с постами/комментариями).
--
-- Публиковать может любой залогиненный (как в Ленте), НЕ только
-- VERIFIED_PRO+ (как курсы/словарь) — форум открыт для всех.
-- Модерация (закреп/блокировка/перенос/удаление чужой темы) — MENTOR/ADMIN.
--
-- Специально НЕТ клиентской INSERT-политики на forum_threads и НЕТ
-- UPDATE-политики на forum_posts — создание темы идёт только через
-- create_forum_thread(), редактирование поста — только через
-- edit_forum_post(). Так исключён целый класс багов "пользователь
-- выставил себе is_pinned/is_op/переставил тему в другой thread_id"
-- самим устройством схемы, а не хитрым WITH CHECK.
--
-- Выполнить после 032_fix_privileged_guard.sql.

-- ══════════════════════════════════════
--  КАТЕГОРИИ
-- ══════════════════════════════════════
create table if not exists forum_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table forum_categories enable row level security;
drop policy if exists forum_categories_select_all on forum_categories;
create policy forum_categories_select_all on forum_categories for select using (true);
drop policy if exists forum_categories_write_staff on forum_categories;
create policy forum_categories_write_staff on forum_categories for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  ТЕМЫ — только метаданные, тело первого поста живёт в forum_posts
-- ══════════════════════════════════════
create table if not exists forum_threads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references forum_categories(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index if not exists idx_forum_threads_category on forum_threads(category_id, is_pinned desc, last_activity_at desc);

alter table forum_threads enable row level security;
drop policy if exists forum_threads_select_all on forum_threads;
create policy forum_threads_select_all on forum_threads for select using (true);
-- Намеренно нет insert policy — тема создаётся только через create_forum_thread().
drop policy if exists forum_threads_update_staff on forum_threads;
create policy forum_threads_update_staff on forum_threads for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));
drop policy if exists forum_threads_delete_own_or_staff on forum_threads;
create policy forum_threads_delete_own_or_staff on forum_threads for delete
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')));

-- ══════════════════════════════════════
--  ПОСТЫ — и открывающий пост темы (is_op=true), и все ответы
-- ══════════════════════════════════════
create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references forum_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  quote_post_id uuid references forum_posts(id) on delete set null,
  is_op boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_forum_posts_thread on forum_posts(thread_id, created_at);

alter table forum_posts enable row level security;
drop policy if exists forum_posts_select_all on forum_posts;
create policy forum_posts_select_all on forum_posts for select using (true);
drop policy if exists forum_posts_insert on forum_posts;
create policy forum_posts_insert on forum_posts for insert
  with check (
    user_id = auth.uid()
    and is_op = false
    and (
      not exists (select 1 from forum_threads t where t.id = thread_id and t.is_locked)
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
    )
  );
-- Нет update policy — редактирование только через edit_forum_post().
-- is_op-пост (открывающий тему) нельзя удалить напрямую — только всю
-- тему целиком (forum_threads, каскадом снесёт и посты).
drop policy if exists forum_posts_delete on forum_posts;
create policy forum_posts_delete on forum_posts for delete
  using (
    not is_op
    and (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN')))
  );

-- ══════════════════════════════════════
--  РЕАКЦИИ НА ПОСТЫ — тот же паттерн, что project_reactions
-- ══════════════════════════════════════
create table if not exists forum_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references forum_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id, emoji)
);
create index if not exists idx_forum_post_reactions_post on forum_post_reactions(post_id);

alter table forum_post_reactions enable row level security;
drop policy if exists forum_post_reactions_select_all on forum_post_reactions;
create policy forum_post_reactions_select_all on forum_post_reactions for select using (true);
drop policy if exists forum_post_reactions_insert_own on forum_post_reactions;
create policy forum_post_reactions_insert_own on forum_post_reactions for insert with check (user_id = auth.uid());
drop policy if exists forum_post_reactions_delete_own on forum_post_reactions;
create policy forum_post_reactions_delete_own on forum_post_reactions for delete using (user_id = auth.uid());

-- ══════════════════════════════════════
--  create_forum_thread — единственный способ создать тему
-- ══════════════════════════════════════
create or replace function create_forum_thread(p_category_id uuid, p_title text, p_content text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_thread_id uuid;
  v_title text;
begin
  v_title := trim(p_title);
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Заголовок темы должен быть от 3 до 200 символов';
  end if;
  if p_content is null or trim(p_content) = '' then
    raise exception 'Текст темы не может быть пустым';
  end if;
  if not exists (select 1 from forum_categories where id = p_category_id) then
    raise exception 'Категория не найдена';
  end if;

  insert into forum_threads (category_id, user_id, title, last_activity_at)
  values (p_category_id, auth.uid(), v_title, now())
  returning id into v_thread_id;

  insert into forum_posts (thread_id, user_id, content, is_op)
  values (v_thread_id, auth.uid(), p_content, true);

  return v_thread_id;
end;
$$;
grant execute on function create_forum_thread(uuid, text, text) to authenticated;

-- ══════════════════════════════════════
--  edit_forum_post — единственный способ отредактировать пост
-- ══════════════════════════════════════
create or replace function edit_forum_post(p_post_id uuid, p_content text)
returns void
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_thread_id uuid;
  v_locked boolean;
  v_is_staff boolean;
begin
  select user_id, thread_id into v_owner, v_thread_id from forum_posts where id = p_post_id;
  if v_owner is null then
    raise exception 'Пост не найден';
  end if;

  select (role in ('MENTOR','ADMIN')) into v_is_staff from profiles where id = auth.uid();
  if v_owner <> auth.uid() and not coalesce(v_is_staff, false) then
    raise exception 'Можно редактировать только свои сообщения';
  end if;

  select is_locked into v_locked from forum_threads where id = v_thread_id;
  if coalesce(v_locked, false) and not coalesce(v_is_staff, false) then
    raise exception 'Тема закрыта для правок';
  end if;

  if p_content is null or trim(p_content) = '' then
    raise exception 'Текст не может быть пустым';
  end if;

  update forum_posts set content = p_content, updated_at = now() where id = p_post_id;
end;
$$;
grant execute on function edit_forum_post(uuid, text) to authenticated;

-- ══════════════════════════════════════
--  increment_thread_view — просмотр темы не требует UPDATE-прав на
--  forum_threads (та политика оставлена только для staff), просто
--  маленькая RPC на +1 к счётчику
-- ══════════════════════════════════════
create or replace function increment_thread_view(p_thread_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update forum_threads set view_count = view_count + 1 where id = p_thread_id;
end;
$$;
grant execute on function increment_thread_view(uuid) to authenticated;

-- ══════════════════════════════════════
--  Триггер: любой новый пост в теме двигает last_activity_at
-- ══════════════════════════════════════
create or replace function forum_posts_touch_thread_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  update forum_threads set last_activity_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_forum_posts_touch_activity on forum_posts;
create trigger trg_forum_posts_touch_activity
  after insert on forum_posts
  for each row execute function forum_posts_touch_thread_activity();

-- ══════════════════════════════════════
--  Новые типы уведомлений/жалоб для форума (пока только реакции —
--  ответы и "спасибо" добавятся отдельными миграциями 034/035)
-- ══════════════════════════════════════
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'post_comment','post_reaction','project_comment','project_reaction','project_review','follow',
    'role_changed','vip_granted','verification_approved','verification_rejected',
    'forum_reaction'
  ));

alter table content_reports drop constraint if exists content_reports_content_type_check;
alter table content_reports add constraint content_reports_content_type_check
  check (content_type in ('post', 'comment', 'project_comment', 'forum_post'));
