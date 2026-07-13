-- ══════════════════════════════════════
--  МОДЕРАЦИЯ КОНТЕНТА В ЛЕНТЕ
-- ══════════════════════════════════════
-- Два слоя: (1) автоматический фильтр мата — на стороне браузера, ничего
-- в базе не требует; (2) жалобы от пользователей — эта таблица собирает
-- их и показывает в панели управления, MENTOR/ADMIN решают удалить
-- контент или отклонить жалобу (удаление уже умели делать раньше).

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  content_type text not null check (content_type in ('post', 'comment')),
  content_id uuid not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, content_type, content_id)
);

create index if not exists idx_content_reports_status on content_reports(status);
create index if not exists idx_content_reports_content on content_reports(content_type, content_id);

alter table content_reports enable row level security;

-- Пожаловаться может любой залогиненный, на что угодно (не только на своё —
-- смысл жалобы как раз в чужом контенте), но только от своего имени.
drop policy if exists reports_insert_own on content_reports;
create policy reports_insert_own on content_reports for insert
  with check (reporter_id = auth.uid());

-- Видеть жалобы (и чьи они) может только тот, кто их разбирает — MENTOR/ADMIN.
-- Обычный пользователь не должен видеть, кто на что жаловался.
drop policy if exists reports_select_staff on content_reports;
create policy reports_select_staff on content_reports for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('MENTOR', 'ADMIN')));

drop policy if exists reports_update_staff on content_reports;
create policy reports_update_staff on content_reports for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('MENTOR', 'ADMIN')));

comment on table content_reports is
  'Жалобы пользователей на посты/комментарии в ленте. Разбирают MENTOR/ADMIN в панели управления.';
