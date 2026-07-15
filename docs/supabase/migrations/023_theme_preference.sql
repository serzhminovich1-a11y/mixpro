-- ══════════════════════════════════════
--  ВЫБОР ТЕМЫ ОФОРМЛЕНИЯ: сохраняем на аккаунте, часть тем — только VIP
-- ══════════════════════════════════════
-- Список тем и какие из них требуют VIP — на стороне фронтенда (docs/js/theme.js),
-- здесь только хранится, что выбрал пользователь, и сервер не даёт поставить
-- платную тему без is_vip (даже если кто-то попробует дёрнуть запрос напрямую,
-- минуя интерфейс).
--
-- В отличие от role/xp/verification_status/is_vip (см. 013_vip_status.sql),
-- эту тему меняет сам пользователь — она не в списке полей, защищённых
-- guard_profile_privileged_fields, а получает свою отдельную, более мягкую
-- проверку: можно ставить 'default' всегда, всё остальное — только если is_vip.

alter table profiles add column if not exists active_theme text not null default 'default';

comment on column profiles.active_theme is
  'Выбранная пользователем визуальная тема сайта. ''default'' доступна всем,
   остальные значения (сейчас: brutal/hifi/neon) требуют is_vip=true —
   see guard_theme_selection().';

create or replace function guard_theme_selection()
returns trigger
language plpgsql
security definer
as $$
declare
  is_bypassed boolean;
begin
  is_bypassed := coalesce(current_setting('app.bypass_privileged_guard', true), 'false') = 'true';

  if new.active_theme is distinct from old.active_theme
     and new.active_theme <> 'default'
     and not is_bypassed
     and not coalesce(new.is_vip, false) then
    raise exception 'active_theme % требует VIP', new.active_theme;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_theme_selection on profiles;
create trigger trg_guard_theme_selection
  before update on profiles
  for each row execute function guard_theme_selection();
