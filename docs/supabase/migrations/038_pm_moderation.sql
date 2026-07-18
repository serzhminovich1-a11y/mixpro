-- МОДЕРАЦИЯ ЛИЧНЫХ СООБЩЕНИЙ ПО ЖАЛОБЕ (уточнено с пользователем явно —
-- полная приватность переписки означала бы, что персонал не может
-- ничего сделать даже при жалобе на харассмент). Персонал видит ТОЛЬКО
-- то сообщение, на которое конкретно пожаловались, а не всю переписку —
-- вторая, отдельная разрешающая RLS-политика (объединяется с обычной
-- "своё" по правилу ИЛИ, как и все остальные admin-политики в проекте).
--
-- Выполнить после 037_private_messages.sql.

alter table content_reports drop constraint if exists content_reports_content_type_check;
alter table content_reports add constraint content_reports_content_type_check
  check (content_type in ('post', 'comment', 'project_comment', 'forum_post', 'pm_message'));

drop policy if exists pm_messages_select_staff_reported on pm_messages;
create policy pm_messages_select_staff_reported on pm_messages for select
  using (
    exists (
      select 1 from content_reports cr
      where cr.content_type = 'pm_message' and cr.content_id = pm_messages.id
    )
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
  );
