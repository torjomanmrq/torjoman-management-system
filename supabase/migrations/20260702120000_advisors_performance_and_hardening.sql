-- تحسينات مراجعة Supabase Advisors (2026-07-02)
-- أ) فهارس المفاتيح الأجنبية غير المفهرسة (~20)
-- ب) initplan: لفّ auth.uid() والدوال المساعدة بـ (select …) لتقييم واحد لكل استعلام بدل كل صف
-- ج) فصل سياسات FOR ALL إلى insert/update/delete (إزالة ازدواج سياسات SELECT)
-- د) تقييد تنفيذ دوال SECURITY DEFINER على authenticated فقط (كانت مكشوفة لـ anon عبر /rest/v1/rpc)
-- هـ) إسقاط سياسة سرد سلة media العامة (الرابط العام لا يمرّ بسياسات SELECT)
-- ملاحظة: فُصلت سياسة قراءة الأخبار إلى anon/authenticated قبل سحب is_manager من anon.

-- ============ أ) الفهارس ============
create index if not exists idx_admin_alerts_issuer        on public.admin_alerts (issuer_id);
create index if not exists idx_exam_list_items_plan       on public.exam_list_items (exam_plan_id);
create index if not exists idx_exam_list_items_student    on public.exam_list_items (student_id);
create index if not exists idx_exam_lists_teacher         on public.exam_lists (teacher_id);
create index if not exists idx_exam_results_list_item     on public.exam_results (exam_list_item_id);
create index if not exists idx_exam_results_examiner      on public.exam_results (examiner_id);
create index if not exists idx_fin_tx_created_by          on public.financial_transactions (created_by);
create index if not exists idx_halaqa_incentives_approver on public.halaqa_incentives (approved_by);
create index if not exists idx_halaqat_assigned_by        on public.halaqat (assigned_by);
create index if not exists idx_stmt_items_statement       on public.incentive_statement_items (statement_id);
create index if not exists idx_statements_created_by      on public.incentive_statements (created_by);
create index if not exists idx_statements_reviewed_by     on public.incentive_statements (reviewed_by);
create index if not exists idx_minutes_created_by         on public.meeting_minutes (created_by);
create index if not exists idx_mrs_student                on public.monthly_report_students (student_id);
create index if not exists idx_reports_approved_by        on public.monthly_reports (approved_by);
create index if not exists idx_salaries_approved_by       on public.monthly_salaries (approved_by);
create index if not exists idx_news_created_by            on public.news (created_by);
create index if not exists idx_profiles_assigned_by       on public.profiles (assigned_by);
create index if not exists idx_students_created_by        on public.students (created_by);
create index if not exists idx_reschedule_visit           on public.visit_reschedule_log (visit_id);

-- ============ ب) initplan ============
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_manager()) or id = (select auth.uid()))
  with check ((select public.is_manager()) or id = (select auth.uid()));

drop policy visits_insert on public.supervision_visits;
create policy visits_insert on public.supervision_visits for insert to authenticated
  with check ((select public.is_manager()) or (supervisor_id = (select auth.uid()) and public.can_access_halaqa(halaqa_id)));

drop policy visits_update on public.supervision_visits;
create policy visits_update on public.supervision_visits for update to authenticated
  using ((select public.is_manager()) or supervisor_id = (select auth.uid()))
  with check ((select public.is_manager()) or supervisor_id = (select auth.uid()));

drop policy reschedule_insert on public.visit_reschedule_log;
create policy reschedule_insert on public.visit_reschedule_log for insert to authenticated
  with check (exists (
    select 1 from public.supervision_visits v
    where v.id = visit_reschedule_log.visit_id
      and ((select public.is_manager()) or v.supervisor_id = (select auth.uid()))
  ));

drop policy lists_insert on public.exam_lists;
create policy lists_insert on public.exam_lists for insert to authenticated
  with check ((select public.current_user_role()) = 'teacher'::public.user_role
    and teacher_id = (select auth.uid())
    and public.can_access_halaqa(halaqa_id));

drop policy lists_delete on public.exam_lists;
create policy lists_delete on public.exam_lists for delete to authenticated
  using ((select public.is_manager()) or teacher_id = (select auth.uid()));

drop policy alerts_select on public.admin_alerts;
create policy alerts_select on public.admin_alerts for select to authenticated
  using ((select public.is_manager()) or issuer_id = (select auth.uid()) or teacher_id = (select auth.uid()));

drop policy alerts_insert on public.admin_alerts;
create policy alerts_insert on public.admin_alerts for insert to authenticated
  with check ((select public.current_user_role()) = any (array['manager','quality','supervisor']::public.user_role[])
    and issuer_id = (select auth.uid()));

drop policy alerts_update on public.admin_alerts;
create policy alerts_update on public.admin_alerts for update to authenticated
  using ((select public.is_manager()) or issuer_id = (select auth.uid()) or teacher_id = (select auth.uid()))
  with check ((select public.is_manager()) or issuer_id = (select auth.uid()) or teacher_id = (select auth.uid()));

