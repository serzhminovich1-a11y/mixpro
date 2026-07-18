-- БАРАХОЛКА — объявления о продаже оборудования. Без ролевого фильтра на
-- публикацию (как форум, а не как курсы) — продавать может любой
-- залогиненный. Модерация — через тот же общий "Жалобы"
-- (content_reports), отдельного раздела в админке нет: счётчик жалоб в
-- сайдбаре и так считает все content_reports одним запросом.
--
-- image_urls — обычный text[], не отдельная таблица-джойн: у объявления
-- максимум 5 фото, отдельная таблица тут была бы лишней сложностью.
--
-- Выполнить после всех предыдущих миграций.

create table if not exists marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  description text,
  price numeric not null check (price >= 0),
  currency text not null default 'RUB',
  category text not null check (category in (
    'mics', 'monitors', 'interfaces', 'headphones', 'outboard',
    'midi', 'software', 'furniture', 'other'
  )),
  condition text not null check (condition in ('new', 'used')),
  status text not null default 'active' check (status in ('active', 'sold', 'archived')),
  image_urls text[] check (image_urls is null or array_length(image_urls, 1) <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_marketplace_listings_status on marketplace_listings(status, created_at desc);
create index if not exists idx_marketplace_listings_category on marketplace_listings(category, status);

alter table marketplace_listings enable row level security;
drop policy if exists marketplace_listings_select_all on marketplace_listings;
create policy marketplace_listings_select_all on marketplace_listings for select using (true);
drop policy if exists marketplace_listings_insert_own on marketplace_listings;
create policy marketplace_listings_insert_own on marketplace_listings for insert with check (user_id = auth.uid());
drop policy if exists marketplace_listings_update_own_or_admin on marketplace_listings;
create policy marketplace_listings_update_own_or_admin on marketplace_listings for update
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'))
  with check (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));
drop policy if exists marketplace_listings_delete_own_or_admin on marketplace_listings;
create policy marketplace_listings_delete_own_or_admin on marketplace_listings for delete
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

alter table content_reports drop constraint if exists content_reports_content_type_check;
alter table content_reports add constraint content_reports_content_type_check
  check (content_type in ('post', 'comment', 'project_comment', 'forum_post', 'pm_message', 'marketplace_listing'));
