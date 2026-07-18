-- Раньше при выдаче роли/VIP/одобрении верификации из панели администратора
-- сам человек никак об этом не узнавал — уведомления слал только feed.js
-- (комментарии/реакции/подписки), панель администратора вообще не звала
-- notifyUser(). Добавляем 4 новых типа уведомлений для этих случаев —
-- сама вставка идёт из docs/js/admin.js (см. saveField/handleVerifyReview).
-- Выполнить после всех предыдущих миграций.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'post_comment','post_reaction','project_comment','project_reaction','project_review','follow',
    'role_changed','vip_granted','verification_approved','verification_rejected'
  ));
