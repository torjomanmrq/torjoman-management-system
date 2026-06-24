import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * رابط اطّلاع الطالب (عام، بلا حساب) — يجلب الطالب بالـ view_token بصلاحية الخدمة
 * ويُرجِع حقولاً آمنة فقط (دون رقم الهوية/الجوالات/البريد — خصوصية).
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    throw createError({ statusCode: 400, statusMessage: 'رمز غير صالح.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data, error } = await admin
    .from('students')
    .select('id, full_name, status, quran_parts, tajweed_level, enrollment_date, halaqa:halaqa_id(name, daily_time, teacher:teacher_id(full_name))')
    .eq('view_token', token)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'الرابط غير صحيح أو لم يعد متاحاً.' })
  }

  // خطة الاختبارات + نتائج الطالب لرسم رحلة الطالب
  const { data: plan } = await admin
    .from('exam_plan')
    .select('id, parts_from, parts_to, stage_type')
    .order('parts_to')

  const { data: rawResults } = await admin
    .from('exam_results')
    .select('passed, exam_list_item:exam_list_item_id(exam_plan_id)')
    .eq('student_id', data.id)

  const results = (rawResults ?? []).map((r: { passed: boolean | null, exam_list_item: { exam_plan_id: number | null } | null }) => ({
    exam_plan_id: r.exam_list_item?.exam_plan_id ?? null,
    passed: r.passed
  }))

  const { id: _id, ...safe } = data
  return { ...safe, exam_plan: plan ?? [], results }
})
