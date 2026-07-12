-- MIXPRO LMS — этап 3: хранилище видео для уроков (закрытое, не публичное).
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

-- ══════════════════════════════════════
--  БАКЕТ ДЛЯ ВИДЕО УРОКОВ — public = false (главное отличие от портфолио)
-- ══════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('lessons', 'lessons', false)
on conflict (id) do nothing;

-- ══════════════════════════════════════
--  ПРАВИЛА ДОСТУПА
--  Смотреть — любой залогиненный пользователь (только через временную
--  подписанную ссылку, не напрямую). Загружать/удалять — только MENTOR/ADMIN.
-- ══════════════════════════════════════
do $$ begin
  create policy "lessons_video_read_authenticated" on storage.objects
    for select using (bucket_id = 'lessons' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lessons_video_write_staff" on storage.objects
    for insert with check (
      bucket_id = 'lessons'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lessons_video_delete_staff" on storage.objects
    for delete using (
      bucket_id = 'lessons'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('MENTOR','ADMIN'))
    );
exception when duplicate_object then null; end $$;
