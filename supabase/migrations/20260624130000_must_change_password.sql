-- علَم «يجب تغيير كلمة المرور»: يُضبط true عند إنشاء حساب العامل بكلمة افتراضية،
-- ويصير false عندما يغيّر العامل كلمته بنفسه. يُستخدم لإظهار تلميح في ملفه الشخصي.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
