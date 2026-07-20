-- БИБЛИОТЕКА — примеры А/Б у термина (звук «до»/«после», например для
-- компрессии, эквализации и т.п.). Новые nullable-колонки, RLS не
-- меняется — политики glossary_terms уже `for all` для VERIFIED_PRO/
-- MENTOR/ADMIN и покрывают любые колонки без изменений.
--
-- Выполнить после 027_glossary.sql.

alter table glossary_terms
  add column if not exists example_a_url text,
  add column if not exists example_a_label text,
  add column if not exists example_b_url text,
  add column if not exists example_b_label text;
