-- رابط اطّلاع الطالب (§4.23) — رمز سرّي للعرض العام بلا حساب دخول.
-- لكل طالب view_token فريد يُستخدم في صفحة عامّة للقراءة فقط (يُجلب خادميّاً بصلاحية الخدمة).
alter table public.students
  add column if not exists view_token uuid not null default gen_random_uuid();

create unique index if not exists students_view_token_key on public.students (view_token);

comment on column public.students.view_token is 'رمز رابط الاطّلاع العام للطالب (للقراءة فقط، قابل لإعادة التوليد).';
