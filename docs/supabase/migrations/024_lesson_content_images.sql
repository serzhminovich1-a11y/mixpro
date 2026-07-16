-- MIXPRO LMS — бакет для картинок внутри текста теории (не путать с
-- 'lessons' — тот приватный, для видео, чтобы его не растащили по кускам.
-- Картинки внутри учебного текста наоборот должны открываться без
-- подписанных ссылок, поэтому бакет публичный на чтение.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

insert into storage.buckets (id, name, public)
values ('lesson-content', 'lesson-content', true)
on conflict (id) do nothing;

do $$ begin
  create policy "lesson_content_public_read" on storage.objects
    for select using (bucket_id = 'lesson-content');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lesson_content_write_staff" on storage.objects
    for insert with check (
      bucket_id = 'lesson-content'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lesson_content_delete_staff" on storage.objects
    for delete using (
      bucket_id = 'lesson-content'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;
