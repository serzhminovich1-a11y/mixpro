-- Вложения из Stepik-подобного редактора: изображения, документы, аудио
-- и короткие видео, встроенные в описание курса и теоретические блоки.
-- Выполнить в Supabase SQL Editor после предыдущих миграций.

insert into storage.buckets (id, name, public, file_size_limit)
values ('course-assets', 'course-assets', true, 104857600)
on conflict (id) do nothing;

do $$ begin
  create policy "course_assets_public_read" on storage.objects
    for select using (bucket_id = 'course-assets');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "course_assets_write_course_authors" on storage.objects
    for insert with check (
      bucket_id = 'course-assets'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "course_assets_delete_course_authors" on storage.objects
    for delete using (
      bucket_id = 'course-assets'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;
