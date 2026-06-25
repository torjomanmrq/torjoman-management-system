-- تقوية أمنية: تثبيت search_path لدوال التريجر (إصلاح تحذير المستشار
-- function_search_path_mutable). لا يغيّر سلوكها، يمنع اختطاف search_path فقط.
-- (لم تُطبَّق آليّاً على الإنتاج — تُطبَّق ضمن دفعة الهجرات أو بإذن صريح.)
alter function public.set_updated_at() set search_path = public;
alter function public.prevent_future_report_month() set search_path = public;
