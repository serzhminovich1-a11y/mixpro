-- MIXPRO — этап 3: редактирование постов/комментариев + отметка "изменено".
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

alter table posts add column if not exists updated_at timestamptz;
alter table post_comments add column if not exists updated_at timestamptz;

-- Редактировать содержимое может только сам автор (не ADMIN — модератор
-- может удалить чужой пост/комментарий, но не переписывать чужие слова).
drop policy if exists posts_update_own on posts;
create policy posts_update_own on posts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists comments_update_own on post_comments;
create policy comments_update_own on post_comments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
