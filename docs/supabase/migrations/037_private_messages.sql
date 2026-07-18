-- ЛИЧНЫЕ СООБЩЕНИЯ — плоская таблица, без отдельных "бесед"/участников.
-- "Переписка" с конкретным человеком — это просто фильтр по паре
-- (sender_id, recipient_id) в любую сторону, вычисляется на клиенте.
--
-- Отметка "прочитано" — только через RPC mark_message_read(), не через
-- прямой UPDATE: RLS построчная, не по колонкам, а разрешить получателю
-- прямой UPDATE всей строки значит разрешить ему переписать чужой текст.
--
-- Выполнить после всех предыдущих миграций.

create table if not exists pm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists idx_pm_messages_recipient on pm_messages(recipient_id, created_at desc);
create index if not exists idx_pm_messages_sender on pm_messages(sender_id, created_at desc);

alter table pm_messages enable row level security;
drop policy if exists pm_messages_select_own on pm_messages;
create policy pm_messages_select_own on pm_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists pm_messages_insert_own on pm_messages;
create policy pm_messages_insert_own on pm_messages for insert
  with check (sender_id = auth.uid());
-- Намеренно нет update policy — отметка "прочитано" только через RPC ниже.

create or replace function mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update pm_messages
    set read_at = now()
    where id = p_message_id and recipient_id = auth.uid() and read_at is null;
end;
$$;
grant execute on function mark_message_read(uuid) to authenticated;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'post_comment','post_reaction','project_comment','project_reaction','project_review','follow',
    'role_changed','vip_granted','verification_approved','verification_rejected',
    'forum_reaction','forum_reply','forum_thanks','pm_message'
  ));
