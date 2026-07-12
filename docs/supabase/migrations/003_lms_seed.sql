-- MIXPRO LMS — этап 1: тестовые данные. Выполнять ПОСЛЕ 001 и 002.
-- Несколько примеров достижений — чтобы проверить, что схема реально работает.
-- Условия (condition_type/condition_value) здесь не проверяются автоматически —
-- логика авто-выдачи будет добавлена на этапе "Achievement Engine".

insert into achievements (title, description, icon, category, rarity, condition_type, condition_value, xp_reward)
values
  ('Первый микс', 'Загрузи свой первый проект в портфолио', '🎚️', 'portfolio', 'common', 'projects_completed', 1, 50),
  ('Прилежный ученик', 'Пройди 10 уроков', '📚', 'learning', 'common', 'lessons_completed', 10, 100),
  ('Сдал первое задание', 'Отправь и получи оценку за первое практическое задание', '✅', 'assignments', 'common', 'assignments_completed', 1, 75),
  ('Подтверждённый профи', 'Пройди верификацию Certified Engineer', '🏆', 'verification', 'rare', 'expert_verified', 1, 500)
on conflict do nothing;
