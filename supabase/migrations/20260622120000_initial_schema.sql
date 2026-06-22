-- ============================================================================
-- ترجمان القرآني — أول migration: المخطّط الكامل (المرحلة 1 + 2)
-- مصدر الحقيقة: docs/DATABASE.md
-- يشمل: enums + جداول + قيود + أعمدة محسوبة + triggers + RLS + بيانات أولية
-- ملاحظة أمنية: RLS مُفعّل على كل جدول. الصلاحيات الهرمية الدقيقة للكتابة
--   (إسناد مشرف الجودة للحلقات) مبدئيّة هنا ومحصورة بالمدير — تُوسَّع لاحقاً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) الأنواع (Enums)
-- ----------------------------------------------------------------------------
create type user_role            as enum ('manager', 'quality', 'supervisor', 'teacher');
create type gender_type          as enum ('male', 'female');
create type profile_status       as enum ('pending', 'active', 'disabled');
create type account_type         as enum ('jawwalpay', 'palpay', 'bank_palestine');
create type student_status       as enum ('active', 'withdrawn', 'graduated', 'transferred');
create type halaqa_classification as enum ('a', 'b');
create type halaqa_status        as enum ('active', 'stopped');
create type visit_status         as enum ('scheduled', 'done', 'late', 'missed');
create type exam_stage_type      as enum ('partial', 'cumulative');
create type exam_list_status     as enum ('sent', 'in_progress', 'completed');
create type report_status        as enum ('draft', 'submitted', 'approved');
create type minutes_status       as enum ('draft', 'final');
create type transaction_type     as enum ('income', 'expense');
create type alert_severity       as enum ('note', 'first_warning', 'final_warning');
create type alert_status         as enum ('new', 'acknowledged');
create type statement_status     as enum ('draft', 'submitted', 'reviewed');
create type activity_key         as enum (
  'reflection_1', 'reflection_2', 'reflection_3', 'reflection_4',
  'weekly_review_1', 'weekly_review_2', 'weekly_review_3', 'weekly_review_4',
  'edu_curriculum_1', 'edu_curriculum_2', 'edu_curriculum_3', 'edu_curriculum_4',
  'video_lecture', 'values_followup'
);

-- ----------------------------------------------------------------------------
-- 1) دالة updated_at المشتركة
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- الجداول
-- ============================================================================

-- 1. profiles — العاملون الأربعة (يمتد من auth.users)
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  role                  user_role not null,
  full_name             text not null,
  gender                gender_type,
  birth_date            date,
  national_id           text unique,
  marital_status        text,
  family_count          int,
  job_title             text,
  hire_date             date,
  years_experience      int,
  quality_supervisor_id uuid references public.profiles(id) on delete set null,
  residence_area        text,
  nearest_mosque        text,
  address_detail        text,
  education_level       text,
  academic_major        text,
  quran_parts           int,
  tajweed_level         text,
  phone                 text,
  email                 text,
  status                profile_status not null default 'pending',
  assigned_by           uuid references public.profiles(id) on delete set null,
  avatar_url            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- بيانات مالية للعاملين (🔒 منفصلة، المدير فقط)
