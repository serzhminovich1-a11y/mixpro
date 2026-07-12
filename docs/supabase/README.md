# MIXPRO LMS — миграции БД (этап 1: архитектура)

Это расширение текущего Supabase-проекта MIXPRO под систему курсов,
достижений, XP/уровней, портфолио, заданий и сертификации звукорежиссёров.
Существующие таблицы `profiles` и `scores` не удаляются — `profiles` только
дополняется новыми колонками.

## Как применить

Открой Supabase Dashboard → SQL Editor → New query, и выполни файлы
**строго по порядку**, один за другим (каждый — отдельным запуском):

1. `migrations/001_lms_schema.sql` — типы, новые таблицы, колонки в `profiles`,
   функция `get_level_from_xp()`.
2. `migrations/002_lms_rls.sql` — политики безопасности (Row Level Security)
   на все новые таблицы + защита `role`/`xp`/`verification_status` от прямого
   изменения пользователем.
3. `migrations/003_lms_seed.sql` — 4 примера достижений для проверки.

Если какой-то файл упадёт с ошибкой — не продолжай следующим, разберись
сначала с ошибкой (частая причина: файл 001 не выполнился полностью).

## Как проверить, что всё встало

В SQL Editor выполни по очереди:

```sql
-- 1. Таблицы появились
select table_name from information_schema.tables
where table_schema = 'public' and table_name in
  ('courses','lessons','lesson_progress','achievements','user_achievements',
   'projects','assignments','assignment_submissions','reviews',
   'certificates','verification_requests');
-- должно вернуть все 11 строк

-- 2. Функция уровня работает
select get_level_from_xp(0), get_level_from_xp(600), get_level_from_xp(6000);
-- Beginner | Intermediate | Professional

-- 3. Сид-достижения на месте
select title, condition_type, condition_value, xp_reward from achievements;
-- 4 строки

-- 4. У profiles появились новые колонки
select role, xp, bio, avatar_url, verification_status from profiles limit 1;
```

Проверка RLS (защита от самостоятельной накрутки XP/роли) — выполни как
залогиненный обычный пользователь (не через service_role):

```sql
update profiles set xp = 99999 where id = auth.uid();
```

Должна вернуться ошибка `role/xp/verification_status можно менять только
через ADMIN или service_role` — это подтверждает, что триггер защиты работает.

## Что дальше

Это только структура БД. Следующие этапы (начнутся после того, как ты
подтвердишь, что этот применился без ошибок):

- **Этап 2 — Achievement Engine**: функция/триггеры, которые реально
  проверяют условия (`condition_type`/`condition_value`) и автоматически
  выдают достижения + XP при выполнении уроков/заданий/загрузке проектов.
- **Этап 3 — UI**: страницы курсов, профиля с достижениями, загрузки
  портфолио и админки для MENTOR/ADMIN.
- **Этап 4 — загрузка аудио**: интеграция с Supabase Storage для WAV/MP3.
