-- ПОДПИСЬ В ПРОФИЛЕ — переиспользуем уже существующую колонку profiles.bio
-- (001_lms_schema.sql), которая до сих пор нигде не была подключена ни в
-- одной форме и ни на одной странице. Ограничиваем длину, чтобы подпись
-- нельзя было превратить в длинную стену текста/спам под каждым постом
-- на форуме. RLS уже разрешает профилю редактировать это поле самому
-- (profiles_update_own, 002_lms_rls.sql, без ограничения по колонкам, и
-- bio не входит в защищённый список guard_profile_privileged_fields) —
-- новых политик не нужно, только constraint.
--
-- Выполнить после всех предыдущих миграций.

alter table profiles drop constraint if exists bio_length_check;
alter table profiles add constraint bio_length_check check (char_length(bio) <= 300);
