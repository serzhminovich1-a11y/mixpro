-- MIXPRO — уведомления: кто-то прокомментировал/отреагировал/оставил
-- разбор на твой пост или трек, у тебя новый подписчик.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,   -- кому уведомление
  actor_id uuid references profiles(id) on delete set null,          -- кто вызвал событие
  type text not null check (type in ('post_comment','post_reaction','project_comment','project_reaction','project_review','follow')),
  content_type text,   -- 'post' | 'project' | null (для follow)
  content_id uuid,     -- id поста/трека, к которому относится уведомление
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

alter table notifications enable row level security;

-- Видеть можно только свои уведомления.
drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications for select using (user_id = auth.uid());

-- Создавать уведомление может кто угодно, но только "от своего имени" —
-- actor_id обязан быть тем, кто сейчас залогинен. Получатель (user_id)
-- при этом может быть кем угодно — иначе не получилось бы уведомить
-- ДРУГОГО человека о своём действии (прокомментировал/поставил реакцию).
drop policy if exists notifications_insert_as_actor on notifications;
create policy notifications_insert_as_actor on notifications for insert
  with check (actor_id = auth.uid());

-- Отмечать прочитанным / удалять можно только своё.
drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on notifications;
create policy notifications_delete_own on notifications for delete using (user_id = auth.uid());

comment on table notifications is
  'Уведомления пользователя. actor_id — кто вызвал событие (для системных
   в будущем может быть null), content_type/content_id — куда вести при клике.
   Текст не хранится — собирается на клиенте по type + профилю actor_id,
   чтобы не хранить дублирующийся текст и не зависеть от смены имени.';
