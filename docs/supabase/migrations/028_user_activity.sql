-- Отметка "когда пользователь последний раз был на сайте" — обновляется
-- самим клиентом при заходе на любую страницу (см. touchLastSeen() в JS).
-- Поле не входит в список защищённых триггером guard_profile_privileged_fields
-- (002_lms_rls.sql), поэтому обычный пользователь может обновлять его себе
-- через уже существующую политику profiles_update_own — новых политик не нужно.
-- Выполнить после всех предыдущих миграций.

alter table profiles add column if not exists last_seen_at timestamptz;
create index if not exists idx_profiles_last_seen on profiles(last_seen_at desc);