-- ============ ج) فصل سياسات الكتابة ============
-- app_settings
drop policy settings_write on public.app_settings;
create policy settings_insert on public.app_settings for insert to authenticated with check ((select public.is_manager()));
create policy settings_update on public.app_settings for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy settings_delete on public.app_settings for delete to authenticated using ((select public.is_manager()));

-- exam_list_items
drop policy items_write on public.exam_list_items;
create policy items_insert on public.exam_list_items for insert to authenticated
  with check (exists (select 1 from public.exam_lists l where l.id = exam_list_id and ((select public.is_manager()) or public.can_access_halaqa(l.halaqa_id))));
create policy items_update on public.exam_list_items for update to authenticated
  using (exists (select 1 from public.exam_lists l where l.id = exam_list_id and ((select public.is_manager()) or public.can_access_halaqa(l.halaqa_id))))
  with check (exists (select 1 from public.exam_lists l where l.id = exam_list_id and ((select public.is_manager()) or public.can_access_halaqa(l.halaqa_id))));
create policy items_delete on public.exam_list_items for delete to authenticated
  using (exists (select 1 from public.exam_lists l where l.id = exam_list_id and ((select public.is_manager()) or public.can_access_halaqa(l.halaqa_id))));

-- exam_plan
drop policy plan_write on public.exam_plan;
create policy plan_insert on public.exam_plan for insert to authenticated with check ((select public.is_manager()));
create policy plan_update on public.exam_plan for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy plan_delete on public.exam_plan for delete to authenticated using ((select public.is_manager()));

-- exam_results
drop policy results_write on public.exam_results;
create policy results_insert on public.exam_results for insert to authenticated
  with check ((select public.current_user_role()) = any (array['manager','supervisor']::public.user_role[])
    and exists (select 1 from public.students s where s.id = student_id and ((select public.is_manager()) or public.can_access_halaqa(s.halaqa_id))));
create policy results_update on public.exam_results for update to authenticated
  using ((select public.current_user_role()) = any (array['manager','supervisor']::public.user_role[])
    and exists (select 1 from public.students s where s.id = student_id and ((select public.is_manager()) or public.can_access_halaqa(s.halaqa_id))))
  with check ((select public.current_user_role()) = any (array['manager','supervisor']::public.user_role[])
    and exists (select 1 from public.students s where s.id = student_id and ((select public.is_manager()) or public.can_access_halaqa(s.halaqa_id))));
create policy results_delete on public.exam_results for delete to authenticated
  using ((select public.current_user_role()) = any (array['manager','supervisor']::public.user_role[])
    and exists (select 1 from public.students s where s.id = student_id and ((select public.is_manager()) or public.can_access_halaqa(s.halaqa_id))));

-- halaqa_incentives
drop policy incentives_write on public.halaqa_incentives;
create policy incentives_insert on public.halaqa_incentives for insert to authenticated with check ((select public.is_manager()));
create policy incentives_update on public.halaqa_incentives for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy incentives_delete on public.halaqa_incentives for delete to authenticated using ((select public.is_manager()));

-- halaqat (can_access_halaqa تشمل المدير — القراءة تبقى مغطّاة بسياسة halaqat_select)
drop policy halaqat_write on public.halaqat;
create policy halaqat_insert on public.halaqat for insert to authenticated with check ((select public.is_manager()));
create policy halaqat_update on public.halaqat for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy halaqat_delete on public.halaqat for delete to authenticated using ((select public.is_manager()));

-- incentive_statements
drop policy statements_write on public.incentive_statements;
create policy statements_insert on public.incentive_statements for insert to authenticated
  with check ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));
create policy statements_update on public.incentive_statements for update to authenticated
  using ((select public.is_manager()) or public.can_access_halaqa(halaqa_id))
  with check ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));
create policy statements_delete on public.incentive_statements for delete to authenticated
  using ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));

-- monthly_reports
drop policy reports_write on public.monthly_reports;
create policy reports_insert on public.monthly_reports for insert to authenticated
  with check ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));
create policy reports_update on public.monthly_reports for update to authenticated
  using ((select public.is_manager()) or public.can_access_halaqa(halaqa_id))
  with check ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));
create policy reports_delete on public.monthly_reports for delete to authenticated
  using ((select public.is_manager()) or public.can_access_halaqa(halaqa_id));

-- news: فصل قراءة الزوّار عن المسجّلين (شرط سحب is_manager من anon)
drop policy news_select on public.news;
create policy news_select_public on public.news for select to anon using (published);
create policy news_select_auth on public.news for select to authenticated using (published or (select public.is_manager()));

drop policy news_write on public.news;
create policy news_insert on public.news for insert to authenticated with check ((select public.is_manager()));
create policy news_update on public.news for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy news_delete on public.news for delete to authenticated using ((select public.is_manager()));

-- ============ د) تقييد دوال SECURITY DEFINER ============
revoke execute on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated, service_role;
revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;
revoke execute on function public.can_access_halaqa(uuid) from public, anon;
grant execute on function public.can_access_halaqa(uuid) to authenticated, service_role;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ============ هـ) سلة media: منع سرد الملفات ============
drop policy if exists media_public_read on storage.objects;