create table public.profile_financials (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  account_number text,
  account_holder text,
  account_type   account_type,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3. halaqat — الحلقات
create table public.halaqat (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  daily_time     time,
  teacher_id     uuid not null references public.profiles(id) on delete restrict,
  supervisor_id  uuid references public.profiles(id) on delete set null,
  classification halaqa_classification,
  gender         gender_type,
  status         halaqa_status not null default 'active',
  assigned_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2. students — سجلّ بيانات (لا ربط بـ auth.users)
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  gender         gender_type,
  birth_date     date,
  national_id    text unique,
  family_count   int,
  quran_parts    int,
  tajweed_level  text,
  residence      text,
  nearest_mosque text,
  enrollment_date date,
  status         student_status not null default 'active',
  guardian_name  text,
  guardian_phone text,
  guardian_email text,
  phone          text,
  halaqa_id      uuid references public.halaqat(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 4. supervision_visits — الزيارات الإشرافية
create table public.supervision_visits (
  id              uuid primary key default gen_random_uuid(),
  halaqa_id       uuid not null references public.halaqat(id) on delete cascade,
  supervisor_id   uuid not null references public.profiles(id) on delete restrict,
  scheduled_at    timestamptz not null,
  executed_at     timestamptz,
  status          visit_status not null default 'scheduled',
  notes           text,
  flow_rating     text,
  strengths       text,
  improvements    text,
  recommendations text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.visit_reschedule_log (
  id         uuid primary key default gen_random_uuid(),
  visit_id   uuid not null references public.supervision_visits(id) on delete cascade,
  old_time   timestamptz,
  new_time   timestamptz,
  reason     text not null,
  changed_at timestamptz not null default now()
);

-- 5. exam_plan — خطة الاختبارات (يعدّلها المدير)
create table public.exam_plan (
  id           int generated always as identity primary key,
  group_number int not null,
  stage_type   exam_stage_type not null,
  parts_from   int not null,
  parts_to     int not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 6. exam_lists — قوائم الاختبار الأسبوعي
create table public.exam_lists (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  halaqa_id  uuid not null references public.halaqat(id) on delete cascade,
  week_date  date not null,
  status     exam_list_status not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_list_items (
  id           uuid primary key default gen_random_uuid(),
  exam_list_id uuid not null references public.exam_lists(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  exam_plan_id int references public.exam_plan(id) on delete set null,
  teacher_note text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 7. exam_results — نتائج اختبار الطالب (المجموع 100، أعمدة محسوبة)
create table public.exam_results (
  id                uuid primary key default gen_random_uuid(),
  exam_list_item_id uuid references public.exam_list_items(id) on delete set null,
  student_id        uuid not null references public.students(id) on delete cascade,
  examiner_id       uuid references public.profiles(id) on delete set null,
  exam_date         date not null default current_date,
  q1_memorization   int not null default 0 check (q1_memorization between 0 and 10),
  q1_understanding  int not null default 0 check (q1_understanding between 0 and 10),
  q1_reflection     int not null default 0 check (q1_reflection between 0 and 10),
  q2_memorization   int not null default 0 check (q2_memorization between 0 and 10),
  q2_understanding  int not null default 0 check (q2_understanding between 0 and 10),
  q2_reflection     int not null default 0 check (q2_reflection between 0 and 10),
  q3_memorization   int not null default 0 check (q3_memorization between 0 and 10),
  q3_understanding  int not null default 0 check (q3_understanding between 0 and 10),
  q3_reflection     int not null default 0 check (q3_reflection between 0 and 10),
  tajweed_score     int not null default 0 check (tajweed_score between 0 and 10),
  total_score       int generated always as (
                      q1_memorization + q1_understanding + q1_reflection
                    + q2_memorization + q2_understanding + q2_reflection
                    + q3_memorization + q3_understanding + q3_reflection
                    + tajweed_score) stored,
  pass_mark_snapshot int not null,
  passed            boolean generated always as (
                      (q1_memorization + q1_understanding + q1_reflection
                     + q2_memorization + q2_understanding + q2_reflection
                     + q3_memorization + q3_understanding + q3_reflection
                     + tajweed_score) >= pass_mark_snapshot) stored,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 8. monthly_reports — التقرير الشهري للحلقة
create table public.monthly_reports (
  id                      uuid primary key default gen_random_uuid(),
  halaqa_id               uuid not null references public.halaqat(id) on delete cascade,
  report_month            int not null check (report_month between 1 and 12),
  report_year             int not null,
  submitted_at            date,
  actual_days             int,
  default_days_snapshot   int,
  default_points_snapshot int,
  target_pages_snapshot   int,
  attendance_rate         numeric,
  activities_done         int not null default 0,
  activities_total        int not null default 15,
  general_notes           text,
  activities_notes        text,
  status                  report_status not null default 'draft',
  approved_by             uuid references public.profiles(id) on delete set null,
  approved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (halaqa_id, report_month, report_year)   -- تقرير واحد لكل حلقة لكل شهر
);

create table public.monthly_report_students (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.monthly_reports(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  memorization_from int,
  memorization_to   int check (memorization_to >= memorization_from),
  memorization_pages int generated always as (memorization_to - memorization_from) stored,
  review_to         int,
  review_pages      int generated always as (review_to - memorization_from) stored,
  absence_excused   int not null default 0,
  absence_unexcused int not null default 0,
  monthly_points    int,
  student_grade     numeric,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (report_id, student_id)
);

create table public.monthly_report_activities (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.monthly_reports(id) on delete cascade,
  activity_key activity_key not null,
  done      boolean not null default false,
  note      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, activity_key)   -- لا تكرار نشاط في تقرير
);

-- 9. meeting_minutes — محاضر الاجتماعات (المدير فقط)
create table public.meeting_minutes (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  meeting_date date not null,
  attendee_ids uuid[] not null default '{}',
  agenda       text,
  decisions    text,
  tasks        text,
  attachments  jsonb,
  status       minutes_status not null default 'draft',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 10. financial_transactions — الحركات المالية (المدير فقط)
create table public.financial_transactions (
  id               uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  description      text,
  category         text,
  type             transaction_type not null,
  amount           numeric not null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 11. admin_alerts — التنبيهات الإدارية للمعلمين
create table public.admin_alerts (
  id              uuid primary key default gen_random_uuid(),
  issuer_id       uuid not null references public.profiles(id) on delete cascade,
  teacher_id      uuid not null references public.profiles(id) on delete cascade,
  violation_type  text not null,
  severity        alert_severity not null default 'note',
  description     text,
  alert_date      date not null default current_date,
  status          alert_status not null default 'new',
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 12. app_settings — إعدادات المدير (صف واحد)
create table public.app_settings (
  id                         int primary key default 1 check (id = 1),
  pass_mark                  int not null default 80,
  target_memorization_pages  int not null default 30,
  default_points             int not null default 100,
  default_attendance_days    int,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- 13. news — الأخبار (عامّة على Landing)
create table public.news (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  news_date  date not null default current_date,
  category   text,
  body       text,
  image_url  text,
  published  boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. monthly_salaries — الرواتب الشهرية المرجعية (المدير فقط)
create table public.monthly_salaries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  salary_month int not null check (salary_month between 1 and 12),
  salary_year  int not null,
  amount       numeric not null default 0,
  approved     boolean not null default false,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, salary_month, salary_year)
);

-- 15. halaqa_incentives — تخصيص حوافز الحلقات الشهري (المدير فقط)
create table public.halaqa_incentives (
  id               uuid primary key default gen_random_uuid(),
  halaqa_id        uuid not null references public.halaqat(id) on delete cascade,
  incentive_month  int not null check (incentive_month between 1 and 12),
  incentive_year   int not null,
  allocated_amount numeric not null default 0,
  approved         boolean not null default false,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (halaqa_id, incentive_month, incentive_year)
);

-- 16. incentive_statements — كشف حوافز الحلقة (المعلم)
create table public.incentive_statements (
  id              uuid primary key default gen_random_uuid(),
  halaqa_id       uuid not null references public.halaqat(id) on delete cascade,
  statement_month int not null check (statement_month between 1 and 12),
  statement_year  int not null,
  received_amount numeric not null default 0,
  submitted_at    date,
  status          statement_status not null default 'draft',
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (halaqa_id, statement_month, statement_year)
);

create table public.incentive_statement_items (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.incentive_statements(id) on delete cascade,
  description  text,
  category     text,
  amount       numeric not null default 0,
  item_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- الفهارس (Indexes) على المفاتيح الخارجية الأكثر استخداماً
-- ----------------------------------------------------------------------------
create index idx_profiles_quality_supervisor on public.profiles(quality_supervisor_id);
create index idx_halaqat_teacher    on public.halaqat(teacher_id);
create index idx_halaqat_supervisor on public.halaqat(supervisor_id);
create index idx_students_halaqa    on public.students(halaqa_id);
create index idx_visits_halaqa      on public.supervision_visits(halaqa_id);
create index idx_visits_supervisor  on public.supervision_visits(supervisor_id);
create index idx_exam_lists_halaqa  on public.exam_lists(halaqa_id);
create index idx_exam_items_list    on public.exam_list_items(exam_list_id);
create index idx_exam_results_student on public.exam_results(student_id);
create index idx_reports_halaqa     on public.monthly_reports(halaqa_id);
create index idx_report_students_report on public.monthly_report_students(report_id);
create index idx_report_acts_report on public.monthly_report_activities(report_id);
create index idx_alerts_teacher     on public.admin_alerts(teacher_id);
create index idx_salaries_profile   on public.monthly_salaries(profile_id);
create index idx_incentives_halaqa  on public.halaqa_incentives(halaqa_id);
create index idx_statements_halaqa  on public.incentive_statements(halaqa_id);

-- ----------------------------------------------------------------------------
-- triggers updated_at على كل الجداول ذات العمود
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','profile_financials','halaqat','students','supervision_visits',
    'exam_plan','exam_lists','exam_list_items','exam_results','monthly_reports',
    'monthly_report_students','monthly_report_activities','meeting_minutes',
    'financial_transactions','admin_alerts','app_settings','news',
    'monthly_salaries','halaqa_incentives','incentive_statements','incentive_statement_items'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- منع تقارير الأشهر المستقبلية (CHECK لا يقبل now()، فنستخدم trigger)
-- ----------------------------------------------------------------------------
create or replace function public.prevent_future_report_month()
returns trigger language plpgsql as $$
begin
  if make_date(new.report_year, new.report_month, 1)
     > date_trunc('month', current_date)::date then
    raise exception 'لا يمكن إنشاء تقرير لشهر لم يبدأ بعد';
  end if;
  return new;
end;
$$;

create trigger trg_reports_no_future
  before insert or update of report_month, report_year on public.monthly_reports
  for each row execute function public.prevent_future_report_month();

-- ============================================================================
-- دوال النطاق (Scope) — SECURITY DEFINER لتفادي تكرار RLS على profiles
-- ============================================================================
create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager');
$$;

-- هل يستطيع المستخدم الحالي الوصول لهذه الحلقة (حسب نطاقه الهرمي)؟
create or replace function public.can_access_halaqa(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.halaqat h
    where h.id = hid and (
         public.is_manager()
      or h.teacher_id = auth.uid()
      or h.supervisor_id = auth.uid()
      or exists (
           select 1 from public.profiles s
           where s.id = h.supervisor_id and s.quality_supervisor_id = auth.uid()
         )
    )
  );
$$;

-- ============================================================================
-- تفعيل RLS على كل الجداول
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','profile_financials','halaqat','students','supervision_visits',
    'visit_reschedule_log','exam_plan','exam_lists','exam_list_items','exam_results',
    'monthly_reports','monthly_report_students','monthly_report_activities',
    'meeting_minutes','financial_transactions','admin_alerts','app_settings','news',
    'monthly_salaries','halaqa_incentives','incentive_statements','incentive_statement_items'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ============================================================================
-- سياسات RLS
-- ============================================================================

-- profiles: قراءة لكل العاملين (الأسماء مطلوبة عبر الواجهة)؛ الكتابة للمدير + تعديل الذات
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_manager());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_manager() or id = auth.uid())
  with check (public.is_manager() or id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_manager());

-- profile_financials: المدير فقط
create policy fin_all on public.profile_financials for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- halaqat: قراءة ضمن النطاق؛ الكتابة للمدير (TODO: إسناد مشرف الجودة لاحقاً)
create policy halaqat_select on public.halaqat for select to authenticated
  using (public.can_access_halaqa(id));
create policy halaqat_write on public.halaqat for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- students: قراءة ضمن النطاق؛ المعلم ينشئ/يعدّل طلاب حلقته؛ المشرف/المدير يعدّل
create policy students_select on public.students for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy students_insert on public.students for insert to authenticated
  with check (public.is_manager() or (public.current_user_role() = 'teacher' and public.can_access_halaqa(halaqa_id)));
create policy students_update on public.students for update to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id))
  with check (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy students_delete on public.students for delete to authenticated using (public.is_manager());

-- supervision_visits: قراءة ضمن النطاق؛ المشرف ينشئ/يعدّل زياراته
create policy visits_select on public.supervision_visits for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy visits_insert on public.supervision_visits for insert to authenticated
  with check (public.is_manager() or (supervisor_id = auth.uid() and public.can_access_halaqa(halaqa_id)));
create policy visits_update on public.supervision_visits for update to authenticated
  using (public.is_manager() or supervisor_id = auth.uid())
  with check (public.is_manager() or supervisor_id = auth.uid());
create policy visits_delete on public.supervision_visits for delete to authenticated using (public.is_manager());

-- visit_reschedule_log: تابع للزيارة
create policy reschedule_select on public.visit_reschedule_log for select to authenticated
  using (exists (select 1 from public.supervision_visits v
                 where v.id = visit_id and (public.is_manager() or public.can_access_halaqa(v.halaqa_id))));
create policy reschedule_insert on public.visit_reschedule_log for insert to authenticated
  with check (exists (select 1 from public.supervision_visits v
                 where v.id = visit_id and (public.is_manager() or v.supervisor_id = auth.uid())));

-- exam_plan: قراءة للجميع، كتابة للمدير
create policy plan_select on public.exam_plan for select to authenticated using (true);
create policy plan_write on public.exam_plan for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- exam_lists: قراءة ضمن النطاق؛ المعلم ينشئ؛ المشرف/المدير يحدّث الحالة
create policy lists_select on public.exam_lists for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy lists_insert on public.exam_lists for insert to authenticated
  with check (public.current_user_role() = 'teacher' and teacher_id = auth.uid() and public.can_access_halaqa(halaqa_id));
create policy lists_update on public.exam_lists for update to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id))
  with check (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy lists_delete on public.exam_lists for delete to authenticated
  using (public.is_manager() or teacher_id = auth.uid());

-- exam_list_items: تابع للقائمة
create policy items_select on public.exam_list_items for select to authenticated
  using (exists (select 1 from public.exam_lists l
                 where l.id = exam_list_id and (public.is_manager() or public.can_access_halaqa(l.halaqa_id))));
create policy items_write on public.exam_list_items for all to authenticated
  using (exists (select 1 from public.exam_lists l
                 where l.id = exam_list_id and (public.is_manager() or public.can_access_halaqa(l.halaqa_id))))
  with check (exists (select 1 from public.exam_lists l
                 where l.id = exam_list_id and (public.is_manager() or public.can_access_halaqa(l.halaqa_id))));

-- exam_results: قراءة ضمن نطاق حلقة الطالب؛ الكتابة للمشرف/المدير
create policy results_select on public.exam_results for select to authenticated
  using (exists (select 1 from public.students s
                 where s.id = student_id and (public.is_manager() or public.can_access_halaqa(s.halaqa_id))));
create policy results_write on public.exam_results for all to authenticated
  using (public.current_user_role() in ('manager','supervisor')
         and exists (select 1 from public.students s where s.id = student_id and (public.is_manager() or public.can_access_halaqa(s.halaqa_id))))
  with check (public.current_user_role() in ('manager','supervisor')
         and exists (select 1 from public.students s where s.id = student_id and (public.is_manager() or public.can_access_halaqa(s.halaqa_id))));

-- monthly_reports: قراءة/كتابة ضمن النطاق
create policy reports_select on public.monthly_reports for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy reports_write on public.monthly_reports for all to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id))
  with check (public.is_manager() or public.can_access_halaqa(halaqa_id));

-- monthly_report_students: تابع للتقرير
create policy rstudents_all on public.monthly_report_students for all to authenticated
  using (exists (select 1 from public.monthly_reports r
                 where r.id = report_id and (public.is_manager() or public.can_access_halaqa(r.halaqa_id))))
  with check (exists (select 1 from public.monthly_reports r
                 where r.id = report_id and (public.is_manager() or public.can_access_halaqa(r.halaqa_id))));

-- monthly_report_activities: تابع للتقرير
create policy ractivities_all on public.monthly_report_activities for all to authenticated
  using (exists (select 1 from public.monthly_reports r
                 where r.id = report_id and (public.is_manager() or public.can_access_halaqa(r.halaqa_id))))
  with check (exists (select 1 from public.monthly_reports r
                 where r.id = report_id and (public.is_manager() or public.can_access_halaqa(r.halaqa_id))));

-- meeting_minutes / financial_transactions / monthly_salaries: المدير فقط
create policy minutes_all on public.meeting_minutes for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy fintx_all on public.financial_transactions for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy salaries_all on public.monthly_salaries for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- halaqa_incentives: المدير يكتب؛ المعلم يقرأ مبلغ حلقته
create policy incentives_select on public.halaqa_incentives for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy incentives_write on public.halaqa_incentives for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- admin_alerts: المُصدِر/المُستقبِل/المدير
create policy alerts_select on public.admin_alerts for select to authenticated
  using (public.is_manager() or issuer_id = auth.uid() or teacher_id = auth.uid());
create policy alerts_insert on public.admin_alerts for insert to authenticated
  with check (public.current_user_role() in ('manager','quality','supervisor') and issuer_id = auth.uid());
create policy alerts_update on public.admin_alerts for update to authenticated
  using (public.is_manager() or issuer_id = auth.uid() or teacher_id = auth.uid())
  with check (public.is_manager() or issuer_id = auth.uid() or teacher_id = auth.uid());

-- app_settings: قراءة للجميع، كتابة للمدير
create policy settings_select on public.app_settings for select to authenticated using (true);
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- news: المنشور عامّ (زوّار)، الكتابة للمدير
create policy news_select on public.news for select to anon, authenticated
  using (published or public.is_manager());
create policy news_write on public.news for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- incentive_statements: المعلم ينشئ/يعدّل كشوف حلقته؛ المدير يطّلع/يحدّث الحالة
create policy statements_select on public.incentive_statements for select to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id));
create policy statements_write on public.incentive_statements for all to authenticated
  using (public.is_manager() or public.can_access_halaqa(halaqa_id))
  with check (public.is_manager() or public.can_access_halaqa(halaqa_id));

create policy sitems_all on public.incentive_statement_items for all to authenticated
  using (exists (select 1 from public.incentive_statements st
                 where st.id = statement_id and (public.is_manager() or public.can_access_halaqa(st.halaqa_id))))
  with check (exists (select 1 from public.incentive_statements st
                 where st.id = statement_id and (public.is_manager() or public.can_access_halaqa(st.halaqa_id))));

-- ============================================================================
-- بيانات أولية (Seed)
-- ============================================================================

-- خطة الاختبارات: 6 مجموعات × (مرحلي 3 أجزاء + تجميعي 5 أجزاء)
insert into public.exam_plan (group_number, stage_type, parts_from, parts_to) values
  (1, 'partial', 1, 3),   (1, 'cumulative', 1, 5),
  (2, 'partial', 6, 8),   (2, 'cumulative', 6, 10),
  (3, 'partial', 11, 13), (3, 'cumulative', 11, 15),
  (4, 'partial', 16, 18), (4, 'cumulative', 16, 20),
  (5, 'partial', 21, 23), (5, 'cumulative', 21, 25),
  (6, 'partial', 26, 28), (6, 'cumulative', 26, 30);

-- إعدادات المدير (الصف الوحيد)
insert into public.app_settings (id, pass_mark, target_memorization_pages, default_points, default_attendance_days)
values (1, 80, 30, 100, 26);
