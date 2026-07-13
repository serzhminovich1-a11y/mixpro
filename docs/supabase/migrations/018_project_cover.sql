-- MIXPRO — обложка трека в портфолио.
-- Выполнить в Supabase SQL Editor целиком, после всех предыдущих миграций.

alter table projects add column if not exists cover_url text;

comment on column projects.cover_url is
  'Обложка трека (картинка) — необязательна. Хранится в том же бакете
   storage "portfolio", что и сам аудиофайл — политики доступа к бакету
   уже разрешают публичное чтение и запись/удаление своих файлов
   (см. 005_storage_portfolio.sql), новая миграция для хранилища не нужна.';
