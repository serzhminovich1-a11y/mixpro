-- ЗАЩИТА ЗАГРУЗКИ ФАЙЛОВ — ни у одного из 4 бакетов (portfolio/posts/
-- lessons/course-assets) не было ограничения на тип файла, и только у
-- course-assets было ограничение на размер (100 МБ). Все проверки типа
-- ("accept=audio/*" в HTML, ручные проверки размера в JS перед
-- .upload()) — только на клиенте и ничего не стоят: тот же запрос
-- можно отправить напрямую в Storage API, минуя сайт целиком (то же
-- самое, что делалось в этой сессии curl'ом для проверки RLS).
--
-- file_size_limit/allowed_mime_types — проверяются Supabase Storage
-- САМ, на сервере, независимо от того, что заявляет клиент. Это не
-- глубокая проверка байт файла (Storage не читает содержимое, только
-- заявленный Content-Type при загрузке) — но: (1) обычная загрузка
-- через сайт и большинство наивных попыток подделки отклоняются сразу;
-- (2) даже если Content-Type при загрузке подделан, отдаётся файл
-- Storage'ом с тем же (безопасным) Content-Type, каким был загружен —
-- значит выполниться в браузере как HTML/JS при открытии по прямой
-- ссылке он не сможет, только если жертва явно его так и не откроет.
-- SVG исключён из всех списков намеренно — может содержать <script>,
-- в отличие от растровых форматов.
--
-- Существующие уже загруженные файлы не затрагиваются — ограничения
-- действуют только на новые загрузки (и перезаписи) начиная с
-- применения этой миграции.
--
-- Выполнить после 025_course_assets.sql.

-- ── portfolio: только аудио-треки + обложки ──
update storage.buckets set
  file_size_limit = 52428800, -- 50 МБ
  allowed_mime_types = array[
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave',
    'audio/webm','audio/ogg','audio/aac','audio/flac','audio/x-m4a','audio/mp4',
    'image/jpeg','image/png','image/webp','image/gif'
  ]
where id = 'portfolio';

-- ── posts: форум/барахолка/лента — картинки, аудио (в т.ч. голосовые
-- комментарии), видео + немного безопасных документов для вложений ──
update storage.buckets set
  file_size_limit = 26214400, -- 25 МБ
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave',
    'audio/webm','audio/ogg','audio/aac','audio/flac','audio/x-m4a','audio/mp4',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf','application/zip','application/x-zip-compressed','text/plain'
  ]
where id = 'posts';

-- ── course-assets: курсы/уроки/библиотека — тот же набор типов, что и
-- posts, лимит размера уже был (100 МБ) — не трогаю ──
update storage.buckets set
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave',
    'audio/webm','audio/ogg','audio/aac','audio/flac','audio/x-m4a','audio/mp4',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf','application/zip','application/x-zip-compressed','text/plain'
  ]
where id = 'course-assets';

-- ── lessons: только видео уроков, приватный бакет, загружают MENTOR/ADMIN ──
update storage.buckets set
  file_size_limit = 2147483648, -- 2 ГБ — видео-уроки могут быть длинными
  allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
where id = 'lessons';
