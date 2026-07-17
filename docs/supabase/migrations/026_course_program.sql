-- Программа курса в формате "раздел → уроки", как в редакторе Stepik.
-- Выполнить после 025_course_assets.sql.

create table if not exists course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_course_sections_course on course_sections(course_id, order_index);

alter table lessons add column if not exists section_id uuid references course_sections(id) on delete set null;
alter table lessons add column if not exists cover_image_url text;
create index if not exists idx_lessons_section on lessons(section_id, order_index);

alter table course_sections enable row level security;
drop policy if exists course_sections_select_all on course_sections;
create policy course_sections_select_all on course_sections for select using (true);
drop policy if exists course_sections_write_authors on course_sections;
create policy course_sections_write_authors on course_sections for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('VERIFIED_PRO','MENTOR','ADMIN')));
