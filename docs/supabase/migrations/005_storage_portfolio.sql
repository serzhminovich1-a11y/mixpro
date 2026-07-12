-- MIXPRO LMS — этап 3: хранилище файлов для портфолио (аудио-миксы).
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

-- ══════════════════════════════════════
--  БАКЕТ ДЛЯ ФАЙЛОВ ПОРТФОЛИО
-- ══════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

-- ══════════════════════════════════════
--  ПРАВИЛА ДОСТУПА К ФАЙЛАМ
-- ══════════════════════════════════════
do $$ begin
  create policy "portfolio_public_read" on storage.objects
    for select using (bucket_id = 'portfolio');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "portfolio_own_insert" on storage.objects
    for insert with check (bucket_id = 'portfolio' and owner = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "portfolio_own_delete" on storage.objects
    for delete using (bucket_id = 'portfolio' and owner = auth.uid());
exception when duplicate_object then null; end $$;
