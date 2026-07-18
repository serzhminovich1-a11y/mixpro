-- ФОРУМ — подписки на темы + уведомления об ответах.
--
-- RLS на forum_subscriptions обязана быть "видно только своё" (иначе
-- любой сможет читать, кто на что подписан) — а значит с браузера
-- физически нельзя прочитать чужой список подписчиков, чтобы разослать
-- уведомления самому. Поэтому рассылка идёт ТОЛЬКО через триггер на
-- forum_posts (security definer, обходит RLS) — при любом новом посте
-- (и открывающем тему, и ответе) автор автоматически подписывается на
-- тему, и всем ОСТАЛЬНЫМ подписчикам уходит уведомление.
--
-- Выполнить после 033_forum_core.sql.

create table if not exists forum_subscriptions (
  thread_id uuid not null references forum_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table forum_subscriptions enable row level security;
drop policy if exists forum_subscriptions_select_own on forum_subscriptions;
create policy forum_subscriptions_select_own on forum_subscriptions for select using (user_id = auth.uid());
drop policy if exists forum_subscriptions_insert_own on forum_subscriptions;
create policy forum_subscriptions_insert_own on forum_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists forum_subscriptions_delete_own on forum_subscriptions;
create policy forum_subscriptions_delete_own on forum_subscriptions for delete using (user_id = auth.uid());

create or replace function forum_posts_subscribe_and_notify()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into forum_subscriptions(thread_id, user_id)
  values (new.thread_id, new.user_id)
  on conflict do nothing;

  insert into notifications(user_id, actor_id, type, content_type, content_id)
  select fs.user_id, new.user_id, 'forum_reply', 'forum_thread', new.thread_id
  from forum_subscriptions fs
  where fs.thread_id = new.thread_id and fs.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_forum_posts_subscribe_and_notify on forum_posts;
create trigger trg_forum_posts_subscribe_and_notify
  after insert on forum_posts
  for each row execute function forum_posts_subscribe_and_notify();

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'post_comment','post_reaction','project_comment','project_reaction','project_review','follow',
    'role_changed','vip_granted','verification_approved','verification_rejected',
    'forum_reaction','forum_reply'
  ));
